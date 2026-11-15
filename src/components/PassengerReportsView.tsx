import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CheckCircle2,
  Clock,
  Filter,
  MapPin,
  MessageSquarePlus,
  ShieldAlert,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext.tsx';
import { useTransit } from '../context/TransitContext.tsx';
import type { ReportType, SupportedLanguage } from '../shared/types.ts';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { cn } from '../lib/utils.ts';

const REPORT_TYPES: ReportType[] = [
  'ARRIVAL_CONFIRMED',
  'DELAY',
  'MISSING_BUS',
  'BREAKDOWN',
  'DIVERSION',
];

export function PassengerReportsView({
  onSelectBusDetails,
}: {
  onSelectBusDetails: (routeId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as SupportedLanguage) || 'en';
  const { getIdToken } = useAuth();
  const { snapshot, stopsMap, userLocation, refreshSnapshot } = useTransit();

  const [routeId, setRouteId] = useState(snapshot.routes[0]?.routeId || 'route_s12');
  const selectedRoute = snapshot.routes.find((r) => r.routeId === routeId) || snapshot.routes[0];
  const [stopId, setStopId] = useState(
    selectedRoute?.stopSequence[0]?.stopId || snapshot.stops[0]?.stopId || ''
  );
  const [reportType, setReportType] = useState<ReportType>('ARRIVAL_CONFIRMED');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [filterRoute, setFilterRoute] = useState<string>('ALL');
  const [filterType, setFilterType] = useState<string>('ALL');

  const resolvedStopId =
    selectedRoute?.stopSequence.some((s) => s.stopId === stopId)
      ? stopId
      : selectedRoute?.stopSequence[0]?.stopId || '';

  const routesMap = useMemo(
    () => new Map(snapshot.routes.map((r) => [r.routeId, r])),
    [snapshot.routes]
  );

  const filteredReports = useMemo(() => {
    return snapshot.passengerReports
      .filter((r) => (filterRoute === 'ALL' ? true : r.routeId === filterRoute))
      .filter((r) => (filterType === 'ALL' ? true : r.reportType === filterType))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }, [snapshot.passengerReports, filterRoute, filterType]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!routeId || !resolvedStopId) return;
    setSubmitting(true);
    try {
      const token = await getIdToken();
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          routeId,
          stopId: resolvedStopId,
          reportType,
          note: note.trim(),
          lat: userLocation.lat,
          lng: userLocation.lng,
        }),
      });
      const data = (await res.json()) as { deduplicated?: boolean; error?: string };
      if (!res.ok) {
        toast.error(data.error || 'Unable to submit observation');
        return;
      }
      toast.success(data.deduplicated ? t('reports.deduplicated') : t('reports.success'));
      setNote('');
      await refreshSnapshot();
    } catch {
      toast.error('Network error while submitting report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Navy Top Header */}
      <div className="rounded-2xl bg-gradient-to-r from-[#0A224E] to-[#16428A] p-5 text-white">
        <h1 className="font-display text-2xl font-bold">{t('reports.title')}</h1>
        <p className="mt-1 max-w-2xl text-xs text-blue-100 leading-relaxed">
          {t('reports.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Submission Form */}
        <Card className="lg:col-span-5">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="flex items-center gap-2">
              <MessageSquarePlus className="h-4 w-4 text-teal-600" aria-hidden="true" />
              <span>{t('reports.submit')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5">
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                <span>{t('reports.routeLabel')}</span>
                <select
                  value={routeId}
                  onChange={(e) => {
                    const nextId = e.target.value;
                    setRouteId(nextId);
                    const nextRoute = snapshot.routes.find((r) => r.routeId === nextId);
                    if (nextRoute?.stopSequence[0]) {
                      setStopId(nextRoute.stopSequence[0].stopId);
                    }
                  }}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  {snapshot.routes.map((r) => (
                    <option key={r.routeId} value={r.routeId}>
                      {r.routeNumber} — {r.origin[lang] || r.origin.en} →{' '}
                      {r.destination[lang] || r.destination.en}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                <span>{t('reports.stopLabel')}</span>
                <select
                  value={resolvedStopId}
                  onChange={(e) => setStopId(e.target.value)}
                  className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                >
                  {(selectedRoute?.stopSequence ?? []).map((entry) => {
                    const stop = stopsMap.get(entry.stopId);
                    return (
                      <option key={entry.stopId} value={entry.stopId}>
                        {stop ? stop.name[lang] || stop.name.en : entry.stopId}
                      </option>
                    );
                  })}
                </select>
              </label>

              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-slate-700">
                  {t('reports.typeLabel')}
                </span>
                <div className="grid grid-cols-1 gap-2">
                  {REPORT_TYPES.map((rt) => (
                    <button
                      key={rt}
                      type="button"
                      onClick={() => setReportType(rt)}
                      className={cn(
                        'min-h-[42px] rounded-xl border px-3.5 text-left text-xs font-medium transition-colors cursor-pointer',
                        reportType === rt
                          ? 'border-[#0F52BA] bg-blue-50 text-[#0B1F3A] font-semibold'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      )}
                    >
                      {t(`reports.types.${rt}`)}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
                <span>{t('reports.noteLabel')}</span>
                <textarea
                  rows={3}
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={240}
                  placeholder={t('reports.notePlaceholder')}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
                />
              </label>

              <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-[11px] text-amber-900">
                <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                <span>{t('statusExplanations.CONFLICTING_EVIDENCE')}</span>
              </div>

              <Button type="submit" variant="teal" className="w-full" disabled={submitting}>
                {submitting ? t('reports.submitting') : t('reports.submit')}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Community Feed */}
        <Card className="lg:col-span-7">
          <CardHeader className="border-b border-slate-100 pb-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="flex items-center gap-2">
                <Users className="h-4 w-4 text-blue-700" aria-hidden="true" />
                <span>{t('reports.recentReports')}</span>
              </CardTitle>
              <span className="font-mono-tabular text-xs font-semibold text-slate-500">
                {filteredReports.length}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Filter className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
              <select
                value={filterRoute}
                onChange={(e) => setFilterRoute(e.target.value)}
                aria-label={t('reports.routeLabel')}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800"
              >
                <option value="ALL">{t('map.allRoutes')}</option>
                {snapshot.routes.map((r) => (
                  <option key={r.routeId} value={r.routeId}>
                    {r.routeNumber}
                  </option>
                ))}
              </select>

              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                aria-label={t('reports.typeLabel')}
                className="h-9 rounded-lg border border-slate-200 bg-white px-2.5 text-xs text-slate-800"
              >
                <option value="ALL">{t('common.all')}</option>
                {REPORT_TYPES.map((rt) => (
                  <option key={rt} value={rt}>
                    {t(`reports.types.${rt}`)}
                  </option>
                ))}
              </select>
            </div>
          </CardHeader>

          <CardContent className="divide-y divide-slate-100 pt-1 max-h-[680px] overflow-y-auto">
            {filteredReports.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">
                No commuter observations match the selected filter.
              </p>
            ) : (
              filteredReports.map((rep) => {
                const route = routesMap.get(rep.routeId);
                const stop = stopsMap.get(rep.stopId);
                const minsAgo = Math.max(1, Math.round((snapshot.serverTimestamp - rep.updatedAt) / 60000));
                const badgeClass =
                  rep.verificationStatus === 'CONFIRMED'
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : rep.verificationStatus === 'REJECTED'
                      ? 'bg-red-50 text-red-700 border-red-200'
                      : 'bg-amber-50 text-amber-800 border-amber-200';

                return (
                  <div key={rep.reportId} className="py-4 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectBusDetails(rep.routeId)}
                          className="font-mono-tabular rounded-lg bg-[#0B1F3A] px-2.5 py-0.5 text-xs font-bold text-white hover:bg-[#16428A] cursor-pointer"
                        >
                          {route?.routeNumber ?? rep.routeId}
                        </button>
                        <span className="text-sm font-semibold text-slate-900">
                          {t(`reports.types.${rep.reportType}`)}
                        </span>
                      </div>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-[11px] font-semibold',
                          badgeClass
                        )}
                      >
                        <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                        <span>{t(`reports.statuses.${rep.verificationStatus}`)}</span>
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                        <span>{stop ? stop.name[lang] || stop.name.en : rep.stopId}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 font-medium text-blue-700">
                        <Users className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t('reports.confirmations', { count: rep.confirmationCount })}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-slate-500">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t('map.minutesAgo', { min: minsAgo })}</span>
                      </span>
                    </div>

                    {rep.note && (
                      <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-700">
                        {rep.note}
                      </p>
                    )}

                    <p className="text-[11px] text-slate-400">{rep.userDisplayName}</p>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
