import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  HelpCircle,
  Radio,
  WifiOff,
  XCircle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ServiceStatus, ServiceStatusVerification } from '../shared/types.ts';
import { cn } from '../lib/utils.ts';

const STATUS_STYLES: Record<
  ServiceStatus,
  { textClass: string; iconColor: string }
> = {
  OPERATING: { textClass: 'text-emerald-700', iconColor: 'text-emerald-600' },
  DELAYED: { textClass: 'text-amber-700', iconColor: 'text-amber-600' },
  SCHEDULED: { textClass: 'text-slate-700', iconColor: 'text-slate-500' },
  CANCELLED: { textClass: 'text-red-700', iconColor: 'text-red-600' },
  TRACKING_UNAVAILABLE: { textClass: 'text-slate-700', iconColor: 'text-amber-600' },
  UNVERIFIED: { textClass: 'text-violet-700', iconColor: 'text-violet-600' },
};

export function StatusIcon({ status, className }: { status: ServiceStatus; className?: string }) {
  const style = STATUS_STYLES[status];
  const cls = cn('h-4 w-4 shrink-0', style.iconColor, className);
  switch (status) {
    case 'OPERATING':
      return <CheckCircle2 className={cls} aria-hidden="true" />;
    case 'DELAYED':
      return <AlertTriangle className={cls} aria-hidden="true" />;
    case 'CANCELLED':
      return <XCircle className={cls} aria-hidden="true" />;
    case 'TRACKING_UNAVAILABLE':
      return <WifiOff className={cls} aria-hidden="true" />;
    case 'UNVERIFIED':
      return <HelpCircle className={cls} aria-hidden="true" />;
    case 'SCHEDULED':
    default:
      return <Clock className={cls} aria-hidden="true" />;
  }
}

export function StatusIndicator({
  verification,
  compact = false,
}: {
  verification: ServiceStatusVerification;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const style = STATUS_STYLES[verification.status];
  const ageSec = verification.evidenceCount.gpsAgeSeconds;

  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs font-semibold">
        <span className={cn('inline-flex items-center gap-1.5', style.textClass)}>
          <StatusIcon status={verification.status} />
          <span>{t(`status.${verification.status}`)}</span>
        </span>
        <span aria-hidden="true" className="text-slate-300">
          ·
        </span>
        <span className="font-normal text-slate-600 inline-flex items-center gap-1">
          {verification.source === 'OFFICIAL_VERIFIED' && (
            <Radio className="h-3 w-3 text-teal-600" aria-hidden="true" />
          )}
          {t(`sources.${verification.source}`)}
        </span>
        {(verification.freshnessState === 'DELAYED_UPDATE' ||
          verification.freshnessState === 'STALE') && (
          <>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-normal text-amber-700">
              {t(`freshness.${verification.freshnessState}`)}
            </span>
          </>
        )}
        {ageSec !== null && (
          <>
            <span aria-hidden="true" className="text-slate-300">
              ·
            </span>
            <span className="font-mono-tabular font-normal text-slate-500">
              {ageSec < 60
                ? t('map.secondsAgo', { sec: ageSec })
                : t('map.minutesAgo', { min: Math.round(ageSec / 60) })}
            </span>
          </>
        )}
      </div>
      {!compact && (
        <p className="text-xs text-slate-500 leading-relaxed">
          {t(`statusExplanations.${verification.explanationCode}`)}
        </p>
      )}
    </div>
  );
}
