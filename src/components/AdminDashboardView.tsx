import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertTriangle,
  BellRing,
  Check,
  Database,
  FileSpreadsheet,
  History,
  LogIn,
  Plus,
  Radio,
  ShieldAlert,
  Upload,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext.tsx';
import { useTransit } from '../context/TransitContext.tsx';
import type {
  AlertSeverity,
  AlertType,
  AuditLogEntry,
  DataSourceRegisterItem,
  DataSourceType,
  TimetableBasis,
} from '../shared/types.ts';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Input } from './ui/input.tsx';
import { cn } from '../lib/utils.ts';

type AdminSubTab = 'overview' | 'feeds' | 'alerts' | 'reports' | 'audit';

interface GtfsImportResult {
  ok: boolean;
  dryRun: boolean;
  summary: {
    stopsCount: number;
    routesCount: number;
    tripsCount: number;
    stopTimesCount: number;
  };
  warnings: string[];
  errors: string[];
}

export function AdminDashboardView() {
  const { t } = useTranslation();
  const { user, userRole, isAdmin, isStaff, signInWithGoogle, getIdToken } = useAuth();
  const { snapshot, stopsMap, refreshSnapshot } = useTransit();

  const isModeratorOrAdmin = userRole === 'moderator' || userRole === 'admin';
  const isOperatorOrAdmin = userRole === 'operator' || userRole === 'admin';

  const [subTab, setSubTab] = useState<AdminSubTab>(
    userRole === 'moderator' ? 'reports' : 'overview'
  );

  // Feed endpoints config
  const [staticFeedUrl, setStaticFeedUrl] = useState('');
  const [vehicleFeedUrl, setVehicleFeedUrl] = useState('');
  const [tripUpdatesFeedUrl, setTripUpdatesFeedUrl] = useState('');
  const [alertsFeedUrl, setAlertsFeedUrl] = useState('');
  const [pollIntervalMs, setPollIntervalMs] = useState(
    String(snapshot.dataHealth.pollIntervalMs || 30000)
  );
  const [feedSyncing, setFeedSyncing] = useState(false);

  // Static GTFS CSV Importer
  const [stopsCsv, setStopsCsv] = useState('');
  const [routesCsv, setRoutesCsv] = useState('');
  const [tripsCsv, setTripsCsv] = useState('');
  const [stopTimesCsv, setStopTimesCsv] = useState('');
  const [agencyCsv, setAgencyCsv] = useState('');
  const [calendarCsv, setCalendarCsv] = useState('');
  const [importSourceLabel, setImportSourceLabel] = useState('Official WBTC/GTFS Package');
  const [importSourceType, setImportSourceType] = useState<DataSourceType>('OFFICIAL_VERIFIED');
  const [importBasis, setImportBasis] = useState<TimetableBasis>('OFFICIAL_TIMETABLE');
  const [importResult, setImportResult] = useState<GtfsImportResult | null>(null);
  const [importBusy, setImportBusy] = useState(false);

  // Service alert form
  const [alertRouteId, setAlertRouteId] = useState(snapshot.routes[0]?.routeId || 'route_s12');
  const [alertType, setAlertType] = useState<AlertType>('DELAY');
  const [alertSeverity, setAlertSeverity] = useState<AlertSeverity>('WARNING');
  const [alertTitle, setAlertTitle] = useState('');
  const [alertDesc, setAlertDesc] = useState('');
  const [alertOrg, setAlertOrg] = useState('RoutePulse Operations Desk');
  const [alertSendPush, setAlertSendPush] = useState(false);

  // Direct FCM push broadcast
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushRouteId, setPushRouteId] = useState('');

  // Quick Route & Stop creation
  const [newRouteNumber, setNewRouteNumber] = useState('');
  const [newOrigin, setNewOrigin] = useState('');
  const [newDest, setNewDest] = useState('');
  const [newFreq, setNewFreq] = useState('20');
  const [newStop1, setNewStop1] = useState(snapshot.stops[0]?.stopId || 'stop_howrah');
  const [newStop2, setNewStop2] = useState(snapshot.stops[2]?.stopId || 'stop_esplanade');

  // Data Sources & Audit Logs
  const [sources, setSources] = useState<DataSourceRegisterItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  const authFetch = async <T = unknown>(url: string, options: RequestInit = {}): Promise<T> => {
    const token = await getIdToken();
    const res = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error((payload as { error?: string }).error || 'Operation failed');
    }
    return payload as T;
  };

  useEffect(() => {
    if (!user || !isStaff) return;
    fetch('/api/sources/register')
      .then((r) => (r.ok ? r.json() : { sources: [] }))
      .then((data: { sources?: DataSourceRegisterItem[] }) => setSources(data.sources || []))
      .catch(() => {});
  }, [user, isStaff]);

  useEffect(() => {
    if (!user || !isAdmin || subTab !== 'audit') return;
    authFetch<{ logs: AuditLogEntry[] }>('/api/admin/audit-logs')
      .then((data) => setAuditLogs(data.logs || []))
      .catch(() => {});
  }, [user, isAdmin, subTab]);

  if (!user || !isStaff) {
    return (
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldAlert className="h-5 w-5 text-amber-600" aria-hidden="true" />
            <span>{t('admin.restricted')}</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-600 leading-relaxed">{t('admin.restrictedDesc')}</p>
          {!user ? (
            <Button variant="default" onClick={signInWithGoogle}>
              <LogIn className="h-4 w-4" aria-hidden="true" />
              <span>{t('welcome.signInGoogle')}</span>
            </Button>
          ) : (
            <p className="text-xs text-slate-500">
              Signed in as {user.email} ({userRole}). Authorised staff role required.
            </p>
          )}
        </CardContent>
      </Card>
    );
  }

  const handleModerate = async (reportId: string, status: 'CONFIRMED' | 'REJECTED') => {
    try {
      await authFetch(`/api/admin/reports/${reportId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      toast.success(`Report marked ${status}`);
      await refreshSnapshot();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Moderation failed');
    }
  };

  const handlePublishAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await authFetch<{ pushResult?: { sent: number; failed: number } | null }>(
        '/api/admin/alerts',
        {
          method: 'POST',
          body: JSON.stringify({
            routeId: alertRouteId,
            affectedStopIds: [],
            alertType,
            severity: alertSeverity,
            titleEn: alertTitle,
            descriptionEn: alertDesc,
            issuingOrganization: alertOrg,
            sendPush: alertSendPush,
          }),
        }
      );
      setAlertTitle('');
      setAlertDesc('');
      toast.success(
        res.pushResult
          ? `Service alert published (Push sent: ${res.pushResult.sent})`
          : 'Service alert published'
      );
      await refreshSnapshot();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to publish alert');
    }
  };

  const handleToggleAlert = async (alertId: string, active: boolean) => {
    try {
      await authFetch(`/api/admin/alerts/${alertId}`, {
        method: 'PATCH',
        body: JSON.stringify({ active }),
      });
      await refreshSnapshot();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update alert');
    }
  };

  const handleSaveFeed = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedSyncing(true);
    try {
      await authFetch('/api/admin/feed-config', {
        method: 'POST',
        body: JSON.stringify({
          gtfsStaticFeedUrl: staticFeedUrl.trim() || null,
          gtfsRtFeedUrl: vehicleFeedUrl.trim() || null,
          gtfsRtTripUpdatesFeedUrl: tripUpdatesFeedUrl.trim() || null,
          gtfsRtAlertsFeedUrl: alertsFeedUrl.trim() || null,
          pollIntervalMs: Number(pollIntervalMs) || 30000,
          syncNow: true,
        }),
      });
      toast.success('GTFS & GTFS-RT feed configuration saved and synced');
      await refreshSnapshot();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to update feed configuration');
    } finally {
      setFeedSyncing(false);
    }
  };

  const handleGtfsImport = async (dryRun: boolean) => {
    setImportBusy(true);
    setImportResult(null);
    try {
      const files: Record<string, string> = {
        'stops.txt': stopsCsv,
        'routes.txt': routesCsv,
        'trips.txt': tripsCsv,
        'stop_times.txt': stopTimesCsv,
      };
      if (agencyCsv.trim()) files['agency.txt'] = agencyCsv;
      if (calendarCsv.trim()) files['calendar.txt'] = calendarCsv;

      const token = await getIdToken();
      const res = await fetch('/api/admin/import-gtfs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          files,
          dryRun,
          replaceExisting: false,
          sourceLabel: importSourceLabel,
          sourceType: importSourceType,
          timetableBasis: importBasis,
        }),
      });
      const data = (await res.json()) as GtfsImportResult;
      setImportResult(data);
      if (res.ok && data.ok) {
        toast.success(
          dryRun
            ? `Validation passed: ${data.summary.routesCount} routes, ${data.summary.stopsCount} stops`
            : `Imported ${data.summary.routesCount} routes, ${data.summary.stopsCount} stops`
        );
        if (!dryRun) await refreshSnapshot();
      } else {
        toast.error('GTFS validation found errors');
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'GTFS import failed');
    } finally {
      setImportBusy(false);
    }
  };

  const handleSendPush = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await authFetch<{ result: { sent: number; failed: number; pruned: number } }>(
        '/api/admin/notifications/send',
        {
          method: 'POST',
          body: JSON.stringify({
            title: pushTitle,
            body: pushBody,
            routeId: pushRouteId || undefined,
          }),
        }
      );
      setPushTitle('');
      setPushBody('');
      toast.success(
        `FCM push complete: sent=${res.result.sent}, failed=${res.result.failed}, pruned=${res.result.pruned}`
      );
      await refreshSnapshot();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to dispatch push notification');
    }
  };

  const handleToggleVehicleGps = async (vehicleId: string, stale: boolean) => {
    try {
      await authFetch(`/api/admin/vehicles/${vehicleId}/gps-state`, {
        method: 'POST',
        body: JSON.stringify({ stale }),
      });
      await refreshSnapshot();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to toggle GPS simulation');
    }
  };

  const handleCreateRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRouteNumber.trim() || newStop1 === newStop2) {
      toast.error('Enter route number and select two distinct stops.');
      return;
    }
    try {
      await authFetch('/api/admin/routes', {
        method: 'POST',
        body: JSON.stringify({
          routeNumber: newRouteNumber,
          operatorId: 'op_wbtc',
          originEn: newOrigin || stopsMap.get(newStop1)?.name.en || 'Origin',
          destinationEn: newDest || stopsMap.get(newStop2)?.name.en || 'Destination',
          stopIds: [newStop1, newStop2],
          firstDeparture: '06:00',
          lastDeparture: '21:30',
          frequencyMin: Number(newFreq) || 20,
          isAc: false,
        }),
      });
      setNewRouteNumber('');
      setNewOrigin('');
      setNewDest('');
      toast.success('New route created');
      await refreshSnapshot();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Failed to create route');
    }
  };

  const { dataHealth } = snapshot;
  const { dataQuality, fcmHealth } = dataHealth;

  const tabs: Array<{ key: AdminSubTab; label: string; visible: boolean }> = [
    { key: 'overview', label: t('admin.dataQuality'), visible: true },
    { key: 'feeds', label: t('admin.gtfsImport'), visible: isOperatorOrAdmin },
    { key: 'alerts', label: t('admin.publishAlert'), visible: isOperatorOrAdmin },
    { key: 'reports', label: t('admin.moderateReports'), visible: isModeratorOrAdmin },
    { key: 'audit', label: t('admin.auditLogs'), visible: isAdmin },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">{t('admin.title')}</h1>
          <p className="text-xs text-slate-500">
            {user.email} · Role: <strong className="uppercase text-slate-800">{userRole}</strong>
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1">
          {tabs
            .filter((tab) => tab.visible)
            .map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setSubTab(tab.key)}
                className={cn(
                  'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer',
                  subTab === tab.key
                    ? 'bg-[#0B1F3A] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                {tab.label}
              </button>
            ))}
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500">{t('admin.telemetryMode')}</p>
            <p className="mt-1 font-display text-base font-bold text-[#0B1F3A]">
              {t(`telemetryModes.${dataHealth.activeTelemetryMode}`)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500">{t('admin.freshVehicles')}</p>
            <p className="mt-1 font-mono-tabular text-2xl font-bold text-emerald-700">
              {dataHealth.freshVehiclesCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500">{t('admin.staleVehicles')}</p>
            <p className="mt-1 font-mono-tabular text-2xl font-bold text-amber-700">
              {dataHealth.staleVehiclesCount}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-5">
            <p className="text-xs text-slate-500">{t('admin.pendingModeration')}</p>
            <p className="mt-1 font-mono-tabular text-2xl font-bold text-[#0B1F3A]">
              {dataHealth.pendingReportsCount}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* SUB-TAB 1: OVERVIEW, DATA QUALITY, FCM HEALTH & SOURCES */}
      {subTab === 'overview' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Card className="lg:col-span-6">
            <CardHeader className="border-b border-slate-100 pb-3.5">
              <CardTitle className="flex items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 text-blue-700" aria-hidden="true" />
                <span>{t('admin.dataQuality')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-slate-500">Official Verified Routes</p>
                  <p className="mt-1 font-mono-tabular text-lg font-bold text-[#0B1F3A]">
                    {dataQuality.officialVerifiedPercent}% ({dataQuality.officialTimetableRoutesCount}/
                    {dataQuality.totalRoutes})
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-slate-500">Stops Within Kolkata Bounds</p>
                  <p className="mt-1 font-mono-tabular text-lg font-bold text-emerald-700">
                    {dataQuality.stopsWithinKolkataBoundsCount} / {dataQuality.totalStops}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-slate-500">Vehicle Freshness Breakdown</p>
                  <p className="mt-1 font-mono-tabular font-semibold text-slate-800">
                    Fresh: {dataQuality.freshVehiclesCount} · Delayed: {dataQuality.delayedVehiclesCount} ·
                    Stale: {dataQuality.staleVehiclesCount}
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <p className="text-slate-500">FCM Push Delivery Health</p>
                  <p className="mt-1 font-mono-tabular font-semibold text-slate-800">
                    {fcmHealth.configured ? 'Configured' : 'Unconfigured'} · Tokens:{' '}
                    {fcmHealth.registeredTokensCount}
                  </p>
                </div>
              </div>

              {dataQuality.warnings.length > 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-1 text-amber-900">
                  {dataQuality.warnings.map((w, idx) => (
                    <p key={idx}>• {w}</p>
                  ))}
                </div>
              )}

              <div className="space-y-2">
                <p className="font-semibold text-slate-800">External Feed Endpoints</p>
                {[
                  ['Static GTFS', dataHealth.staticFeedHealth],
                  ['GTFS-RT VehiclePositions', dataHealth.vehicleFeedHealth],
                  ['GTFS-RT TripUpdates', dataHealth.tripUpdatesFeedHealth],
                  ['GTFS-RT ServiceAlerts', dataHealth.alertsFeedHealth],
                ].map(([label, fh]) => {
                  const health = fh as typeof dataHealth.vehicleFeedHealth;
                  return (
                    <div
                      key={String(label)}
                      className="flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2"
                    >
                      <div>
                        <p className="font-semibold text-slate-800">{String(label)}</p>
                        <p className="text-[11px] text-slate-500">
                          {health.urlMasked || 'Not configured'}
                          {health.lastError ? ` · Error: ${health.lastError}` : ''}
                        </p>
                      </div>
                      <span className="font-mono-tabular rounded-md bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                        {health.status}
                      </span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6 lg:col-span-6">
            <Card>
              <CardHeader className="border-b border-slate-100 pb-3.5">
                <CardTitle className="flex items-center gap-2">
                  <Database className="h-4 w-4 text-teal-600" aria-hidden="true" />
                  <span>{t('transparency.dataSourcesLink')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-2.5 max-h-72 overflow-y-auto text-xs">
                {sources.map((src) => (
                  <div key={src.id} className="rounded-xl border border-slate-200 p-3 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-900">{src.name}</span>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono-tabular text-[10px] font-semibold">
                        {src.status}
                      </span>
                    </div>
                    <p className="text-slate-600">{src.notes}</p>
                  </div>
                ))}
              </CardContent>
            </Card>

            {isAdmin && (
              <Card>
                <CardHeader className="border-b border-slate-100 pb-3.5">
                  <CardTitle className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-teal-600" aria-hidden="true" />
                    <span>Demo Telemetry Vehicle Controls</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4 divide-y divide-slate-100 max-h-56 overflow-y-auto">
                  {snapshot.vehiclePositions.map((pos) => {
                    const route = snapshot.routes.find((r) => r.routeId === pos.routeId);
                    return (
                      <div
                        key={pos.vehicleId}
                        className="flex items-center justify-between gap-2 py-2.5 text-xs"
                      >
                        <div>
                          <span className="font-mono-tabular font-semibold text-slate-900">
                            {route?.routeNumber} · {pos.vehicleId}
                          </span>
                          <p className="text-slate-500">
                            {pos.gpsStaleSimulated
                              ? 'Stale GPS Simulated'
                              : `Speed ${pos.speedKmh} km/h · ${t(`freshness.${pos.freshnessState || 'UNAVAILABLE'}`)}`}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            handleToggleVehicleGps(pos.vehicleId, !pos.gpsStaleSimulated)
                          }
                        >
                          {pos.gpsStaleSimulated ? t('admin.restoreGps') : t('admin.simulateStale')}
                        </Button>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: FEEDS CONFIG, GTFS CSV IMPORTER & ROUTE CREATION */}
      {subTab === 'feeds' && isOperatorOrAdmin && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Card className="lg:col-span-5">
            <CardHeader className="border-b border-slate-100 pb-3.5">
              <CardTitle className="flex items-center gap-2">
                <Radio className="h-4 w-4 text-teal-600" aria-hidden="true" />
                <span>{t('admin.configureFeed')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <form onSubmit={handleSaveFeed} className="space-y-3 text-xs">
                <div>
                  <label className="font-semibold text-slate-700">GTFS Static Package URL (JSON)</label>
                  <Input
                    value={staticFeedUrl}
                    onChange={(e) => setStaticFeedUrl(e.target.value)}
                    placeholder="https://official-feed.example.org/gtfs-static.json"
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">GTFS-RT VehiclePositions URL</label>
                  <Input
                    value={vehicleFeedUrl}
                    onChange={(e) => setVehicleFeedUrl(e.target.value)}
                    placeholder="https://official-feed.example.org/gtfs-rt/vehicles.json"
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">GTFS-RT TripUpdates URL</label>
                  <Input
                    value={tripUpdatesFeedUrl}
                    onChange={(e) => setTripUpdatesFeedUrl(e.target.value)}
                    placeholder="https://official-feed.example.org/gtfs-rt/trip-updates.json"
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">GTFS-RT ServiceAlerts URL</label>
                  <Input
                    value={alertsFeedUrl}
                    onChange={(e) => setAlertsFeedUrl(e.target.value)}
                    placeholder="https://official-feed.example.org/gtfs-rt/alerts.json"
                    className="mt-1 text-xs"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-700">Poll Interval (ms, min 5000)</label>
                  <Input
                    type="number"
                    min={5000}
                    value={pollIntervalMs}
                    onChange={(e) => setPollIntervalMs(e.target.value)}
                    className="mt-1 text-xs"
                  />
                </div>
                <Button type="submit" size="sm" variant="default" disabled={feedSyncing}>
                  {t('admin.saveFeed')}
                </Button>
              </form>

              {/* Quick Create Route */}
              <div className="border-t border-slate-100 pt-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-900">{t('admin.addRoute')}</h4>
                <form onSubmit={handleCreateRoute} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Input
                      required
                      value={newRouteNumber}
                      onChange={(e) => setNewRouteNumber(e.target.value)}
                      placeholder="Route No. (e.g. S-24)"
                    />
                    <Input
                      type="number"
                      min={5}
                      value={newFreq}
                      onChange={(e) => setNewFreq(e.target.value)}
                      placeholder="Frequency (min)"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <select
                      value={newStop1}
                      onChange={(e) => setNewStop1(e.target.value)}
                      className="h-10 rounded-xl border border-slate-200 px-3 text-xs"
                    >
                      {snapshot.stops.map((s) => (
                        <option key={s.stopId} value={s.stopId}>
                          Origin: {s.name.en}
                        </option>
                      ))}
                    </select>
                    <select
                      value={newStop2}
                      onChange={(e) => setNewStop2(e.target.value)}
                      className="h-10 rounded-xl border border-slate-200 px-3 text-xs"
                    >
                      {snapshot.stops.map((s) => (
                        <option key={s.stopId} value={s.stopId}>
                          Dest: {s.name.en}
                        </option>
                      ))}
                    </select>
                  </div>
                  <Button type="submit" variant="teal" size="sm">
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    <span>{t('admin.addRoute')}</span>
                  </Button>
                </form>
              </div>
            </CardContent>
          </Card>

          <Card className="lg:col-span-7">
            <CardHeader className="border-b border-slate-100 pb-3.5">
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-blue-700" aria-hidden="true" />
                <span>{t('admin.gtfsImport')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3 text-xs">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <Input
                  value={importSourceLabel}
                  onChange={(e) => setImportSourceLabel(e.target.value)}
                  placeholder="Source Label"
                  className="text-xs"
                />
                <select
                  value={importSourceType}
                  onChange={(e) => setImportSourceType(e.target.value as DataSourceType)}
                  className="h-10 rounded-xl border border-slate-200 px-2.5 text-xs"
                >
                  <option value="OFFICIAL_VERIFIED">OFFICIAL_VERIFIED</option>
                  <option value="OPEN_LICENSED">OPEN_LICENSED</option>
                  <option value="ESTIMATED">ESTIMATED</option>
                </select>
                <select
                  value={importBasis}
                  onChange={(e) => setImportBasis(e.target.value as TimetableBasis)}
                  className="h-10 rounded-xl border border-slate-200 px-2.5 text-xs"
                >
                  <option value="OFFICIAL_TIMETABLE">OFFICIAL_TIMETABLE</option>
                  <option value="OFFICIAL_FREQUENCY">OFFICIAL_FREQUENCY</option>
                  <option value="HISTORICAL_TIMETABLE">HISTORICAL_TIMETABLE</option>
                </select>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {[
                  ['stops.txt *', stopsCsv, setStopsCsv, 'stop_id,stop_name,stop_lat,stop_lon'],
                  ['routes.txt *', routesCsv, setRoutesCsv, 'route_id,agency_id,route_short_name,route_long_name,route_type'],
                  ['trips.txt *', tripsCsv, setTripsCsv, 'route_id,service_id,trip_id,trip_headsign,direction_id'],
                  ['stop_times.txt *', stopTimesCsv, setStopTimesCsv, 'trip_id,arrival_time,departure_time,stop_id,stop_sequence'],
                  ['agency.txt (optional)', agencyCsv, setAgencyCsv, 'agency_id,agency_name,agency_url,agency_timezone'],
                  ['calendar.txt (optional)', calendarCsv, setCalendarCsv, 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday'],
                ].map(([label, val, setter, placeholder]) => (
                  <div key={String(label)}>
                    <label className="font-semibold text-slate-700">{String(label)}</label>
                    <textarea
                      rows={3}
                      value={val as string}
                      onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                      placeholder={String(placeholder)}
                      className="mt-1 w-full rounded-xl border border-slate-200 p-2 font-mono-tabular text-[11px]"
                    />
                  </div>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={importBusy}
                  onClick={() => handleGtfsImport(true)}
                >
                  {t('admin.dryRunBtn')}
                </Button>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  disabled={importBusy}
                  onClick={() => handleGtfsImport(false)}
                >
                  {t('admin.importBtn')}
                </Button>
              </div>

              {importResult && (
                <div
                  className={cn(
                    'rounded-xl border p-3 space-y-1.5',
                    importResult.ok
                      ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                      : 'border-rose-200 bg-rose-50/70 text-rose-900'
                  )}
                >
                  <p className="font-semibold">
                    {importResult.dryRun ? 'Dry-Run Result' : 'Import Result'}: Routes:{' '}
                    {importResult.summary.routesCount} · Stops: {importResult.summary.stopsCount} ·
                    Trips: {importResult.summary.tripsCount} · StopTimes:{' '}
                    {importResult.summary.stopTimesCount}
                  </p>
                  {importResult.errors.map((err, i) => (
                    <p key={i} className="text-rose-800">
                      Error: {err}
                    </p>
                  ))}
                  {importResult.warnings.slice(0, 8).map((warn, i) => (
                    <p key={i} className="text-amber-800">
                      Warning: {warn}
                    </p>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* SUB-TAB 3: ALERTS & DIRECT FCM PUSH */}
      {subTab === 'alerts' && isOperatorOrAdmin && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <Card className="lg:col-span-7">
            <CardHeader className="border-b border-slate-100 pb-3.5">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
                <span>{t('admin.publishAlert')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <form onSubmit={handlePublishAlert} className="space-y-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <select
                    value={alertRouteId}
                    onChange={(e) => setAlertRouteId(e.target.value)}
                    className="h-10 rounded-xl border border-slate-200 px-2.5 text-xs"
                  >
                    {snapshot.routes.map((r) => (
                      <option key={r.routeId} value={r.routeId}>
                        {r.routeNumber}
                      </option>
                    ))}
                  </select>
                  <select
                    value={alertType}
                    onChange={(e) => setAlertType(e.target.value as AlertType)}
                    className="h-10 rounded-xl border border-slate-200 px-2.5 text-xs"
                  >
                    <option value="DELAY">DELAY</option>
                    <option value="CANCELLATION">CANCELLATION</option>
                    <option value="PARTIAL_CANCELLATION">PARTIAL_CANCELLATION</option>
                    <option value="DIVERSION">DIVERSION</option>
                    <option value="BREAKDOWN">BREAKDOWN</option>
                    <option value="TRAFFIC_CONGESTION">TRAFFIC_CONGESTION</option>
                    <option value="WEATHER_DISRUPTION">WEATHER_DISRUPTION</option>
                    <option value="ROUTE_SUSPENSION">ROUTE_SUSPENSION</option>
                    <option value="SPECIAL_SERVICE">SPECIAL_SERVICE</option>
                    <option value="MISSING_WARNING">MISSING_WARNING</option>
                  </select>
                  <select
                    value={alertSeverity}
                    onChange={(e) => setAlertSeverity(e.target.value as AlertSeverity)}
                    className="h-10 rounded-xl border border-slate-200 px-2.5 text-xs"
                  >
                    <option value="INFO">INFO</option>
                    <option value="WARNING">WARNING</option>
                    <option value="CRITICAL">CRITICAL</option>
                  </select>
                </div>
                <Input
                  value={alertOrg}
                  onChange={(e) => setAlertOrg(e.target.value)}
                  placeholder="Issuing organization"
                  className="text-xs"
                />
                <Input
                  required
                  value={alertTitle}
                  onChange={(e) => setAlertTitle(e.target.value)}
                  placeholder="Alert headline"
                />
                <textarea
                  required
                  rows={2}
                  value={alertDesc}
                  onChange={(e) => setAlertDesc(e.target.value)}
                  placeholder="Explanation and alternative route advice..."
                  className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                />
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={alertSendPush}
                    onChange={(e) => setAlertSendPush(e.target.checked)}
                    className="h-4 w-4 accent-blue-600"
                  />
                  <span>Dispatch localized FCM push notification to subscribed devices</span>
                </label>
                <Button type="submit" variant="default" size="sm">
                  Publish Alert
                </Button>
              </form>

              <div className="border-t border-slate-100 pt-3 space-y-2 max-h-56 overflow-y-auto">
                {snapshot.serviceAlerts.map((a) => (
                  <div
                    key={a.alertId}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">{a.title.en}</p>
                      <p className="text-slate-500">
                        {a.alertType} · {a.active ? 'Active' : 'Archived'} · {t(`sources.${a.sourceType}`)}
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleToggleAlert(a.alertId, !a.active)}
                    >
                      {a.active ? 'Deactivate' : 'Activate'}
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {isAdmin && (
            <Card className="lg:col-span-5">
              <CardHeader className="border-b border-slate-100 pb-3.5">
                <CardTitle className="flex items-center gap-2">
                  <BellRing className="h-4 w-4 text-blue-700" aria-hidden="true" />
                  <span>{t('admin.pushBroadcast')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs space-y-1">
                  <p>
                    <strong>FCM HTTP v1 Status:</strong>{' '}
                    {fcmHealth.configured ? 'Configured' : 'Not configured'}
                  </p>
                  <p>
                    <strong>Registered Tokens:</strong> {fcmHealth.registeredTokensCount} ·{' '}
                    <strong>Sent:</strong> {fcmHealth.sentCount} · <strong>Pruned:</strong>{' '}
                    {fcmHealth.prunedTokensCount}
                  </p>
                </div>

                <form onSubmit={handleSendPush} className="space-y-3">
                  <select
                    value={pushRouteId}
                    onChange={(e) => setPushRouteId(e.target.value)}
                    className="h-10 w-full rounded-xl border border-slate-200 px-2.5 text-xs"
                  >
                    <option value="">All subscribed commuters</option>
                    {snapshot.routes.map((r) => (
                      <option key={r.routeId} value={r.routeId}>
                        Route {r.routeNumber}
                      </option>
                    ))}
                  </select>
                  <Input
                    required
                    value={pushTitle}
                    onChange={(e) => setPushTitle(e.target.value)}
                    placeholder="Push notification title"
                  />
                  <textarea
                    required
                    rows={3}
                    value={pushBody}
                    onChange={(e) => setPushBody(e.target.value)}
                    placeholder="Notification message body..."
                    className="w-full rounded-xl border border-slate-200 px-3.5 py-2 text-sm"
                  />
                  <Button type="submit" size="sm" variant="default">
                    Send Push Broadcast
                  </Button>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* SUB-TAB 4: REPORT MODERATION */}
      {subTab === 'reports' && isModeratorOrAdmin && (
        <Card>
          <CardHeader className="border-b border-slate-100 pb-3.5">
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-teal-600" aria-hidden="true" />
              <span>{t('admin.moderateReports')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
            {snapshot.passengerReports.length === 0 ? (
              <p className="py-6 text-sm text-slate-500">No passenger reports queued.</p>
            ) : (
              snapshot.passengerReports.map((rep) => {
                const route = snapshot.routes.find((r) => r.routeId === rep.routeId);
                const stop = stopsMap.get(rep.stopId);
                return (
                  <div key={rep.reportId} className="py-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-900">
                        {route?.routeNumber ?? rep.routeId} · {stop?.name.en ?? rep.stopId}
                      </span>
                      <span className="font-mono-tabular text-slate-600">
                        {rep.verificationStatus} ({rep.confirmationCount})
                      </span>
                    </div>
                    <p className="text-xs text-slate-600">
                      {rep.reportType} — {rep.note || 'No note provided'}
                    </p>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleModerate(rep.reportId, 'CONFIRMED')}
                      >
                        <Check className="h-3.5 w-3.5 text-emerald-600" aria-hidden="true" />
                        <span>{t('admin.confirm')}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleModerate(rep.reportId, 'REJECTED')}
                      >
                        <X className="h-3.5 w-3.5 text-red-600" aria-hidden="true" />
                        <span>{t('admin.reject')}</span>
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      )}

      {/* SUB-TAB 5: AUDIT LOGS */}
      {subTab === 'audit' && isAdmin && (
        <Card>
          <CardHeader className="border-b border-slate-100 pb-3.5">
            <CardTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-blue-700" aria-hidden="true" />
              <span>{t('admin.auditLogs')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 divide-y divide-slate-100 max-h-[520px] overflow-y-auto text-xs">
            {auditLogs.length === 0 ? (
              <p className="py-6 text-center text-slate-500">No privileged staff actions recorded yet.</p>
            ) : (
              auditLogs.map((log) => (
                <div key={log.logId} className="py-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <p className="font-semibold text-slate-900">
                      {log.action} · {log.targetType} ({log.targetId})
                    </p>
                    <p className="text-slate-600">{log.summary}</p>
                    <p className="text-[11px] text-slate-500">
                      {log.actorEmail} ({log.actorRole})
                    </p>
                  </div>
                  <span className="font-mono-tabular text-[11px] text-slate-500">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
