import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  Bell,
  Bus,
  Check,
  Compass,
  History,
  MapPin,
  Trash2,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext.tsx';
import { Button } from './ui/button.tsx';
import { Card, CardContent, CardHeader, CardTitle } from './ui/card.tsx';

export function HistoryAndNotificationsView({
  onSelectBusDetails,
  onOpenPlanner,
  onSelectStop,
}: {
  onSelectBusDetails: (routeId: string) => void;
  onOpenPlanner: () => void;
  onSelectStop: (stopId: string) => void;
}) {
  const { t } = useTranslation();
  const {
    notifications,
    markNotificationRead,
    travelHistory,
    clearTravelHistory,
    recentSearches,
  } = useAuth();

  return (
    <div className="space-y-6">
      {/* Navy Top Header */}
      <div className="rounded-2xl bg-gradient-to-r from-[#0A224E] to-[#16428A] p-5 text-white">
        <h1 className="font-display text-2xl font-bold">{t('historyPage.title')}</h1>
        <p className="mt-1 max-w-2xl text-xs text-blue-100 leading-relaxed">
          {t('historyPage.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Notifications Inbox */}
        <Card className="lg:col-span-5">
          <CardHeader className="border-b border-slate-100 pb-4">
            <CardTitle className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-blue-700" aria-hidden="true" />
              <span>{t('historyPage.notificationsSection')}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-4 space-y-3">
            {notifications.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                {t('historyPage.noNotifications')}
              </p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`rounded-xl border p-3.5 text-xs space-y-1.5 ${
                    n.read ? 'border-slate-200 bg-white' : 'border-blue-200 bg-blue-50/50'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold text-slate-900">{n.title}</p>
                    {!n.read && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markNotificationRead(n.id)}
                        className="h-7 px-2 text-[11px]"
                      >
                        <Check className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                  <p className="text-slate-600 leading-relaxed">{n.body}</p>
                  {n.routeId && (
                    <button
                      type="button"
                      onClick={() => onSelectBusDetails(n.routeId!)}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#0F52BA] hover:underline cursor-pointer"
                    >
                      <span>{t('dashboard.busDetailsBtn')}</span>
                      <ArrowRight className="h-3 w-3" aria-hidden="true" />
                    </button>
                  )}
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Travel & Search History */}
        <Card className="lg:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <CardTitle className="flex items-center gap-2">
              <History className="h-4 w-4 text-teal-600" aria-hidden="true" />
              <span>{t('historyPage.travelHistorySection')}</span>
            </CardTitle>
            {travelHistory.length > 0 && (
              <Button size="sm" variant="ghost" onClick={clearTravelHistory}>
                <Trash2 className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                <span>{t('historyPage.clearHistory')}</span>
              </Button>
            )}
          </CardHeader>
          <CardContent className="pt-4 space-y-5">
            {travelHistory.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">{t('historyPage.noHistory')}</p>
            ) : (
              <div className="divide-y divide-slate-100">
                {travelHistory.map((item) => {
                  const Icon =
                    item.kind === 'ROUTE' ? Bus : item.kind === 'JOURNEY' ? Compass : MapPin;
                  const timeStr = new Date(item.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        if (item.kind === 'ROUTE' && item.routeId) {
                          onSelectBusDetails(item.routeId);
                        } else if (item.kind === 'JOURNEY') {
                          onOpenPlanner();
                        } else if (item.fromStopId) {
                          onSelectStop(item.fromStopId);
                        }
                      }}
                      className="flex w-full items-center justify-between gap-3 py-3.5 px-2 -mx-2 rounded-xl text-left hover:bg-slate-50 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                          <Icon className="h-4 w-4" aria-hidden="true" />
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-slate-900">
                            {item.title}
                          </p>
                          <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 text-xs text-slate-500">
                        <span className="font-mono-tabular">{timeStr}</span>
                        <ArrowRight className="h-4 w-4 text-slate-400" aria-hidden="true" />
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {recentSearches.length > 0 && (
              <div className="border-t border-slate-100 pt-4">
                <p className="mb-2 text-xs font-semibold text-slate-600">
                  {t('dashboard.recentSearches')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {recentSearches.map((term) => (
                    <span
                      key={term}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-700"
                    >
                      {term}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
