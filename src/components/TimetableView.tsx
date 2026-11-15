import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Bookmark, BookmarkCheck, CalendarDays, Clock, MapPin } from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useTransit } from '../context/TransitContext.tsx';
import type { SupportedLanguage } from '../shared/types.ts';
import { TransitMap } from './TransitMap.tsx';
import { Card, CardContent } from './ui/card.tsx';
import { cn } from '../lib/utils.ts';

function formatTo12Hour(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${suffix}`;
}

export function TimetableView({
  routeId,
  onSelectRouteId,
  onBack,
}: {
  routeId: string;
  onSelectRouteId: (id: string) => void;
  onBack: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as SupportedLanguage) || 'en';
  const { favouriteRoutes, toggleFavouriteRoute } = useAuth();
  const { snapshot, stopsMap, verificationsByRoute, userLocation } = useTransit();

  const [subTab, setSubTab] = useState<'schedule' | 'stops' | 'map'>('schedule');
  const route = snapshot.routes.find((r) => r.routeId === routeId) || snapshot.routes[0];
  const isFav = route ? favouriteRoutes.some((f) => f.routeId === route.routeId) : false;

  const trips = useMemo(() => {
    if (!route) return [];
    return snapshot.scheduledTrips.filter((tr) => tr.routeId === route.routeId);
  }, [route, snapshot.scheduledTrips]);

  // Highlight next departure relative to current local time
  const nextDepartureIdx = useMemo(() => {
    const now = new Date();
    const curMin = now.getHours() * 60 + now.getMinutes();
    const idx = trips.findIndex((tr) => {
      const [h, m] = tr.departureTime.split(':').map(Number);
      return h * 60 + m >= curMin;
    });
    return idx >= 0 ? idx : 0;
  }, [trips]);

  if (!route) return null;

  return (
    <div className="space-y-6">
      {/* Navy Top Bar matching Reference Screen 5 */}
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
          <h1 className="font-display text-xl font-bold">{t('timetable.title')}</h1>
        </div>

        <select
          value={route.routeId}
          onChange={(e) => onSelectRouteId(e.target.value)}
          aria-label="Select route timetable"
          className="h-10 rounded-xl bg-white/15 px-3 text-sm font-medium text-white border border-white/20 focus:outline-none"
        >
          {snapshot.routes.map((r) => (
            <option key={r.routeId} value={r.routeId} className="text-slate-900">
              {r.routeNumber} — {r.origin[lang] || r.origin.en} → {r.destination[lang] || r.destination.en}
            </option>
          ))}
        </select>
      </div>

      <Card className="mx-auto max-w-4xl">
        <CardContent className="p-5 sm:p-6 space-y-5">
          {/* Route Code Header + Favourite Star */}
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2.5">
                <span className="font-mono-tabular rounded-xl bg-gradient-to-r from-[#0F52BA] to-[#1D70EC] px-3.5 py-1 text-base font-bold text-white">
                  {route.routeNumber}
                </span>
                <span className="text-xs text-slate-500">
                  {t('explorer.frequency', { min: route.frequencyMin })}
                </span>
              </div>
              <p className="mt-2 font-display text-lg font-semibold text-slate-900">
                {route.origin[lang] || route.origin.en} → {route.destination[lang] || route.destination.en}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                toggleFavouriteRoute({
                  routeId: route.routeId,
                  routeNumber: route.routeNumber,
                  originName: route.origin[lang] || route.origin.en,
                  destinationName: route.destination[lang] || route.destination.en,
                })
              }
              aria-label={t('explorer.saveRoute')}
              className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 hover:bg-slate-50 cursor-pointer"
            >
              {isFav ? (
                <BookmarkCheck className="h-5 w-5 text-blue-700" aria-hidden="true" />
              ) : (
                <Bookmark className="h-5 w-5 text-slate-500" aria-hidden="true" />
              )}
            </button>
          </div>

          {/* 3-Tab Switcher matching Reference Screen 5: Schedule | Stop List | Route Map */}
          <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
            {(
              [
                ['schedule', t('timetable.tabSchedule')],
                ['stops', t('timetable.tabStopList')],
                ['map', t('timetable.tabRouteMap')],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setSubTab(key)}
                className={cn(
                  'min-h-[40px] rounded-lg text-sm font-semibold transition-colors cursor-pointer',
                  subTab === key
                    ? 'bg-gradient-to-r from-[#0F52BA] to-[#1D70EC] text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {subTab === 'schedule' && (
            <div className="space-y-5">
              {/* Explicit Timetable Basis & Provenance Disclosure */}
              <div
                className={cn(
                  'rounded-xl border px-4 py-3 text-xs leading-relaxed',
                  route.timetableBasis === 'OFFICIAL_TIMETABLE'
                    ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                    : 'border-amber-200 bg-amber-50/70 text-amber-900'
                )}
              >
                <p className="font-semibold">{t(`timetableBasis.${route.timetableBasis}`)}</p>
                <p className="mt-0.5">
                  {route.timetableBasis === 'ESTIMATED_FREQUENCY' ||
                  route.timetableBasis === 'SYNTHETIC_DEMO'
                    ? t('transparency.estimatedBanner')
                    : t('sources.' + route.dataSource)}{' '}
                  · {route.sourceLabel}
                </p>
              </div>

              {/* Operating Days Row */}
              <div className="flex items-center justify-between rounded-xl border border-slate-200 px-4 py-3 text-sm">
                <span className="flex items-center gap-2 text-slate-600">
                  <CalendarDays className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  <span>{t('timetable.operatingDays')}</span>
                </span>
                <span className="font-semibold text-slate-900">
                  {route.operatingDays.length === 7
                    ? 'Mon – Sun'
                    : `${route.operatingDays[0]} – ${route.operatingDays[route.operatingDays.length - 1]}`}
                </span>
              </div>

              {/* First Bus (Mint Green) & Last Bus (Soft Rose) Highlights matching Reference Screen 5 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/70 p-4 text-center">
                  <p className="text-xs font-medium text-emerald-800">{t('timetable.firstBus')}</p>
                  <p className="mt-1 font-mono-tabular text-lg font-bold text-slate-900">
                    {formatTo12Hour(route.firstDeparture)}
                  </p>
                </div>
                <div className="rounded-2xl border border-rose-200 bg-rose-50/70 p-4 text-center">
                  <p className="text-xs font-medium text-rose-800">{t('timetable.lastBus')}</p>
                  <p className="mt-1 font-mono-tabular text-lg font-bold text-slate-900">
                    {formatTo12Hour(route.lastDeparture)}
                  </p>
                </div>
              </div>

              {/* 3-Column Departure Schedule Grid */}
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-slate-900">
                    {t('timetable.departureFrom', {
                      origin: route.origin[lang] || route.origin.en,
                    })}
                  </h3>
                  <span className="text-xs text-slate-500">
                    {route.timetableBasis === 'ESTIMATED_FREQUENCY'
                      ? t('transparency.estimatedEveryMin', { min: route.frequencyMin })
                      : t('eta.timetableNotice')}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-6">
                  {trips.map((tr, idx) => {
                    const isNext = idx === nextDepartureIdx;
                    return (
                      <div
                        key={tr.tripId}
                        className={cn(
                          'font-mono-tabular rounded-xl border px-2.5 py-2.5 text-center text-xs font-semibold',
                          isNext
                            ? 'border-blue-600 bg-gradient-to-r from-[#0F52BA] to-[#1D70EC] text-white shadow-xs'
                            : 'border-slate-200 bg-slate-50 text-slate-800'
                        )}
                      >
                        {formatTo12Hour(tr.departureTime)}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {subTab === 'stops' && (
            <div className="space-y-3">
              <p className="text-xs text-slate-500">{t('timetable.stopWiseTimings')}</p>
              <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200">
                {route.stopSequence.map((entry) => {
                  const stop = stopsMap.get(entry.stopId);
                  return (
                    <div
                      key={entry.stopId}
                      className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="font-mono-tabular flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">
                          {entry.sequenceOrder}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">
                            {stop ? stop.name[lang] || stop.name.en : entry.stopId}
                          </p>
                          <p className="truncate text-xs text-slate-500">
                            {stop ? stop.locality[lang] || stop.locality.en : ''}
                          </p>
                        </div>
                      </div>
                      <div className="font-mono-tabular text-right text-xs text-slate-600 shrink-0">
                        <span className="inline-flex items-center gap-1 font-semibold text-slate-900">
                          <Clock className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />+
                          {entry.scheduledOffsetMin} min
                        </span>
                        <p className="text-slate-500">{entry.distanceFromOriginKm} km</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {subTab === 'map' && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-slate-600">
                <MapPin className="h-4 w-4 text-blue-600" aria-hidden="true" />
                <span>{route.corridorSummary[lang] || route.corridorSummary.en}</span>
              </div>
              <TransitMap
                routes={snapshot.routes}
                stops={snapshot.stops}
                vehicles={snapshot.vehicles}
                vehiclePositions={snapshot.vehiclePositions}
                verificationsByRoute={verificationsByRoute}
                selectedRouteId={route.routeId}
                userLat={userLocation.lat}
                userLng={userLocation.lng}
                heightClass="h-[360px]"
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
