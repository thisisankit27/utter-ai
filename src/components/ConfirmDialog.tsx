import { useSyncExternalStore } from "react";
import { Dialog } from "./ui";

/**
 * A small promise-based confirmation, for the handful of actions that throw
 * work away: deleting a history entry, clearing all history, removing a model.
 * They used to fire on a single click with no way back.
 *
 * Deliberately not `window.confirm` — it is blocking, unstyled, and behaves
 * inconsistently across the two webviews we ship on.
 */
export interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel: string;
  danger: boolean;
}

type State = { req: ConfirmRequest; resolve: (ok: boolean) => void } | null;

let state: State = null;
const listeners = new Set<() => void>();
function emit() {
  listeners.forEach((l) => l());
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function confirmAction(
  title: string,
  body?: string,
  opts?: { confirmLabel?: string; danger?: boolean },
): Promise<boolean> {
  // A second request while one is open resolves the first as "no".
  state?.resolve(false);
  return new Promise<boolean>((resolve) => {
    state = {
      req: {
        title,
        body,
        confirmLabel: opts?.confirmLabel ?? "Remove",
        danger: opts?.danger ?? true,
      },
      resolve,
    };
    emit();
  });
}

function settle(ok: boolean) {
  const cur = state;
  state = null;
  emit();
  cur?.resolve(ok);
}

export function ConfirmDialog() {
  const current = useSyncExternalStore(
    subscribe,
    () => state,
    () => null,
  );

  return (
    <Dialog
      open={!!current}
      onClose={() => settle(false)}
      labelledBy="confirm-title"
    >
      {current && (
        <div>
          <h2 id="confirm-title" className="text-lg">
            {current.req.title}
          </h2>
          {current.req.body && (
            <p className="mt-1.5 text-sm leading-relaxed text-muted">
              {current.req.body}
            </p>
          )}
          <div className="mt-6 flex justify-end gap-2">
            <button className="btn-outline" data-autofocus onClick={() => settle(false)}>
              Cancel
            </button>
            <button
              className={current.req.danger ? "btn-danger" : "btn-primary"}
              onClick={() => settle(true)}
            >
              {current.req.confirmLabel}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
