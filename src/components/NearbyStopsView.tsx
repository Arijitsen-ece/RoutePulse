import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Accessibility, Bus, ChevronRight, MapPin, Navigation } from 'lucide-react';
import { useTransit } from '../context/TransitContext.tsx';
import type { SupportedLanguage } from '../shared/types.ts';
import { haversineKm, predictStopArrivalsForRoute } from '../shared/verificationEngine.ts';
import { StatusIndicator } from './StatusIndicator.tsx';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';

export function NearbyStopsView({
  onSelectBusDetails,
  onRefreshGps,
}: {
  onSelectBusDetails: (routeId: string) => void;
  onRefreshGps: () => Promise<boolean>;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as SupportedLanguage) || 'en';
  const { snapshot, stopsMap, userLocation } = useTransit();

  const sortedStops = useMemo(() => {
    return snapshot.stops
      .map((stop) => {
        const km = haversineKm(userLocation.lat, userLocation.lng, stop.lat, stop.lng);
        return {
          stop,
          distanceKm: Number(km.toFixed(2)),
          walkMin: Math.max(1, Math.round((km * 1000) / 75)),
        };
      })
      .sort((a, b) => a.distanceKm - b.distanceKm);
  }, [snapshot.stops, userLocation]);

  const [selectedStopId, setSelectedStopId] = useState<string>(sortedStops[0]?.stop.stopId || '');
  const activeStopId = sortedStops.some((s) => s.stop.stopId === selectedStopId)
    ? selectedStopId
    : sortedStops[0]?.stop.stopId || '';
  const activeStop = stopsMap.get(activeStopId);

  const arrivals = useMemo(() => {
    if (!activeStopId) return [];
    const routes = snapshot.routes.filter((r) =>
      r.stopSequence.some((s) => s.stopId === activeStopId)
    );
    return routes.flatMap((route) => {
      const preds = predictStopArrivalsForRoute({
        route,
        targetStopId: activeStopId,
        stopsMap,
        positions: snapshot.vehiclePositions,
        alerts: snapshot.serviceAlerts,
        reports: snapshot.passengerReports,
        tripUpdates: snapshot.tripUpdates,
        now: snapshot.serverTimestamp,
      });
      return preds.slice(0, 1).map((prediction) => ({ route, prediction }));
    });
  }, [activeStopId, snapshot, stopsMap]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#0A224E] to-[#16428A] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">{t('nearby.title')}</h1>
          <p className="mt-0.5 text-xs text-blue-100">{t('nearby.subtitle')}</p>
        </div>
        <Button
          variant="outline"
          onClick={onRefreshGps}
          className="border-white/25 bg-white/10 text-white hover:bg-white/20"
        >
          <Navigation className="h-4 w-4" aria-hidden="true" />
          <span>{t('welcome.useCurrentLocation')}</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-2.5 lg:col-span-5 max-h-[600px] overflow-y-auto pr-1">
          {sortedStops.map(({ stop, distanceKm, walkMin }) => {
            const active = stop.stopId === activeStopId;
            return (
              <button
                key={stop.stopId}
                type="button"
                onClick={() => setSelectedStopId(stop.stopId)}
                className={`flex w-full items-center justify-between gap-3 rounded-2xl border p-4 text-left transition-colors cursor-pointer ${
                  active
                    ? 'border-blue-600 bg-blue-50/50 ring-1 ring-blue-600/20'
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                    <span className="truncate text-sm font-semibold text-slate-900">
                      {stop.name[lang] || stop.name.en}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span>{stop.locality[lang] || stop.locality.en}</span>
                    {stop.wheelchairAccessible && (
                      <span className="inline-flex items-center gap-1 text-teal-700">
                        <Accessibility className="h-3.5 w-3.5" aria-hidden="true" />
                        {t('nearby.wheelchairYes')}
                      </span>
                    )}
                  </div>
                </div>
                <span className="font-mono-tabular shrink-0 text-xs font-semibold text-blue-700">
                  {t('nearby.distanceLabel', { km: distanceKm, min: walkMin })}
                </span>
              </button>
            );
          })}
        </div>

        <Card className="lg:col-span-7">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="flex items-center gap-2">
              <Bus className="h-4 w-4 text-blue-700" aria-hidden="true" />
              <span>
                {activeStop ? activeStop.name[lang] || activeStop.name.en : t('nearby.upcomingAtStop')}
              </span>
            </CardTitle>
            <p className="text-xs text-slate-500">{t('nearby.upcomingAtStop')}</p>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100 pt-1">
            {arrivals.length === 0 ? (
              <p className="py-8 text-center text-sm text-slate-500">
                No scheduled routes found for this stop.
              </p>
            ) : (
              arrivals.map(({ route, prediction }) => {
                const hasLiveEta =
                  prediction.etaMinLow !== null && prediction.etaMinHigh !== null;
                return (
                  <button
                    key={prediction.predictionId}
                    type="button"
                    onClick={() => onSelectBusDetails(route.routeId)}
                    className="flex w-full items-center justify-between gap-4 py-4 text-left hover:bg-slate-50/70 px-2 -mx-2 rounded-xl cursor-pointer"
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono-tabular rounded-lg bg-[#0B1F3A] px-2.5 py-0.5 text-xs font-bold text-white">
                          {route.routeNumber}
                        </span>
                        <span className="truncate text-sm font-semibold text-slate-900">
                          {route.origin[lang] || route.origin.en} →{' '}
                          {route.destination[lang] || route.destination.en}
                        </span>
                      </div>
                      <StatusIndicator verification={prediction.verification} compact />
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono-tabular text-xs font-semibold text-emerald-700">
                        {hasLiveEta
                          ? t('dashboard.arrivingInMin', {
                              range: `${prediction.etaMinLow}–${prediction.etaMinHigh}`,
                            })
                          : prediction.scheduledTime
                            ? t('dashboard.scheduledOnlyLabel', { time: prediction.scheduledTime })
                            : t('transparency.estimatedEveryMin', { min: route.frequencyMin })}
                      </span>
                      <ChevronRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    </div>
                  </button>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
