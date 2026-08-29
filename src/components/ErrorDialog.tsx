import { useState } from "react";
import { useStore } from "@/lib/store";
import { Dialog } from "./ui";
import { IconAlert } from "./icons";

export function ErrorDialog() {
  const error = useStore((s) => s.error);
  const dismiss = useStore((s) => s.dismissError);
  const retry = useStore((s) => s.retry);
  const developer = useStore((s) => s.settings?.developer_mode ?? false);
  const [showDetail, setShowDetail] = useState(false);

  return (
    <Dialog open={!!error} onClose={dismiss} labelledBy="error-title" width="max-w-lg">
      {error && (
        <div>
          <div className="flex items-start gap-3.5">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose/12 text-rose">
              <IconAlert className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <h2 id="error-title" className="text-lg">
                {error.title}
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-muted">
                {error.message}
              </p>
            </div>
          </div>

          {(developer || showDetail) && (
            <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-surface-2 p-3 font-mono text-xs text-muted">
              {error.code}: {error.detail}
            </pre>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
            {!developer && !showDetail && (
              <button
                className="btn-ghost mr-auto text-xs"
                onClick={() => setShowDetail(true)}
              >
                Show technical details
              </button>
            )}
            {error.actions.some((a) => /try again|retry/i.test(a)) &&
              useStore.getState().media && (
                <button className="btn-outline" onClick={retry}>
                  Try again
                </button>
              )}
            <button className="btn-primary" data-autofocus onClick={dismiss}>
              Got it
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
