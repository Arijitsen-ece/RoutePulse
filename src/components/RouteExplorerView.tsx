import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeftRight,
  Bookmark,
  BookmarkCheck,
  Clock,
  MapPin,
  Search,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useTransit } from '../context/TransitContext.tsx';
import type { SupportedLanguage, TransitRoute } from '../shared/types.ts';
import { StatusIndicator } from './StatusIndicator.tsx';
import { TransitMap } from './TransitMap.tsx';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Input } from './ui/input.tsx';

export function RouteExplorerView({
  onOpenReportModal,
  onOpenBusDetails,
  onOpenTimetable,
}: {
  onOpenReportModal: (routeId?: string, stopId?: string) => void;
  onOpenBusDetails?: (routeId: string) => void;
  onOpenTimetable?: (routeId: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as SupportedLanguage) || 'en';
  const { favouriteRoutes, toggleFavouriteRoute } = useAuth();
  const { snapshot, verificationsByRoute, stopsMap, userLocation } = useTransit();

  const [query, setQuery] = useState('');
  const [operatorFilter, setOperatorFilter] = useState<string>('ALL');
  const [acOnly, setAcOnly] = useState(false);
  const [selectedRouteId, setSelectedRouteId] = useState<string>(
    snapshot.routes[0]?.routeId || 'route_s12'
  );
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const opMap = useMemo(
    () => new Map(snapshot.operators.map((o) => [o.operatorId, o])),
    [snapshot.operators]
  );

  const filteredRoutes = useMemo(() => {
    const q = query.trim().toLowerCase();
    return snapshot.routes.filter((r) => {
      if (operatorFilter !== 'ALL' && r.operatorId !== operatorFilter) return false;
      if (acOnly && !r.isAc) return false;
      if (!q) return true;
      const stopMatch = r.stopSequence.some((entry) => {
        const stop = stopsMap.get(entry.stopId);
        if (!stop) return false;
        return (
          stop.name.en.toLowerCase().includes(q) ||
          stop.name.hi.toLowerCase().includes(q) ||
          stop.name.bn.toLowerCase().includes(q)
        );
      });
      return (
        r.routeNumber.toLowerCase().includes(q) ||
        r.origin.en.toLowerCase().includes(q) ||
        r.destination.en.toLowerCase().includes(q) ||
        stopMatch
      );
    });
  }, [snapshot.routes, operatorFilter, acOnly, query, stopsMap]);

  const selectedRoute: TransitRoute | undefined =
    snapshot.routes.find((r) => r.routeId === selectedRouteId) || filteredRoutes[0];

  const selectedTrips = useMemo(() => {
    if (!selectedRoute) return [];
    return snapshot.scheduledTrips.filter((trip) => trip.routeId === selectedRoute.routeId);
  }, [selectedRoute, snapshot.scheduledTrips]);

  const toggleCompare = (routeId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(routeId)) return prev.filter((id) => id !== routeId);
      if (prev.length >= 2) return [prev[1], routeId];
      return [...prev, routeId];
    });
  };

  const comparedRoutes = compareIds
    .map((id) => snapshot.routes.find((r) => r.routeId === id))
    .filter((r): r is TransitRoute => Boolean(r));

  return (
    <div className="space-y-6">
      {/* Header + Filter Controls */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">{t('explorer.title')}</h1>
            <p className="text-xs text-slate-600">{t('explorer.subtitle')}</p>
          </div>
          <p className="text-xs text-slate-500">{t('explorer.scheduledVsLiveNote')}</p>
        </div>

        <div className="flex flex-col gap-3 md:flex-row md:items-center">
          <div className="relative flex-1">
            <Search
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
              aria-hidden="true"
            />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('dashboard.searchPlaceholder')}
              className="pl-10"
            />
          </div>

          <select
            value={operatorFilter}
            onChange={(e) => setOperatorFilter(e.target.value)}
            className="h-11 rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
          >
            <option value="ALL">{t('explorer.allOperators')}</option>
            {snapshot.operators.map((op) => (
              <option key={op.operatorId} value={op.operatorId}>
                {op.shortCode} — {op.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => setAcOnly((v) => !v)}
            className={`min-h-[44px] rounded-xl border px-4 text-sm font-medium transition-colors cursor-pointer ${
              acOnly
                ? 'border-teal-600 bg-teal-50 text-teal-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            {t('explorer.acOnly')}
          </button>
        </div>
      </div>

      {/* Side-by-Side Comparison Banner if 1 or 2 routes selected */}
      {comparedRoutes.length > 0 && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-3">
            <CardTitle className="flex items-center gap-2">
              <ArrowLeftRight className="h-4 w-4 text-teal-600" aria-hidden="true" />
              <span>{t('explorer.compareRoutes')}</span>
            </CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setCompareIds([])}>
              {t('explorer.clearCompare')}
            </Button>
          </CardHeader>
          <CardContent className="pt-4">
            {comparedRoutes.length === 1 ? (
              <p className="text-xs text-slate-500">{t('explorer.selectToCompare')}</p>
            ) : (
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {comparedRoutes.map((route) => {
                  const v = verificationsByRoute.get(route.routeId);
                  return (
                    <div key={route.routeId} className="rounded-xl border border-slate-200 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-mono-tabular text-base font-bold text-[#0B1F3A]">
                          {route.routeNumber}
                        </span>
                        <span className="text-xs text-slate-500">
                          {opMap.get(route.operatorId)?.shortCode}
                        </span>
                      </div>
                      <p className="text-sm font-medium text-slate-800">
                        {route.origin[lang] || route.origin.en} →{' '}
                        {route.destination[lang] || route.destination.en}
                      </p>
                      <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-600 tabular-nums">
                        <span>{t('explorer.frequency', { min: route.frequencyMin })}</span>
                        <span>·</span>
                        <span>
                          {route.firstDeparture}–{route.lastDeparture}
                        </span>
                        <span>·</span>
                        <span>
                          {t('explorer.fare', { min: route.fareMinInr, max: route.fareMaxInr })}
                        </span>
                      </div>
                      {v && <StatusIndicator verification={v} compact />}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Main Split: Route List (5 cols) + Detailed Stop Sequence, Timetable & Map (7 cols) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-5">
          {filteredRoutes.map((route) => {
            const isSelected = selectedRoute?.routeId === route.routeId;
            const isFav = favouriteRoutes.some((f) => f.routeId === route.routeId);
            const isCompared = compareIds.includes(route.routeId);
            const v = verificationsByRoute.get(route.routeId);

            return (
              <div
                key={route.routeId}
                className={`rounded-2xl border bg-white p-4 transition-colors ${
                  isSelected ? 'border-teal-600 ring-1 ring-teal-600/20' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedRouteId(route.routeId)}
                    className="flex-1 text-left cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono-tabular rounded-lg bg-[#0B1F3A] px-2.5 py-0.5 text-xs font-bold text-white">
                        {route.routeNumber}
                      </span>
                      <span className="text-xs font-medium text-slate-600">
                        {opMap.get(route.operatorId)?.shortCode}
                      </span>
                      {route.isAc && (
                        <>
                          <span aria-hidden="true" className="text-slate-300">
                            ·
                          </span>
                          <span className="text-xs font-medium text-teal-700">AC</span>
                        </>
                      )}
                    </div>
                    <p className="mt-1.5 text-sm font-semibold text-slate-900">
                      {route.origin[lang] || route.origin.en} →{' '}
                      {route.destination[lang] || route.destination.en}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {route.corridorSummary[lang] || route.corridorSummary.en}
                    </p>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      aria-label={t('explorer.compareRoutes')}
                      onClick={() => toggleCompare(route.routeId)}
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border text-xs cursor-pointer ${
                        isCompared
                          ? 'border-teal-600 bg-teal-50 text-teal-700'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      <ArrowLeftRight className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      aria-label={t('explorer.saveRoute')}
                      onClick={() =>
                        toggleFavouriteRoute({
                          routeId: route.routeId,
                          routeNumber: route.routeNumber,
                          originName: route.origin[lang] || route.origin.en,
                          destinationName: route.destination[lang] || route.destination.en,
                        })
                      }
                      className={`inline-flex h-9 w-9 items-center justify-center rounded-lg border cursor-pointer ${
                        isFav
                          ? 'border-teal-600 bg-teal-50 text-teal-700'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-50'
                      }`}
                    >
                      {isFav ? (
                        <BookmarkCheck className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Bookmark className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                {v && (
                  <div className="mt-3 border-t border-slate-100 pt-2.5">
                    <StatusIndicator verification={v} compact />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Selected Route Details */}
        {selectedRoute && (
          <div className="space-y-6 lg:col-span-7">
            <Card>
              <CardHeader className="border-b border-slate-100 pb-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <span className="font-mono-tabular font-bold text-sm text-[#0B1F3A]">
                        {selectedRoute.routeNumber}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{opMap.get(selectedRoute.operatorId)?.name}</span>
                    </div>
                    <CardTitle className="mt-1 text-xl">
                      {selectedRoute.origin[lang] || selectedRoute.origin.en} →{' '}
                      {selectedRoute.destination[lang] || selectedRoute.destination.en}
                    </CardTitle>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {onOpenBusDetails && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onOpenBusDetails(selectedRoute.routeId)}
                      >
                        {t('dashboard.busDetailsBtn')}
                      </Button>
                    )}
                    {onOpenTimetable && (
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => onOpenTimetable(selectedRoute.routeId)}
                      >
                        {t('dashboard.viewTimetable')}
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="teal"
                      onClick={() =>
                        onOpenReportModal(
                          selectedRoute.routeId,
                          selectedRoute.stopSequence[0]?.stopId
                        )
                      }
                    >
                      {t('dashboard.reportObservation')}
                    </Button>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 tabular-nums">
                  <span>
                    {t('explorer.firstBus')}: <strong>{selectedRoute.firstDeparture}</strong>
                  </span>
                  <span>
                    {t('explorer.lastBus')}: <strong>{selectedRoute.lastDeparture}</strong>
                  </span>
                  <span>{t('explorer.frequency', { min: selectedRoute.frequencyMin })}</span>
                  <span>
                    {t('explorer.fare', {
                      min: selectedRoute.fareMinInr,
                      max: selectedRoute.fareMaxInr,
                    })}
                  </span>
                  <span>{selectedRoute.operatingDays.join(', ')}</span>
                </div>

                {verificationsByRoute.get(selectedRoute.routeId) && (
                  <div className="mt-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <StatusIndicator
                      verification={verificationsByRoute.get(selectedRoute.routeId)!}
                    />
                  </div>
                )}
              </CardHeader>

              <CardContent className="pt-5 space-y-6">
                {/* Route Map */}
                <TransitMap
                  routes={snapshot.routes}
                  stops={snapshot.stops}
                  vehicles={snapshot.vehicles}
                  vehiclePositions={snapshot.vehiclePositions}
                  verificationsByRoute={verificationsByRoute}
                  selectedRouteId={selectedRoute.routeId}
                  userLat={userLocation.lat}
                  userLng={userLocation.lng}
                  heightClass="h-[260px]"
                />

                {/* Ordered Stop Sequence */}
                <div>
                  <h4 className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <MapPin className="h-4 w-4 text-teal-600" aria-hidden="true" />
                    <span>
                      {t('explorer.stopSequence')} ({selectedRoute.stopSequence.length})
                    </span>
                  </h4>
                  <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {selectedRoute.stopSequence.map((entry) => {
                      const stop = stopsMap.get(entry.stopId);
                      return (
                        <div
                          key={entry.stopId}
                          className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono-tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                              {entry.sequenceOrder}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-slate-900">
                                {stop ? stop.name[lang] || stop.name.en : entry.stopId}
                              </p>
                              <p className="truncate text-xs text-slate-500">
                                {stop ? stop.locality[lang] || stop.locality.en : ''}
                              </p>
                            </div>
                          </div>
                          <div className="font-mono-tabular shrink-0 text-right text-xs text-slate-500">
                            <span>+{entry.scheduledOffsetMin}m</span>
                            <span className="mx-1.5 text-slate-300">·</span>
                            <span>{entry.distanceFromOriginKm} km</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Scheduled Departures Timetable */}
                <div>
                  <h4 className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <Clock className="h-4 w-4 text-slate-600" aria-hidden="true" />
                    <span>{t('explorer.departures')}</span>
                  </h4>
                  <div
                    className={`mb-3 rounded-xl border px-3 py-2 text-xs ${
                      selectedRoute.timetableBasis === 'OFFICIAL_TIMETABLE'
                        ? 'border-emerald-200 bg-emerald-50/70 text-emerald-900'
                        : 'border-amber-200 bg-amber-50/70 text-amber-900'
                    }`}
                  >
                    <span className="font-semibold">
                      {t(`timetableBasis.${selectedRoute.timetableBasis}`)}
                    </span>
                    {' · '}
                    <span>
                      {selectedRoute.timetableBasis === 'ESTIMATED_FREQUENCY' ||
                      selectedRoute.timetableBasis === 'SYNTHETIC_DEMO'
                        ? t('transparency.estimatedBanner')
                        : t('eta.timetableNotice')}
                    </span>
                    {' · '}
                    <span className="text-slate-600">{selectedRoute.sourceLabel}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                    {selectedTrips.slice(0, 24).map((trip) => (
                      <div
                        key={trip.tripId}
                        className="font-mono-tabular rounded-lg border border-slate-200 bg-slate-50 px-2 py-1.5 text-center text-xs font-medium text-slate-800"
                      >
                        {trip.departureTime}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
