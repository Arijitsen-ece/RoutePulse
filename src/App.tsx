import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  AlertTriangle,
  Bookmark,
  CalendarDays,
  History,
  Home,
  Map as MapIcon,
  MapPin,
  MessageSquarePlus,
  Shield,
  User as UserIcon,
  WifiOff,
} from 'lucide-react';
import { toast, Toaster } from 'sonner';
import { AuthProvider, useAuth } from './context/AuthContext.tsx';
import { TransitProvider, useTransit } from './context/TransitContext.tsx';
import { hasChosenInitialLanguage, setAppLanguage } from './i18n/index.ts';
import type { SupportedLanguage } from './shared/types.ts';
import { AdminDashboardView } from './components/AdminDashboardView.tsx';
import { BusDetailsView } from './components/BusDetailsView.tsx';
import { DashboardView, type DashboardTargetTab } from './components/DashboardView.tsx';
import { HistoryAndNotificationsView } from './components/HistoryAndNotificationsView.tsx';
import { JourneyPlannerView } from './components/JourneyPlannerView.tsx';
import { LiveMapView } from './components/LiveMapView.tsx';
import { NearbyStopsView } from './components/NearbyStopsView.tsx';
import { PassengerReportsView } from './components/PassengerReportsView.tsx';
import { ReportModal } from './components/ReportModal.tsx';
import { RouteExplorerView } from './components/RouteExplorerView.tsx';
import { RoutePulseLogo } from './components/RoutePulseLogo.tsx';
import { SavedAndProfileView } from './components/SavedAndProfileView.tsx';
import { ServiceAlertsView } from './components/ServiceAlertsView.tsx';
import { TimetableView } from './components/TimetableView.tsx';
import { WelcomeScreen } from './components/WelcomeScreen.tsx';
import { cn } from './lib/utils.ts';

type AppTab = DashboardTargetTab;

const LANG_OPTIONS: Array<{ code: SupportedLanguage; label: string }> = [
  { code: 'en', label: 'EN' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'bn', label: 'বাংলা' },
];

function RoutePulseShell() {
  const { t, i18n } = useTranslation();
  const {
    user,
    isStaff,
    foregroundToast,
    dismissForegroundToast,
    updatePreferences,
    addTravelHistory,
  } = useAuth();
  const { snapshot, offline, wsConnected, stopsMap, requestGpsLocation, setManualLocation } =
    useTransit();

  useEffect(() => {
    if (foregroundToast) {
      toast.info(foregroundToast.title, { description: foregroundToast.body });
      dismissForegroundToast();
    }
  }, [foregroundToast, dismissForegroundToast]);

  const [onboarded, setOnboarded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('routepulse_onboarded') === '1' && hasChosenInitialLanguage();
  });
  const [onboardingStep, setOnboardingStep] = useState<'splash' | 'language' | 'location'>('splash');
  const [activeTab, setActiveTab] = useState<AppTab>('home');
  const [tabHistory, setTabHistory] = useState<AppTab[]>([]);
  const [selectedMapRouteId, setSelectedMapRouteId] = useState<string | 'ALL'>('ALL');
  const [detailRouteId, setDetailRouteId] = useState<string>('route_215');
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportDefaultRoute, setReportDefaultRoute] = useState<string | undefined>(undefined);
  const [reportDefaultStop, setReportDefaultStop] = useState<string | undefined>(undefined);

  const currentLang = (i18n.language as SupportedLanguage) || 'en';

  const navigateTo = (nextTab: AppTab) => {
    if (nextTab !== activeTab) {
      setTabHistory((prev) => [...prev.slice(-10), activeTab]);
      setActiveTab(nextTab);
    }
  };

  const navigateBack = () => {
    setTabHistory((prev) => {
      if (prev.length === 0) {
        setActiveTab('home');
        return [];
      }
      const last = prev[prev.length - 1];
      setActiveTab(last);
      return prev.slice(0, -1);
    });
  };

  const recordRouteVisit = (routeId: string) => {
    const r = snapshot.routes.find((rt) => rt.routeId === routeId);
    if (r) {
      addTravelHistory({
        kind: 'ROUTE',
        title: `${r.routeNumber} · ${r.origin[currentLang] || r.origin.en} → ${
          r.destination[currentLang] || r.destination.en
        }`,
        subtitle: r.corridorSummary[currentLang] || r.corridorSummary.en,
        routeId: r.routeId,
      });
    }
  };

  const handleCompleteOnboarding = () => {
    localStorage.setItem('routepulse_onboarded', '1');
    setOnboarded(true);
  };

  const handleSelectRouteForMap = (routeId: string) => {
    setSelectedMapRouteId(routeId);
    if (routeId !== 'ALL') {
      setDetailRouteId(routeId);
      recordRouteVisit(routeId);
    }
    navigateTo('map');
  };

  const handleOpenBusDetails = (routeId: string) => {
    setDetailRouteId(routeId);
    recordRouteVisit(routeId);
    navigateTo('bus-details');
  };

  const handleOpenTimetable = (routeId: string) => {
    setDetailRouteId(routeId);
    recordRouteVisit(routeId);
    navigateTo('timetable');
  };

  const handleOpenReportModal = (routeId?: string, stopId?: string) => {
    setReportDefaultRoute(routeId);
    setReportDefaultStop(stopId);
    setReportModalOpen(true);
  };

  const handleLanguageChange = async (lang: SupportedLanguage) => {
    setAppLanguage(lang);
    await updatePreferences({ language: lang }).catch(() => {});
  };

  if (!onboarded) {
    return <WelcomeScreen initialStep={onboardingStep} onComplete={handleCompleteOnboarding} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 md:pb-10">
      {/* Desktop 3-Zone Top Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
          {/* Zone 1: Brand Crest */}
          <button
            type="button"
            onClick={() => navigateTo('home')}
            className="cursor-pointer shrink-0"
          >
            <RoutePulseLogo variant="dark" size="sm" />
          </button>

          {/* Zone 2: Primary Desktop Links */}
          <nav className="hidden md:flex items-center gap-5 text-sm font-medium text-slate-600">
            {(
              [
                ['home', t('nav.home')],
                ['explore', t('nav.explore')],
                ['map', t('nav.map')],
                ['timetable', t('nav.timetable')],
                ['planner', t('nav.planner')],
                ['saved', t('nav.saved')],
              ] as Array<[AppTab, string]>
            ).map(([tabKey, label]) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => navigateTo(tabKey)}
                className={cn(
                  'whitespace-nowrap shrink-0 py-1 transition-colors cursor-pointer border-b-2',
                  activeTab === tabKey
                    ? 'border-[#0F52BA] text-[#0B1F3A] font-semibold'
                    : 'border-transparent hover:text-slate-900'
                )}
              >
                {label}
              </button>
            ))}
          </nav>

          {/* Zone 3: Single Primary Account Action */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => navigateTo('profile')}
              className="inline-flex min-h-[38px] items-center gap-2 rounded-xl bg-[#0B1F3A] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#132D52] whitespace-nowrap shrink-0 cursor-pointer"
            >
              <UserIcon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{user ? user.displayName?.split(' ')[0] || t('nav.profile') : t('nav.profile')}</span>
            </button>
          </div>
        </div>
      </header>

      {/* Secondary Workspace Utility Toolbar */}
      <div className="border-b border-slate-200/80 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-2 text-xs sm:px-6">
          <div className="flex items-center gap-2 text-slate-600">
            <span>{t('cityFocus')}</span>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="hidden sm:inline text-slate-500">{t('tagline')}</span>
            <span aria-hidden="true" className="hidden sm:inline text-slate-300">
              ·
            </span>
            <span className="text-teal-700 font-medium">
              {wsConnected ? 'WS · ' : ''}
              {t(`telemetryModes.${snapshot.dataHealth.activeTelemetryMode}`)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => navigateTo('nearby')}
              className={cn(
                'inline-flex items-center gap-1 font-medium cursor-pointer',
                activeTab === 'nearby' ? 'text-[#0F52BA]' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <MapPin className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
              <span>{t('nav.nearby')}</span>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('alerts')}
              className={cn(
                'inline-flex items-center gap-1 font-medium cursor-pointer',
                activeTab === 'alerts' ? 'text-[#0F52BA]' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" aria-hidden="true" />
              <span>{t('nav.alerts')}</span>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('reports')}
              className={cn(
                'inline-flex items-center gap-1 font-medium cursor-pointer',
                activeTab === 'reports' ? 'text-[#0F52BA]' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <MessageSquarePlus className="h-3.5 w-3.5 text-blue-600" aria-hidden="true" />
              <span>{t('nav.reports')}</span>
            </button>

            <button
              type="button"
              onClick={() => navigateTo('history')}
              className={cn(
                'hidden md:inline-flex items-center gap-1 font-medium cursor-pointer',
                activeTab === 'history' ? 'text-[#0F52BA]' : 'text-slate-600 hover:text-slate-900'
              )}
            >
              <History className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
              <span>{t('nav.history')}</span>
            </button>

            {isStaff && (
              <button
                type="button"
                onClick={() => navigateTo('admin')}
                className={cn(
                  'inline-flex items-center gap-1 font-medium cursor-pointer',
                  activeTab === 'admin' ? 'text-[#0B1F3A] underline' : 'text-slate-600 hover:text-slate-900'
                )}
              >
                <Shield className="h-3.5 w-3.5 text-teal-600" aria-hidden="true" />
                <span>{t('nav.admin')}</span>
              </button>
            )}

            <div
              role="group"
              aria-label={t('profile.languagePref')}
              className="flex items-center gap-1 rounded-lg bg-slate-100 p-0.5"
            >
              {LANG_OPTIONS.map((opt) => (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => handleLanguageChange(opt.code)}
                  className={cn(
                    'rounded-md px-2 py-1 text-[11px] font-medium cursor-pointer transition-colors',
                    currentLang === opt.code
                      ? 'bg-white text-[#0B1F3A] shadow-xs font-semibold'
                      : 'text-slate-600 hover:text-slate-900'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Offline Banner */}
      {offline && (
        <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-xs text-amber-800">
          <span className="inline-flex items-center gap-1.5">
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{t('common.offlineBanner')}</span>
          </span>
        </div>
      )}

      {/* Main Content Container across all 15 pages */}
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        {activeTab === 'home' && (
          <DashboardView
            onNavigate={navigateTo}
            onSelectBusDetails={handleOpenBusDetails}
            onSelectRouteForMap={handleSelectRouteForMap}
            onOpenReportModal={handleOpenReportModal}
          />
        )}
        {activeTab === 'explore' && (
          <RouteExplorerView
            onOpenReportModal={handleOpenReportModal}
            onOpenBusDetails={handleOpenBusDetails}
            onOpenTimetable={handleOpenTimetable}
          />
        )}
        {activeTab === 'map' && (
          <LiveMapView
            selectedRouteId={selectedMapRouteId}
            onSelectRouteId={setSelectedMapRouteId}
            onOpenReportModal={handleOpenReportModal}
            onOpenBusDetails={handleOpenBusDetails}
            onOpenTimetable={handleOpenTimetable}
            onBack={tabHistory.length > 0 ? navigateBack : undefined}
          />
        )}
        {activeTab === 'bus-details' && (
          <BusDetailsView
            routeId={detailRouteId}
            onBack={navigateBack}
            onTrackOnMap={handleSelectRouteForMap}
            onViewTimetable={handleOpenTimetable}
            onOpenReportModal={handleOpenReportModal}
          />
        )}
        {activeTab === 'timetable' && (
          <TimetableView
            routeId={detailRouteId}
            onSelectRouteId={setDetailRouteId}
            onBack={navigateBack}
          />
        )}
        {activeTab === 'planner' && (
          <JourneyPlannerView
            onSelectRouteForMap={handleSelectRouteForMap}
            onSelectBusDetails={handleOpenBusDetails}
          />
        )}
        {activeTab === 'nearby' && (
          <NearbyStopsView
            onSelectBusDetails={handleOpenBusDetails}
            onRefreshGps={requestGpsLocation}
          />
        )}
        {activeTab === 'alerts' && (
          <ServiceAlertsView
            onSelectBusDetails={handleOpenBusDetails}
            onPlanAlternative={() => navigateTo('planner')}
          />
        )}
        {activeTab === 'reports' && (
          <PassengerReportsView onSelectBusDetails={handleOpenBusDetails} />
        )}
        {activeTab === 'saved' && (
          <SavedAndProfileView
            mode="saved"
            onSelectRouteForMap={handleSelectRouteForMap}
            onOpenBusDetails={handleOpenBusDetails}
            onOpenTimetable={handleOpenTimetable}
            onOpenNearbyStops={() => navigateTo('nearby')}
          />
        )}
        {activeTab === 'history' && (
          <HistoryAndNotificationsView
            onSelectBusDetails={handleOpenBusDetails}
            onOpenPlanner={() => navigateTo('planner')}
            onSelectStop={(stopId) => {
              const stop = stopsMap.get(stopId);
              if (stop) setManualLocation(stop);
              navigateTo('nearby');
            }}
          />
        )}
        {activeTab === 'profile' && (
          <SavedAndProfileView
            mode="profile"
            onSelectRouteForMap={handleSelectRouteForMap}
            onOpenHistory={() => navigateTo('history')}
            onOpenAdmin={() => navigateTo('admin')}
          />
        )}
        {activeTab === 'admin' && <AdminDashboardView />}

        {/* Optional footer action on Profile to revisit Language Selection */}
        {activeTab === 'profile' && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={() => {
                setOnboardingStep('language');
                setOnboarded(false);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-[#0F52BA] cursor-pointer"
            >
              <CalendarDays className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{t('welcome.chooseLanguage')}</span>
            </button>
          </div>
        )}

        <footer className="mt-10 border-t border-slate-200/80 pt-4 text-center text-[11px] text-slate-500">
          {t('transparency.independentAppNotice')}
        </footer>
      </main>

      {/* Mobile Bottom Navigation matching Reference Screen 3 (Home, Map, Saved, History, Profile) */}
      <nav
        aria-label="Mobile Navigation"
        className="fixed bottom-0 left-0 right-0 z-40 grid h-16 grid-cols-5 border-t border-slate-200 bg-white/95 backdrop-blur-md md:hidden"
      >
        {(
          [
            ['home', t('nav.home'), Home],
            ['map', t('nav.map'), MapIcon],
            ['saved', t('nav.saved'), Bookmark],
            ['history', t('nav.history'), History],
            ['profile', t('nav.profile'), UserIcon],
          ] as Array<[AppTab, string, typeof Home]>
        ).map(([tabKey, label, Icon]) => {
          const active = activeTab === tabKey;
          return (
            <button
              key={tabKey}
              type="button"
              onClick={() => navigateTo(tabKey)}
              className={cn(
                'flex min-h-[44px] flex-col items-center justify-center gap-0.5 text-[10px] font-medium cursor-pointer',
                active ? 'text-[#0F52BA] font-semibold' : 'text-slate-500'
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
              <span className="truncate max-w-[64px]">{label}</span>
            </button>
          );
        })}
      </nav>

      {/* Passenger Community Reporting Modal */}
      <ReportModal
        open={reportModalOpen}
        onOpenChange={setReportModalOpen}
        defaultRouteId={reportDefaultRoute}
        defaultStopId={reportDefaultStop}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <TransitProvider>
        <RoutePulseShell />
        <Toaster position="top-center" richColors />
      </TransitProvider>
    </AuthProvider>
  );
}
