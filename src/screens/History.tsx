import { useStore } from "@/lib/store";
import { api } from "@/lib/ipc";
import { clock, languageName, relativeTime } from "@/lib/format";
import { confirmAction } from "@/components/ConfirmDialog";
import { IconFile, IconHistory, IconTrash } from "@/components/icons";

export function History() {
  const history = useStore((s) => s.history);
  const openEntry = useStore((s) => s.openHistoryEntry);
  const refresh = useStore((s) => s.refreshHistory);
  const toast = useStore((s) => s.toast);
  const go = useStore((s) => s.go);

  async function remove(id: string, name: string) {
    if (!(await confirmAction(`Remove "${name}" from history?`, "The transcript is deleted. Your original media file is untouched.", { confirmLabel: "Remove" }))) return;
    await api.deleteHistory(id).catch(() => {});
    await refresh();
    toast("Removed from history");
  }
  async function clearAll() {
    if (!(await confirmAction("Clear all history?", `All ${history.length} saved transcripts are deleted. Your media files are untouched.`, { confirmLabel: "Clear all" }))) return;
    await api.clearHistory().catch(() => {});
    await refresh();
    toast("History cleared");
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-8">
      <div className="mb-5 flex items-center justify-between">
        <h1 className="text-xl">History</h1>
        {history.length > 0 && (
          <button className="btn-ghost text-sm" onClick={clearAll}>
            Clear all
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 px-6 py-16 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface-2 text-faint">
            <IconHistory className="h-6 w-6" />
          </span>
          <p className="text-sm text-muted">
            Your past transcriptions will appear here.
          </p>
          <button className="btn-primary mt-1" onClick={() => go("intake")}>
            Transcribe something
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {history.map((h) => (
            <li
              key={h.id}
              className="card flex items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2"
            >
              <IconFile className="h-4 w-4 shrink-0 text-faint" />
              <button
                onClick={() => openEntry(h)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="block truncate text-sm font-medium">
                  {h.source_name}
                </span>
                <span className="block text-xs text-faint">
                  {clock(h.duration)} · {languageName(h.language)} ·{" "}
                  <span className="capitalize">{h.model_id.replace(/-/g, " ")}</span> ·{" "}
                  {relativeTime(h.created_at)}
                </span>
              </button>
              <button
                className="btn-ghost px-2 text-faint hover:text-rose"
                aria-label="Delete"
                onClick={() => remove(h.id, h.source_name)}
              >
                <IconTrash className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
