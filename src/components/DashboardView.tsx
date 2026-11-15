import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  Bookmark,
  Bus,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  CloudSun,
  Compass,
  History,
  Map as MapIcon,
  MapPin,
  MessageSquarePlus,
  Navigation,
  Route as RouteIcon,
  Search,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useTransit } from '../context/TransitContext.tsx';
import type { SupportedLanguage, TripPrediction } from '../shared/types.ts';
import { predictStopArrivalsForRoute } from '../shared/verificationEngine.ts';
import { RoutePulseLogo } from './RoutePulseLogo.tsx';
import { StatusIndicator } from './StatusIndicator.tsx';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from './ui/dialog.tsx';
import { Input } from './ui/input.tsx';

export type DashboardTargetTab =
  | 'home'
  | 'map'
  | 'bus-details'
  | 'timetable'
  | 'explore'
  | 'planner'
  | 'nearby'
  | 'alerts'
  | 'reports'
  | 'saved'
  | 'history'
  | 'profile'
  | 'admin';

interface DashboardViewProps {
  onNavigate: (tab: DashboardTargetTab) => void;
  onSelectBusDetails: (routeId: string) => void;
  onSelectRouteForMap: (routeId: string) => void;
  onOpenReportModal: (routeId?: string, stopId?: string) => void;
}

const CORRIDOR_BANNER_IMG = '/src/assets/images/bus_corridor_preview_1794752426782.jpg';

export function DashboardView({
  onNavigate,
  onSelectBusDetails,
  onSelectRouteForMap,
  onOpenReportModal,
}: DashboardViewProps) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as SupportedLanguage) || 'en';
  const { favouriteRoutes, recentSearches, notifications, addRecentSearch } = useAuth();
  const {
    snapshot,
    verificationsByRoute,
    stopsMap,
    userLocation,
    nearbyStops,
    setManualLocation,
    requestGpsLocation,
  } = useTransit();

  const [searchQuery, setSearchQuery] = useState('');
  const [locationDialogOpen, setLocationDialogOpen] = useState(false);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);
  const [bannerImgFailed, setBannerImgFailed] = useState(false);
  const [weather, setWeather] = useState<{ available: boolean; tempC?: number }>({
    available: false,
  });

  // Gemini Transport Assistant state
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Fetch cached real Kolkata weather (only displayed when available)
  useEffect(() => {
    let active = true;
    fetch('/api/weather')
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((data: { available?: boolean; tempC?: number }) => {
        if (active && data.available && typeof data.tempC === 'number') {
          setWeather({ available: true, tempC: data.tempC });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const activeFocusStopId = selectedStopId || nearbyStops[0]?.stop.stopId || 'stop_esplanade';
  const activeFocusStop = stopsMap.get(activeFocusStopId);
  const unreadCount = notifications.filter((n) => !n.read).length;

  // Filtered search results across routes & stops
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return { routes: [], stops: [] };

    const matchedRoutes = snapshot.routes.filter(
      (r) =>
        r.routeNumber.toLowerCase().includes(q) ||
        r.origin.en.toLowerCase().includes(q) ||
        r.destination.en.toLowerCase().includes(q) ||
        r.corridorSummary.en.toLowerCase().includes(q)
    );
    const matchedStops = snapshot.stops.filter(
      (s) =>
        s.name.en.toLowerCase().includes(q) ||
        s.name.hi.toLowerCase().includes(q) ||
        s.name.bn.toLowerCase().includes(q) ||
        s.locality.en.toLowerCase().includes(q)
    );
    return { routes: matchedRoutes.slice(0, 5), stops: matchedStops.slice(0, 4) };
  }, [searchQuery, snapshot.routes, snapshot.stops]);

  // Deterministic upcoming arrivals at activeFocusStopId
  const upcomingArrivals = useMemo(() => {
    const routesServingStop = snapshot.routes.filter((r) =>
      r.stopSequence.some((s) => s.stopId === activeFocusStopId)
    );
    const rows: Array<{
      routeNumber: string;
      operatorShort: string;
      destination: string;
      frequencyMin: number;
      prediction: TripPrediction;
    }> = [];

    const opMap = new Map(snapshot.operators.map((o) => [o.operatorId, o]));
    for (const route of routesServingStop) {
      const preds = predictStopArrivalsForRoute({
        route,
        targetStopId: activeFocusStopId,
        stopsMap,
        positions: snapshot.vehiclePositions,
        alerts: snapshot.serviceAlerts,
        reports: snapshot.passengerReports,
        tripUpdates: snapshot.tripUpdates,
        now: snapshot.serverTimestamp,
      });
      if (preds.length > 0) {
        rows.push({
          routeNumber: route.routeNumber,
          operatorShort: opMap.get(route.operatorId)?.shortCode ?? 'WBTC',
          destination: route.destination[lang] || route.destination.en,
          frequencyMin: route.frequencyMin,
          prediction: preds[0],
        });
      }
    }
    return rows.sort((a, b) => (a.prediction.etaMinLow ?? 999) - (b.prediction.etaMinLow ?? 999));
  }, [activeFocusStopId, snapshot, stopsMap, lang]);

  const activeAlerts = snapshot.serviceAlerts.filter((a) => a.active);

  const handleAskAssistant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!aiQuestion.trim()) return;
    setAiLoading(true);
    try {
      const res = await fetch('/api/ai/assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: aiQuestion.trim(), language: lang }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      setAiAnswer(data.answer || data.error || 'No response available.');
    } catch {
      setAiAnswer('Unable to reach assistant right now.');
    } finally {
      setAiLoading(false);
    }
  };

  const quickTiles = [
    {
      key: 'map' as const,
      label: t('dashboard.quickTiles.liveTrack'),
      icon: Bus,
      cardClass: 'bg-emerald-50 border-emerald-200/80 hover:border-emerald-400',
      iconClass: 'bg-emerald-600 text-white',
    },
    {
      key: 'timetable' as const,
      label: t('dashboard.quickTiles.timetable'),
      icon: CalendarDays,
      cardClass: 'bg-sky-50 border-sky-200/80 hover:border-sky-400',
      iconClass: 'bg-blue-600 text-white',
    },
    {
      key: 'explore' as const,
      label: t('dashboard.quickTiles.routeStops'),
      icon: RouteIcon,
      cardClass: 'bg-indigo-50 border-indigo-200/80 hover:border-indigo-400',
      iconClass: 'bg-indigo-600 text-white',
    },
    {
      key: 'planner' as const,
      label: t('dashboard.quickTiles.journeyPlanner'),
      icon: Compass,
      cardClass: 'bg-amber-50 border-amber-200/80 hover:border-amber-400',
      iconClass: 'bg-amber-500 text-white',
    },
    {
      key: 'alerts' as const,
      label: t('dashboard.quickTiles.serviceAlerts'),
      icon: AlertTriangle,
      cardClass: 'bg-rose-50 border-rose-200/80 hover:border-rose-400',
      iconClass: 'bg-rose-600 text-white',
    },
    {
      key: 'nearby' as const,
      label: t('dashboard.quickTiles.nearbyStops'),
      icon: MapPin,
      cardClass: 'bg-teal-50 border-teal-200/80 hover:border-teal-400',
      iconClass: 'bg-teal-600 text-white',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Curved Navy-Blue Hero Header matching Reference Screen 3 */}
      <section className="overflow-hidden rounded-3xl bg-gradient-to-br from-[#0A224E] via-[#103470] to-[#16428A] p-5 sm:p-6 text-white shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <RoutePulseLogo variant="light" size="sm" />
            <span className="hidden sm:inline-block text-xs text-blue-200">
              {t(`telemetryModes.${snapshot.dataHealth.activeTelemetryMode}`)}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            {weather.available && typeof weather.tempC === 'number' && (
              <div className="inline-flex items-center gap-1.5 rounded-xl bg-white/12 px-3 py-1.5 text-xs font-medium text-white border border-white/15">
                <CloudSun className="h-4 w-4 text-amber-300" aria-hidden="true" />
                <span className="font-mono-tabular font-semibold">{weather.tempC}°C</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => setLocationDialogOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-semibold text-[#0B1F3A] shadow-xs hover:bg-blue-50 cursor-pointer"
            >
              <MapPin className="h-3.5 w-3.5 text-blue-700" aria-hidden="true" />
              <span className="max-w-[140px] truncate">{userLocation.label}</span>
              <ChevronDown className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => onNavigate('history')}
              aria-label={t('historyPage.title')}
              className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/12 hover:bg-white/20 border border-white/15 cursor-pointer"
            >
              <Bell className="h-4 w-4" aria-hidden="true" />
              {unreadCount > 0 && (
                <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold">
                  {unreadCount}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Search Field */}
        <div className="relative mt-4">
          <Search
            className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && searchQuery.trim()) {
                addRecentSearch(searchQuery.trim());
              }
            }}
            placeholder={t('dashboard.searchPlaceholder')}
            className="h-12 rounded-2xl border-0 bg-white pl-11 pr-4 text-sm text-slate-900 shadow-sm placeholder:text-slate-400"
          />
        </div>

        {/* Search Dropdown Results */}
        {searchQuery.trim() && (
          <div className="mt-2 divide-y divide-slate-100 rounded-2xl bg-white text-slate-900 shadow-lg overflow-hidden">
            {searchResults.routes.length === 0 && searchResults.stops.length === 0 ? (
              <p className="px-4 py-3 text-xs text-slate-500">No matching routes or stops.</p>
            ) : (
              <>
                {searchResults.routes.map((route) => {
                  const v = verificationsByRoute.get(route.routeId);
                  return (
                    <button
                      key={route.routeId}
                      type="button"
                      onClick={() => {
                        addRecentSearch(route.routeNumber);
                        onSelectBusDetails(route.routeId);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono-tabular rounded-md bg-[#0B1F3A] px-2 py-0.5 text-xs font-bold text-white">
                            {route.routeNumber}
                          </span>
                          <span className="truncate text-sm font-medium text-slate-800">
                            {route.origin[lang] || route.origin.en} →{' '}
                            {route.destination[lang] || route.destination.en}
                          </span>
                        </div>
                        {v && (
                          <div className="mt-1">
                            <StatusIndicator verification={v} compact />
                          </div>
                        )}
                      </div>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                    </button>
                  );
                })}
                {searchResults.stops.map((stop) => (
                  <button
                    key={stop.stopId}
                    type="button"
                    onClick={() => {
                      addRecentSearch(stop.name[lang] || stop.name.en);
                      setSelectedStopId(stop.stopId);
                      setSearchQuery('');
                    }}
                    className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-slate-50 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <MapPin className="h-4 w-4 shrink-0 text-teal-600" aria-hidden="true" />
                      <span className="truncate text-sm text-slate-800">
                        {stop.name[lang] || stop.name.en}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 shrink-0">
                      {stop.locality[lang] || stop.locality.en}
                    </span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}
      </section>

      {/* 6 Pastel Quick-Action Tiles (3x2 mobile / 6-col desktop matching Reference Screen 3) */}
      <section aria-label="Quick Actions" className="grid grid-cols-3 gap-3 sm:grid-cols-6">
        {quickTiles.map((tile) => {
          const Icon = tile.icon;
          return (
            <button
              key={tile.key}
              type="button"
              onClick={() => onNavigate(tile.key)}
              className={`flex flex-col items-center justify-center gap-2 rounded-2xl border p-3.5 text-center transition-all cursor-pointer shadow-xs ${tile.cardClass}`}
            >
              <div className={`flex h-10 w-10 items-center justify-center rounded-xl shadow-xs ${tile.iconClass}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <span className="text-xs font-semibold text-slate-800 leading-tight">{tile.label}</span>
            </button>
          );
        })}
      </section>

      {/* Real-time Bus Updates Visual Banner (Reference Screen 3) */}
      <button
        type="button"
        onClick={() => onNavigate('map')}
        className="group relative flex w-full items-center justify-between gap-4 overflow-hidden rounded-2xl bg-gradient-to-r from-[#0A224E] via-[#133C80] to-[#1D63D8] p-4 sm:px-6 text-left text-white shadow-md cursor-pointer"
      >
        <div className="flex items-center gap-4 min-w-0">
          {!bannerImgFailed ? (
            <img
              src={CORRIDOR_BANNER_IMG}
              alt="Kolkata bus stop real-time transit shelter"
              onError={() => setBannerImgFailed(true)}
              className="h-14 w-20 shrink-0 rounded-xl object-cover border border-white/20"
            />
          ) : (
            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-white/15">
              <MapIcon className="h-7 w-7 text-teal-300" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <h2 className="font-display text-base sm:text-lg font-bold truncate">
              {t('dashboard.bannerTitle')}
            </h2>
            <p className="text-xs text-blue-100">{t('dashboard.bannerSub')}</p>
          </div>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/15 group-hover:bg-white/25 transition-colors">
          <ChevronRight className="h-5 w-5" aria-hidden="true" />
        </div>
      </button>

      {/* Main 12-Col Responsive Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Primary Column (8 cols): Nearby Buses at Focused Stop + Service Alerts */}
        <div className="space-y-6 lg:col-span-8">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="min-w-0">
                <CardTitle className="flex items-center gap-2 text-base sm:text-lg">
                  <MapPin className="h-4 w-4 text-blue-700 shrink-0" aria-hidden="true" />
                  <span className="truncate">
                    {t('dashboard.nearbyBusesAt', {
                      stop: activeFocusStop ? activeFocusStop.name[lang] || activeFocusStop.name.en : '',
                    })}
                  </span>
                </CardTitle>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" onClick={() => onNavigate('map')}>
                  {t('dashboard.viewOnMap')}
                </Button>
                <Button variant="teal" size="sm" onClick={() => onNavigate('reports')}>
                  <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">{t('nav.reports')}</span>
                </Button>
              </div>
            </CardHeader>

            <CardContent className="divide-y divide-slate-100 pt-1">
              {upcomingArrivals.length === 0 ? (
                <p className="py-6 text-sm text-slate-500">No routes scheduled at this stop.</p>
              ) : (
                upcomingArrivals.map(({ routeNumber, operatorShort, destination, frequencyMin, prediction }) => {
                  const hasLiveEta =
                    prediction.etaMinLow !== null && prediction.etaMinHigh !== null;
                  const isDelayed =
                    prediction.verification.status === 'DELAYED' &&
                    prediction.delayMinutes &&
                    prediction.delayMinutes >= 5;
                  const isCancelled = prediction.verification.status === 'CANCELLED';

                  return (
                    <div
                      key={prediction.predictionId}
                      className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectBusDetails(prediction.routeId)}
                        className="flex-1 text-left min-w-0 space-y-1.5 cursor-pointer group"
                      >
                        <div className="flex flex-wrap items-center gap-2.5">
                          <span className="inline-flex items-center gap-1.5 font-mono-tabular rounded-xl bg-blue-50 px-2.5 py-1 text-xs font-bold text-[#0A224E] border border-blue-200 group-hover:bg-[#0A224E] group-hover:text-white transition-colors">
                            <Bus className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{routeNumber}</span>
                          </span>
                          <span className="text-sm font-semibold text-slate-900 truncate">
                            {destination}
                          </span>
                          <span className="text-xs text-slate-500">{operatorShort}</span>
                        </div>
                        <StatusIndicator verification={prediction.verification} />
                      </button>

                      <div className="flex shrink-0 items-center justify-between sm:justify-end gap-3">
                        <button
                          type="button"
                          onClick={() => onSelectBusDetails(prediction.routeId)}
                          className={`rounded-xl px-3 py-1.5 text-xs font-semibold font-mono-tabular cursor-pointer ${
                            isCancelled
                              ? 'bg-rose-50 text-rose-700 border border-rose-200'
                              : isDelayed
                                ? 'bg-rose-50 text-rose-700 border border-rose-200'
                                : hasLiveEta
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                          }`}
                        >
                          {isCancelled
                            ? t('status.CANCELLED')
                            : isDelayed
                              ? t('dashboard.delayedByMin', { min: prediction.delayMinutes })
                              : hasLiveEta
                                ? t('dashboard.arrivingInMin', {
                                    range: `${prediction.etaMinLow}–${prediction.etaMinHigh}`,
                                  })
                                : prediction.scheduledTime
                                  ? t('dashboard.scheduledOnlyLabel', {
                                      time: prediction.scheduledTime,
                                    })
                                  : t('transparency.estimatedEveryMin', { min: frequencyMin })}
                        </button>

                        <button
                          type="button"
                          onClick={() => onSelectBusDetails(prediction.routeId)}
                          aria-label={t('dashboard.busDetailsBtn')}
                          className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
                        >
                          <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Service Alerts Preview */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2 border-b border-slate-100 pb-3.5">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-600" aria-hidden="true" />
                <span>{t('dashboard.serviceAlerts')}</span>
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('alerts')}>
                <span>{t('nav.alerts')}</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </CardHeader>
            <CardContent className="divide-y divide-slate-100 pt-1">
              {activeAlerts.length === 0 ? (
                <p className="py-5 text-sm text-slate-500">No active disruptions reported.</p>
              ) : (
                activeAlerts.slice(0, 3).map((alert) => {
                  const route = snapshot.routes.find((r) => r.routeId === alert.routeId);
                  const sevColor =
                    alert.severity === 'CRITICAL'
                      ? 'text-red-700'
                      : alert.severity === 'WARNING'
                        ? 'text-amber-700'
                        : 'text-slate-700';
                  return (
                    <div key={alert.alertId} className="py-4 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h4 className={`text-sm font-semibold ${sevColor}`}>
                          {alert.title[lang] || alert.title.en}
                        </h4>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono-tabular font-semibold text-slate-800">
                            {route?.routeNumber ?? alert.routeId}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>{t(`sources.${alert.sourceType}`)}</span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-600 leading-relaxed">
                        {alert.description[lang] || alert.description.en}
                      </p>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>
        </div>

        {/* Secondary Column (4 cols): Nearby Stops, Favourites, AI Assistant */}
        <div className="space-y-6 lg:col-span-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between border-b border-slate-100 pb-3">
              <CardTitle>{t('dashboard.nearbyStops')}</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => onNavigate('nearby')}>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            </CardHeader>
            <CardContent className="divide-y divide-slate-100 pt-1">
              {nearbyStops.slice(0, 5).map(({ stop, distanceKm }) => {
                const isSelected = stop.stopId === activeFocusStopId;
                return (
                  <button
                    key={stop.stopId}
                    type="button"
                    onClick={() => setSelectedStopId(stop.stopId)}
                    className={`flex w-full min-h-[48px] items-center justify-between gap-2 py-2.5 px-2 -mx-2 rounded-xl text-left transition-colors cursor-pointer ${
                      isSelected ? 'bg-blue-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {stop.name[lang] || stop.name.en}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {stop.locality[lang] || stop.locality.en}
                      </p>
                    </div>
                    <span className="font-mono-tabular shrink-0 text-xs font-medium text-blue-700">
                      {t('common.kmAway', { km: distanceKm })}
                    </span>
                  </button>
                );
              })}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-blue-700" aria-hidden="true" />
                <span>{t('dashboard.favouriteRoutes')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3 space-y-4">
              {favouriteRoutes.length === 0 ? (
                <p className="text-xs text-slate-500">{t('dashboard.noFavourites')}</p>
              ) : (
                <div className="space-y-2">
                  {favouriteRoutes.map((fav) => (
                    <button
                      key={fav.routeId}
                      type="button"
                      onClick={() => onSelectRouteForMap(fav.routeId)}
                      className="flex w-full items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-left hover:border-blue-600 cursor-pointer"
                    >
                      <div className="min-w-0">
                        <span className="font-mono-tabular text-xs font-bold text-[#0B1F3A]">
                          {fav.routeNumber}
                        </span>
                        <p className="truncate text-xs text-slate-600">
                          {fav.originName} → {fav.destinationName}
                        </p>
                      </div>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
                    </button>
                  ))}
                </div>
              )}

              <div className="border-t border-slate-100 pt-3">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600">
                  <History className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{t('dashboard.recentSearches')}</span>
                </p>
                {recentSearches.length === 0 ? (
                  <p className="text-xs text-slate-500">{t('dashboard.noRecentSearches')}</p>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {recentSearches.map((term) => (
                      <button
                        key={term}
                        type="button"
                        onClick={() => setSearchQuery(term)}
                        className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700 hover:bg-slate-100 cursor-pointer"
                      >
                        {term}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-slate-100 pb-3">
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-blue-700" aria-hidden="true" />
                <span>{t('dashboard.askAssistant')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3 space-y-3">
              <form onSubmit={handleAskAssistant} className="flex gap-2">
                <Input
                  value={aiQuestion}
                  onChange={(e) => setAiQuestion(e.target.value)}
                  placeholder={t('dashboard.askPlaceholder')}
                  className="h-10 text-xs"
                />
                <Button type="submit" size="sm" variant="default" disabled={aiLoading}>
                  {t('dashboard.askButton')}
                </Button>
              </form>
              {aiAnswer && (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-800 leading-relaxed whitespace-pre-line">
                  {aiAnswer}
                </div>
              )}
              <p className="text-[11px] text-slate-500 leading-snug">
                {t('dashboard.assistantDisclaimer')}
              </p>
            </CardContent>
          </Card>

          <Button
            variant="outline"
            className="w-full"
            onClick={() => onOpenReportModal(undefined, activeFocusStopId)}
          >
            <MessageSquarePlus className="h-4 w-4 text-teal-600" aria-hidden="true" />
            <span>{t('dashboard.reportObservation')}</span>
          </Button>
        </div>
      </div>

      {/* Location Picker Dialog */}
      <Dialog open={locationDialogOpen} onOpenChange={setLocationDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('welcome.locationTitle')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <Button
              variant="teal"
              className="w-full"
              onClick={async () => {
                await requestGpsLocation();
                setLocationDialogOpen(false);
              }}
            >
              <Navigation className="h-4 w-4" aria-hidden="true" />
              <span>{t('welcome.useCurrentLocation')}</span>
            </Button>
            <div className="grid grid-cols-1 gap-2 max-h-64 overflow-y-auto">
              {snapshot.stops.map((stop) => (
                <button
                  key={stop.stopId}
                  type="button"
                  onClick={() => {
                    setManualLocation(stop);
                    setSelectedStopId(stop.stopId);
                    setLocationDialogOpen(false);
                  }}
                  className="flex items-center justify-between rounded-xl border border-slate-200 px-3.5 py-2.5 text-left hover:border-blue-600 cursor-pointer"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {stop.name[lang] || stop.name.en}
                    </p>
                    <p className="truncate text-xs text-slate-500">
                      {stop.locality[lang] || stop.locality.en}
                    </p>
                  </div>
                  <Bus className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                </button>
              ))}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
