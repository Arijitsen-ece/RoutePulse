import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Bus,
  CalendarDays,
  Clock,
  Info,
  MessageSquarePlus,
  Radio,
} from 'lucide-react';
import { useTransit } from '../context/TransitContext.tsx';
import type { SupportedLanguage } from '../shared/types.ts';
import { predictStopArrivalsForRoute } from '../shared/verificationEngine.ts';
import { StatusIndicator } from './StatusIndicator.tsx';
import { TransitMap } from './TransitMap.tsx';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';

interface LiveMapViewProps {
  selectedRouteId: string | 'ALL';
  onSelectRouteId: (routeId: string | 'ALL') => void;
  onOpenReportModal: (routeId?: string, stopId?: string) => void;
  onOpenBusDetails: (routeId: string) => void;
  onOpenTimetable: (routeId: string) => void;
  onBack?: () => void;
}

export function LiveMapView({
  selectedRouteId,
  onSelectRouteId,
  onOpenReportModal,
  onOpenBusDetails,
  onOpenTimetable,
  onBack,
}: LiveMapViewProps) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as SupportedLanguage) || 'en';
  const { snapshot, verificationsByRoute, stopsMap, userLocation } = useTransit();

  const filteredPositions =
    selectedRouteId === 'ALL'
      ? snapshot.vehiclePositions
      : snapshot.vehiclePositions.filter((vp) => vp.routeId === selectedRouteId);

  const now = snapshot.serverTimestamp;
  const focusedRoute =
    selectedRouteId !== 'ALL'
      ? snapshot.routes.find((r) => r.routeId === selectedRouteId)
      : undefined;
  const focusedPos = focusedRoute
    ? snapshot.vehiclePositions.find((vp) => vp.routeId === focusedRoute.routeId)
    : undefined;
  const focusedVerification = focusedRoute
    ? verificationsByRoute.get(focusedRoute.routeId)
    : undefined;

  const focusedPrediction =
    focusedRoute && focusedPos
      ? predictStopArrivalsForRoute({
          route: focusedRoute,
          targetStopId: focusedPos.nextStopId,
          stopsMap,
          positions: snapshot.vehiclePositions,
          alerts: snapshot.serviceAlerts,
          reports: snapshot.passengerReports,
          tripUpdates: snapshot.tripUpdates,
          now,
        })[0]
      : undefined;

  return (
    <div className="space-y-6">
      {/* Navy Top Header matching Reference Screen 4 */}
      <div className="flex flex-col gap-3 rounded-2xl bg-gradient-to-r from-[#0A224E] to-[#16428A] p-5 text-white sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={t('nav.back')}
              className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 cursor-pointer"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <div>
            <h1 className="font-display text-2xl font-bold">{t('map.title')}</h1>
            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-blue-100">
              <Radio className="h-3.5 w-3.5 text-teal-300" aria-hidden="true" />
              <span>
                {t(`telemetryModes.${snapshot.dataHealth.activeTelemetryMode}`)}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={selectedRouteId}
            onChange={(e) => onSelectRouteId(e.target.value)}
            aria-label={t('map.allRoutes')}
            className="h-11 rounded-xl border border-white/25 bg-white/15 px-3.5 text-sm text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <option value="ALL" className="text-slate-900">
              {t('map.allRoutes')}
            </option>
            {snapshot.routes.map((r) => (
              <option key={r.routeId} value={r.routeId} className="text-slate-900">
                {r.routeNumber} — {r.origin[lang] || r.origin.en} →{' '}
                {r.destination[lang] || r.destination.en}
              </option>
            ))}
          </select>

          <Button
            variant="teal"
            onClick={() =>
              onOpenReportModal(selectedRouteId === 'ALL' ? undefined : selectedRouteId)
            }
          >
            <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
            <span>{t('dashboard.reportObservation')}</span>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-4 lg:col-span-8">
          <TransitMap
            routes={snapshot.routes}
            stops={snapshot.stops}
            vehicles={snapshot.vehicles}
            vehiclePositions={snapshot.vehiclePositions}
            verificationsByRoute={verificationsByRoute}
            selectedRouteId={selectedRouteId}
            userLat={userLocation.lat}
            userLng={userLocation.lng}
            heightClass="h-[420px] lg:h-[520px]"
            onSelectRoute={(id) => onSelectRouteId(id)}
          />

          {/* Selected Route Live Telemetry Summary Card (Reference Screen 4) */}
          {focusedRoute && (
            <Card>
              <CardContent className="p-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                      <Bus className="h-5 w-5" aria-hidden="true" />
                    </div>
                    <div>
                      <h2 className="font-display text-base font-bold text-[#0B1F3A]">
                        {t('busDetails.busPrefix', { num: focusedRoute.routeNumber })}
                      </h2>
                      <p className="text-xs text-slate-600">
                        {focusedRoute.origin[lang] || focusedRoute.origin.en} →{' '}
                        {focusedRoute.destination[lang] || focusedRoute.destination.en}
                      </p>
                    </div>
                  </div>
                  {focusedVerification && <StatusIndicator verification={focusedVerification} compact />}
                </div>

                {/* Progress Stepper */}
                <div className="flex items-center gap-1 overflow-x-auto py-1">
                  {focusedRoute.stopSequence.map((entry, idx) => {
                    const passed = focusedPos
                      ? entry.sequenceOrder <= focusedPos.currentStopSequence
                      : false;
                    const isNext = focusedPos ? entry.stopId === focusedPos.nextStopId : false;
                    return (
                      <div key={entry.stopId} className="flex flex-1 items-center min-w-[20px]">
                        <div
                          className={`h-3 w-3 shrink-0 rounded-full border-2 ${
                            isNext
                              ? 'border-blue-600 bg-white ring-2 ring-blue-200'
                              : passed
                                ? 'border-emerald-600 bg-emerald-600'
                                : 'border-slate-300 bg-white'
                          }`}
                        />
                        {idx < focusedRoute.stopSequence.length - 1 && (
                          <div
                            className={`h-0.5 flex-1 ${passed ? 'bg-emerald-500' : 'bg-slate-200'}`}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>

                {focusedPos && (
                  <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3 text-xs sm:grid-cols-4">
                    <div>
                      <p className="text-slate-500">{t('map.nextStop')}</p>
                      <p className="mt-0.5 font-semibold text-slate-900 truncate">
                        {stopsMap.get(focusedPos.nextStopId)?.name[lang] ||
                          stopsMap.get(focusedPos.nextStopId)?.name.en ||
                          focusedPos.nextStopId}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">{t('eta.arrivingIn')}</p>
                      <p className="mt-0.5 font-mono-tabular font-semibold text-emerald-700">
                        {focusedPrediction?.etaMinLow !== null &&
                        focusedPrediction?.etaMinLow !== undefined
                          ? t('eta.minutesRange', {
                              low: focusedPrediction.etaMinLow,
                              high: focusedPrediction.etaMinHigh,
                            })
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">{t('busDetails.delayLabel')}</p>
                      <p className="mt-0.5 font-semibold text-slate-900">
                        {focusedPos.delayMinutes >= 5
                          ? t('eta.delayBy', { min: focusedPos.delayMinutes })
                          : t('eta.onSchedule')}
                      </p>
                    </div>
                    <div>
                      <p className="text-slate-500">{t('map.lastGps')}</p>
                      <p className="mt-0.5 font-mono-tabular font-medium text-slate-800">
                        {(() => {
                          const obsTs = focusedPos.observationTimestamp || focusedPos.lastGpsTimestamp;
                          const age = Math.max(0, Math.round((now - obsTs) / 1000));
                          return age < 60
                            ? t('map.secondsAgo', { sec: age })
                            : t('map.minutesAgo', { min: Math.round(age / 60) });
                        })()}
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-2.5">
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => onOpenBusDetails(focusedRoute.routeId)}
                  >
                    <Info className="h-4 w-4 text-blue-700" aria-hidden="true" />
                    <span>{t('dashboard.busDetailsBtn')}</span>
                  </Button>
                  <Button
                    variant="default"
                    className="flex-1"
                    onClick={() => onOpenTimetable(focusedRoute.routeId)}
                  >
                    <CalendarDays className="h-4 w-4" aria-hidden="true" />
                    <span>{t('dashboard.viewTimetable')}</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Active Vehicle List */}
        <Card className="lg:col-span-4">
          <CardHeader className="border-b border-slate-100 pb-3.5">
            <CardTitle className="flex items-center gap-2">
              <Bus className="h-4 w-4 text-teal-600" aria-hidden="true" />
              <span>{t('dashboard.liveTracking')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="divide-y divide-slate-100 pt-1 max-h-[620px] overflow-y-auto">
            {filteredPositions.length === 0 ? (
              <div className="py-8 text-center space-y-3">
                <p className="text-sm text-slate-500">
                  No active GPS telemetry for this route. Check timetable or passenger confirmations.
                </p>
                {focusedRoute && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenTimetable(focusedRoute.routeId)}
                  >
                    <Clock className="h-4 w-4" aria-hidden="true" />
                    <span>{t('dashboard.viewTimetable')}</span>
                  </Button>
                )}
              </div>
            ) : (
              filteredPositions.map((pos) => {
                const route = snapshot.routes.find((r) => r.routeId === pos.routeId);
                const vehicle = snapshot.vehicles.find((v) => v.vehicleId === pos.vehicleId);
                const nextStop = stopsMap.get(pos.nextStopId);
                const verification = verificationsByRoute.get(pos.routeId);
                const obsTs = pos.observationTimestamp || pos.lastGpsTimestamp;
                const ageSec = Math.max(0, Math.round((now - obsTs) / 1000));

                return (
                  <div key={pos.vehicleId} className="py-3.5 space-y-2">
                    <button
                      type="button"
                      onClick={() => onSelectRouteId(pos.routeId)}
                      className="w-full text-left hover:bg-slate-50/70 rounded-xl p-1 -m-1 transition-colors cursor-pointer space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono-tabular rounded-lg bg-[#0B1F3A] px-2.5 py-0.5 text-xs font-bold text-white">
                            {route?.routeNumber ?? pos.routeId}
                          </span>
                          <span className="font-mono-tabular text-xs text-slate-600">
                            {vehicle?.fleetCode ?? pos.vehicleId}
                          </span>
                        </div>
                        <span className="font-mono-tabular text-xs font-medium text-slate-700">
                          {pos.speedKmh} km/h
                        </span>
                      </div>

                      <p className="text-xs text-slate-700">
                        <span className="text-slate-500">{t('map.nextStop')}:</span>{' '}
                        <strong>
                          {nextStop ? nextStop.name[lang] || nextStop.name.en : pos.nextStopId}
                        </strong>
                      </p>

                      <div className="flex items-center justify-between text-[11px] text-slate-500">
                        <span>
                          {t(`sources.${pos.sourceType}`)} · {t(`freshness.${pos.freshnessState || 'UNAVAILABLE'}`)}
                        </span>
                        <span className="font-mono-tabular">
                          {ageSec < 60
                            ? t('map.secondsAgo', { sec: ageSec })
                            : t('map.minutesAgo', { min: Math.round(ageSec / 60) })}
                        </span>
                      </div>

                      {verification && <StatusIndicator verification={verification} compact />}
                    </button>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => onOpenBusDetails(pos.routeId)}
                        className="text-[11px] font-semibold text-[#0F52BA] hover:underline cursor-pointer"
                      >
                        {t('dashboard.busDetailsBtn')}
                      </button>
                      <span className="text-slate-300">·</span>
                      <button
                        type="button"
                        onClick={() => onOpenTimetable(pos.routeId)}
                        className="text-[11px] font-semibold text-teal-700 hover:underline cursor-pointer"
                      >
                        {t('dashboard.viewTimetable')}
                      </button>
                    </div>
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
