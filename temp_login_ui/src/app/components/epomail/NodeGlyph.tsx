interface NodeGlyphProps {
  size?: number;
  className?: string;
}

/**
 * EpoMail brand mark — a data node orbited by information packets.
 * Represents "MAIL" as a futuristic transmission node (never an envelope)
 * and "EPO" via the orbital/temporal rings.
 */
export function NodeGlyph({ size = 44, className }: NodeGlyphProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="epo-glyph-grad" x1="0" y1="0" x2="48" y2="48">
          <stop offset="0%" stopColor="#a855f7" />
          <stop offset="100%" stopColor="#67e8f9" />
        </linearGradient>
        <filter id="epo-glyph-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="1.4" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Orbital rings */}
      <ellipse
        cx="24"
        cy="24"
        rx="20"
        ry="9"
        stroke="url(#epo-glyph-grad)"
        strokeWidth="1.4"
        opacity="0.7"
      />
      <ellipse
        cx="24"
        cy="24"
        rx="20"
        ry="9"
        stroke="url(#epo-glyph-grad)"
        strokeWidth="1.4"
        opacity="0.35"
        transform="rotate(60 24 24)"
      />

      {/* Central data node */}
      <g filter="url(#epo-glyph-glow)">
        <circle cx="24" cy="24" r="6.5" fill="url(#epo-glyph-grad)" />
        <circle cx="24" cy="24" r="3" fill="#05060f" opacity="0.75" />
      </g>

      {/* Orbiting packets */}
      <circle cx="43" cy="24" r="2.2" fill="#67e8f9" />
      <circle cx="9" cy="19" r="1.8" fill="#a855f7" />
      <circle cx="34" cy="9" r="1.6" fill="#67e8f9" opacity="0.85" />
    </svg>
  );
}
