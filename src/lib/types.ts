// Mirrors the DTOs emitted by src-tauri (Rust). Keep in sync with lib.rs.

export interface MediaInfo {
  duration_secs: number;
  container: string;
  size_bytes: number;
  has_audio: boolean;
  has_video: boolean;
  audio_codec: string | null;
  video_codec: string | null;
  sample_rate: number | null;
  channels: number | null;
  kind_label: string;
}

export interface Segment {
  start: number;
  end: number;
  text: string;
}

export interface Transcript {
  segments: Segment[];
  paragraphs: Segment[];
  language: string;
  model_id: string;
  duration: number;
  source_offset: number;
  source_name: string;
}

export interface ModelSpec {
  id: string;
  display: string;
  file: string;
  size_bytes: number;
  sha256: string;
  blurb: string;
  speed_hint: string;
  bundled: boolean;
  internal: boolean;
}

export interface InstalledModel {
  id: string;
  display: string;
  path: string;
  size_bytes: number;
  verified: boolean;
}

export interface ModelCatalog {
  selectable: ModelSpec[];
  installed: InstalledModel[];
  default_id: string;
  bundled_id: string;
}

export interface DependencyReport {
  ffmpeg_ok: boolean;
  ffprobe_ok: boolean;
  bundled_model_ok: boolean;
  models_installed: InstalledModel[];
  data_dir: string;
  free_space_mb: number;
}

export interface UserError {
  code: string;
  title: string;
  message: string;
  actions: string[];
  detail: string;
}

export type ExportFormatId =
  | "txt"
  | "txt_timestamped"
  | "srt"
  | "vtt"
  | "json"
  | "md";

export interface Settings {
  default_model: string;
  default_language: string;
  default_export_format: string;
  theme: "system" | "light" | "dark";
  developer_mode: boolean;
  onboarding_complete: boolean;
  follow_playback: boolean;
}

export interface HistoryEntry {
  id: string;
  source_path: string;
  source_name: string;
  created_at: number;
  duration: number;
  range: [number, number] | null;
  model_id: string;
  language: string;
  transcript: Transcript;
}

export type JobStage =
  | "preparing"
  | "extracting"
  | "loading_model"
  | "transcribing"
  | "finalizing";

export type JobUpdate =
  | {
      phase: "progress";
      job_id: string;
      overall: number;
      stage: JobStage;
      note: string;
      partial: Segment | null;
    }
  | { phase: "done"; job_id: string; transcript: Transcript }
  | { phase: "failed"; job_id: string; error: UserError };

export interface ModelDownloadProgress {
  id: string;
  received: number;
  total: number;
  fraction: number;
}
