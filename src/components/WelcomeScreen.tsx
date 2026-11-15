import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowRight,
  CalendarDays,
  Check,
  Compass,
  LogIn,
  MapPin,
  Navigation,
  Radio,
} from 'lucide-react';
import { setAppLanguage } from '../i18n/index.ts';
import { useAuth } from '../context/AuthContext.tsx';
import { useTransit } from '../context/TransitContext.tsx';
import type { SupportedLanguage, TransitStop } from '../shared/types.ts';
import { RoutePulseLogo } from './RoutePulseLogo.tsx';
import { Button } from './ui/button.tsx';
import { cn } from '../lib/utils.ts';

const WELCOME_IMAGE_URL = '/src/assets/images/welcome_kolkata_transit_1794752426695.jpg';

const LANGUAGES: Array<{
  code: SupportedLanguage;
  badge: string;
  badgeBg: string;
  label: string;
}> = [
  { code: 'en', badge: 'EN', badgeBg: 'bg-blue-600 text-white', label: 'English' },
  { code: 'hi', badge: 'हि', badgeBg: 'bg-amber-100 text-amber-800', label: 'Hindi / हिन्दी' },
  { code: 'bn', badge: 'বাং', badgeBg: 'bg-emerald-100 text-emerald-800', label: 'Bengali / বাংলা' },
];

export function WelcomeScreen({
  onComplete,
  initialStep = 'splash',
}: {
  onComplete: () => void;
  initialStep?: 'splash' | 'language' | 'location';
}) {
  const { t, i18n } = useTranslation();
  const { signInWithGoogle, updatePreferences } = useAuth();
  const { snapshot, setManualLocation, requestGpsLocation } = useTransit();

  const [step, setStep] = useState<'splash' | 'language' | 'location'>(initialStep);
  const [authLoading, setAuthLoading] = useState(false);
  const [locLoading, setLocLoading] = useState(false);
  const [locMessage, setLocMessage] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  const currentLang = (i18n.language as SupportedLanguage) || 'en';

  const handleLanguageSelect = async (lang: SupportedLanguage) => {
    setAppLanguage(lang);
    await updatePreferences({ language: lang }).catch(() => {});
  };

  const handleGoogleSignIn = async () => {
    setAuthLoading(true);
    try {
      await signInWithGoogle();
      setStep('location');
    } catch {
      setLocMessage('Google sign-in was cancelled. You can browse as a guest anytime.');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleUseGps = async () => {
    setLocLoading(true);
    const ok = await requestGpsLocation();
    setLocLoading(false);
    if (ok) {
      onComplete();
    } else {
      setLocMessage(
        currentLang === 'bn'
          ? 'লোকেশন পাওয়া যায়নি। নিচ থেকে কলকাতার একটি স্টপ বেছে নিন।'
          : currentLang === 'hi'
            ? 'लोकेशन नहीं मिल सकी। कृपया नीचे से कोलकाता का एक स्टॉप चुनें।'
            : 'Location permission was denied or unavailable. Please choose a Kolkata hub below.'
      );
    }
  };

  const handleManualStop = (stop: TransitStop) => {
    setManualLocation(stop);
    onComplete();
  };

  const majorHubs = snapshot.stops.filter((s) => s.isMajorHub).slice(0, 8);

  if (step === 'splash') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#071A3E] via-[#0F3460] to-[#1D549F] text-white flex flex-col justify-between">
        {/* Top Brand Hero */}
        <div className="mx-auto w-full max-w-6xl px-5 pt-8 pb-6 lg:py-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center flex-1">
          <div className="lg:col-span-6 space-y-6 text-center lg:text-left">
            <div className="flex justify-center lg:justify-start">
              <RoutePulseLogo variant="light" size="lg" />
            </div>

            <div className="space-y-3">
              <p className="text-sm font-medium text-teal-300 tracking-wide">
                {t('subtitle')} · {t('cityFocus')}
              </p>
              <h1 className="font-display text-3xl sm:text-5xl font-bold leading-tight text-balance">
                {t('heroHeadline')}
              </h1>
              <p className="text-base text-blue-100/90 max-w-xl mx-auto lg:mx-0">
                {t('tagline')} — {t('heroBullets.track')} {t('heroBullets.routes')}
              </p>
            </div>

            {/* 3 Glassmorphic Feature Tiles matching Reference Screen 1 */}
            <div className="grid grid-cols-3 gap-3 max-w-md mx-auto lg:mx-0 pt-2">
              <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm p-3.5 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-teal-400/20 text-teal-300">
                  <Radio className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="text-xs font-semibold text-white">{t('welcome.liveTrackingTile')}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm p-3.5 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-sky-400/20 text-sky-300">
                  <CalendarDays className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="text-xs font-semibold text-white">{t('welcome.timetableTile')}</p>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/10 backdrop-blur-sm p-3.5 text-center">
                <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-400/20 text-blue-200">
                  <Compass className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="text-xs font-semibold text-white">{t('welcome.journeyPlannerTile')}</p>
              </div>
            </div>
          </div>

          {/* Kolkata Bus & Skyline Illustration */}
          <div className="lg:col-span-6">
            <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-[#0A224E] shadow-2xl">
              {!imgFailed ? (
                <img
                  src={WELCOME_IMAGE_URL}
                  alt="Kolkata transit bus with Howrah Bridge in background"
                  referrerPolicy="no-referrer"
                  onError={() => setImgFailed(true)}
                  className="h-64 sm:h-80 lg:h-[400px] w-full object-cover"
                />
              ) : (
                <div className="flex h-72 items-center justify-center bg-gradient-to-br from-[#0A224E] to-[#0D9488]">
                  <RoutePulseLogo variant="light" size="lg" />
                </div>
              )}
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#071A3E]/95 via-[#071A3E]/45 to-transparent p-5">
                <p className="text-xs font-medium text-teal-300">
                  WBTC · CSTC · Kolkata Bus Corridors
                </p>
                <p className="mt-0.5 text-sm text-white/95">{t('heroBullets.eta')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Curved White Bottom Dock matching Reference Screen 1 */}
        <div className="rounded-t-[32px] bg-white px-5 py-6 text-slate-900 shadow-[0_-10px_30px_rgba(7,26,62,0.3)]">
          <div className="mx-auto flex max-w-3xl flex-col items-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => setStep('language')}
              className="flex h-12 w-full flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#0F52BA] to-[#1D70EC] px-6 text-base font-semibold text-white shadow-md hover:opacity-95 transition-opacity cursor-pointer"
            >
              <span>{t('welcome.getStarted')}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <Button
              size="lg"
              variant="outline"
              onClick={handleGoogleSignIn}
              disabled={authLoading}
              className="h-12 w-full sm:w-auto rounded-2xl"
            >
              <LogIn className="h-4 w-4" aria-hidden="true" />
              <span>{t('welcome.signInGoogle')}</span>
            </Button>
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">{t('welcome.noUnnecessaryData')}</p>
          <div className="mx-auto mt-2 max-w-3xl space-y-1 text-center text-[11px] text-slate-500">
            <p>{t('transparency.independentAppNotice')}</p>
            <p>{t('transparency.privacyNotice')}</p>
          </div>
        </div>
      </div>
    );
  }

  if (step === 'language') {
    return (
      <div className="min-h-screen bg-gradient-to-b from-[#EDF4FF] via-white to-[#F0F7FF] text-slate-900 flex flex-col justify-between">
        <div className="mx-auto w-full max-w-lg px-5 pt-10 pb-6 flex-1 flex flex-col justify-center">
          <div className="flex justify-center mb-6">
            <RoutePulseLogo variant="dark" size="lg" />
          </div>

          <div className="text-center space-y-1.5 mb-7">
            <h1 className="font-display text-2xl font-bold text-[#0B1F3A]">
              {t('welcome.chooseLanguage')}
            </h1>
            <p className="text-sm text-slate-600">{t('welcome.selectPreferred')}</p>
          </div>

          <div className="space-y-3.5">
            {LANGUAGES.map((lang) => {
              const active = currentLang === lang.code;
              return (
                <button
                  key={lang.code}
                  type="button"
                  onClick={() => handleLanguageSelect(lang.code)}
                  className={cn(
                    'flex w-full min-h-[64px] items-center justify-between rounded-2xl border bg-white px-4 py-3 text-left shadow-xs transition-all cursor-pointer',
                    active
                      ? 'border-blue-600 ring-2 ring-blue-600/20 bg-blue-50/40'
                      : 'border-slate-200 hover:border-slate-300'
                  )}
                >
                  <div className="flex items-center gap-3.5">
                    <span
                      className={cn(
                        'flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold',
                        lang.badgeBg
                      )}
                    >
                      {lang.badge}
                    </span>
                    <span className="text-base font-semibold text-slate-900">{lang.label}</span>
                  </div>
                  <span
                    className={cn(
                      'flex h-6 w-6 items-center justify-center rounded-full border',
                      active
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 bg-white'
                    )}
                  >
                    {active && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="mt-7 space-y-4">
            <button
              type="button"
              onClick={() => setStep('location')}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#0F52BA] to-[#1D70EC] px-6 text-base font-semibold text-white shadow-md hover:opacity-95 transition-opacity cursor-pointer"
            >
              <span>{t('welcome.continueBtn')}</span>
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="flex items-center justify-center gap-2">
              <span className="h-2 w-2 rounded-full bg-slate-300" />
              <span className="h-2 w-5 rounded-full bg-blue-600" />
              <span className="h-2 w-2 rounded-full bg-slate-300" />
            </div>
          </div>
        </div>

        {/* Subtle Kolkata Skyline / Howrah Bridge Vector Silhouette */}
        <div className="w-full overflow-hidden opacity-25 pointer-events-none select-none">
          <svg viewBox="0 0 1200 120" className="w-full h-20 fill-[#1E40AF]">
            <path d="M0 110 L180 110 L210 70 L240 110 L350 110 L350 65 L400 65 L400 110 L520 110 L580 25 L640 110 L760 110 L820 25 L880 110 L1020 110 L1040 50 L1060 110 L1200 110 L1200 120 L0 120 Z" />
          </svg>
        </div>
      </div>
    );
  }

  // Step 3: Location Access / Manual Kolkata Hub Selection
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#EDF4FF] via-white to-slate-50 flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-2xl rounded-3xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
        <div className="flex items-start gap-3.5">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-700">
            <MapPin className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-display text-xl font-bold text-[#0B1F3A]">
              {t('welcome.locationTitle')}
            </h2>
            <p className="mt-1 text-sm text-slate-600 leading-relaxed">
              {t('welcome.locationDesc')}
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={handleUseGps}
            disabled={locLoading}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#0F52BA] to-[#1D70EC] px-5 text-sm font-semibold text-white shadow-sm hover:opacity-95 cursor-pointer"
          >
            <Navigation className="h-4 w-4" aria-hidden="true" />
            <span>{t('welcome.useCurrentLocation')}</span>
          </button>
          <Button size="lg" variant="outline" onClick={onComplete} className="h-12 flex-1 rounded-2xl">
            <span>{t('welcome.continueGuest')}</span>
          </Button>
        </div>

        {locMessage && (
          <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
            {locMessage}
          </p>
        )}

        <div className="mt-6 border-t border-slate-100 pt-5">
          <p className="mb-3 text-xs font-semibold text-slate-600">
            {t('welcome.selectManualLocation')}
          </p>
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {majorHubs.map((stop) => (
              <button
                key={stop.stopId}
                type="button"
                onClick={() => handleManualStop(stop)}
                className="flex min-h-[52px] items-center justify-between rounded-2xl border border-slate-200 px-4 py-2.5 text-left hover:border-blue-600 hover:bg-blue-50/40 transition-colors cursor-pointer"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {stop.name[currentLang] || stop.name.en}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {stop.locality[currentLang] || stop.locality.en}
                  </p>
                </div>
                <ArrowRight className="ml-2 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
