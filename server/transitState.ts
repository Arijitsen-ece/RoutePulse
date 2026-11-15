import {
  classifyFreshnessState,
  isWithinKolkataMetroBounds,
  parseGtfsRtAlerts,
  parseGtfsRtTripUpdates,
  parseGtfsRtVehiclePositions,
  validateAndImportStaticGtfs,
  type GtfsImportResult,
} from '../src/shared/gtfsParser.ts';
import {
  createInitialServiceAlerts,
  createInitialVehiclePositions,
  generateDailyTripsForRoutes,
  INITIAL_OPERATORS,
  INITIAL_ROUTES,
  INITIAL_STOPS,
  INITIAL_VEHICLES,
} from '../src/shared/kolkataTransitData.ts';
import type {
  ActiveTelemetryMode,
  AlertSeverity,
  AlertType,
  AuditLogEntry,
  DataQualityMetrics,
  DataSourceHealth,
  DataSourceRegisterItem,
  DataSourceType,
  FeedEndpointHealth,
  Operator,
  PassengerReport,
  ReportType,
  ReportVerificationStatus,
  ScheduledTrip,
  ServiceAlert,
  TimetableBasis,
  TransitRoute,
  TransitSnapshot,
  TransitStop,
  TripUpdateRecord,
  Vehicle,
  VehiclePosition,
} from '../src/shared/types.ts';
import { haversineKm } from '../src/shared/verificationEngine.ts';
import { fcmService } from './fcmService.ts';

interface EndpointTracker {
  url: string | null;
  status: 'CONNECTED' | 'DEGRADED' | 'UNCONFIGURED' | 'BACKOFF';
  lastSuccessfulFetch: number | null;
  lastFailedFetch: number | null;
  lastError: string | null;
  consecutiveFailures: number;
  nextRetryAt: number | null;
  entityCount: number;
  lastAttemptAt: number | null;
}

function createEmptyTracker(url: string | null): EndpointTracker {
  return {
    url,
    status: url ? 'CONNECTED' : 'UNCONFIGURED',
    lastSuccessfulFetch: null,
    lastFailedFetch: null,
    lastError: null,
    consecutiveFailures: 0,
    nextRetryAt: null,
    entityCount: 0,
    lastAttemptAt: null,
  };
}

export function isAllowedFeedUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    if (parsed.protocol === 'https:') return true;
    if (
      parsed.protocol === 'http:' &&
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    ) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

class TransitStateStore {
  private operators: Operator[] = [...INITIAL_OPERATORS];
  private stops: TransitStop[] = [...INITIAL_STOPS];
  private routes: TransitRoute[] = [...INITIAL_ROUTES];
  private scheduledTrips: ScheduledTrip[] = generateDailyTripsForRoutes(INITIAL_ROUTES);
  private vehicles: Vehicle[] = [...INITIAL_VEHICLES];
  private vehiclePositions: VehiclePosition[] = createInitialVehiclePositions(Date.now());
  private tripUpdates: TripUpdateRecord[] = [];
  private externalAlerts: ServiceAlert[] = [];
  private serviceAlerts: ServiceAlert[] = createInitialServiceAlerts(Date.now());
  private passengerReports: PassengerReport[] = [];
  private auditLogs: AuditLogEntry[] = [];

  private staticTracker: EndpointTracker;
  private vehicleTracker: EndpointTracker;
  private tripUpdatesTracker: EndpointTracker;
  private alertsTracker: EndpointTracker;

  private pollIntervalMs: number;
  private gtfsStaticLastSync: number = Date.now();
  private lastTickAt: number = Date.now();
  private reportRateLimiter = new Map<string, number[]>();

  constructor() {
    const rawPoll = Number(process.env.GTFS_RT_POLL_INTERVAL_MS || 30000);
    this.pollIntervalMs = Number.isFinite(rawPoll) ? Math.max(10000, rawPoll) : 30000;

    const initUrl = (val: string | undefined): string | null => {
      const clean = (val || '').trim();
      if (!clean || clean.startsWith('MY_') || !isAllowedFeedUrl(clean)) return null;
      return clean;
    };

    this.staticTracker = createEmptyTracker(initUrl(process.env.GTFS_STATIC_FEED_URL));
    this.vehicleTracker = createEmptyTracker(initUrl(process.env.GTFS_RT_VEHICLE_FEED_URL));
    this.tripUpdatesTracker = createEmptyTracker(initUrl(process.env.GTFS_RT_TRIP_UPDATES_FEED_URL));
    this.alertsTracker = createEmptyTracker(initUrl(process.env.GTFS_RT_ALERTS_FEED_URL));

    const now = Date.now();
    this.passengerReports = [
      {
        reportId: 'rep_seed_1',
        userId: 'commuter_kol_01',
        userDisplayName: 'Ananya Sen',
        routeId: 'route_s12',
        stopId: 'stop_parkcircus',
        reportType: 'ARRIVAL_CONFIRMED',
        note: 'Sample community observation: S-12 AC bus spotted passing Park Circus 7-Point.',
        verificationStatus: 'CONFIRMED',
        confirmationCount: 3,
        createdAt: now - 8 * 60 * 1000,
        updatedAt: now - 7 * 60 * 1000,
      },
      {
        reportId: 'rep_seed_2',
        userId: 'commuter_kol_02',
        userDisplayName: 'Subhajit Das',
        routeId: 'route_45',
        stopId: 'stop_sealdah',
        reportType: 'DELAY',
        note: 'Sample community observation: Route 45 moving slowly near Sealdah approach.',
        verificationStatus: 'PENDING',
        confirmationCount: 1,
        createdAt: now - 12 * 60 * 1000,
        updatedAt: now - 12 * 60 * 1000,
      },
    ];
  }

  private maskUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}/...`;
    } catch {
      return 'configured-feed';
    }
  }

  private toEndpointHealth(tracker: EndpointTracker): FeedEndpointHealth {
    return {
      configured: Boolean(tracker.url),
      urlMasked: tracker.url ? this.maskUrl(tracker.url) : null,
      status: tracker.url ? tracker.status : 'UNCONFIGURED',
      lastSuccessfulFetch: tracker.lastSuccessfulFetch,
      lastFailedFetch: tracker.lastFailedFetch,
      lastError: tracker.lastError,
      consecutiveFailures: tracker.consecutiveFailures,
      nextRetryAt: tracker.nextRetryAt,
      entityCount: tracker.entityCount,
    };
  }

  private computeDataQuality(now: number, positionsWithFreshness: VehiclePosition[]): DataQualityMetrics {
    const officialTimetableRoutesCount = this.routes.filter(
      (r) => r.timetableBasis === 'OFFICIAL_TIMETABLE' || r.timetableBasis === 'OFFICIAL_FREQUENCY'
    ).length;
    const estimatedFrequencyRoutesCount = this.routes.length - officialTimetableRoutesCount;
    const officialVerifiedPercent =
      this.routes.length > 0
        ? Math.round((officialTimetableRoutesCount / this.routes.length) * 100)
        : 0;

    const stopsWithinKolkataBoundsCount = this.stops.filter((s) =>
      isWithinKolkataMetroBounds(s.lat, s.lng)
    ).length;
    const stopsOutOfBoundsCount = this.stops.length - stopsWithinKolkataBoundsCount;

    const freshVehiclesCount = positionsWithFreshness.filter((v) => v.freshnessState === 'FRESH').length;
    const delayedVehiclesCount = positionsWithFreshness.filter(
      (v) => v.freshnessState === 'DELAYED_UPDATE'
    ).length;
    const staleVehiclesCount = positionsWithFreshness.filter((v) => v.freshnessState === 'STALE').length;
    const unavailableVehiclesCount = positionsWithFreshness.filter(
      (v) => v.freshnessState === 'UNAVAILABLE'
    ).length;

    const warnings: string[] = [];
    if (officialTimetableRoutesCount === 0) {
      warnings.push(
        'No official static GTFS timetable loaded; corridors currently use estimated frequencies.'
      );
    }
    if (!this.vehicleTracker.url) {
      warnings.push(
        'No official GTFS-RT VehiclePositions URL configured; telemetry uses clearly labelled demonstration coordinates.'
      );
    }
    if (!this.alertsTracker.url) {
      warnings.push('No official GTFS-RT ServiceAlerts feed connected.');
    }
    if (stopsOutOfBoundsCount > 0) {
      warnings.push(`${stopsOutOfBoundsCount} stop(s) lie outside Kolkata Metro bounding box.`);
    }

    return {
      totalRoutes: this.routes.length,
      totalStops: this.stops.length,
      totalTrips: this.scheduledTrips.length,
      officialTimetableRoutesCount,
      estimatedFrequencyRoutesCount,
      officialVerifiedPercent,
      stopsWithinKolkataBoundsCount,
      stopsOutOfBoundsCount,
      freshVehiclesCount,
      delayedVehiclesCount,
      staleVehiclesCount,
      unavailableVehiclesCount,
      lastValidatedAt: now,
      warnings,
    };
  }

  private resolveActiveTelemetryMode(positionsWithFreshness: VehiclePosition[]): ActiveTelemetryMode {
    const hasFreshOfficialVehicle = positionsWithFreshness.some(
      (p) =>
        p.sourceType === 'OFFICIAL_VERIFIED' &&
        (p.freshnessState === 'FRESH' || p.freshnessState === 'DELAYED_UPDATE')
    );
    if (this.vehicleTracker.url && hasFreshOfficialVehicle) {
      return 'OFFICIAL_LIVE';
    }
    if (
      this.staticTracker.url ||
      this.routes.some((r) => r.timetableBasis === 'OFFICIAL_TIMETABLE')
    ) {
      return 'OFFICIAL_STATIC';
    }
    const hasConfirmedCommunity = this.passengerReports.some(
      (r) =>
        r.reportType === 'ARRIVAL_CONFIRMED' &&
        (r.verificationStatus === 'CONFIRMED' || r.confirmationCount >= 2)
    );
    if (this.vehiclePositions.every((p) => p.sourceType !== 'SYNTHETIC_DEMO')) {
      return hasConfirmedCommunity ? 'PASSENGER_CONFIRMED' : 'OPEN_DATA';
    }
    return 'SYNTHETIC_DEMO';
  }

  public getSnapshot(): TransitSnapshot {
    const now = Date.now();
    const positionsWithFreshness: VehiclePosition[] = this.vehiclePositions.map((pos) => ({
      ...pos,
      freshnessState: classifyFreshnessState(
        pos.observationTimestamp || pos.lastGpsTimestamp,
        now,
        pos.gpsStaleSimulated
      ),
    }));

    const combinedAlerts = [...this.externalAlerts, ...this.serviceAlerts];
    const dataQuality = this.computeDataQuality(now, positionsWithFreshness);
    const activeTelemetryMode = this.resolveActiveTelemetryMode(positionsWithFreshness);

    const dataHealth: DataSourceHealth = {
      gtfsStaticLoaded: this.routes.length > 0 && this.stops.length > 0,
      gtfsStaticLastSync: this.gtfsStaticLastSync,
      gtfsRtFeedConfigured: Boolean(this.vehicleTracker.url),
      gtfsRtFeedUrlMasked: this.vehicleTracker.url ? this.maskUrl(this.vehicleTracker.url) : null,
      officialStaticFeedConnected:
        Boolean(this.staticTracker.url && this.staticTracker.status === 'CONNECTED') ||
        this.routes.some((r) => r.timetableBasis === 'OFFICIAL_TIMETABLE'),
      officialTripUpdatesConnected: Boolean(
        this.tripUpdatesTracker.url && this.tripUpdatesTracker.status === 'CONNECTED'
      ),
      officialAlertFeedConnected: Boolean(
        this.alertsTracker.url && this.alertsTracker.status === 'CONNECTED'
      ),
      activeTelemetryMode,
      pollIntervalMs: this.pollIntervalMs,
      freshVehiclesCount: dataQuality.freshVehiclesCount + dataQuality.delayedVehiclesCount,
      staleVehiclesCount: dataQuality.staleVehiclesCount + dataQuality.unavailableVehiclesCount,
      totalRoutes: this.routes.length,
      totalStops: this.stops.length,
      pendingReportsCount: this.passengerReports.filter((r) => r.verificationStatus === 'PENDING').length,
      activeAlertsCount: combinedAlerts.filter((a) => a.active).length,
      lastTickAt: this.lastTickAt,
      vehicleFeedHealth: this.toEndpointHealth(this.vehicleTracker),
      tripUpdatesFeedHealth: this.toEndpointHealth(this.tripUpdatesTracker),
      alertsFeedHealth: this.toEndpointHealth(this.alertsTracker),
      staticFeedHealth: this.toEndpointHealth(this.staticTracker),
      fcmHealth: fcmService.getHealth(),
      dataQuality,
    };

    return {
      operators: this.operators,
      stops: this.stops,
      routes: this.routes,
      scheduledTrips: this.scheduledTrips,
      vehicles: this.vehicles,
      vehiclePositions: positionsWithFreshness,
      tripUpdates: this.tripUpdates,
      serviceAlerts: combinedAlerts,
      passengerReports: this.passengerReports,
      dataHealth,
      serverTimestamp: now,
    };
  }

  private recordFeedFailure(tracker: EndpointTracker, err: unknown, now: number) {
    tracker.consecutiveFailures += 1;
    tracker.lastFailedFetch = now;
    tracker.lastError = err instanceof Error ? err.message : String(err);
    const backoffSeconds = Math.min(300, 30 * Math.pow(2, Math.max(0, tracker.consecutiveFailures - 1)));
    tracker.nextRetryAt = now + backoffSeconds * 1000;
    tracker.status = tracker.consecutiveFailures >= 2 ? 'BACKOFF' : 'DEGRADED';
  }

  private recordFeedSuccess(tracker: EndpointTracker, entityCount: number, now: number) {
    tracker.consecutiveFailures = 0;
    tracker.lastSuccessfulFetch = now;
    tracker.lastError = null;
    tracker.nextRetryAt = null;
    tracker.entityCount = entityCount;
    tracker.status = 'CONNECTED';
  }

  private shouldPollTracker(tracker: EndpointTracker, now: number): boolean {
    if (!tracker.url) return false;
    if (tracker.nextRetryAt && now < tracker.nextRetryAt) return false;
    if (tracker.lastAttemptAt && now - tracker.lastAttemptAt < this.pollIntervalMs) return false;
    return true;
  }

  public async pollExternalFeeds(force = false): Promise<void> {
    const now = Date.now();
    const routesMap = new Map(this.routes.map((r) => [r.routeId, r]));

    // 1. VehiclePositions GTFS-RT JSON
    if (this.vehicleTracker.url && (force || this.shouldPollTracker(this.vehicleTracker, now))) {
      this.vehicleTracker.lastAttemptAt = now;
      try {
        const res = await fetch(this.vehicleTracker.url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as unknown;
        const parsed = parseGtfsRtVehiclePositions(payload, routesMap, now, 'OFFICIAL_VERIFIED');
        if (parsed.positions.length > 0) {
          this.vehiclePositions = parsed.positions;
        }
        this.recordFeedSuccess(this.vehicleTracker, parsed.positions.length, now);
      } catch (err) {
        // NEVER update observationTimestamp or lastGpsTimestamp on failure!
        this.recordFeedFailure(this.vehicleTracker, err, now);
      }
    }

    // 2. TripUpdates GTFS-RT JSON
    if (this.tripUpdatesTracker.url && (force || this.shouldPollTracker(this.tripUpdatesTracker, now))) {
      this.tripUpdatesTracker.lastAttemptAt = now;
      try {
        const res = await fetch(this.tripUpdatesTracker.url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as unknown;
        const parsed = parseGtfsRtTripUpdates(payload, now, 'OFFICIAL_VERIFIED');
        this.tripUpdates = parsed.tripUpdates;
        this.recordFeedSuccess(this.tripUpdatesTracker, parsed.tripUpdates.length, now);
      } catch (err) {
        this.recordFeedFailure(this.tripUpdatesTracker, err, now);
      }
    }

    // 3. ServiceAlerts GTFS-RT JSON
    if (this.alertsTracker.url && (force || this.shouldPollTracker(this.alertsTracker, now))) {
      this.alertsTracker.lastAttemptAt = now;
      try {
        const res = await fetch(this.alertsTracker.url, { signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const payload = (await res.json()) as unknown;
        const parsed = parseGtfsRtAlerts(payload, now, this.alertsTracker.url);
        this.externalAlerts = parsed.alerts;
        this.recordFeedSuccess(this.alertsTracker, parsed.alerts.length, now);
      } catch (err) {
        this.recordFeedFailure(this.alertsTracker, err, now);
      }
    }
  }

  public async tickTelemetry(): Promise<TransitSnapshot> {
    const now = Date.now();
    this.lastTickAt = now;

    if (this.vehicleTracker.url || this.tripUpdatesTracker.url || this.alertsTracker.url) {
      await this.pollExternalFeeds(false);
    }

    // Only simulate movement on synthetic demo vehicles when no live vehicle feed is configured
    if (!this.vehicleTracker.url) {
      const stopsMap = new Map(this.stops.map((s) => [s.stopId, s]));
      const routesMap = new Map(this.routes.map((r) => [r.routeId, r]));

      this.vehiclePositions = this.vehiclePositions.map((pos) => {
        if (pos.gpsStaleSimulated || pos.sourceType !== 'SYNTHETIC_DEMO') {
          return pos;
        }
        const route = routesMap.get(pos.routeId);
        if (!route || route.stopSequence.length < 2) return pos;

        const seq = route.stopSequence;
        let targetIdx = seq.findIndex((s) => s.stopId === pos.nextStopId);
        if (targetIdx === -1) targetIdx = 1;

        const targetEntry = seq[targetIdx];
        const targetStop = stopsMap.get(targetEntry.stopId);
        if (!targetStop) return pos;

        const distKm = haversineKm(pos.lat, pos.lng, targetStop.lat, targetStop.lng);
        const speedKmh = Math.max(12, Math.min(28, pos.speedKmh + (Math.random() - 0.5) * 3));
        const stepKm = (speedKmh / 3600) * 4;

        if (distKm <= Math.max(0.08, stepKm * 1.4)) {
          const nextIdx = targetIdx + 1 < seq.length ? targetIdx + 1 : 1;
          const nextEntry = seq[nextIdx];
          const prevEntry = seq[nextIdx - 1];
          const prevStop = stopsMap.get(prevEntry.stopId);
          const nextStop = stopsMap.get(nextEntry.stopId);

          const bearing =
            prevStop && nextStop
              ? this.computeBearing(prevStop.lat, prevStop.lng, nextStop.lat, nextStop.lng)
              : pos.bearing;

          return {
            ...pos,
            lat: prevStop ? prevStop.lat : targetStop.lat,
            lng: prevStop ? prevStop.lng : targetStop.lng,
            currentStopSequence: prevEntry.sequenceOrder,
            nextStopId: nextEntry.stopId,
            speedKmh: Number(speedKmh.toFixed(1)),
            bearing,
            lastGpsTimestamp: now,
            observationTimestamp: now,
            ingestedAt: now,
            sourceType: 'SYNTHETIC_DEMO',
          };
        }

        const ratio = Math.min(1, stepKm / distKm);
        const newLat = pos.lat + (targetStop.lat - pos.lat) * ratio;
        const newLng = pos.lng + (targetStop.lng - pos.lng) * ratio;
        const bearing = this.computeBearing(pos.lat, pos.lng, targetStop.lat, targetStop.lng);

        return {
          ...pos,
          lat: Number(newLat.toFixed(6)),
          lng: Number(newLng.toFixed(6)),
          speedKmh: Number(speedKmh.toFixed(1)),
          bearing,
          lastGpsTimestamp: now,
          observationTimestamp: now,
          ingestedAt: now,
          sourceType: 'SYNTHETIC_DEMO',
        };
      });
    }

    return this.getSnapshot();
  }

  private computeBearing(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const y = Math.sin(((lng2 - lng1) * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180);
    const x =
      Math.cos((lat1 * Math.PI) / 180) * Math.sin((lat2 * Math.PI) / 180) -
      Math.sin((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.cos(((lng2 - lng1) * Math.PI) / 180);
    const brng = (Math.atan2(y, x) * 180) / Math.PI;
    return Math.round((brng + 360) % 360);
  }

  public importStaticGtfs(
    files: Record<string, string>,
    options: {
      dryRun?: boolean;
      replaceExisting?: boolean;
      sourceLabel?: string;
      sourceType?: DataSourceType;
      timetableBasis?: TimetableBasis;
      sourceUrl?: string;
    } = {}
  ): GtfsImportResult {
    const result = validateAndImportStaticGtfs(files, options);
    if (!result.ok || result.dryRun) {
      return result;
    }

    if (options.replaceExisting) {
      this.operators = result.parsedOperators;
      this.stops = result.parsedStops;
      this.routes = result.parsedRoutes;
      this.scheduledTrips = result.parsedTrips;
    } else {
      const opMap = new Map(this.operators.map((o) => [o.operatorId, o]));
      result.parsedOperators.forEach((o) => opMap.set(o.operatorId, o));
      this.operators = Array.from(opMap.values());

      const stopMap = new Map(this.stops.map((s) => [s.stopId, s]));
      result.parsedStops.forEach((s) => stopMap.set(s.stopId, s));
      this.stops = Array.from(stopMap.values());

      const routeMap = new Map(this.routes.map((r) => [r.routeId, r]));
      result.parsedRoutes.forEach((r) => routeMap.set(r.routeId, r));
      this.routes = Array.from(routeMap.values());

      const tripMap = new Map(this.scheduledTrips.map((t) => [t.tripId, t]));
      result.parsedTrips.forEach((t) => tripMap.set(t.tripId, t));
      this.scheduledTrips = Array.from(tripMap.values());
    }

    this.gtfsStaticLastSync = Date.now();
    return result;
  }

  public async syncStaticFeed(overrideUrl?: string): Promise<GtfsImportResult | null> {
    const url = overrideUrl?.trim() || this.staticTracker.url;
    if (!url || !isAllowedFeedUrl(url)) return null;
    const now = Date.now();
    this.staticTracker.lastAttemptAt = now;
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('json')) {
        throw new Error('Static feed URL must return JSON map of GTFS text files ({ "stops.txt": ..., "routes.txt": ..., "trips.txt": ..., "stop_times.txt": ... }).');
      }
      const files = (await res.json()) as Record<string, string>;
      const imported = this.importStaticGtfs(files, {
        dryRun: false,
        sourceType: 'OFFICIAL_VERIFIED',
        timetableBasis: 'OFFICIAL_TIMETABLE',
        sourceLabel: `Static GTFS Sync (${this.maskUrl(url)})`,
        sourceUrl: url,
      });
      if (!imported.ok) {
        throw new Error(imported.errors[0] || 'Static GTFS validation failed');
      }
      this.recordFeedSuccess(this.staticTracker, imported.summary.routesCount, now);
      return imported;
    } catch (err) {
      this.recordFeedFailure(this.staticTracker, err, now);
      return null;
    }
  }

  public submitPassengerReport(params: {
    userId: string;
    userDisplayName: string;
    routeId: string;
    stopId: string;
    reportType: ReportType;
    note: string;
    lat?: number;
    lng?: number;
  }): { ok: true; report: PassengerReport; deduplicated: boolean } | { ok: false; status: number; error: string } {
    const now = Date.now();
    const routeExists = this.routes.some((r) => r.routeId === params.routeId);
    const stopExists = this.stops.some((s) => s.stopId === params.stopId);
    if (!routeExists || !stopExists) {
      return { ok: false, status: 400, error: 'Invalid route or stop identifier.' };
    }

    const windowMs = 15 * 60 * 1000;
    const recentTimestamps = (this.reportRateLimiter.get(params.userId) ?? []).filter(
      (ts) => now - ts <= windowMs
    );
    if (recentTimestamps.length >= 5) {
      return {
        ok: false,
        status: 429,
        error: 'Rate limit exceeded. Maximum 5 reports allowed per 15 minutes.',
      };
    }
    this.reportRateLimiter.set(params.userId, [...recentTimestamps, now]);

    const duplicateWindow = 10 * 60 * 1000;
    const existingSimilar = this.passengerReports.find(
      (r) =>
        r.routeId === params.routeId &&
        r.stopId === params.stopId &&
        r.reportType === params.reportType &&
        r.verificationStatus !== 'REJECTED' &&
        now - r.createdAt <= duplicateWindow
    );

    if (existingSimilar) {
      if (existingSimilar.userId === params.userId && now - existingSimilar.createdAt < 3 * 60 * 1000) {
        return {
          ok: false,
          status: 409,
          error: 'Duplicate report already submitted for this stop and route.',
        };
      }
      existingSimilar.confirmationCount += 1;
      existingSimilar.updatedAt = now;
      if (existingSimilar.confirmationCount >= 3 && existingSimilar.verificationStatus === 'PENDING') {
        if (existingSimilar.reportType === 'ARRIVAL_CONFIRMED' || existingSimilar.reportType === 'DELAY') {
          existingSimilar.verificationStatus = 'CONFIRMED';
        }
      }
      return { ok: true, report: existingSimilar, deduplicated: true };
    }

    const sanitizedNote = params.note.trim().slice(0, 400);
    const report: PassengerReport = {
      reportId: `rep_${now}_${Math.random().toString(36).slice(2, 7)}`,
      userId: params.userId,
      userDisplayName: params.userDisplayName.slice(0, 80) || 'Passenger',
      routeId: params.routeId,
      stopId: params.stopId,
      reportType: params.reportType,
      note: sanitizedNote,
      lat: params.lat,
      lng: params.lng,
      verificationStatus: 'PENDING',
      confirmationCount: 1,
      createdAt: now,
      updatedAt: now,
    };

    this.passengerReports = [report, ...this.passengerReports].slice(0, 100);
    return { ok: true, report, deduplicated: false };
  }

  public moderatePassengerReport(reportId: string, status: ReportVerificationStatus): PassengerReport | null {
    const target = this.passengerReports.find((r) => r.reportId === reportId);
    if (!target) return null;
    target.verificationStatus = status;
    target.updatedAt = Date.now();
    return target;
  }

  public createServiceAlert(params: {
    routeId: string;
    affectedStopIds: string[];
    alertType: AlertType;
    severity: AlertSeverity;
    titleEn: string;
    descriptionEn: string;
    issuingOrganization?: string;
    sourceUrl?: string;
    endTime?: number;
  }): ServiceAlert | null {
    const routeExists =
      params.routeId === 'ALL' || this.routes.some((r) => r.routeId === params.routeId);
    if (!routeExists) return null;

    const now = Date.now();
    const alert: ServiceAlert = {
      alertId: `alert_${now}_${Math.random().toString(36).slice(2, 6)}`,
      routeId: params.routeId,
      affectedStopIds: params.affectedStopIds,
      alertType: params.alertType,
      severity: params.severity,
      title: { en: params.titleEn, hi: params.titleEn, bn: params.titleEn },
      description: { en: params.descriptionEn, hi: params.descriptionEn, bn: params.descriptionEn },
      sourceType: 'OFFICIAL_VERIFIED',
      issuingOrganization:
        params.issuingOrganization?.trim() || 'RoutePulse Operations Desk (Admin-Verified)',
      verifiedByAdmin: true,
      active: true,
      startTime: now,
      endTime: params.endTime,
      publicationTime: now,
      lastUpdatedTime: now,
      sourceUrl: params.sourceUrl,
      createdAt: now,
    };
    this.serviceAlerts = [alert, ...this.serviceAlerts];
    return alert;
  }

  public toggleServiceAlert(alertId: string, active: boolean): ServiceAlert | null {
    const alert =
      this.serviceAlerts.find((a) => a.alertId === alertId) ||
      this.externalAlerts.find((a) => a.alertId === alertId);
    if (!alert) return null;
    alert.active = active;
    alert.lastUpdatedTime = Date.now();
    return alert;
  }

  public updateRouteMetadata(
    routeId: string,
    updates: Partial<
      Pick<TransitRoute, 'firstDeparture' | 'lastDeparture' | 'frequencyMin' | 'active' | 'timetableBasis'>
    >
  ): TransitRoute | null {
    const route = this.routes.find((r) => r.routeId === routeId);
    if (!route) return null;
    if (updates.firstDeparture) route.firstDeparture = updates.firstDeparture;
    if (updates.lastDeparture) route.lastDeparture = updates.lastDeparture;
    if (typeof updates.frequencyMin === 'number' && updates.frequencyMin >= 3) {
      route.frequencyMin = updates.frequencyMin;
    }
    if (typeof updates.active === 'boolean') route.active = updates.active;
    if (updates.timetableBasis) route.timetableBasis = updates.timetableBasis;
    route.lastVerifiedAt = Date.now();
    this.scheduledTrips = generateDailyTripsForRoutes(this.routes);
    return route;
  }

  public createRoute(params: {
    routeNumber: string;
    operatorId: string;
    originEn: string;
    destinationEn: string;
    stopIds: string[];
    firstDeparture: string;
    lastDeparture: string;
    frequencyMin: number;
    isAc: boolean;
    timetableBasis?: TimetableBasis;
    sourceLabel?: string;
    sourceUrl?: string;
  }): TransitRoute | null {
    if (!params.routeNumber.trim() || params.stopIds.length < 2) return null;
    const stopsMap = new Map(this.stops.map((s) => [s.stopId, s]));
    const stopSequence = params.stopIds
      .filter((id) => stopsMap.has(id))
      .map((id, idx) => ({
        routeId: '',
        stopId: id,
        sequenceOrder: idx + 1,
        distanceFromOriginKm: Number((idx * 2.4).toFixed(1)),
        scheduledOffsetMin: idx * 9,
      }));
    if (stopSequence.length < 2) return null;

    const routeId = `route_${params.routeNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}_${Date.now().toString().slice(-4)}`;
    stopSequence.forEach((s) => {
      s.routeId = routeId;
    });

    const newRoute: TransitRoute = {
      routeId,
      routeNumber: params.routeNumber.trim().toUpperCase(),
      operatorId: params.operatorId,
      origin: { en: params.originEn, hi: params.originEn, bn: params.originEn },
      destination: { en: params.destinationEn, hi: params.destinationEn, bn: params.destinationEn },
      corridorSummary: {
        en: `${params.originEn} to ${params.destinationEn}`,
        hi: `${params.originEn} से ${params.destinationEn}`,
        bn: `${params.originEn} থেকে ${params.destinationEn}`,
      },
      operatingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
      firstDeparture: params.firstDeparture || '06:00',
      lastDeparture: params.lastDeparture || '21:30',
      frequencyMin: Math.max(5, params.frequencyMin || 20),
      fareMinInr: params.isAc ? 20 : 10,
      fareMaxInr: params.isAc ? 50 : 25,
      isAc: params.isAc,
      active: true,
      dataSource: 'OFFICIAL_VERIFIED',
      timetableBasis: params.timetableBasis || 'ESTIMATED_FREQUENCY',
      sourceLabel: params.sourceLabel || 'Admin-verified corridor entry',
      sourceUrl: params.sourceUrl,
      lastVerifiedAt: Date.now(),
      stopSequence,
    };

    this.routes = [...this.routes, newRoute];
    this.scheduledTrips = generateDailyTripsForRoutes(this.routes);
    return newRoute;
  }

  public addStop(params: {
    nameEn: string;
    localityEn: string;
    lat: number;
    lng: number;
    zone: string;
  }): TransitStop {
    const stop: TransitStop = {
      stopId: `stop_${Date.now().toString().slice(-6)}`,
      name: { en: params.nameEn, hi: params.nameEn, bn: params.nameEn },
      locality: { en: params.localityEn, hi: params.localityEn, bn: params.localityEn },
      lat: params.lat,
      lng: params.lng,
      zone: params.zone || 'Kolkata',
      isMajorHub: false,
      wheelchairAccessible: false,
      sourceType: 'OFFICIAL_VERIFIED',
      sourceLabel: 'Admin-verified stop coordinates',
    };
    this.stops = [...this.stops, stop];
    return stop;
  }

  public configureFeeds(params: {
    gtfsStaticFeedUrl?: string | null;
    gtfsRtFeedUrl?: string | null;
    gtfsRtTripUpdatesFeedUrl?: string | null;
    gtfsRtAlertsFeedUrl?: string | null;
    pollIntervalMs?: number;
  }): { ok: boolean; error?: string } {
    const apply = (
      val: string | null | undefined,
      current: EndpointTracker
    ): { ok: boolean; tracker: EndpointTracker; error?: string } => {
      if (val === undefined) return { ok: true, tracker: current };
      const clean = (val || '').trim();
      if (!clean) return { ok: true, tracker: createEmptyTracker(null) };
      if (!isAllowedFeedUrl(clean)) {
        return {
          ok: false,
          tracker: current,
          error: `Feed URL must use HTTPS (or http://localhost for testing): ${clean}`,
        };
      }
      return { ok: true, tracker: createEmptyTracker(clean) };
    };

    const s = apply(params.gtfsStaticFeedUrl, this.staticTracker);
    if (!s.ok) return { ok: false, error: s.error };
    const v = apply(params.gtfsRtFeedUrl, this.vehicleTracker);
    if (!v.ok) return { ok: false, error: v.error };
    const t = apply(params.gtfsRtTripUpdatesFeedUrl, this.tripUpdatesTracker);
    if (!t.ok) return { ok: false, error: t.error };
    const a = apply(params.gtfsRtAlertsFeedUrl, this.alertsTracker);
    if (!a.ok) return { ok: false, error: a.error };

    this.staticTracker = s.tracker;
    this.vehicleTracker = v.tracker;
    this.tripUpdatesTracker = t.tracker;
    this.alertsTracker = a.tracker;

    if (typeof params.pollIntervalMs === 'number' && Number.isFinite(params.pollIntervalMs)) {
      this.pollIntervalMs = Math.max(10000, Math.min(300000, params.pollIntervalMs));
    }

    return { ok: true };
  }

  public toggleVehicleGpsSimulation(vehicleId: string, stale: boolean): VehiclePosition | null {
    const v = this.vehiclePositions.find((pos) => pos.vehicleId === vehicleId);
    if (!v) return null;
    v.gpsStaleSimulated = stale;
    const ts = stale ? Date.now() - 420 * 1000 : Date.now();
    v.lastGpsTimestamp = ts;
    v.observationTimestamp = ts;
    v.ingestedAt = Date.now();
    v.freshnessState = classifyFreshnessState(ts, Date.now(), stale);
    return v;
  }

  public recordAuditLog(entry: Omit<AuditLogEntry, 'logId' | 'timestamp'>): AuditLogEntry {
    const now = Date.now();
    const record: AuditLogEntry = {
      ...entry,
      logId: `audit_${now}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: now,
    };
    this.auditLogs = [record, ...this.auditLogs].slice(0, 150);
    return record;
  }

  public getAuditLogs(): AuditLogEntry[] {
    return this.auditLogs;
  }

  public getDataSourceRegister(): DataSourceRegisterItem[] {
    return [
      {
        id: 'src_wb_transport',
        name: 'West Bengal Transport Department Portal',
        category: 'OFFICIAL_GOVERNMENT',
        status: 'NOT_PUBLICLY_AVAILABLE',
        dataSourceType: 'UNVERIFIED',
        licenseOrTerms: 'Official portal; no public GTFS ZIP download or open developer REST/GTFS-RT API published.',
        endpointUrl: 'https://transport.wb.gov.in/',
        notes: 'Reviewed bus services, timetable, and trip-planner portals. Requires official data-sharing MOU for live VLTD/GTFS feeds.',
      },
      {
        id: 'src_wbtc_sbstc_nbstc',
        name: 'WBTC / SBSTC / NBSTC Undertaking Portals',
        category: 'OFFICIAL_GOVERNMENT',
        status: 'NOT_PUBLICLY_AVAILABLE',
        dataSourceType: 'UNVERIFIED',
        licenseOrTerms: 'Public passenger web portals only; no public API credentials or open GTFS-RT feeds.',
        endpointUrl: 'https://wbtconline.in/',
        notes: 'Route identities referenced for corridor naming; published departure clocks are not open machine-readable feeds.',
      },
      {
        id: 'src_yatrisathi',
        name: 'Yatri Sathi & Yatri Sathi Open Data',
        category: 'OPEN_TRANSIT',
        status: 'NOT_PUBLICLY_AVAILABLE',
        dataSourceType: 'UNVERIFIED',
        licenseOrTerms: 'Open Data portal primarily exposes mobility/ride metrics rather than Kolkata bus GTFS-RT feeds.',
        endpointUrl: 'https://www.yatrisathi.in/open/',
        notes: 'Requires official integration approval if bus telemetry feeds become available.',
      },
      {
        id: 'src_mobility_db_transitland',
        name: 'Mobility Database & Transitland Catalogues',
        category: 'OPEN_TRANSIT',
        status: this.staticTracker.url ? 'CONNECTED' : 'UNCONFIGURED',
        dataSourceType: this.staticTracker.url ? 'OFFICIAL_VERIFIED' : 'UNVERIFIED',
        licenseOrTerms: 'Open transit directories; no verified active Kolkata bus GTFS-RT feed listed publicly.',
        endpointUrl: this.staticTracker.url ? this.maskUrl(this.staticTracker.url) : 'https://mobilitydatabase.org/',
        notes: 'Static GTFS CSV importer & external feed URL polling ready whenever an official/licensed GTFS package is supplied.',
      },
      {
        id: 'src_osm_ptna',
        name: 'OpenStreetMap & PTNA Kolkata Bus Stop Coordinates',
        category: 'OPEN_TRANSIT',
        status: 'CONNECTED',
        dataSourceType: 'OPEN_LICENSED',
        licenseOrTerms: 'Open Database License (ODbL)',
        endpointUrl: 'https://www.openstreetmap.org/',
        notes: 'Supplies open stop hub coordinates across Kolkata Metro; lacks official schedules or live vehicle GPS.',
      },
      {
        id: 'src_open_meteo',
        name: 'Open-Meteo Kolkata Weather API',
        category: 'WEATHER',
        status: 'CONNECTED',
        dataSourceType: 'OPEN_LICENSED',
        licenseOrTerms: 'CC BY 4.0 / Open-Meteo non-commercial API',
        endpointUrl: 'https://api.open-meteo.com/v1/forecast',
        notes: 'Live Kolkata weather temperature and WMO weather code cached every 15 minutes.',
      },
      {
        id: 'src_demo_telemetry',
        name: 'RoutePulse Demonstration & Estimated Frequency Baseline',
        category: 'DEMO_FALLBACK',
        status: this.vehicleTracker.url ? 'UNCONFIGURED' : 'ACTIVE_FALLBACK',
        dataSourceType: 'SYNTHETIC_DEMO',
        licenseOrTerms: 'Built-in fallback for demonstration & testing when official feeds are unconfigured.',
        endpointUrl: null,
        notes: 'Explicitly labelled Estimated Frequency / Demonstration Telemetry; never disguised as official live GPS or official timetables.',
      },
    ];
  }
}

export const transitStore = new TransitStateStore();
