import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Bus,
  CalendarDays,
  Clock,
  Compass,
  MapPin,
  MessageSquarePlus,
  Phone,
  Radio,
  ShieldCheck,
} from 'lucide-react';
import { useTransit } from '../context/TransitContext.tsx';
import type { SupportedLanguage } from '../shared/types.ts';
import { haversineKm, predictStopArrivalsForRoute } from '../shared/verificationEngine.ts';
import { StatusIndicator } from './StatusIndicator.tsx';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';

interface BusDetailsViewProps {
  routeId: string;
  onBack: () => void;
  onTrackOnMap: (routeId: string) => void;
  onViewTimetable: (routeId: string) => void;
  onOpenReportModal: (routeId?: string, stopId?: string) => void;
}

export function BusDetailsView({
  routeId,
  onBack,
  onTrackOnMap,
  onViewTimetable,
  onOpenReportModal,
}: BusDetailsViewProps) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as SupportedLanguage) || 'en';
  const { snapshot, stopsMap, verificationsByRoute, nearbyStops } = useTransit();

  const route = snapshot.routes.find((r) => r.routeId === routeId) || snapshot.routes[0];
  const operator = snapshot.operators.find((o) => o.operatorId === route?.operatorId);
  const verification = route ? verificationsByRoute.get(route.routeId) : undefined;
  const positions = snapshot.vehiclePositions.filter((vp) => vp.routeId === route?.routeId);
  const activePos = positions[0] ?? null;
  const vehicle = activePos
    ? snapshot.vehicles.find((v) => v.vehicleId === activePos.vehicleId)
    : snapshot.vehicles.find((v) => v.routeId === route?.routeId);

  const defaultStopId = useMemo(() => {
    if (!route) return '';
    const nearbyServing = nearbyStops.find((n) =>
      route.stopSequence.some((s) => s.stopId === n.stop.stopId)
    );
    return nearbyServing?.stop.stopId || route.stopSequence[route.stopSequence.length - 1]?.stopId || '';
  }, [route, nearbyStops]);

  const [targetStopId, setTargetStopId] = useState(defaultStopId);
  const resolvedTargetStopId =
    route?.stopSequence.some((s) => s.stopId === targetStopId) ? targetStopId : defaultStopId;

  if (!route) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-slate-600">
          {t('busDetails.noVehicleSelected')}
        </CardContent>
      </Card>
    );
  }

  const predictions = predictStopArrivalsForRoute({
    route,
    targetStopId: resolvedTargetStopId,
    stopsMap,
    positions: snapshot.vehiclePositions,
    alerts: snapshot.serviceAlerts,
    reports: snapshot.passengerReports,
    tripUpdates: snapshot.tripUpdates,
    now: snapshot.serverTimestamp,
  });
  const primaryPrediction = predictions[0];
  const targetStop = stopsMap.get(resolvedTargetStopId);
  const nextStop = activePos ? stopsMap.get(activePos.nextStopId) : null;

  const distanceKm =
    activePos && targetStop
      ? (haversineKm(activePos.lat, activePos.lng, targetStop.lat, targetStop.lng) * 1.28).toFixed(1)
      : null;

  const ageSec = activePos
    ? Math.max(
        0,
        Math.round(
          (snapshot.serverTimestamp - (activePos.observationTimestamp || activePos.lastGpsTimestamp)) /
            1000
        )
      )
    : null;

  const currentSeq = activePos?.currentStopSequence ?? 0;
  const hasFreshEta =
    primaryPrediction &&
    primaryPrediction.etaMinLow !== null &&
    primaryPrediction.etaMinHigh !== null;

  return (
    <div className="space-y-6">
      {/* Navy Page Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-gradient-to-r from-[#0A224E] to-[#16428A] px-5 py-4 text-white">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={t('nav.back')}
            className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 cursor-pointer"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div>
            <p className="text-xs text-blue-200">{t('busDetails.title')}</p>
            <h1 className="font-display text-xl font-bold">
              {t('busDetails.busPrefix', { num: route.routeNumber })} ·{' '}
              {route.origin[lang] || route.origin.en} → {route.destination[lang] || route.destination.en}
            </h1>
          </div>
        </div>
        {verification && (
          <span className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-[#0B1F3A]">
            {t(`status.${verification.status}`)}
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Main Telemetry & Route Progress Card */}
        <Card className="lg:col-span-7">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                  <Bus className="h-6 w-6" aria-hidden="true" />
                </div>
                <div>
                  <CardTitle className="text-lg">
                    {t('busDetails.busPrefix', { num: route.routeNumber })}
                  </CardTitle>
                  <p className="text-xs text-slate-500">
                    {operator?.name} · {route.isAc ? t('busDetails.acService') : t('busDetails.nonAcService')}
                  </p>
                </div>
              </div>
              {verification && <StatusIndicator verification={verification} compact />}
            </div>
          </CardHeader>

          <CardContent className="pt-5 space-y-6">
            {/* Horizontal Route Progress Stepper (Reference Screen 4) */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <div className="flex items-center justify-between text-xs font-semibold text-slate-800 mb-3">
                <span>{route.origin[lang] || route.origin.en}</span>
                <span>{route.destination[lang] || route.destination.en}</span>
              </div>
              <div className="flex items-center justify-between gap-1 overflow-x-auto pb-2">
                {route.stopSequence.map((entry, idx) => {
                  const passed = activePos ? entry.sequenceOrder <= currentSeq : false;
                  const isNext = activePos ? entry.stopId === activePos.nextStopId : false;
                  const stop = stopsMap.get(entry.stopId);
                  return (
                    <div key={entry.stopId} className="flex flex-1 items-center min-w-[44px]">
                      <div className="flex flex-col items-center text-center w-full">
                        <div
                          className={`h-3.5 w-3.5 rounded-full border-2 ${
                            isNext
                              ? 'border-blue-600 bg-white ring-4 ring-blue-100'
                              : passed
                                ? 'border-emerald-600 bg-emerald-600'
                                : 'border-slate-300 bg-white'
                          }`}
                        />
                        <span className="mt-1.5 text-[10px] text-slate-600 line-clamp-1 max-w-[70px]">
                          {stop ? stop.name[lang] || stop.name.en : entry.stopId}
                        </span>
                      </div>
                      {idx < route.stopSequence.length - 1 && (
                        <div
                          className={`h-0.5 flex-1 -mt-4 ${
                            passed ? 'bg-emerald-500' : 'bg-slate-200'
                          }`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Target Stop Selector for ETA Evaluation */}
            <label className="flex flex-col gap-1.5 text-xs font-medium text-slate-700">
              <span>{t('busDetails.selectTargetStop')}</span>
              <select
                value={resolvedTargetStopId}
                onChange={(e) => setTargetStopId(e.target.value)}
                className="h-11 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
              >
                {route.stopSequence.map((entry) => {
                  const stop = stopsMap.get(entry.stopId);
                  return (
                    <option key={entry.stopId} value={entry.stopId}>
                      {entry.sequenceOrder}. {stop ? stop.name[lang] || stop.name.en : entry.stopId}
                    </option>
                  );
                })}
              </select>
            </label>

            {/* Telemetry Specification Grid (Reference Screen 4) */}
            <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <MapPin className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span>{t('busDetails.nextStop')}</span>
                </span>
                <span className="font-semibold text-slate-900">
                  {nextStop ? nextStop.name[lang] || nextStop.name.en : '—'}
                </span>
              </div>

              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span>{t('busDetails.etaAtStop')}</span>
                </span>
                <span className="font-mono-tabular font-semibold text-emerald-700">
                  {hasFreshEta
                    ? t('eta.minutesRange', {
                        low: primaryPrediction.etaMinLow,
                        high: primaryPrediction.etaMinHigh,
                      })
                    : primaryPrediction?.scheduledTime
                      ? `${t('eta.scheduledAt')} ${primaryPrediction.scheduledTime}`
                      : t('transparency.estimatedEveryMin', { min: route.frequencyMin })}
                </span>
              </div>

              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <Compass className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span>{t('busDetails.distanceToStop')}</span>
                </span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {distanceKm ? `${distanceKm} km` : '—'}
                </span>
              </div>

              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <Clock className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span>{t('busDetails.delayLabel')}</span>
                </span>
                <span className="font-semibold text-slate-900">
                  {primaryPrediction?.delayMinutes && primaryPrediction.delayMinutes >= 5
                    ? t('eta.delayBy', { min: primaryPrediction.delayMinutes })
                    : t('eta.onSchedule')}
                </span>
              </div>

              <div className="flex items-center justify-between px-4 py-3 text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <Radio className="h-4 w-4 text-slate-400" aria-hidden="true" />
                  <span>{t('busDetails.lastUpdate')}</span>
                </span>
                <span className="font-mono-tabular font-medium text-slate-800">
                  {ageSec === null
                    ? t('status.SCHEDULED')
                    : ageSec < 60
                      ? t('map.secondsAgo', { sec: ageSec })
                      : t('map.minutesAgo', { min: Math.round(ageSec / 60) })}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Button variant="outline" onClick={() => onTrackOnMap(route.routeId)}>
                <MapPin className="h-4 w-4 text-blue-700" aria-hidden="true" />
                <span>{t('dashboard.viewOnMap')}</span>
              </Button>
              <Button variant="default" onClick={() => onViewTimetable(route.routeId)}>
                <CalendarDays className="h-4 w-4" aria-hidden="true" />
                <span>{t('dashboard.viewTimetable')}</span>
              </Button>
              <Button
                variant="teal"
                onClick={() => onOpenReportModal(route.routeId, resolvedTargetStopId)}
              >
                <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
                <span>{t('dashboard.reportObservation')}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Vehicle & Reliability Provenance Card */}
        <Card className="lg:col-span-5">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-teal-600" aria-hidden="true" />
              <span>{t('busDetails.dataSource')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-5 space-y-5">
            {verification && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <StatusIndicator verification={verification} />
                <p className="text-xs text-slate-500">
                  {t('eta.confidence')}:{' '}
                  <strong>{t(`eta.${primaryPrediction?.confidence ?? verification.confidence}`)}</strong>
                </p>
              </div>
            )}

            <div className="divide-y divide-slate-100 text-sm">
              <div className="flex justify-between py-2.5">
                <span className="text-slate-500">{t('busDetails.vehicleReg')}</span>
                <span className="font-mono-tabular font-semibold text-slate-900">
                  {vehicle?.registrationNumber ?? 'Timetable Trip'}
                </span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-slate-500">{t('busDetails.fleetCode')}</span>
                <span className="font-mono-tabular font-medium text-slate-800">
                  {vehicle?.fleetCode ?? '—'}
                </span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-slate-500">{t('busDetails.direction')}</span>
                <span className="font-medium text-slate-800">
                  {activePos?.direction === 'INBOUND'
                    ? t('busDetails.inbound')
                    : t('busDetails.outbound')}
                </span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-slate-500">{t('busDetails.speed')}</span>
                <span className="font-mono-tabular font-medium text-slate-800">
                  {activePos ? `${activePos.speedKmh} km/h` : '—'}
                </span>
              </div>
              <div className="flex justify-between py-2.5">
                <span className="text-slate-500">{t('busDetails.capacity')}</span>
                <span className="font-mono-tabular font-medium text-slate-800">
                  {vehicle ? `${vehicle.capacity} seats` : '—'}
                </span>
              </div>
              {operator?.helpline && (
                <div className="flex justify-between py-2.5">
                  <span className="text-slate-500 flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t('busDetails.operator')}</span>
                  </span>
                  <span className="font-mono-tabular font-medium text-slate-800">
                    {operator.helpline}
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
