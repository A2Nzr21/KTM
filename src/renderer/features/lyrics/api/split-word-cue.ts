import { SyncedWordCue } from '/@/shared/types/domain-types';

// eslint-disable-next-line no-irregular-whitespace
const BREAK_CHAR_RE = /[\s​­\p{Dash_Punctuation}]/u;
const TRAILING_WS_RE = /\s+$/;
const SEGMENT_LENGTH_THRESHOLD = 5;
const LONG_WORD_DURATION_MS = 1000;
const MIN_LETTER_MS = 70;
const GRAPHEME_WRAP_RE =
    /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}\p{sc=Thai}\p{sc=Lao}\p{sc=Khmer}\p{sc=Myanmar}]/u;

export type SplitWordCue = SyncedWordCue & {
    isWrapAfter?: boolean;
};

const splitIntoLetters = (durationMs: number, text: string): null | SplitWordCue[] => {
    const core = text.replace(TRAILING_WS_RE, '');

    if (core.length <= 1 || BREAK_CHAR_RE.test(core)) {
        return null;
    }

    const letters = segmentGraphemes(core);
    if (letters.length <= 1) {
        return null;
    }

    if (durationMs < LONG_WORD_DURATION_MS || durationMs / letters.length < MIN_LETTER_MS) {
        return null;
    }

    const trailing = text.slice(core.length);
    const cues = distributeSegments(letters, durationMs);

    if (trailing && cues.length) {
        cues[cues.length - 1].text += trailing;
    }

    return cues;
};

const distributeSegments = (segments: string[], durationMs: number): SplitWordCue[] => {
    const perDuration = durationMs / segments.length;

    return segments.map((seg, index) => ({
        endMs: (index + 1) * perDuration,
        isWrapAfter: index < segments.length - 1,
        startMs: index * perDuration,
        text: seg,
    }));
};

const segmentGraphemes = (text: string): string[] => {
    try {
        const graphSeg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        return Array.from(graphSeg.segment(text), (entry) => entry.segment);
    } catch {
        return Array.from(text);
    }
};

const shouldSplit = (text: string): boolean => {
    const core = text.replace(TRAILING_WS_RE, '');
    if (core.length <= SEGMENT_LENGTH_THRESHOLD) {
        return false;
    }

    return !BREAK_CHAR_RE.test(core);
};

const segment = (text: string): string[] => {
    try {
        const wordSeg = new Intl.Segmenter(undefined, { granularity: 'word' });
        const words = Array.from(wordSeg.segment(text), (entry) => entry.segment);
        if (words.length > 1) {
            return words;
        }

        if (!GRAPHEME_WRAP_RE.test(text)) {
            return [text];
        }

        const graphSeg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        return Array.from(graphSeg.segment(text), (entry) => entry.segment);
    } catch {
        return Array.from(text);
    }
};

export const splitWordCue = (word: SyncedWordCue): SplitWordCue[] => {
    const duration = word.endMs - word.startMs;

    const perLetter = splitIntoLetters(duration, word.text);
    if (perLetter) {
        return perLetter.map((entry) => ({
            ...entry,
            endMs: word.startMs + entry.endMs,
            startMs: word.startMs + entry.startMs,
        }));
    }

    if (!shouldSplit(word.text)) {
        return [{ ...word, isWrapAfter: false }];
    }

    const segments = segment(word.text);
    if (segments.length <= 1) {
        return [{ ...word, isWrapAfter: false }];
    }

    const perDuration = duration / segments.length;

    return segments.map((seg, index) => ({
        endMs: word.startMs + (index + 1) * perDuration,
        isWrapAfter: index < segments.length - 1,
        startMs: word.startMs + index * perDuration,
        text: seg,
    }));
};

export const splitWordCues = (words: SyncedWordCue[]): SplitWordCue[] =>
    words.flatMap((word) => splitWordCue(word));
