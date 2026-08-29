import { useId } from "react";

/**
 * The UtterAI mark: an "iris" rounded-square tile with a white speech-cadence
 * glyph — five rounded bars whose heights trace a spoken phrase. This is the
 * exact shape the app icon, installer icon and site favicon use; keep the three
 * in step (see `scripts/make_icons.py` and `site/assets/favicon.png`).
 */
export function LogoMark({
  size = 28,
  className,
  title,
}: {
  size?: number;
  className?: string;
  title?: string;
}) {
  const gid = useId();
  // Bar heights as a fraction of the 24-unit tile, matching make_icons.py.
  const heights = [0.3, 0.56, 0.82, 0.48, 0.24];
  const barW = 2.2;
  const gap = 1.55;
  const total = heights.length * barW + (heights.length - 1) * gap;
  let x = (24 - total) / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      role={title ? "img" : "presentation"}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#807BFF" />
          <stop offset="1" stopColor="#635BF0" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="5.6" fill={`url(#${gid})`} />
      {heights.map((h, i) => {
        const bh = 24 * h;
        const rect = (
          <rect
            key={i}
            x={x}
            y={12 - bh / 2}
            width={barW}
            height={bh}
            rx={barW / 2}
            fill="#fff"
          />
        );
        x += barW + gap;
        return rect;
      })}
    </svg>
  );
}

/** Mark + wordmark lockup, used in the app header and on the startup screen. */
export function Logo({
  size = 28,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span className={className} style={{ display: "inline-flex", alignItems: "center", gap: size * 0.34 }}>
      <LogoMark size={size} title="UtterAI" />
      <span
        className="font-display font-semibold tracking-tight"
        style={{ fontSize: size * 0.56 }}
      >
        UtterAI
      </span>
    </span>
  );
}
