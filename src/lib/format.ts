/** `M:SS`, or `H:MM:SS` past an hour. For human-facing labels. */
export function clock(secs: number): string {
  const s = Math.max(0, Math.floor(secs));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/** `MM:SS.mmm` — used in the timestamped transcript view. */
export function clockMs(secs: number): string {
  const s = Math.max(0, secs);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  const base = `${pad(m)}:${pad(sec)}.${pad(ms, 3)}`;
  return h > 0 ? `${h}:${base}` : base;
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v < 10 ? v.toFixed(1) : Math.round(v)} ${units[i]}`;
}

export function relativeTime(epochSecs: number): string {
  const diff = Date.now() / 1000 - epochSecs;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} d ago`;
  return new Date(epochSecs * 1000).toLocaleDateString();
}

/** Rough ETA text from a fraction done and elapsed ms. */
export function eta(fraction: number, elapsedMs: number): string | null {
  if (fraction <= 0.02 || fraction >= 1) return null;
  const totalMs = elapsedMs / fraction;
  const remain = Math.max(0, totalMs - elapsedMs) / 1000;
  if (remain < 5) return "a few seconds left";
  if (remain < 60) return `about ${Math.ceil(remain / 5) * 5} seconds left`;
  const mins = Math.ceil(remain / 60);
  return `about ${mins} minute${mins === 1 ? "" : "s"} left`;
}

export const LANGUAGES: { code: string; name: string }[] = [
  { code: "auto", name: "Detect automatically" },
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "fr", name: "French" },
  { code: "de", name: "German" },
  { code: "it", name: "Italian" },
  { code: "pt", name: "Portuguese" },
  { code: "nl", name: "Dutch" },
  { code: "hi", name: "Hindi" },
  { code: "ja", name: "Japanese" },
  { code: "ko", name: "Korean" },
  { code: "zh", name: "Chinese" },
  { code: "ru", name: "Russian" },
  { code: "ar", name: "Arabic" },
  { code: "tr", name: "Turkish" },
  { code: "pl", name: "Polish" },
  { code: "uk", name: "Ukrainian" },
  { code: "sv", name: "Swedish" },
  { code: "id", name: "Indonesian" },
];

export function languageName(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? code.toUpperCase();
}
