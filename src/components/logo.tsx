type LogoProps = {
  /** Wordmark colour */
  textColor?: string;
  /** Hand-drawn ellipse colour */
  ringColor?: string;
  className?: string;
};

/**
 * Mindspace wordmark: "MIND / SPACE" inside a loose, hand-drawn double ellipse
 * (Brand Book p.19). Brand-approved pairings:
 *   navy text + navy ring on white/cream
 *   sun-300 text + ring on navy
 *   navy text + ring on sun-300
 */
export function Logo({
  textColor = "var(--color-navy-700)",
  ringColor = "var(--color-navy-700)",
  className,
}: LogoProps) {
  return (
    <svg
      viewBox="0 0 220 120"
      role="img"
      aria-label="Mindspace"
      className={className}
    >
      <g fill="none" stroke={ringColor} strokeLinecap="round" strokeWidth="2.2">
        <path d="M24 62c-6-24 40-46 94-46 50 0 86 14 86 38 0 26-44 46-100 46-46 0-74-14-80-30" />
        <path d="M34 34c22-16 64-24 104-20 40 4 66 22 62 42-4 24-46 44-106 44-50 0-82-18-78-40" strokeWidth="1.4" />
      </g>
      <g
        fill={textColor}
        fontFamily="var(--font-brand)"
        textAnchor="middle"
      >
        <text x="112" y="62" fontSize="34" fontWeight="800" letterSpacing="0.5">
          MIND
        </text>
        <text x="113" y="86" fontSize="16" fontWeight="700" letterSpacing="5">
          SPACE
        </text>
      </g>
    </svg>
  );
}
