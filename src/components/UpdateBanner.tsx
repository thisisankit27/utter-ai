import { useStore } from "@/lib/store";
import { openExternal } from "@/lib/platform";
import { IconDownload, IconX } from "@/components/icons";

const RELEASES_URL = "https://github.com/thisisankit27/utter-ai/releases/latest";

/**
 * A slim bar under the header that appears when an update is available. It's
 * always dismissable — automatic checks can be turned off entirely in Settings.
 */
export function UpdateBanner() {
  const { status, info, progress, dismissed, style } = useStore((s) => s.update);
  const install = useStore((s) => s.installUpdate);
  const relaunch = useStore((s) => s.relaunchForUpdate);
  const dismiss = useStore((s) => s.dismissUpdate);
  const busy = useStore((s) => !!s.job);

  const visible =
    !dismissed && (status === "available" || status === "downloading" || status === "ready");
  if (!visible) return null;

  return (
    <div className="relative flex items-center gap-3 border-b border-border/70 bg-iris/8 px-4 py-2 text-xs">
      <IconDownload className="h-4 w-4 shrink-0 text-iris" />

      {status === "available" && (
        <>
          <span className="min-w-0 flex-1 truncate text-iris">
            <span className="font-medium">UtterAI {info?.version}</span> is
            available.
          </span>
          <button
            className="shrink-0 font-medium text-muted underline-offset-2 hover:underline"
            onClick={() => openExternal(RELEASES_URL)}
          >
            What's new
          </button>
          <button
            className="shrink-0 rounded-md bg-iris-strong px-2.5 py-1 font-medium text-white disabled:cursor-not-allowed disabled:opacity-45"
            onClick={install}
            disabled={busy}
            title={
              busy
                ? "Finish or cancel the transcription first"
                : style === "handoff"
                  ? "UtterAI will close while the installer runs"
                  : undefined
            }
          >
            Update now
          </button>
        </>
      )}

      {status === "downloading" && (
        <>
          <span className="min-w-0 flex-1 text-iris">
            Downloading update… {Math.round(progress * 100)}%
            {style === "handoff" && progress > 0.98 && " — UtterAI will close in a moment"}
          </span>
          <div className="h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-iris transition-[width]"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        </>
      )}

      {status === "ready" && (
        <>
          <span className="min-w-0 flex-1 truncate text-iris">
            Update ready. Restart UtterAI to finish.
          </span>
          <button
            className="shrink-0 rounded-md bg-iris-strong px-2.5 py-1 font-medium text-white"
            onClick={relaunch}
          >
            Restart now
          </button>
        </>
      )}

      {status !== "downloading" && (
        <button
          className="shrink-0 rounded p-0.5 text-faint hover:text-text"
          aria-label="Dismiss"
          onClick={dismiss}
        >
          <IconX className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
