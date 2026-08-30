import type { RefObject } from "react";

/**
 * The off-screen media surface driven by `useMediaPlayer`.
 *
 * Two deliberate choices:
 *  - Nothing is rendered when there is no source. A `<video src="">` resolves
 *    against the document URL, so the element tries to decode the app's own
 *    HTML and fires a spurious `error`.
 *  - It is positioned off-screen rather than `display: none`. Hidden media
 *    elements are a known source of "audio sometimes doesn't start" in
 *    WebKitGTK (the Linux webview), which can skip loading a display-none
 *    element's resource until it is shown.
 */
export function MediaElement({
  src,
  elRef,
}: {
  src: string | null;
  elRef: RefObject<HTMLVideoElement>;
}) {
  if (!src) return null;
  return (
    <video
      ref={elRef}
      src={src}
      preload="metadata"
      playsInline
      aria-hidden
      tabIndex={-1}
      className="pointer-events-none absolute h-px w-px opacity-0"
      style={{ left: -9999, top: 0 }}
    />
  );
}
