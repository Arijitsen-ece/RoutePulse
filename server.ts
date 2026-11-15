import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import { fcmService } from './server/fcmService.ts';
import {
  optionalAuth,
  persistAuditLog,
  requireAdmin,
  requireAuth,
  requireModerator,
  requireOperator,
  type AuthRequest,
} from './server/firebaseAdmin.ts';
import { askTransitAssistant } from './server/geminiAssistant.ts';
import { transitStore } from './server/transitState.ts';
import type {
  AlertSeverity,
  AlertType,
  AuditLogEntry,
  DataSourceType,
  ReportType,
  ReportVerificationStatus,
  SupportedLanguage,
  TimetableBasis,
} from './src/shared/types.ts';
import {
  planJourney,
  predictStopArrivalsForRoute,
  verifyRouteServiceStatus,
} from './src/shared/verificationEngine.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function createIpRateLimiter(maxRequests: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (req: Request, res: Response, next: NextFunction) => {
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((ts) => now - ts <= windowMs);
    if (recent.length >= maxRequests) {
      return res.status(429).json({
        error: 'Too many requests. Please wait a minute before trying again.',
      });
    }
    hits.set(key, [...recent, now]);
    next();
  };
}

function logStaffAction(
  req: AuthRequest,
  params: Omit<AuditLogEntry, 'logId' | 'timestamp' | 'actorUid' | 'actorEmail' | 'actorRole'>
) {
  const entry = transitStore.recordAuditLog({
    actorUid: req.user?.uid || 'unknown',
    actorEmail: req.user?.email || 'unknown',
    actorRole: req.userRole || 'passenger',
    ...params,
  });
  void persistAuditLog(entry);
  return entry;
}

async function startServer() {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '4mb' }));

  // Baseline security headers
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=()');
    next();
  });

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  const broadcastSnapshot = () => {
    const payload = JSON.stringify({
      type: 'transit:snapshot',
      data: transitStore.getSnapshot(),
    });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  };

  wss.on('connection', (ws) => {
    ws.send(
      JSON.stringify({
        type: 'transit:snapshot',
        data: transitStore.getSnapshot(),
      })
    );
  });

  const telemetryInterval = setInterval(async () => {
    await transitStore.tickTelemetry();
    broadcastSnapshot();
  }, 4000);
  telemetryInterval.unref();

  const reportLimiter = createIpRateLimiter(10, 60 * 1000);
  const aiLimiter = createIpRateLimiter(10, 60 * 1000);

  // Health endpoint
  app.get('/api/health', (_req, res) => {
    const snapshot = transitStore.getSnapshot();
    res.json({
      status: 'ok',
      telemetryMode: snapshot.dataHealth.activeTelemetryMode,
      officialStaticFeedConnected: snapshot.dataHealth.officialStaticFeedConnected,
      officialAlertFeedConnected: snapshot.dataHealth.officialAlertFeedConnected,
      fcmConfigured: snapshot.dataHealth.fcmHealth.configured,
      serverTimestamp: snapshot.serverTimestamp,
    });
  });

  // Public runtime configuration (only public VAPID key, never private secrets)
  app.get('/api/config/public', (_req, res) => {
    const vapidKey =
      process.env.FCM_VAPID_PUBLIC_KEY || process.env.VITE_FCM_VAPID_PUBLIC_KEY || '';
    const cleanVapid = vapidKey && !vapidKey.startsWith('MY_') ? vapidKey : null;
    res.json({
      fcmVapidPublicKey: cleanVapid,
      fcmConfigured: fcmService.getHealth().configured,
    });
  });

  // Public Data Source Register & Data Quality transparency endpoint
  app.get('/api/sources/register', (_req, res) => {
    const snapshot = transitStore.getSnapshot();
    res.json({
      sources: transitStore.getDataSourceRegister(),
      dataHealth: snapshot.dataHealth,
      serverTimestamp: snapshot.serverTimestamp,
    });
  });

  // Real cached Kolkata weather (Open-Meteo, never fabricated)
  let weatherCache: { fetchedAt: number; tempC: number; code: number } | null = null;
  app.get('/api/weather', async (_req, res) => {
    const now = Date.now();
    if (weatherCache && now - weatherCache.fetchedAt < 15 * 60 * 1000) {
      return res.json({ available: true, tempC: weatherCache.tempC, weatherCode: weatherCache.code });
    }
    try {
      const r = await fetch(
        'https://api.open-meteo.com/v1/forecast?latitude=22.5726&longitude=88.3639&current=temperature_2m,weather_code',
        { signal: AbortSignal.timeout(3500) }
      );
      if (!r.ok) throw new Error('Weather unavailable');
      const json = (await r.json()) as {
        current?: { temperature_2m?: number; weather_code?: number };
      };
      const temp = json.current?.temperature_2m;
      const code = json.current?.weather_code;
      if (typeof temp === 'number') {
        weatherCache = { fetchedAt: now, tempC: Math.round(temp), code: code ?? 0 };
        return res.json({ available: true, tempC: weatherCache.tempC, weatherCode: weatherCache.code });
      }
      res.json({ available: false });
    } catch {
      res.json({ available: false });
    }
  });

  // Full transit snapshot + verification status per route
  app.get('/api/transit/snapshot', (_req, res) => {
    const snapshot = transitStore.getSnapshot();
    const verifications = snapshot.routes.map((route) => ({
      routeId: route.routeId,
      verification: verifyRouteServiceStatus({
        route,
        positions: snapshot.vehiclePositions,
        alerts: snapshot.serviceAlerts,
        reports: snapshot.passengerReports,
        tripUpdates: snapshot.tripUpdates,
        now: snapshot.serverTimestamp,
      }),
    }));
    res.json({ snapshot, verifications });
  });

  // Deterministic stop arrival & delay predictions for a route/stop
  app.get('/api/transit/predictions', (req, res) => {
    const routeId = String(req.query.routeId || '');
    const stopId = String(req.query.stopId || '');
    const snapshot = transitStore.getSnapshot();
    const route = snapshot.routes.find((r) => r.routeId === routeId);
    if (!route) {
      return res.status(404).json({ error: 'Route not found' });
    }
    const stopsMap = new Map(snapshot.stops.map((s) => [s.stopId, s]));
    const predictions = predictStopArrivalsForRoute({
      route,
      targetStopId: stopId,
      stopsMap,
      positions: snapshot.vehiclePositions,
      alerts: snapshot.serviceAlerts,
      reports: snapshot.passengerReports,
      tripUpdates: snapshot.tripUpdates,
      now: snapshot.serverTimestamp,
    });
    res.json({ predictions, serverTimestamp: snapshot.serverTimestamp });
  });

  // Source-to-destination Journey Planner
  app.get('/api/transit/journey', (req, res) => {
    const fromStopId = String(req.query.fromStopId || '');
    const toStopId = String(req.query.toStopId || '');
    const userLat = req.query.lat ? Number(req.query.lat) : undefined;
    const userLng = req.query.lng ? Number(req.query.lng) : undefined;

    if (!fromStopId || !toStopId) {
      return res.status(400).json({ error: 'fromStopId and toStopId are required' });
    }

    const snapshot = transitStore.getSnapshot();
    const stopsMap = new Map(snapshot.stops.map((s) => [s.stopId, s]));
    const options = planJourney({
      fromStopId,
      toStopId,
      userLat: Number.isFinite(userLat) ? userLat : undefined,
      userLng: Number.isFinite(userLng) ? userLng : undefined,
      routes: snapshot.routes,
      operators: snapshot.operators,
      stopsMap,
      positions: snapshot.vehiclePositions,
      alerts: snapshot.serviceAlerts,
      reports: snapshot.passengerReports,
      tripUpdates: snapshot.tripUpdates,
      now: snapshot.serverTimestamp,
    });

    res.json({ options, serverTimestamp: snapshot.serverTimestamp });
  });

  // Passenger Community Report submission (IP + user rate-limited + duplicate-checked)
  app.post('/api/reports', reportLimiter, optionalAuth, (req: AuthRequest, res) => {
    const { routeId, stopId, reportType, note, lat, lng, guestAlias } = req.body ?? {};
    const validTypes: ReportType[] = [
      'ARRIVAL_CONFIRMED',
      'MISSING_BUS',
      'BREAKDOWN',
      'DELAY',
      'DIVERSION',
    ];
    if (!validTypes.includes(reportType)) {
      return res.status(400).json({ error: 'Invalid report type' });
    }
    if (typeof routeId !== 'string' || typeof stopId !== 'string') {
      return res.status(400).json({ error: 'routeId and stopId are required' });
    }

    const userId = req.user?.uid || `guest_${req.ip || 'unknown'}`;
    const userDisplayName =
      req.user?.name ||
      req.user?.email?.split('@')[0] ||
      (typeof guestAlias === 'string' && guestAlias.trim()) ||
      'Commuter';

    const result = transitStore.submitPassengerReport({
      userId,
      userDisplayName,
      routeId,
      stopId,
      reportType,
      note: typeof note === 'string' ? note : '',
      lat: typeof lat === 'number' ? lat : undefined,
      lng: typeof lng === 'number' ? lng : undefined,
    });

    if (!result.ok) {
      const errResult = result as { ok: false; status: number; error: string };
      return res.status(errResult.status).json({ error: errResult.error });
    }

    broadcastSnapshot();
    res.status(result.deduplicated ? 200 : 201).json({
      report: result.report,
      deduplicated: result.deduplicated,
    });
  });

  // FCM Device Token Registration (authenticated users only)
  app.post('/api/notifications/register-token', requireAuth, async (req: AuthRequest, res) => {
    const { token, language, routeIds } = req.body ?? {};
    if (typeof token !== 'string' || token.trim().length < 20 || token.trim().length > 4096) {
      return res.status(400).json({ error: 'Valid FCM registration token required' });
    }
    const lang: SupportedLanguage =
      language === 'hi' || language === 'bn' ? language : 'en';
    const record = await fcmService.registerToken({
      token,
      uid: req.user!.uid,
      language: lang,
      routeIds: Array.isArray(routeIds) ? routeIds.map(String) : [],
    });
    res.status(201).json({ registered: true, tokenHash: record.tokenHash });
  });

  app.post('/api/notifications/unregister-token', requireAuth, async (req: AuthRequest, res) => {
    const { token } = req.body ?? {};
    if (typeof token !== 'string' || !token.trim()) {
      return res.status(400).json({ error: 'FCM token required' });
    }
    const removed = await fcmService.unregisterToken({
      token,
      uid: req.user!.uid,
    });
    res.json({ unregistered: removed });
  });

  // Optional Gemini Natural-Language Transport Assistant (rate-limited + strictly grounded)
  app.post('/api/ai/assist', aiLimiter, async (req, res) => {
    const { question, language } = req.body ?? {};
    if (typeof question !== 'string' || !question.trim()) {
      return res.status(400).json({ error: 'Question is required' });
    }
    const lang: SupportedLanguage =
      language === 'hi' || language === 'bn' ? language : 'en';

    try {
      const result = await askTransitAssistant({
        question: question.trim().slice(0, 400),
        language: lang,
        snapshot: transitStore.getSnapshot(),
      });
      res.json(result);
    } catch (error) {
      console.error('AI assistant error:', error);
      res.status(500).json({ error: 'Unable to query transport assistant right now.' });
    }
  });

  // Protected Staff Role Check endpoint
  app.get('/api/admin/me', requireAuth, (req: AuthRequest, res) => {
    const role = req.userRole || 'passenger';
    res.json({
      uid: req.user?.uid,
      email: req.user?.email,
      role,
      isAdmin: role === 'admin',
      isModerator: role === 'moderator' || role === 'admin',
      isOperator: role === 'operator' || role === 'admin',
    });
  });

  // Moderator & Admin: Data Quality & Report Moderation
  app.get('/api/admin/data-quality', requireModerator, (_req, res) => {
    const snapshot = transitStore.getSnapshot();
    res.json({
      dataQuality: snapshot.dataHealth.dataQuality,
      dataHealth: snapshot.dataHealth,
      sources: transitStore.getDataSourceRegister(),
    });
  });

  app.patch('/api/admin/reports/:reportId', requireModerator, (req: AuthRequest, res) => {
    const { status } = req.body ?? {};
    const validStatuses: ReportVerificationStatus[] = ['PENDING', 'CONFIRMED', 'REJECTED', 'DUPLICATE'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: 'Invalid moderation status' });
    }
    const updated = transitStore.moderatePassengerReport(req.params.reportId, status);
    if (!updated) return res.status(404).json({ error: 'Report not found' });

    logStaffAction(req, {
      action: `MODERATE_REPORT_${status}`,
      targetType: 'REPORT',
      targetId: updated.reportId,
      summary: `Set passenger report ${updated.reportId} on ${updated.routeId} to ${status}`,
    });
    broadcastSnapshot();
    res.json({ report: updated });
  });

  // Operator & Admin: Alerts, Routes, Stops, GTFS Import, Feed Configuration
  app.post('/api/admin/alerts', requireOperator, async (req: AuthRequest, res) => {
    const {
      routeId,
      affectedStopIds,
      alertType,
      severity,
      titleEn,
      descriptionEn,
      issuingOrganization,
      sourceUrl,
      sendPush,
    } = req.body ?? {};
    const validAlertTypes: AlertType[] = [
      'CANCELLATION',
      'PARTIAL_CANCELLATION',
      'DIVERSION',
      'BREAKDOWN',
      'DELAY',
      'TRAFFIC_CONGESTION',
      'WEATHER_DISRUPTION',
      'ROUTE_SUSPENSION',
      'SPECIAL_SERVICE',
      'MISSING_WARNING',
    ];
    const validSeverities: AlertSeverity[] = ['CRITICAL', 'WARNING', 'INFO'];
    if (
      typeof routeId !== 'string' ||
      !validAlertTypes.includes(alertType) ||
      !validSeverities.includes(severity) ||
      typeof titleEn !== 'string' ||
      typeof descriptionEn !== 'string'
    ) {
      return res.status(400).json({ error: 'Invalid service alert payload' });
    }
    const created = transitStore.createServiceAlert({
      routeId,
      affectedStopIds: Array.isArray(affectedStopIds) ? affectedStopIds : [],
      alertType,
      severity,
      titleEn: titleEn.trim().slice(0, 160),
      descriptionEn: descriptionEn.trim().slice(0, 600),
      issuingOrganization:
        typeof issuingOrganization === 'string' ? issuingOrganization.slice(0, 120) : undefined,
      sourceUrl: typeof sourceUrl === 'string' ? sourceUrl.slice(0, 300) : undefined,
    });
    if (!created) return res.status(404).json({ error: 'Route not found' });

    logStaffAction(req, {
      action: 'CREATE_SERVICE_ALERT',
      targetType: 'ALERT',
      targetId: created.alertId,
      summary: `Published ${created.alertType} (${created.severity}) for ${created.routeId}: ${created.title.en}`,
    });

    let pushResult = null;
    if (sendPush) {
      pushResult = await fcmService.broadcastAlertPush(created);
    }

    broadcastSnapshot();
    res.status(201).json({ alert: created, pushResult });
  });

  app.patch('/api/admin/alerts/:alertId', requireOperator, (req: AuthRequest, res) => {
    const { active } = req.body ?? {};
    const updated = transitStore.toggleServiceAlert(req.params.alertId, Boolean(active));
    if (!updated) return res.status(404).json({ error: 'Alert not found' });

    logStaffAction(req, {
      action: updated.active ? 'ACTIVATE_ALERT' : 'RESOLVE_ALERT',
      targetType: 'ALERT',
      targetId: updated.alertId,
      summary: `${updated.active ? 'Activated' : 'Resolved'} alert ${updated.alertId} (${updated.routeId})`,
    });
    broadcastSnapshot();
    res.json({ alert: updated });
  });

  app.post('/api/admin/routes', requireOperator, (req: AuthRequest, res) => {
    const {
      routeNumber,
      operatorId,
      originEn,
      destinationEn,
      stopIds,
      firstDeparture,
      lastDeparture,
      frequencyMin,
      isAc,
      timetableBasis,
      sourceLabel,
      sourceUrl,
    } = req.body ?? {};
    const validBasis: TimetableBasis[] = [
      'OFFICIAL_TIMETABLE',
      'OFFICIAL_FREQUENCY',
      'ESTIMATED_FREQUENCY',
      'HISTORICAL_TIMETABLE',
      'PASSENGER_OBSERVATION',
      'SYNTHETIC_DEMO',
      'UNAVAILABLE',
    ];
    const created = transitStore.createRoute({
      routeNumber: String(routeNumber || ''),
      operatorId: String(operatorId || 'op_wbtc'),
      originEn: String(originEn || ''),
      destinationEn: String(destinationEn || ''),
      stopIds: Array.isArray(stopIds) ? stopIds.map(String) : [],
      firstDeparture: String(firstDeparture || '06:00'),
      lastDeparture: String(lastDeparture || '21:30'),
      frequencyMin: Number(frequencyMin || 20),
      isAc: Boolean(isAc),
      timetableBasis: validBasis.includes(timetableBasis) ? timetableBasis : 'ESTIMATED_FREQUENCY',
      sourceLabel: typeof sourceLabel === 'string' ? sourceLabel.slice(0, 160) : undefined,
      sourceUrl: typeof sourceUrl === 'string' ? sourceUrl.slice(0, 300) : undefined,
    });
    if (!created) return res.status(400).json({ error: 'Invalid route data (requires >= 2 stops)' });

    logStaffAction(req, {
      action: 'CREATE_ROUTE',
      targetType: 'ROUTE',
      targetId: created.routeId,
      summary: `Created route ${created.routeNumber} (${created.origin.en} -> ${created.destination.en})`,
    });
    broadcastSnapshot();
    res.status(201).json({ route: created });
  });

  app.patch('/api/admin/routes/:routeId', requireOperator, (req: AuthRequest, res) => {
    const updated = transitStore.updateRouteMetadata(req.params.routeId, req.body ?? {});
    if (!updated) return res.status(404).json({ error: 'Route not found' });

    logStaffAction(req, {
      action: 'UPDATE_ROUTE',
      targetType: 'ROUTE',
      targetId: updated.routeId,
      summary: `Updated route ${updated.routeNumber} metadata`,
    });
    broadcastSnapshot();
    res.json({ route: updated });
  });

  app.post('/api/admin/stops', requireOperator, (req: AuthRequest, res) => {
    const { nameEn, localityEn, lat, lng, zone } = req.body ?? {};
    if (typeof nameEn !== 'string' || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) {
      return res.status(400).json({ error: 'Valid stop name and coordinates required' });
    }
    const stop = transitStore.addStop({
      nameEn: nameEn.trim().slice(0, 120),
      localityEn: String(localityEn || 'Kolkata').trim().slice(0, 120),
      lat: Number(lat),
      lng: Number(lng),
      zone: String(zone || 'Kolkata').trim().slice(0, 60),
    });

    logStaffAction(req, {
      action: 'CREATE_STOP',
      targetType: 'STOP',
      targetId: stop.stopId,
      summary: `Added stop ${stop.name.en} (${stop.lat}, ${stop.lng})`,
    });
    broadcastSnapshot();
    res.status(201).json({ stop });
  });

  app.post('/api/admin/import-gtfs', requireOperator, (req: AuthRequest, res) => {
    const { files, dryRun, replaceExisting, sourceLabel, sourceType, timetableBasis, sourceUrl } =
      req.body ?? {};
    if (!files || typeof files !== 'object') {
      return res.status(400).json({ error: 'GTFS files map required (stops.txt, routes.txt, trips.txt, stop_times.txt)' });
    }
    const validSourceTypes: DataSourceType[] = [
      'OFFICIAL_VERIFIED',
      'OPEN_LICENSED',
      'COMMUNITY_REPORTED',
      'ESTIMATED',
      'SYNTHETIC_DEMO',
      'UNVERIFIED',
    ];
    const validBasis: TimetableBasis[] = [
      'OFFICIAL_TIMETABLE',
      'OFFICIAL_FREQUENCY',
      'ESTIMATED_FREQUENCY',
      'HISTORICAL_TIMETABLE',
      'PASSENGER_OBSERVATION',
      'SYNTHETIC_DEMO',
      'UNAVAILABLE',
    ];

    const result = transitStore.importStaticGtfs(files as Record<string, string>, {
      dryRun: Boolean(dryRun),
      replaceExisting: Boolean(replaceExisting),
      sourceLabel: typeof sourceLabel === 'string' ? sourceLabel.slice(0, 160) : undefined,
      sourceType: validSourceTypes.includes(sourceType) ? sourceType : 'OFFICIAL_VERIFIED',
      timetableBasis: validBasis.includes(timetableBasis) ? timetableBasis : 'OFFICIAL_TIMETABLE',
      sourceUrl: typeof sourceUrl === 'string' ? sourceUrl.slice(0, 300) : undefined,
    });

    if (!dryRun && result.ok) {
      logStaffAction(req, {
        action: 'IMPORT_STATIC_GTFS',
        targetType: 'GTFS_IMPORT',
        targetId: 'static_gtfs',
        summary: `Imported ${result.summary.routesCount} routes, ${result.summary.stopsCount} stops, ${result.summary.tripsCount} trips`,
      });
      broadcastSnapshot();
    }

    res.status(result.ok ? 200 : 400).json({
      ok: result.ok,
      dryRun: result.dryRun,
      summary: result.summary,
      warnings: result.warnings,
      errors: result.errors,
    });
  });

  app.post('/api/admin/feed-config', requireOperator, async (req: AuthRequest, res) => {
    const {
      gtfsStaticFeedUrl,
      gtfsRtFeedUrl,
      gtfsRtTripUpdatesFeedUrl,
      gtfsRtAlertsFeedUrl,
      pollIntervalMs,
      syncNow,
    } = req.body ?? {};

    const result = transitStore.configureFeeds({
      gtfsStaticFeedUrl: gtfsStaticFeedUrl !== undefined ? (gtfsStaticFeedUrl ? String(gtfsStaticFeedUrl) : null) : undefined,
      gtfsRtFeedUrl: gtfsRtFeedUrl !== undefined ? (gtfsRtFeedUrl ? String(gtfsRtFeedUrl) : null) : undefined,
      gtfsRtTripUpdatesFeedUrl:
        gtfsRtTripUpdatesFeedUrl !== undefined
          ? gtfsRtTripUpdatesFeedUrl
            ? String(gtfsRtTripUpdatesFeedUrl)
            : null
          : undefined,
      gtfsRtAlertsFeedUrl:
        gtfsRtAlertsFeedUrl !== undefined
          ? gtfsRtAlertsFeedUrl
            ? String(gtfsRtAlertsFeedUrl)
            : null
          : undefined,
      pollIntervalMs: pollIntervalMs !== undefined ? Number(pollIntervalMs) : undefined,
    });

    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }

    if (syncNow) {
      await transitStore.syncStaticFeed();
      await transitStore.pollExternalFeeds(true);
    }

    logStaffAction(req, {
      action: 'UPDATE_FEED_CONFIG',
      targetType: 'FEED',
      targetId: 'gtfs_endpoints',
      summary: `Updated GTFS/GTFS-RT feed endpoints${syncNow ? ' and triggered sync' : ''}`,
    });
    broadcastSnapshot();
    res.json({ dataHealth: transitStore.getSnapshot().dataHealth });
  });

  // Strict Admin-only: Vehicle GPS demo simulation, Audit logs, FCM Dispatch & Health
  app.post('/api/admin/vehicles/:vehicleId/gps-state', requireAdmin, (req: AuthRequest, res) => {
    const { stale } = req.body ?? {};
    const updated = transitStore.toggleVehicleGpsSimulation(req.params.vehicleId, Boolean(stale));
    if (!updated) return res.status(404).json({ error: 'Vehicle not found' });

    logStaffAction(req, {
      action: stale ? 'SIMULATE_STALE_GPS' : 'RESTORE_DEMO_GPS',
      targetType: 'VEHICLE',
      targetId: updated.vehicleId,
      summary: `Set vehicle ${updated.vehicleId} GPS state to ${stale ? 'STALE/UNAVAILABLE' : 'ACTIVE_DEMO'}`,
    });
    broadcastSnapshot();
    res.json({ vehiclePosition: updated });
  });

  app.get('/api/admin/audit-logs', requireAdmin, (_req, res) => {
    res.json({ logs: transitStore.getAuditLogs() });
  });

  app.get('/api/admin/notifications/health', requireAdmin, (_req, res) => {
    res.json({ fcmHealth: fcmService.getHealth() });
  });

  app.post('/api/admin/notifications/send', requireAdmin, async (req: AuthRequest, res) => {
    const { title, body, routeId, targetUid } = req.body ?? {};
    if (typeof title !== 'string' || !title.trim() || typeof body !== 'string' || !body.trim()) {
      return res.status(400).json({ error: 'Notification title and body are required' });
    }
    const result = await fcmService.sendNotificationToTokens({
      title: title.trim().slice(0, 160),
      body: body.trim().slice(0, 500),
      routeId: typeof routeId === 'string' && routeId.trim() ? routeId.trim() : undefined,
      targetUid: typeof targetUid === 'string' && targetUid.trim() ? targetUid.trim() : undefined,
    });

    logStaffAction(req, {
      action: 'DISPATCH_PUSH_NOTIFICATION',
      targetType: 'NOTIFICATION',
      targetId: typeof routeId === 'string' && routeId ? routeId : 'ALL',
      summary: `FCM push dispatch: sent=${result.sent}, failed=${result.failed}, pruned=${result.pruned}`,
    });

    res.json({ result, fcmHealth: fcmService.getHealth() });
  });

  // Frontend Vite / Static serving
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT) || 3000;
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`RoutePulse server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start RoutePulse server:', err);
  process.exit(1);
});
