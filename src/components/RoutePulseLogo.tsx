export function RoutePulseLogo({
  variant = 'light',
  size = 'md',
}: {
  variant?: 'light' | 'dark';
  size?: 'sm' | 'md' | 'lg';
}) {
  const iconDim = size === 'lg' ? 56 : size === 'sm' ? 32 : 42;
  const textColor = variant === 'light' ? 'text-white' : 'text-[#0B1F3A]';
  const strokeMain = variant === 'light' ? '#FFFFFF' : '#0B1F3A';
  const busFill = variant === 'light' ? '#FFFFFF' : '#0F4C81';
  const windowFill = variant === 'light' ? '#0B1F3A' : '#FFFFFF';

  return (
    <div className="inline-flex items-center gap-2.5 shrink-0">
      <svg
        width={iconDim}
        height={iconDim}
        viewBox="0 0 64 64"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="rpArcGrad" x1="8" y1="54" x2="56" y2="10" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#14B8A6" />
            <stop offset="60%" stopColor="#38BDF8" />
            <stop offset="100%" stopColor="#1D4ED8" />
          </linearGradient>
        </defs>
        {/* Dynamic Transit Pulse Arc */}
        <path
          d="M14 48C8 39 9 25 18 16C27 7 42 7 52 16"
          stroke="url(#rpArcGrad)"
          strokeWidth="5"
          strokeLinecap="round"
        />
        <path
          d="M48 11L55 16L49 22"
          stroke="#14B8A6"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Clean Bus Silhouette */}
        <rect x="20" y="20" width="24" height="24" rx="5" fill={busFill} />
        <rect x="23" y="24" width="18" height="9" rx="2" fill={windowFill} />
        <circle cx="25.5" cy="38.5" r="2" fill={windowFill} />
        <circle cx="38.5" cy="38.5" r="2" fill={windowFill} />
        <path d="M23 44V47M41 44V47" stroke={strokeMain} strokeWidth="3" strokeLinecap="round" />
      </svg>
      <span
        className={`font-display font-bold tracking-tight whitespace-nowrap ${textColor} ${
          size === 'lg' ? 'text-3xl' : size === 'sm' ? 'text-lg' : 'text-xl'
        }`}
      >
        RoutePulse
      </span>
    </div>
  );
}
