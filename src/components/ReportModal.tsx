import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, MessageSquarePlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../context/AuthContext.tsx';
import { useTransit } from '../context/TransitContext.tsx';
import type { ReportType, SupportedLanguage } from '../shared/types.ts';
import { Button } from './ui/button.tsx';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from './ui/dialog.tsx';

interface ReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultRouteId?: string;
  defaultStopId?: string;
}

const REPORT_TYPES: ReportType[] = [
  'ARRIVAL_CONFIRMED',
  'DELAY',
  'MISSING_BUS',
  'BREAKDOWN',
  'DIVERSION',
];

export function ReportModal({
  open,
  onOpenChange,
  defaultRouteId,
  defaultStopId,
}: ReportModalProps) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as SupportedLanguage) || 'en';
  const { getIdToken } = useAuth();
  const { snapshot, stopsMap, nearbyStops, userLocation, refreshSnapshot } = useTransit();

  const [routeId, setRouteId] = useState(
    defaultRouteId || snapshot.routes[0]?.routeId || 'route_s12'
  );
  const [stopId, setStopId] = useState(
    defaultStopId || nearbyStops[0]?.stop.stopId || snapshot.stops[0]?.stopId || 'stop_esplanade'
  );
  const [reportType, setReportType] = useState<ReportType>('ARRIVAL_CONFIRMED');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectedRoute = snapshot.routes.find((r) => r.routeId === routeId) || snapshot.routes[0];
  const routeStops =
    selectedRoute?.stopSequence
      .map((s) => stopsMap.get(s.stopId))
      .filter((s): s is NonNullable<typeof s> => Boolean(s)) ?? snapshot.stops;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const token = await getIdToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;

      const res = await fetch('/api/reports', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          routeId,
          stopId,
          reportType,
          note,
          lat: userLocation.lat,
          lng: userLocation.lng,
        }),
      });
      const data = (await res.json()) as { error?: string; deduplicated?: boolean };
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to submit observation.');
        return;
      }

      toast.success(data.deduplicated ? t('reports.deduplicated') : t('reports.success'));
      setNote('');
      await refreshSnapshot();
      onOpenChange(false);
    } catch {
      setErrorMsg('Network error submitting report. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-teal-600" aria-hidden="true" />
            <span>{t('reports.title')}</span>
          </DialogTitle>
          <DialogDescription>{t('reports.subtitle')}</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
              <span>{t('reports.routeLabel')}</span>
              <select
                value={routeId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setRouteId(nextId);
                  const r = snapshot.routes.find((rt) => rt.routeId === nextId);
                  if (r && r.stopSequence.length > 0) {
                    setStopId(r.stopSequence[0].stopId);
                  }
                }}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
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
                value={stopId}
                onChange={(e) => setStopId(e.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                {routeStops.map((s) => (
                  <option key={s.stopId} value={s.stopId}>
                    {s.name[lang] || s.name.en}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-slate-700">{t('reports.typeLabel')}</span>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {REPORT_TYPES.map((rt) => (
                <button
                  key={rt}
                  type="button"
                  onClick={() => setReportType(rt)}
                  className={`flex min-h-[42px] items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-medium transition-colors cursor-pointer ${
                    reportType === rt
                      ? 'border-teal-600 bg-teal-50 text-[#0B1F3A]'
                      : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {rt === 'ARRIVAL_CONFIRMED' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" aria-hidden="true" />
                  ) : (
                    <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" aria-hidden="true" />
                  )}
                  <span>{t(`reports.types.${rt}`)}</span>
                </button>
              ))}
            </div>
          </div>

          <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
            <span>{t('reports.noteLabel')}</span>
            <textarea
              rows={2}
              maxLength={400}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('reports.notePlaceholder')}
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
            />
          </label>

          {errorMsg && (
            <p className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs text-red-700">
              {errorMsg}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" variant="teal" disabled={submitting}>
              {submitting ? t('reports.submitting') : t('reports.submit')}
            </Button>
          </div>
        </form>

        {/* Recent Community Observations */}
        {snapshot.passengerReports.length > 0 && (
          <div className="mt-4 border-t border-slate-100 pt-4">
            <p className="mb-2.5 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
              <Users className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t('reports.recentReports')}</span>
            </p>
            <div className="space-y-2.5 max-h-44 overflow-y-auto pr-1">
              {snapshot.passengerReports.slice(0, 5).map((rep) => {
                const route = snapshot.routes.find((r) => r.routeId === rep.routeId);
                const stop = stopsMap.get(rep.stopId);
                return (
                  <div
                    key={rep.reportId}
                    className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2 font-medium text-slate-900">
                      <span>
                        {route?.routeNumber ?? rep.routeId} ·{' '}
                        {stop ? stop.name[lang] || stop.name.en : rep.stopId}
                      </span>
                      <span className="text-slate-600">
                        {t(`reports.statuses.${rep.verificationStatus}`)}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-slate-600">
                      <span>{t(`reports.types.${rep.reportType}`)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{t('reports.confirmations', { count: rep.confirmationCount })}</span>
                    </div>
                    {rep.note && <p className="mt-1 text-slate-600">{rep.note}</p>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
