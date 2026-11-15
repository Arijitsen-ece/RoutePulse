import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertOctagon,
  AlertTriangle,
  ArrowRight,
  Compass,
  Info,
  MapPin,
  Radio,
  ShieldCheck,
} from 'lucide-react';
import { useTransit } from '../context/TransitContext.tsx';
import type { AlertSeverity, SupportedLanguage } from '../shared/types.ts';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { cn } from '../lib/utils.ts';

type AlertFilter = 'ALL' | AlertSeverity;

export function ServiceAlertsView({
  onSelectBusDetails,
  onPlanAlternative,
}: {
  onSelectBusDetails: (routeId: string) => void;
  onPlanAlternative: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as SupportedLanguage) || 'en';
  const { snapshot, stopsMap } = useTransit();
  const [filter, setFilter] = useState<AlertFilter>('ALL');

  const routesMap = useMemo(
    () => new Map(snapshot.routes.map((r) => [r.routeId, r])),
    [snapshot.routes]
  );

  const filteredAlerts = useMemo(() => {
    return snapshot.serviceAlerts
      .filter((a) => a.active)
      .filter((a) => (filter === 'ALL' ? true : a.severity === filter))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [snapshot.serviceAlerts, filter]);

  const counts = useMemo(() => {
    const active = snapshot.serviceAlerts.filter((a) => a.active);
    return {
      ALL: active.length,
      CRITICAL: active.filter((a) => a.severity === 'CRITICAL').length,
      WARNING: active.filter((a) => a.severity === 'WARNING').length,
      INFO: active.filter((a) => a.severity === 'INFO').length,
    };
  }, [snapshot.serviceAlerts]);

  return (
    <div className="space-y-6">
      {/* Navy Top Header */}
      <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#0A224E] to-[#16428A] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="max-w-2xl">
          <h1 className="font-display text-2xl font-bold">{t('alertsPage.title')}</h1>
          <p className="mt-1 text-xs text-blue-100 leading-relaxed">{t('alertsPage.subtitle')}</p>
        </div>
        <Button
          variant="outline"
          onClick={onPlanAlternative}
          className="border-white/25 bg-white/10 text-white hover:bg-white/20 shrink-0"
        >
          <Compass className="h-4 w-4" aria-hidden="true" />
          <span>{t('alertsPage.suggestedAlt')}</span>
        </Button>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['ALL', t('alertsPage.filterAll'), counts.ALL],
            ['CRITICAL', t('alertsPage.filterCritical'), counts.CRITICAL],
            ['WARNING', t('alertsPage.filterWarning'), counts.WARNING],
            ['INFO', t('alertsPage.filterInfo'), counts.INFO],
          ] as Array<[AlertFilter, string, number]>
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              'inline-flex min-h-[40px] items-center gap-2 rounded-xl border px-4 text-xs font-semibold transition-colors cursor-pointer',
              filter === key
                ? 'border-[#0F52BA] bg-gradient-to-r from-[#0F52BA] to-[#1D70EC] text-white shadow-xs'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            )}
          >
            <span>{label}</span>
            <span
              className={cn(
                'font-mono-tabular rounded-md px-1.5 py-0.5 text-[11px]',
                filter === key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
              )}
            >
              {count}
            </span>
          </button>
        ))}
      </div>

      {/* Telemetry & Official Alert Feed Notice Card */}
      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-xs text-slate-600 shadow-xs">
        <div className="flex items-start gap-3">
          <Radio className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
          <p className="leading-relaxed">
            {t(`telemetryModes.${snapshot.dataHealth.activeTelemetryMode}`)} —{' '}
            {t('statusExplanations.STALE_OR_MISSING_GPS')}
          </p>
        </div>
        {!snapshot.dataHealth.officialAlertFeedConnected && (
          <p className="rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-amber-900 font-medium">
            {t('transparency.officialAlertFeedMissing')}
          </p>
        )}
      </div>

      {/* Alerts List */}
      {filteredAlerts.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-slate-500">
            No active service alerts in this category.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {filteredAlerts.map((alert) => {
            const route = routesMap.get(alert.routeId);
            const isCritical = alert.severity === 'CRITICAL';
            const isWarning = alert.severity === 'WARNING';
            const SevIcon = isCritical ? AlertOctagon : isWarning ? AlertTriangle : Info;
            const borderColor = isCritical
              ? 'border-red-200'
              : isWarning
                ? 'border-amber-200'
                : 'border-slate-200';
            const iconBg = isCritical
              ? 'bg-red-50 text-red-700'
              : isWarning
                ? 'bg-amber-50 text-amber-700'
                : 'bg-blue-50 text-blue-700';

            return (
              <Card key={alert.alertId} className={cn('flex flex-col justify-between', borderColor)}>
                <CardHeader className="border-b border-slate-100 pb-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0">
                      <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-xl', iconBg)}>
                        <SevIcon className="h-5 w-5" aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono-tabular rounded-lg bg-[#0B1F3A] px-2.5 py-0.5 text-xs font-bold text-white">
                            {route?.routeNumber ?? alert.routeId}
                          </span>
                          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            {alert.alertType.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <CardTitle className="mt-1.5 text-base leading-snug">
                          {alert.title[lang] || alert.title.en}
                        </CardTitle>
                      </div>
                    </div>

                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold',
                        alert.sourceType === 'OFFICIAL_VERIFIED'
                          ? 'bg-emerald-50 text-emerald-700'
                          : alert.sourceType === 'SYNTHETIC_DEMO'
                            ? 'bg-slate-100 text-slate-600'
                            : 'bg-blue-50 text-blue-800'
                      )}
                    >
                      <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {alert.sourceType === 'SYNTHETIC_DEMO'
                          ? t('transparency.demoNoticeBadge')
                          : alert.verifiedByAdmin && alert.sourceType !== 'OFFICIAL_VERIFIED'
                            ? t('transparency.adminNoticeBadge')
                            : t(`sources.${alert.sourceType}`)}
                      </span>
                    </span>
                  </div>
                </CardHeader>

                <CardContent className="pt-4 space-y-4">
                  <p className="text-xs text-slate-600 leading-relaxed">
                    {alert.description[lang] || alert.description.en}
                  </p>
                  {alert.issuingOrganization && (
                    <p className="text-[11px] text-slate-500">
                      {alert.issuingOrganization}
                    </p>
                  )}

                  {alert.affectedStopIds.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">
                        {t('alertsPage.affectedStops')}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {alert.affectedStopIds.map((stopId) => {
                          const stop = stopsMap.get(stopId);
                          return (
                            <span
                              key={stopId}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                            >
                              <MapPin className="h-3 w-3 text-teal-600" aria-hidden="true" />
                              <span>{stop ? stop.name[lang] || stop.name.en : stopId}</span>
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <button
                      type="button"
                      onClick={() => onSelectBusDetails(alert.routeId)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#0F52BA] hover:underline cursor-pointer"
                    >
                      <span>{t('dashboard.busDetailsBtn')}</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={onPlanAlternative}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
                    >
                      <span>{t('alertsPage.suggestedAlt')}</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
