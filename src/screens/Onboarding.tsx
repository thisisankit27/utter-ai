import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useStore } from "@/lib/store";
import { Switch } from "@/components/ui";
import { IconDownload, IconRefresh, IconShield, IconWave } from "@/components/icons";

const SLIDES = [
  {
    icon: IconWave,
    title: "Transcribe anything you can hear",
    body: "Interviews, lectures, podcasts, meetings, voice notes. Pick a file, choose how much of it to transcribe, and get clean text you can search, edit and export.",
  },
  {
    icon: IconShield,
    title: "It never leaves your computer",
    body: "There's no account and no upload. The audio is processed right here, on your own machine — so it works on a plane, and your recordings stay yours.",
  },
  {
    icon: IconDownload,
    title: "Ready to go",
    body: "A compact transcription model is already built in, so you can start now. Want more accuracy? Download a larger model anytime from Settings.",
  },
  {
    icon: IconRefresh,
    title: "Stays up to date",
    body: "When a new version ships, UtterAI can update itself — no reinstall. The check only asks GitHub for a version number. You can switch it off here or in Settings.",
    control: "auto_update_check" as const,
  },
];

export function Onboarding() {
  const update = useStore((s) => s.updateSettings);
  const settings = useStore((s) => s.settings);
  const [i, setI] = useState(0);
  const last = i === SLIDES.length - 1;
  const S = SLIDES[i];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/80 p-6 backdrop-blur-sm">
      <div className="card w-full max-w-md overflow-hidden p-8 text-center shadow-lift">
        <div className="flex justify-center gap-1.5">
          {SLIDES.map((_, idx) => (
            <span
              key={idx}
              className={`h-1 rounded-full transition-all ${
                idx === i ? "w-6 bg-iris" : "w-1.5 bg-border"
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={i}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.22 }}
            className="mt-8"
          >
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-iris/10 text-iris">
              <S.icon className="h-7 w-7" />
            </span>
            <h1 className="mt-5 text-xl">{S.title}</h1>
            <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">
              {S.body}
            </p>
            {S.control === "auto_update_check" && settings && (
              <div className="mx-auto mt-5 flex w-fit items-center gap-2.5 rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm">
                <Switch
                  label="Check for updates automatically"
                  checked={settings.auto_update_check}
                  onChange={(v) => update({ auto_update_check: v })}
                />
                <span>Check for updates automatically</span>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        <div className="mt-8 flex items-center justify-between">
          <button
            className="btn-ghost text-sm"
            onClick={() => update({ onboarding_complete: true })}
          >
            Skip
          </button>
          <button
            className="btn-primary"
            onClick={() =>
              last ? update({ onboarding_complete: true }) : setI(i + 1)
            }
          >
            {last ? "Start using UtterAI" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
