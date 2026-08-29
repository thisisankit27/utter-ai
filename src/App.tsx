import { useEffect, type ComponentType } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useStore, type Route } from "@/lib/store";
import { Menu, MenuItem, Toaster } from "@/components/ui";
import { ErrorDialog } from "@/components/ErrorDialog";
import {
  IconHistory,
  IconMoon,
  IconSettings,
  IconSun,
} from "@/components/icons";
import { LogoMark } from "@/components/Logo";
import { UpdateBanner } from "@/components/UpdateBanner";
import { Intake } from "@/screens/Intake";
import { Review } from "@/screens/Review";
import { Working } from "@/screens/Working";
import { TranscriptView } from "@/screens/TranscriptView";
import { History } from "@/screens/History";
import { SettingsView } from "@/screens/SettingsView";
import { Onboarding } from "@/screens/Onboarding";

const screens: Record<Route, ComponentType> = {
  intake: Intake,
  review: Review,
  working: Working,
  transcript: TranscriptView,
  history: History,
  settings: SettingsView,
};

export default function App() {
  const ready = useStore((s) => s.ready);
  const route = useStore((s) => s.route);
  const init = useStore((s) => s.init);
  const settings = useStore((s) => s.settings);
  const go = useStore((s) => s.go);
  const reset = useStore((s) => s.reset);
  const updateSettings = useStore((s) => s.updateSettings);
  const job = useStore((s) => s.job);

  useEffect(() => {
    init();
  }, [init]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => useStore.getState().applyTheme();
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const Screen = screens[route];
  const showOnboarding = ready && settings && !settings.onboarding_complete;
  const dark = document.documentElement.getAttribute("data-theme") === "dark";

  return (
    <div className="flex h-full flex-col bg-bg text-text">
      <header
        data-tauri-drag-region
        className="flex h-14 shrink-0 items-center justify-between border-b border-border/70 px-4"
      >
        <button
          className="group flex items-center gap-2.5 rounded-lg px-1.5 py-1 text-left"
          onClick={reset}
          aria-label="UtterAI — start over"
        >
          <LogoMark size={28} className="rounded-lg" />
          <span className="font-display text-[15px] font-semibold tracking-tight">
            UtterAI
          </span>
        </button>

        <div className="flex items-center gap-1">
          <button
            className="btn-ghost px-2"
            aria-label="Toggle theme"
            onClick={() =>
              updateSettings({ theme: dark ? "light" : "dark" })
            }
          >
            {dark ? <IconSun className="h-[18px] w-[18px]" /> : <IconMoon className="h-[18px] w-[18px]" />}
          </button>
          <button
            className={`btn-ghost px-2 ${route === "history" ? "text-text" : ""}`}
            aria-label="History"
            onClick={() => go(route === "history" ? "intake" : "history")}
          >
            <IconHistory className="h-[18px] w-[18px]" />
          </button>
          <Menu
            trigger={({ toggle }) => (
              <button
                className={`btn-ghost px-2 ${route === "settings" ? "text-text" : ""}`}
                aria-label="Settings"
                onClick={toggle}
              >
                <IconSettings className="h-[18px] w-[18px]" />
              </button>
            )}
          >
            <MenuItem icon={<IconSettings className="h-4 w-4" />} onSelect={() => go("settings")}>
              Settings & models
            </MenuItem>
            <MenuItem icon={<IconHistory className="h-4 w-4" />} onSelect={() => go("history")}>
              Transcription history
            </MenuItem>
          </Menu>
        </div>
      </header>

      <UpdateBanner />

      {job && route !== "working" && (
        <button
          onClick={() => go("working")}
          className="flex items-center gap-2 border-b border-border/70 bg-iris/8 px-4 py-1.5 text-xs font-medium text-iris"
        >
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-iris" />
          Transcribing… {Math.round(job.overall * 100)}% — tap to view
        </button>
      )}

      <main className="relative flex-1 overflow-hidden">
        {!ready ? (
          <div className="flex h-full flex-col items-center justify-center gap-4">
            <LogoMark size={44} className="animate-pulse rounded-xl" />
            <span className="text-sm text-faint">Starting UtterAI…</span>
          </div>
        ) : (
          <AnimatePresence initial={false}>
            <motion.div
              key={route}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="absolute inset-0 h-full overflow-y-auto"
            >
              <Screen />
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      {showOnboarding && <Onboarding />}
      <ErrorDialog />
      <Toaster />
    </div>
  );
}
