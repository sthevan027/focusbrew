interface IconProps {
  size?: number;
}

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

export const ClockIcon = ({ size = 12 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
    <circle cx="8" cy="8" r="6.2" />
    <path d="M8 4.6V8l2.3 1.5" />
  </svg>
);

export const PlayIcon = ({ size = 12 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <path d="M5 3.2v9.6a.6.6 0 0 0 .9.5l7.6-4.8a.6.6 0 0 0 0-1L5.9 2.7a.6.6 0 0 0-.9.5z" />
  </svg>
);

export const PauseIcon = ({ size = 12 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <rect x="3.6" y="2.8" width="3.2" height="10.4" rx="1" />
    <rect x="9.2" y="2.8" width="3.2" height="10.4" rx="1" />
  </svg>
);

export const GripIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    {[4, 8, 12].flatMap((y) => [6, 10].map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.1" />))}
  </svg>
);

export const BarsIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <rect x="2" y="8" width="3.4" height="6" rx="0.8" />
    <rect x="6.3" y="3" width="3.4" height="11" rx="0.8" />
    <rect x="10.6" y="6" width="3.4" height="8" rx="0.8" />
  </svg>
);

export const ChevronIcon = ({ size = 12, dir }: IconProps & { dir: "left" | "right" }) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke} strokeWidth={2}>
    <path d={dir === "left" ? "M10 3.5L5.5 8l4.5 4.5" : "M6 3.5L10.5 8 6 12.5"} />
  </svg>
);

export const ArrowRightIcon = ({ size = 12 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke}>
    <path d="M3 8h9.5M9 4.5L12.5 8 9 11.5" />
  </svg>
);

export const PinIcon = ({ size = 12 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" fill="currentColor">
    <path d="M9.8 1.6a.8.8 0 0 0-1.3.3L7.4 4.6 4.6 5.8a.8.8 0 0 0-.3 1.3l1.8 1.8L2.3 12.7a.7.7 0 0 0 1 1l3.8-3.8 1.8 1.8a.8.8 0 0 0 1.3-.3l1.2-2.8 2.7-1.1a.8.8 0 0 0 .3-1.3z" />
  </svg>
);

export const CheckIcon = ({ size = 12 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" {...stroke} strokeWidth={2}>
    <path d="M3.5 8.5l3 3 6-6.5" />
  </svg>
);
