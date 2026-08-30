import { useEffect, useState } from "react";
import { revealPath } from "@/lib/platform";
import { useStore } from "@/lib/store";
import {
  api,
  onModelDownloadDone,
  onModelDownloadProgress,
} from "@/lib/ipc";
import { bytes } from "@/lib/format";
import { LANGUAGES } from "@/lib/format";
import type { DependencyReport } from "@/lib/types";
import { Segmented, Select, Spinner, Switch } from "@/components/ui";
import { confirmAction } from "@/components/ConfirmDialog";
import { IconCheck, IconDownload, IconShield, IconTrash, IconX } from "@/components/icons";

const EXPORT_DEFAULTS = [
  { id: "txt", label: "Plain text" },
  { id: "txt_timestamped", label: "Text with timestamps" },
  { id: "srt", label: "Subtitles (.srt)" },
  { id: "vtt", label: "Captions (.vtt)" },
  { id: "md", label: "Markdown" },
  { id: "json", label: "JSON" },
];

export function SettingsView() {
  const settings = useStore((s) => s.settings)!;
  const update = useStore((s) => s.updateSettings);
  const models = useStore((s) => s.models);
  const refreshModels = useStore((s) => s.refreshModels);
  const toast = useStore((s) => s.toast);
  const showError = useStore((s) => s.showError);
  const updateState = useStore((s) => s.update);
  const checkForUpdates = useStore((s) => s.checkForUpdates);
  const installUpdate = useStore((s) => s.installUpdate);
  const relaunchForUpdate = useStore((s) => s.relaunchForUpdate);

  const [dep, setDep] = useState<DependencyReport | null>(null);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    api.dependencyCheck().then(setDep).catch(() => {});
    const unsubs: Array<Promise<() => void>> = [
      onModelDownloadProgress((p) =>
        setProgress((cur) => ({ ...cur, [p.id]: p.fraction })),
      ),
      onModelDownloadDone((id) => {
        setProgress((cur) => {
          const next = { ...cur };
          delete next[id];
          return next;
        });
        setBusy(null);
        refreshModels();
        api.dependencyCheck().then(setDep).catch(() => {});
        toast("Model ready", "success");
      }),
    ];
    return () => {
      unsubs.forEach((u) => u.then((f) => f()));
    };
  }, [refreshModels, toast]);

  const installed = new Map(models?.installed.map((m) => [m.id, m]) ?? []);

  function clearProgress(id: string) {
    setBusy((b) => (b === id ? null : b));
    setProgress((c) => {
      const n = { ...c };
      delete n[id];
      return n;
    });
  }

  async function download(id: string) {
    setBusy(id);
    setProgress((c) => ({ ...c, [id]: 0 }));
    try {
      await api.downloadModel(id);
    } catch (e) {
      clearProgress(id);
      // Cancelling is something the user just asked for — a red error dialog
      // saying "Transcription cancelled" is not the right answer to it.
      if ((e as { code?: string })?.code === "cancelled") {
        toast("Download cancelled");
        return;
      }
      showError(e);
    }
  }
  async function cancelDl(id: string) {
    await api.cancelDownload().catch(() => {});
    clearProgress(id);
  }
  async function remove(id: string) {
    if (
      !(await confirmAction(
        `Remove ${models?.selectable.find((m) => m.id === id)?.display ?? "this model"}?`,
        "You can download it again at any time.",
      ))
    )
      return;
    await api.removeModel(id).catch(() => {});
    await refreshModels();
    api.dependencyCheck().then(setDep).catch(() => {});
    toast("Model removed");
  }
  async function clearCache() {
    const n = await api.clearCache().catch(() => 0);
    toast(n ? `Cleared ${n} temporary file${n === 1 ? "" : "s"}` : "Nothing to clear");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-6 py-8">
      <h1 className="text-xl">Settings</h1>

      <Section
        title="Transcription models"
        hint="Bigger models are more accurate but slower. The built-in model works offline with no download."
      >
        <ul className="space-y-2">
          {models?.selectable.map((m) => {
            const inst = installed.get(m.id);
            const frac = progress[m.id];
            const downloading = busy === m.id || frac !== undefined;
            const isDefault = settings.default_model === m.id;
            return (
              <li key={m.id} className="rounded-xl border border-border bg-surface p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{m.display}</span>
                      {m.bundled && <span className="chip">Built in</span>}
                      {inst?.verified && !m.bundled && (
                        <span className="chip text-teal">
                          <IconCheck className="h-3 w-3" /> Installed
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-muted">{m.blurb}</p>
                    <p className="mt-1 text-xs text-faint">
                      {bytes(m.size_bytes)} · {m.speed_hint}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1.5">
                    {inst || m.bundled ? (
                      <>
                        <label className="flex items-center gap-1.5 text-xs text-muted">
                          <input
                            type="radio"
                            name="default-model"
                            className="accent-iris"
                            checked={isDefault}
                            onChange={() => update({ default_model: m.id })}
                          />
                          Default
                        </label>
                        {!m.bundled && (
                          <button
                            className="btn-ghost px-2 py-1 text-xs text-faint hover:text-rose"
                            onClick={() => remove(m.id)}
                          >
                            <IconTrash className="h-3.5 w-3.5" /> Remove
                          </button>
                        )}
                      </>
                    ) : downloading ? (
                      <button className="btn-ghost px-2 py-1 text-xs" onClick={() => cancelDl(m.id)}>
                        <IconX className="h-3.5 w-3.5" /> Cancel
                      </button>
                    ) : (
                      <button
                        className="btn-outline px-3 py-1.5 text-xs"
                        onClick={() => download(m.id)}
                      >
                        <IconDownload className="h-3.5 w-3.5" /> Download
                      </button>
                    )}
                  </div>
                </div>
                {downloading && (
                  <div className="mt-2.5">
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full bg-iris transition-[width]"
                        style={{ width: `${Math.round((frac ?? 0) * 100)}%` }}
                      />
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-[11px] text-faint">
                      <Spinner className="h-3 w-3" />
                      Downloading… {Math.round((frac ?? 0) * 100)}%
                    </p>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </Section>

      <Section title="Defaults">
        <Row label="Spoken language">
          <Select
            ariaLabel="Default language"
            value={settings.default_language}
            onChange={(v) => update({ default_language: v })}
          >
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="Export format">
          <Select
            ariaLabel="Default export format"
            value={settings.default_export_format}
            onChange={(v) => update({ default_export_format: v })}
          >
            {EXPORT_DEFAULTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </Select>
        </Row>
      </Section>

      <Section title="Appearance & playback">
        <Row label="Theme">
          <Segmented
            value={settings.theme}
            onChange={(v) => update({ theme: v as typeof settings.theme })}
            options={[
              { value: "system", label: "System" },
              { value: "light", label: "Light" },
              { value: "dark", label: "Dark" },
            ]}
            size="sm"
          />
        </Row>
        <Row label="Follow along while playing" hint="Scroll the transcript to the current line during playback.">
          <Switch
            label="Follow playback"
            checked={settings.follow_playback}
            onChange={(v) => update({ follow_playback: v })}
          />
        </Row>
      </Section>

      <Section
        title="Updates"
        hint="When a new version ships, UtterAI can update itself — no reinstall. The check contacts GitHub for a version number and nothing else."
      >
        <Row
          label="Check for updates automatically"
          hint="Runs once when UtterAI starts."
        >
          <Switch
            label="Check for updates automatically"
            checked={settings.auto_update_check}
            onChange={(v) => update({ auto_update_check: v })}
          />
        </Row>
        <Row label="Current version">
          <span className="text-sm text-muted tnum">{__APP_VERSION__}</span>
        </Row>
        <Row label={updateStatusLabel(updateState.status, updateState.info?.version)}>
          {updateState.status === "available" ? (
            <button
              className="btn-primary px-3 py-1.5 text-xs"
              onClick={installUpdate}
            >
              <IconDownload className="h-3.5 w-3.5" /> Download &amp; install
            </button>
          ) : updateState.status === "downloading" ? (
            <span className="flex items-center gap-1.5 text-xs text-faint">
              <Spinner className="h-3 w-3" />
              {Math.round(updateState.progress * 100)}%
            </span>
          ) : updateState.status === "ready" ? (
            <button
              className="btn-primary px-3 py-1.5 text-xs"
              onClick={relaunchForUpdate}
            >
              Restart now
            </button>
          ) : (
            <button
              className="btn-outline px-3 py-1.5 text-xs"
              disabled={updateState.status === "checking"}
              onClick={() => checkForUpdates({ manual: true })}
            >
              {updateState.status === "checking" ? "Checking…" : "Check now"}
            </button>
          )}
        </Row>
      </Section>

      <Section title="Privacy & storage">
        <div className="rounded-xl border border-teal/25 bg-teal/6 p-3.5 text-sm">
          <p className="flex items-center gap-2 font-medium text-teal">
            <IconShield className="h-4 w-4" /> Nothing leaves your computer
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted">
            Transcription runs entirely offline. UtterAI only uses the network
            when you download a model or when it checks for an update — never to
            send your audio or transcripts anywhere.
          </p>
        </div>
        {dep && (
          <>
            <Row label="Data folder">
              <button
                className="btn-outline max-w-full truncate px-3 py-1.5 text-xs"
                onClick={() => revealPath(dep.data_dir)}
              >
                {dep.data_dir}
              </button>
            </Row>
            <Row label="Free disk space">
              <span className="text-sm text-muted tnum">
                {bytes(dep.free_space_mb * 1_048_576)}
              </span>
            </Row>
          </>
        )}
        <Row label="Temporary files" hint="Audio snippets UtterAI extracts while working. Safe to clear anytime.">
          <button className="btn-outline px-3 py-1.5 text-xs" onClick={clearCache}>
            Clear now
          </button>
        </Row>
      </Section>

      <Section title="Advanced">
        <Row label="Developer mode" hint="Show raw error details and technical logs.">
          <Switch
            label="Developer mode"
            checked={settings.developer_mode}
            onChange={(v) => update({ developer_mode: v })}
          />
        </Row>
        {dep && (
          <Row label="Bundled components">
            <span className="flex items-center gap-3 text-xs text-muted">
              <StatusDot ok={dep.ffmpeg_ok} label="ffmpeg" />
              <StatusDot ok={dep.ffprobe_ok} label="ffprobe" />
              <StatusDot ok={dep.bundled_model_ok} label="model" />
            </span>
          </Row>
        )}
      </Section>

      <p className="pt-2 text-center text-xs text-faint">
        UtterAI {__APP_VERSION__} · made for people who value their privacy
      </p>
    </div>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold">{title}</h2>
      {hint && <p className="mt-1 text-xs leading-relaxed text-faint">{hint}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm">{label}</p>
        {hint && <p className="text-xs text-faint">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function updateStatusLabel(status: string, version?: string): string {
  switch (status) {
    case "available":
      return `Version ${version} is ready to install`;
    case "downloading":
      return "Downloading the update";
    case "ready":
      return "Update installed — restart to finish";
    case "uptodate":
      return "You're on the latest version";
    case "error":
      return "Couldn't reach the update server";
    default:
      return "Check for a newer version";
  }
}

function StatusDot({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span
        className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-teal" : "bg-rose"}`}
      />
      {label}
    </span>
  );
}
