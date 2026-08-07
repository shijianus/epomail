const ENVELOPE =
  'M 40 220 A 60 60 0 0 1 120 155 A 85 85 0 0 1 280 155 A 60 60 0 0 1 360 220 L 360 260 C 360 325 290 335 200 335 C 110 335 40 325 40 260 Z'

type Props = { className?: string }

/**
 * EpoMail mark: the organic cloud-curve envelope silhouette carries a
 * negative-space V-flap and a running 10:10 time seal — "epoch + email".
 */
export default function EpoMailMark({ className }: Props) {
  return (
    <svg
      viewBox="0 0 400 400"
      width="100%"
      height="100%"
      className={className}
      role="img"
      aria-label="EpoMail"
    >
      <defs>
        <linearGradient id="epoMarkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop className="epo-stop-1" offset="0%" stopColor="#00F5D4" />
          <stop className="epo-stop-2" offset="45%" stopColor="#0072FF" />
          <stop className="epo-stop-3" offset="100%" stopColor="#5B24FF" />
        </linearGradient>

        <radialGradient id="epoMarkSheen" cx="34%" cy="26%" r="82%">
          <stop offset="0%" stopColor="rgba(255,255,255,0.42)" />
          <stop offset="42%" stopColor="rgba(255,255,255,0.08)" />
          <stop offset="100%" stopColor="rgba(8,12,32,0.42)" />
        </radialGradient>

        <filter id="epoMarkGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="16" />
        </filter>

        <filter id="epoMarkLift" x="-25%" y="-25%" width="150%" height="160%">
          <feDropShadow dx="0" dy="16" stdDeviation="20" floodColor="#0072FF" floodOpacity="0.35" />
        </filter>

        <mask id="epoMarkCut">
          <rect width="400" height="400" fill="#fff" />

          {/* V-shaped flap fold, drawn in on entry */}
          <path
            className="epo-draw epo-draw-flap"
            d="M 15 210 L 200 270 L 385 210"
            pathLength={100}
            fill="none"
            stroke="#000"
            strokeWidth={14}
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* side creases */}
          <path
            className="epo-draw epo-draw-crease-l"
            d="M 60 322 L 141 281"
            pathLength={100}
            fill="none"
            stroke="#000"
            strokeWidth={11}
            strokeLinecap="round"
          />
          <path
            className="epo-draw epo-draw-crease-r"
            d="M 340 322 L 259 281"
            pathLength={100}
            fill="none"
            stroke="#000"
            strokeWidth={11}
            strokeLinecap="round"
          />

          {/* time seal — disc restored out of the flap, then the dial is cut */}
          <g className="epo-seal">
            <circle cx="200" cy="270" r="27" fill="#fff" />
            <circle
              className="epo-draw epo-draw-ring"
              cx="200"
              cy="270"
              r="27"
              pathLength={100}
              fill="none"
              stroke="#000"
              strokeWidth={10}
            />
            <g className="epo-hand epo-hand-hour">
              <path
                d="M 200 270 L 186 256"
                fill="none"
                stroke="#000"
                strokeWidth={7.5}
                strokeLinecap="round"
              />
            </g>
            <g className="epo-hand epo-hand-minute">
              <path
                d="M 200 270 L 216 255"
                fill="none"
                stroke="#000"
                strokeWidth={6.5}
                strokeLinecap="round"
              />
            </g>
            <circle cx="200" cy="270" r="4.5" fill="#000" />
          </g>
        </mask>
      </defs>

      {/* ambient bloom behind the mark */}
      <path
        className="epo-halo"
        d={ENVELOPE}
        fill="url(#epoMarkGrad)"
        filter="url(#epoMarkGlow)"
      />

      <g filter="url(#epoMarkLift)">
        <path d={ENVELOPE} fill="url(#epoMarkGrad)" mask="url(#epoMarkCut)" />
        <path d={ENVELOPE} fill="url(#epoMarkSheen)" mask="url(#epoMarkCut)" />
      </g>

      {/* specular highlights across the dome */}
      <g className="epo-spec" fill="none" strokeLinecap="round">
        <path
          d="M 143 151 A 85 85 0 0 1 254 149"
          stroke="rgba(255,255,255,0.55)"
          strokeWidth={6}
        />
        <path d="M 62 199 A 60 60 0 0 1 99 168" stroke="rgba(255,255,255,0.32)" strokeWidth={5} />
      </g>

      {/* orbiting accents */}
      <g className="epo-particles">
        <circle className="epo-p epo-p1" cx="46" cy="118" r="4.5" fill="#00F5D4" />
        <circle className="epo-p epo-p2" cx="352" cy="104" r="3.6" fill="#A855F7" />
        <circle className="epo-p epo-p3" cx="374" cy="300" r="4" fill="#0072FF" />
        <circle className="epo-p epo-p4" cx="28" cy="286" r="3.2" fill="#00F5D4" />
        <circle className="epo-p epo-p5" cx="200" cy="72" r="3" fill="#FF369B" />
      </g>
    </svg>
  )
}
