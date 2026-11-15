import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Accessibility,
  AlertCircle,
  ArrowLeftRight,
  Clock,
  Footprints,
  Navigation,
  Route as RouteIcon,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useTransit } from '../context/TransitContext.tsx';
import type { JourneyOption, SupportedLanguage } from '../shared/types.ts';
import { StatusIndicator } from './StatusIndicator.tsx';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';

export function JourneyPlannerView({
  onSelectRouteForMap,
  onSelectBusDetails,
}: {
  onSelectRouteForMap: (routeId: string) => void;
  onSelectBusDetails?: (routeId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as SupportedLanguage) || 'en';
  const { addTravelHistory } = useAuth();
  const { snapshot, stopsMap, nearbyStops, userLocation } = useTransit();

  const [fromStopId, setFromStopId] = useState(
    nearbyStops[0]?.stop.stopId || 'stop_esplanade'
  );
  const [toStopId, setToStopId] = useState('stop_sector5');
  const [options, setOptions] = useState<JourneyOption[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchJourney = async (fromId: string, toId: string) => {
    if (!fromId || !toId || fromId === toId) {
      setOptions([]);
      return;
    }
    setLoading(true);
    try {
      const qs = new URLSearchParams({
        fromStopId: fromId,
        toStopId: toId,
        lat: String(userLocation.lat),
        lng: String(userLocation.lng),
      });
      const res = await fetch(`/api/transit/journey?${qs.toString()}`);
      const data = (await res.json()) as { options?: JourneyOption[] };
      const fetched = data.options ?? [];
      setOptions(fetched);
      if (fetched.length > 0) {
        const fromStop = stopsMap.get(fromId);
        const toStop = stopsMap.get(toId);
        if (fromStop && toStop) {
          addTravelHistory({
            kind: 'JOURNEY',
            title: `${fromStop.name[lang] || fromStop.name.en} → ${toStop.name[lang] || toStop.name.en}`,
            subtitle: `${fetched.length} options`,
            fromStopId: fromId,
            toStopId: toId,
          });
        }
      }
    } catch {
      setOptions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJourney(fromStopId, toStopId);
  }, [fromStopId, toStopId, userLocation.lat, userLocation.lng]);

  const handleSwap = () => {
    setFromStopId(toStopId);
    setToStopId(fromStopId);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="border-b border-slate-100 pb-4">
          <CardTitle className="text-xl">{t('planner.title')}</CardTitle>
          <p className="text-xs text-slate-600">{t('planner.subtitle')}</p>
        </CardHeader>
        <CardContent className="pt-5 space-y-4">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-11 md:items-end">
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700 md:col-span-5">
              <div className="flex items-center justify-between">
                <span>{t('planner.from')}</span>
                {nearbyStops[0] && (
                  <button
                    type="button"
                    onClick={() => setFromStopId(nearbyStops[0].stop.stopId)}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-teal-700 hover:underline cursor-pointer"
                  >
                    <Navigation className="h-3 w-3" aria-hidden="true" />
                    <span>{t('planner.useMyStop')}</span>
                  </button>
                )}
              </div>
              <select
                value={fromStopId}
                onChange={(e) => setFromStopId(e.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                {snapshot.stops.map((s) => (
                  <option key={s.stopId} value={s.stopId}>
                    {s.name[lang] || s.name.en} ({s.locality[lang] || s.locality.en})
                  </option>
                ))}
              </select>
            </label>

            <div className="flex justify-center md:col-span-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={handleSwap}
                aria-label={t('planner.swap')}
              >
                <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>

            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700 md:col-span-5">
              <span>{t('planner.to')}</span>
              <select
                value={toStopId}
                onChange={(e) => setToStopId(e.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              >
                {snapshot.stops.map((s) => (
                  <option key={s.stopId} value={s.stopId}>
                    {s.name[lang] || s.name.en} ({s.locality[lang] || s.locality.en})
                  </option>
                ))}
              </select>
            </label>
          </div>
        </CardContent>
      </Card>

      {/* Journey Results */}
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
          {t('common.loading')}
        </div>
      ) : options.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
          {t('planner.noOptions')}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {options.map((opt) => (
            <Card key={opt.optionId} className="flex flex-col justify-between">
              <CardHeader className="border-b border-slate-100 pb-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono-tabular text-base font-bold text-[#0B1F3A]">
                      {opt.legs.map((l) => l.routeNumber).join(' → ')}
                    </span>
                    <span aria-hidden="true" className="text-slate-300">
                      ·
                    </span>
                    <span className="text-xs font-medium text-teal-700">
                      {opt.transfers === 0 ? t('planner.direct') : t('planner.oneTransfer')}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600 tabular-nums">
                    {opt.wheelchairAccessible && (
                      <span
                        className="inline-flex items-center gap-1 text-teal-700 font-medium"
                        title={t('nearby.wheelchairYes')}
                      >
                        <Accessibility className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>{t('nearby.wheelchairYes')}</span>
                      </span>
                    )}
                    <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                      <Clock className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                      {t('planner.estDuration', { min: opt.totalDurationMin })}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Footprints className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
                      {t('planner.walkDist', { meters: opt.walkingDistanceMeters })}
                    </span>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="pt-4 space-y-4">
                {opt.legs.map((leg, idx) => {
                  const fromStop = stopsMap.get(leg.fromStopId);
                  const toStop = stopsMap.get(leg.toStopId);
                  return (
                    <div key={`${leg.routeId}_${idx}`} className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 text-sm font-medium text-slate-900">
                          <span className="font-mono-tabular rounded-md bg-slate-100 px-2 py-0.5 text-xs font-bold text-[#0B1F3A]">
                            {leg.routeNumber}
                          </span>
                          <span>
                            {fromStop ? fromStop.name[lang] || fromStop.name.en : leg.fromStopId} →{' '}
                            {toStop ? toStop.name[lang] || toStop.name.en : leg.toStopId}
                          </span>
                        </div>
                        <div className="flex items-center gap-2.5 shrink-0">
                          {onSelectBusDetails && (
                            <button
                              type="button"
                              onClick={() => onSelectBusDetails(leg.routeId)}
                              className="text-xs font-semibold text-[#0F52BA] hover:underline cursor-pointer"
                            >
                              {t('dashboard.busDetailsBtn')}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onSelectRouteForMap(leg.routeId)}
                            className="text-xs font-semibold text-teal-700 hover:underline cursor-pointer"
                          >
                            {t('dashboard.viewOnMap')}
                          </button>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 tabular-nums">
                        <span>
                          {leg.scheduledDeparture
                            ? `${t('eta.scheduledAt')}: ${leg.scheduledDeparture}`
                            : t(`timetableBasis.${leg.timetableBasis}`)}
                        </span>
                        <span>·</span>
                        <span>~{leg.estimatedDurationMin} min</span>
                        <span>·</span>
                        <span>
                          {t('common.stopsCount', { count: leg.intermediateStopIds.length + 2 })}
                        </span>
                      </div>

                      <StatusIndicator verification={leg.verification} compact />

                      {idx === 0 && opt.transfers > 0 && toStop && (
                        <div className="mt-2 flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
                          <RouteIcon className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                          <span>
                            {t('planner.transferAt', {
                              stop: toStop.name[lang] || toStop.name.en,
                            })}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}

                {(opt.usesDemoTelemetry || opt.usesScheduleOnly || opt.usesEstimatedFrequency) && (
                  <div className="flex items-start gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" aria-hidden="true" />
                    <span>
                      {opt.usesEstimatedFrequency
                        ? `${t('transparency.estimatedBanner')} `
                        : ''}
                      {opt.usesScheduleOnly ? t('planner.scheduleWarning') : t('planner.demoWarning')}
                    </span>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
