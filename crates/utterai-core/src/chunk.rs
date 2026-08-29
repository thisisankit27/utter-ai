//! Turn Whisper's raw segments into two useful shapes:
//! caption-sized lines (for the timestamped view and SRT/VTT) and flowing
//! paragraphs (for comfortable reading and plain-text export).

use crate::transcribe::Segment;

const MAX_CAPTION_CHARS: usize = 84;
const MAX_CAPTION_SECS: f64 = 7.0;
/// A silence gap longer than this starts a new paragraph.
const PARAGRAPH_GAP_SECS: f64 = 1.4;
const MAX_PARAGRAPH_CHARS: usize = 500;

/// Split over-long lines on sentence boundaries; merge slivers together.
pub fn captionize(raw: &[Segment]) -> Vec<Segment> {
    let mut out: Vec<Segment> = Vec::new();
    for seg in raw {
        let text = normalise(&seg.text);
        if text.is_empty() {
            continue;
        }
        if text.chars().count() <= MAX_CAPTION_CHARS
            && (seg.end - seg.start) <= MAX_CAPTION_SECS
        {
            push_or_merge(&mut out, seg.start, seg.end, &text);
            continue;
        }
        // Proportionally slice a long segment by sentence / clause.
        let pieces = split_text(&text);
        let total: usize = pieces.iter().map(|p| p.len().max(1)).sum();
        let span = seg.end - seg.start;
        let mut cursor = seg.start;
        for piece in pieces {
            let frac = piece.len().max(1) as f64 / total as f64;
            let piece_end = (cursor + span * frac).min(seg.end);
            push_or_merge(&mut out, cursor, piece_end, piece.trim());
            cursor = piece_end;
        }
    }
    out
}

fn push_or_merge(out: &mut Vec<Segment>, start: f64, end: f64, text: &str) {
    if text.is_empty() {
        return;
    }
    if let Some(last) = out.last_mut() {
        let combined = last.text.chars().count() + text.chars().count() + 1;
        let tiny = text.chars().count() < 12 || (end - start) < 0.8;
        if tiny && combined <= MAX_CAPTION_CHARS && (end - last.start) <= MAX_CAPTION_SECS {
            last.text.push(' ');
            last.text.push_str(text);
            last.end = end;
            return;
        }
    }
    out.push(Segment {
        start,
        end,
        text: text.to_string(),
    });
}

/// Group segments into paragraphs on long pauses or sentence-final punctuation.
pub fn paragraphize(raw: &[Segment]) -> Vec<Segment> {
    let mut out: Vec<Segment> = Vec::new();
    let mut cur: Option<Segment> = None;

    for seg in raw {
        let text = normalise(&seg.text);
        if text.is_empty() {
            continue;
        }
        match cur.as_mut() {
            None => {
                cur = Some(Segment {
                    start: seg.start,
                    end: seg.end,
                    text,
                });
            }
            Some(c) => {
                let gap = seg.start - c.end;
                let ends_sentence = c.text.trim_end().ends_with(['.', '!', '?', '…']);
                let too_long = c.text.chars().count() + text.chars().count() > MAX_PARAGRAPH_CHARS;
                if gap > PARAGRAPH_GAP_SECS || (ends_sentence && gap > 0.4) || too_long {
                    out.push(cur.take().unwrap());
                    cur = Some(Segment {
                        start: seg.start,
                        end: seg.end,
                        text,
                    });
                } else {
                    c.text.push(' ');
                    c.text.push_str(&text);
                    c.end = seg.end;
                }
            }
        }
    }
    if let Some(c) = cur {
        out.push(c);
    }
    out
}

fn normalise(s: &str) -> String {
    s.split_whitespace().collect::<Vec<_>>().join(" ")
}

/// Split on sentence enders, keeping the punctuation; fall back to commas, then
/// to a hard character cap so we never emit a wall of text.
fn split_text(text: &str) -> Vec<String> {
    let mut parts: Vec<String> = Vec::new();
    let mut buf = String::new();
    for ch in text.chars() {
        buf.push(ch);
        if matches!(ch, '.' | '!' | '?' | '…') && buf.trim().len() > 1 {
            parts.push(std::mem::take(&mut buf));
        }
    }
    if !buf.trim().is_empty() {
        parts.push(buf);
    }
    // Further break any piece that's still too long.
    let mut result = Vec::new();
    for p in parts {
        if p.chars().count() <= MAX_CAPTION_CHARS {
            result.push(p.trim().to_string());
            continue;
        }
        result.extend(break_long(&p));
    }
    result.retain(|s| !s.trim().is_empty());
    result
}

fn break_long(p: &str) -> Vec<String> {
    let words = p.split_whitespace();
    let mut out = Vec::new();
    let mut line = String::new();
    for w in words {
        if line.chars().count() + w.chars().count() + 1 > MAX_CAPTION_CHARS && !line.is_empty() {
            out.push(std::mem::take(&mut line));
        }
        if !line.is_empty() {
            line.push(' ');
        }
        line.push_str(w);
    }
    if !line.is_empty() {
        out.push(line);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn seg(start: f64, end: f64, text: &str) -> Segment {
        Segment { start, end, text: text.into() }
    }

    #[test]
    fn captionize_splits_long_lines() {
        let long = "This is a very long sentence that keeps going well past any reasonable \
                    caption length. And then another full sentence follows it here.";
        let out = captionize(&[seg(0.0, 12.0, long)]);
        assert!(out.len() >= 2);
        assert!(out.iter().all(|s| s.text.chars().count() <= MAX_CAPTION_CHARS + 4));
        // Timestamps stay ordered and within the source span.
        assert!(out.first().unwrap().start >= 0.0);
        assert!(out.last().unwrap().end <= 12.0 + 1e-6);
        for w in out.windows(2) {
            assert!(w[1].start >= w[0].start - 1e-6);
        }
    }

    #[test]
    fn paragraphize_breaks_on_gap() {
        let raw = vec![
            seg(0.0, 2.0, "Hello there."),
            seg(2.2, 4.0, "How are you"),
            seg(10.0, 12.0, "A while later we resume"),
        ];
        let paras = paragraphize(&raw);
        assert_eq!(paras.len(), 2);
        assert!(paras[0].text.contains("Hello there"));
        assert!(paras[1].text.contains("while later"));
    }

    #[test]
    fn captionize_merges_slivers() {
        let raw = vec![seg(0.0, 1.5, "Well,"), seg(1.5, 3.0, "I think so.")];
        let out = captionize(&raw);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].text, "Well, I think so.");
    }
}
