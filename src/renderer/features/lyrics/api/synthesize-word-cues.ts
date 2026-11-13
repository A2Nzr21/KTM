import { lyricsHasWordCues, normalizeLyrics } from '/@/renderer/features/lyrics/api/lyrics-utils';
import {
    SyncedCueLine,
    SyncedWordCue,
    SynchronizedLyricLine,
    SynchronizedLyrics,
    SynchronizedLyricsLineTuple,
} from '/@/shared/types/domain-types';

const MIN_LINE_ESTIMATE_MS = 1400;
const MAX_LINE_ESTIMATE_MS = 9000;
const BASE_LINE_MS = 400;
const MS_PER_SYLLABLE = 300;
const MIN_WORD_MS = 110;
const LINE_END_BREATH_MS = 20;

const MARKUP_RE = /<\/?[a-z][^>]*>/i;
const WORD_CHAR_RE = /[\p{L}\p{N}]/u;
const CJK_RE =
    /[\p{sc=Han}\p{sc=Hiragana}\p{sc=Katakana}\p{sc=Hangul}\p{sc=Thai}\p{sc=Lao}\p{sc=Khmer}\p{sc=Myanmar}]/u;
const LATIN_VOWEL_GROUP_RE = /[aeiouyà-öø-ÿ]+/gi;

interface LineToken {
    text: string;
    weight: number;
}

const wordSegmenter =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl
        ? new Intl.Segmenter(undefined, { granularity: 'word' })
        : null;

const countSyllables = (text: string): number => {
    if (CJK_RE.test(text)) {
        return Math.max(1, Array.from(text).filter((char) => WORD_CHAR_RE.test(char)).length);
    }

    const groups = text.match(LATIN_VOWEL_GROUP_RE);
    return Math.max(1, groups?.length ?? 1);
};

const splitIntoTokens = (text: string): LineToken[] => {
    if (!text.trim()) {
        return [];
    }

    const tokens: LineToken[] = [];

    if (wordSegmenter) {
        let pendingPrefix = '';

        for (const part of wordSegmenter.segment(text)) {
            if (part.isWordLike) {
                tokens.push({
                    text: pendingPrefix + part.segment,
                    weight: countSyllables(part.segment),
                });
                pendingPrefix = '';
            } else if (tokens.length) {
                tokens[tokens.length - 1].text += part.segment;
            } else {
                pendingPrefix += part.segment;
            }
        }

        if (pendingPrefix && tokens.length) {
            tokens[tokens.length - 1].text += pendingPrefix;
        }
    } else {
        for (const part of text.split(/(\s+)/)) {
            if (!part) continue;

            if (WORD_CHAR_RE.test(part) && tokens.length) {
                tokens.push({ text: part, weight: countSyllables(part) });
            } else if (tokens.length) {
                tokens[tokens.length - 1].text += part;
            } else {
                tokens.push({ text: part, weight: countSyllables(part) });
            }
        }
    }

    return tokens;
};

const estimateLineDurationMs = (totalWeight: number): number => {
    const estimate = BASE_LINE_MS + totalWeight * MS_PER_SYLLABLE;
    return Math.min(MAX_LINE_ESTIMATE_MS, Math.max(MIN_LINE_ESTIMATE_MS, estimate));
};

const resolveLineEndMs = (
    startMs: number,
    nextStartMs: null | number,
    totalWeight: number,
): number => {
    let endMs = startMs + estimateLineDurationMs(totalWeight);

    if (nextStartMs != null && nextStartMs > startMs) {
        endMs = Math.min(endMs, nextStartMs - LINE_END_BREATH_MS);
    }

    const minEndMs = startMs + Math.max(MIN_WORD_MS, totalWeight * MIN_WORD_MS);
    return Math.max(endMs, minEndMs);
};

const distributeTokens = (tokens: LineToken[], startMs: number, endMs: number): SyncedWordCue[] => {
    const totalWeight = tokens.reduce((sum, token) => sum + token.weight, 0);

    if (totalWeight <= 0 || endMs <= startMs) {
        return [];
    }

    const durationMs = endMs - startMs;
    const cues: SyncedWordCue[] = [];
    let cursorMs = startMs;

    tokens.forEach((token, index) => {
        const isLast = index === tokens.length - 1;
        const wordDurationMs = isLast
            ? endMs - cursorMs
            : Math.max(MIN_WORD_MS, (durationMs * token.weight) / totalWeight);
        const wordEndMs = isLast ? endMs : Math.min(endMs, cursorMs + wordDurationMs);

        cues.push({
            endMs: Math.round(wordEndMs),
            startMs: Math.round(cursorMs),
            text: token.text,
        });

        cursorMs = wordEndMs;
    });

    return cues;
};

const synthesizeLineCue = (
    line: SynchronizedLyricLine,
    nextStartMs: null | number,
): null | SyncedCueLine => {
    if (MARKUP_RE.test(line.text)) {
        return null;
    }

    const tokens = splitIntoTokens(line.text);
    if (!tokens.length) {
        return null;
    }

    const totalWeight = tokens.reduce((sum, token) => sum + token.weight, 0);
    const startMs = line.startMs;
    const endMs = resolveLineEndMs(startMs, nextStartMs, totalWeight);
    const words = distributeTokens(tokens, startMs, endMs);

    if (!words.length) {
        return null;
    }

    return {
        endMs: words[words.length - 1].endMs,
        index: 0,
        startMs,
        value: line.text,
        words,
    };
};

export interface SynthesizeWordCuesOptions {
    endMs?: null | number;
}

export const synthesizeWordCues = (
    lyrics: SynchronizedLyrics | SynchronizedLyricsLineTuple[],
    options: SynthesizeWordCuesOptions = {},
): null | SynchronizedLyrics => {
    const normalized = normalizeLyrics(lyrics);

    if (!normalized.length || lyricsHasWordCues(normalized)) {
        return null;
    }

    const lastStartMs = normalized[normalized.length - 1].startMs;
    const songEndMs =
        typeof options.endMs === 'number' && options.endMs > lastStartMs ? options.endMs : null;

    const synthesized: SynchronizedLyrics = normalized.map((line, index) => {
        if (line.cueLines?.some((cueLine) => cueLine.words.length)) {
            return line;
        }

        const nextLine = normalized[index + 1];
        const nextStartMs = nextLine ? nextLine.startMs : (songEndMs ?? null);
        const cueLine = synthesizeLineCue(line, nextStartMs);

        if (!cueLine) {
            return line;
        }

        return { ...line, cueLines: [cueLine] };
    });

    return lyricsHasWordCues(synthesized) ? synthesized : null;
};
