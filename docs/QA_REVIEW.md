# v1.0 quality review

Six passes over the finished product, each from a different seat. Issues found
during the review were fixed before tagging; they're listed so the reasoning is
on the record.

## As a user

*Would I understand what to do immediately?*

Yes. The first screen is a single sentence ("Turn anything spoken into text.")
and one obvious drop zone. Onboarding is three short slides you can skip. Every
screen has one primary action. Range selection shows a running "Will transcribe
2:40 of audio" so there's no guessing.

Fixed during review: the readable transcript used to indent the first line
oddly (an invisible inline timestamp button); it's now clean prose with the
time in a gutter.

## As a designer

*Does this feel polished and intentional?*

The app and the landing page share one visual language — the same typefaces
(Bricolage Grotesque + Inter), the same iris accent, and one recurring
element, the speech ribbon, which is the file timeline, the progress surface
and the playback scrubber in turn. Motion is limited to page transitions and
the ribbon. Light and dark are both first-class.

Fixed during review: a shared-layout animation on the segmented control could
deadlock a screen transition; the ribbon rendered as a solid block instead of
bars; landing-page sections had no vertical breathing room because a `padding`
shorthand was zeroing it.

## As an engineer

*Is this maintainable and reliable?*

The engine is a standalone crate with no UI or Tauri dependency and its own
tests (unit + a real-audio pipeline test). The Tauri layer is thin — it
translates commands/events to core calls and computes one derived value
(overall progress), which is unit-tested. The frontend runs in a browser
against a mock backend, so the whole UI flow is testable without the native
shell. `cargo clippy -D warnings`, `tsc`, `eslint` and Playwright all gate CI;
a Linux `tauri build` runs on every PR.

Known debt: E2E of the packaged app uses a small `e2e_autoload` test hook
rather than driving the native file dialog.

## As a product owner

*Does this solve the problem without unnecessary complexity?*

The scope is deliberately narrow: local transcription, nothing else. No cloud,
no projects, no collaboration, no settings the user doesn't need. Features that
didn't earn their place (speaker diarization, word-level karaoke, a plugin
system) were left out of v1. What's there — range selection, two transcript
views, search, edit, six export formats, a model manager — all maps to a real
step in "get a usable transcript out of a recording".

## As a first-time installer

*Can I install and use it without technical knowledge?*

Windows: download the `.exe`, click through, past the SmartScreen warning
(documented). Linux: `.deb` via `apt install ./file.deb`, or `chmod +x` the
AppImage. First transcription works with no download because a model ships in
the installer. The one rough edge is the unsigned-binary warning; the user
guide and download page both address it up front.

## As a skeptical user

*Would I trust this with my media?*

The privacy claims are specific and checkable: `docs/SECURITY.md` walks through
command execution (arg vectors only), path handling, `0600` temp files with a
startup sweep, and logging that omits file names and transcript text. Two tests
enforce that the transcription modules have no network code. The only outbound
requests are model downloads (checksum-verified) and, on the website, the
public download count. The site says exactly this and nothing more.
