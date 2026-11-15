import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Bell,
  BellOff,
  BellRing,
  Bookmark,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Database,
  Globe,
  History,
  LogIn,
  LogOut,
  MapPin,
  Shield,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { useTransit } from '../context/TransitContext.tsx';
import type { DataSourceRegisterItem, SupportedLanguage } from '../shared/types.ts';
import { StatusIndicator } from './StatusIndicator.tsx';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';

const AVATAR_FALLBACK = '/src/assets/images/avatar_commuter_default_1794752426972.jpg';

const LANGUAGES: Array<{ code: SupportedLanguage; native: string }> = [
  { code: 'en', native: 'English' },
  { code: 'hi', native: 'हिन्दी' },
  { code: 'bn', native: 'বাংলা' },
];

export function SavedAndProfileView({
  mode,
  onSelectRouteForMap,
  onOpenBusDetails,
  onOpenTimetable,
  onOpenHistory,
  onOpenNearbyStops,
  onOpenAdmin,
}: {
  mode: 'saved' | 'profile';
  onSelectRouteForMap: (routeId: string) => void;
  onOpenBusDetails?: (routeId: string) => void;
  onOpenTimetable?: (routeId: string) => void;
  onOpenHistory?: () => void;
  onOpenNearbyStops?: () => void;
  onOpenAdmin?: () => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as SupportedLanguage) || 'en';
  const {
    user,
    userRole,
    isStaff,
    profile,
    favouriteRoutes,
    favouriteStops,
    notifications,
    pushPermission,
    pushTokenRegistered,
    pushError,
    enablePushNotifications,
    disablePushNotifications,
    signInWithGoogle,
    logout,
    toggleFavouriteRoute,
    toggleFavouriteStop,
    updatePreferences,
    markNotificationRead,
  } = useAuth();
  const { verificationsByRoute } = useTransit();
  const [imgErr, setImgErr] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [sourcesList, setSourcesList] = useState<DataSourceRegisterItem[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);

  useEffect(() => {
    if (!sourcesOpen || sourcesList.length > 0) return;
    setSourcesLoading(true);
    fetch('/api/sources/register')
      .then((r) => (r.ok ? r.json() : { sources: [] }))
      .then((data: { sources?: DataSourceRegisterItem[] }) => {
        setSourcesList(data.sources || []);
      })
      .catch(() => {})
      .finally(() => setSourcesLoading(false));
  }, [sourcesOpen, sourcesList.length]);

  const handleTogglePush = async () => {
    setPushBusy(true);
    try {
      if (pushTokenRegistered) {
        await disablePushNotifications();
      } else {
        await enablePushNotifications();
      }
    } finally {
      setPushBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {mode === 'saved' ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader className="border-b border-slate-100 pb-3.5">
              <CardTitle className="flex items-center gap-2">
                <Bookmark className="h-4 w-4 text-teal-600" aria-hidden="true" />
                <span>{t('profile.savedRoutesTitle')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3 divide-y divide-slate-100">
              {favouriteRoutes.length === 0 ? (
                <p className="py-6 text-sm text-slate-500">{t('dashboard.noFavourites')}</p>
              ) : (
                favouriteRoutes.map((fav) => {
                  const v = verificationsByRoute.get(fav.routeId);
                  return (
                    <div
                      key={fav.routeId}
                      className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          onOpenBusDetails
                            ? onOpenBusDetails(fav.routeId)
                            : onSelectRouteForMap(fav.routeId)
                        }
                        className="flex-1 text-left cursor-pointer"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-mono-tabular rounded-lg bg-[#0B1F3A] px-2.5 py-0.5 text-xs font-bold text-white">
                            {fav.routeNumber}
                          </span>
                          <span className="text-sm font-medium text-slate-900">
                            {fav.originName} → {fav.destinationName}
                          </span>
                        </div>
                        {v && (
                          <div className="mt-1">
                            <StatusIndicator verification={v} compact />
                          </div>
                        )}
                      </button>

                      <div className="flex items-center gap-1 shrink-0">
                        {onOpenTimetable && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => onOpenTimetable(fav.routeId)}
                          >
                            <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>{t('nav.timetable')}</span>
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Remove favourite route"
                          onClick={() => toggleFavouriteRoute(fav)}
                        >
                          <Trash2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="border-b border-slate-100 pb-3.5">
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-teal-600" aria-hidden="true" />
                <span>{t('profile.savedStopsTitle')}</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-3 divide-y divide-slate-100">
              {favouriteStops.length === 0 ? (
                <p className="py-6 text-sm text-slate-500">{t('dashboard.noFavourites')}</p>
              ) : (
                favouriteStops.map((stop) => (
                  <div
                    key={stop.stopId}
                    className="flex items-center justify-between gap-3 py-3.5"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenNearbyStops?.()}
                      className="text-left flex-1 cursor-pointer"
                    >
                      <p className="text-sm font-medium text-slate-900">{stop.stopName}</p>
                      <p className="text-xs text-slate-500">{stop.locality}</p>
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label="Remove favourite stop"
                      onClick={() => toggleFavouriteStop(stop)}
                    >
                      <Trash2 className="h-4 w-4 text-slate-400" aria-hidden="true" />
                    </Button>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Account Card */}
          <Card className="lg:col-span-5">
            <CardHeader className="border-b border-slate-100 pb-4">
              <CardTitle>{t('profile.title')}</CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-5">
              {user ? (
                <div className="flex items-center gap-4">
                  {!imgErr ? (
                    <img
                      src={user.photoURL || AVATAR_FALLBACK}
                      alt={user.displayName || 'Commuter avatar'}
                      referrerPolicy="no-referrer"
                      onError={() => setImgErr(true)}
                      className="h-14 w-14 rounded-full border border-slate-200 object-cover"
                    />
                  ) : (
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#0B1F3A] text-white font-semibold">
                      {(user.displayName || user.email || 'U')[0].toUpperCase()}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-xs text-slate-500">{t('profile.signedInAs')}</p>
                      <span className="rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-blue-800 border border-blue-200">
                        {userRole}
                      </span>
                    </div>
                    <p className="truncate font-semibold text-slate-900">
                      {user.displayName || 'Commuter'}
                    </p>
                    <p className="truncate text-xs text-slate-600">{user.email}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-900">{t('profile.guestTitle')}</p>
                  <p className="text-xs text-slate-600 leading-relaxed">{t('profile.guestDesc')}</p>
                  <Button variant="default" onClick={signInWithGoogle} className="w-full">
                    <LogIn className="h-4 w-4" aria-hidden="true" />
                    <span>{t('welcome.signInGoogle')}</span>
                  </Button>
                </div>
              )}

              {user && (
                <Button variant="outline" onClick={logout} className="w-full">
                  <LogOut className="h-4 w-4" aria-hidden="true" />
                  <span>{t('profile.signOut')}</span>
                </Button>
              )}

              {/* Language Switcher */}
              <div className="border-t border-slate-100 pt-4 space-y-2.5">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Globe className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                  <span>{t('profile.languagePref')}</span>
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {LANGUAGES.map((item) => (
                    <button
                      key={item.code}
                      type="button"
                      onClick={() => updatePreferences({ language: item.code })}
                      className={`min-h-[42px] rounded-xl border text-xs font-medium cursor-pointer ${
                        lang === item.code
                          ? 'border-teal-600 bg-teal-50 text-[#0B1F3A] font-semibold'
                          : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      {item.native}
                    </button>
                  ))}
                </div>
              </div>

              {/* Quick shortcuts to History & Staff Operations Console */}
              <div className="border-t border-slate-100 pt-4 space-y-2">
                {onOpenHistory && (
                  <Button variant="outline" onClick={onOpenHistory} className="w-full justify-start">
                    <History className="h-4 w-4 text-blue-700" aria-hidden="true" />
                    <span>{t('historyPage.title')}</span>
                  </Button>
                )}
                {isStaff && onOpenAdmin && (
                  <Button variant="default" onClick={onOpenAdmin} className="w-full justify-start">
                    <Shield className="h-4 w-4 text-teal-300" aria-hidden="true" />
                    <span>{t('profile.openAdmin')}</span>
                  </Button>
                )}
              </div>

              {/* Privacy & Non-Affiliation Notice */}
              <div className="border-t border-slate-100 pt-4 space-y-2 text-[11px] text-slate-500 leading-relaxed">
                <p>{t('transparency.independentAppNotice')}</p>
                <p>{t('transparency.privacyNotice')}</p>
              </div>
            </CardContent>
          </Card>

          {/* Notification Preferences, FCM Web Push Opt-In, Data Sources & Inbox */}
          <div className="space-y-6 lg:col-span-7">
            <Card>
              <CardHeader className="border-b border-slate-100 pb-4">
                <CardTitle className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-teal-600" aria-hidden="true" />
                  <span>{t('profile.notifications')}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-5">
                {/* Explicit User Opt-in Web Push (FCM) Card */}
                <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4 space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1 max-w-md">
                      <p className="flex items-center gap-2 text-sm font-semibold text-[#0B1F3A]">
                        <BellRing className="h-4 w-4 text-blue-700" aria-hidden="true" />
                        <span>{t('push.title')}</span>
                      </p>
                      <p className="text-xs text-slate-600 leading-relaxed">{t('push.desc')}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={pushTokenRegistered ? 'outline' : 'default'}
                      disabled={pushBusy || !user || pushPermission === 'unsupported'}
                      onClick={handleTogglePush}
                    >
                      {pushTokenRegistered ? (
                        <>
                          <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{t('push.disableBtn')}</span>
                        </>
                      ) : (
                        <>
                          <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>{t('push.enableBtn')}</span>
                        </>
                      )}
                    </Button>
                  </div>
                  <div className="text-xs">
                    {pushPermission === 'unsupported' ? (
                      <p className="text-slate-500">{t('push.unsupportedStatus')}</p>
                    ) : pushPermission === 'denied' ? (
                      <p className="text-amber-700">{t('push.deniedStatus')}</p>
                    ) : pushTokenRegistered ? (
                      <p className="text-emerald-700 font-medium">{t('push.enabledStatus')}</p>
                    ) : null}
                    {pushError && <p className="mt-1 text-rose-700">{pushError}</p>}
                  </div>
                </div>

                <div className="space-y-3">
                  {[
                    {
                      key: 'notifyDelays' as const,
                      label: t('profile.notifyDelays'),
                      val: profile?.notifyDelays ?? true,
                    },
                    {
                      key: 'notifyCancellations' as const,
                      label: t('profile.notifyCancellations'),
                      val: profile?.notifyCancellations ?? true,
                    },
                    {
                      key: 'notifyArrivals' as const,
                      label: t('profile.notifyArrivals'),
                      val: profile?.notifyArrivals ?? false,
                    },
                  ].map((pref) => (
                    <label
                      key={pref.key}
                      className="flex min-h-[44px] items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-2.5 cursor-pointer"
                    >
                      <span className="text-sm text-slate-800">{pref.label}</span>
                      <input
                        type="checkbox"
                        checked={pref.val}
                        disabled={!user}
                        onChange={(e) => updatePreferences({ [pref.key]: e.target.checked })}
                        className="h-4 w-4 accent-teal-600"
                      />
                    </label>
                  ))}
                </div>

                <div className="border-t border-slate-100 pt-4">
                  <h4 className="mb-2.5 text-xs font-semibold text-slate-600">
                    {t('profile.recentNotifications')}
                  </h4>
                  {notifications.length === 0 ? (
                    <p className="text-xs text-slate-500">{t('historyPage.noNotifications')}</p>
                  ) : (
                    <div className="space-y-2">
                      {notifications.map((n) => (
                        <div
                          key={n.id}
                          className="flex items-start justify-between gap-3 rounded-xl border border-slate-200 p-3 text-xs"
                        >
                          <div>
                            <p className="font-semibold text-slate-900">{n.title}</p>
                            <p className="mt-0.5 text-slate-600">{n.body}</p>
                          </div>
                          {!n.read && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => markNotificationRead(n.id)}
                            >
                              Mark read
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Public Data Sources & Provenance Drawer */}
            <Card>
              <CardHeader className="pb-3">
                <button
                  type="button"
                  onClick={() => setSourcesOpen((v) => !v)}
                  className="flex w-full items-center justify-between text-left cursor-pointer"
                >
                  <CardTitle className="flex items-center gap-2 text-base">
                    <Database className="h-4 w-4 text-blue-700" aria-hidden="true" />
                    <span>{t('transparency.dataSourcesLink')}</span>
                  </CardTitle>
                  {sourcesOpen ? (
                    <ChevronUp className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-slate-500" aria-hidden="true" />
                  )}
                </button>
              </CardHeader>
              {sourcesOpen && (
                <CardContent className="border-t border-slate-100 pt-4 space-y-3">
                  {sourcesLoading ? (
                    <p className="text-xs text-slate-500">{t('common.loading')}</p>
                  ) : (
                    sourcesList.map((src) => (
                      <div
                        key={src.id}
                        className="rounded-xl border border-slate-200 p-3 text-xs space-y-1"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-semibold text-slate-900">{src.name}</span>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 font-mono-tabular text-[11px] font-semibold text-slate-700">
                            {src.status.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <p className="text-slate-600 leading-relaxed">{src.notes}</p>
                        <p className="text-[11px] text-slate-500">
                          {t(`sources.${src.dataSourceType}`)} · {src.licenseOrTerms}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              )}
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}
