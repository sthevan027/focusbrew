/** Ícone do app: grão de café em gradiente âmbar, igual ao ícone real do FocusBrew. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <defs>
        <linearGradient id="bean" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d98a3d" />
          <stop offset="100%" stopColor="#8a4a1e" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="14" fill="#1c1c1e" />
      <path d="M32 14c-10 0-17 8-17 18s7 18 17 18 17-8 17-18-7-18-17-18z" fill="url(#bean)" />
      <path d="M32 16c-5 6-5 12 0 18s5 12 0 18" stroke="#1c1c1e" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}
