const STORAGE_PREFIX = 'ktm:autodj-history:';
const MAX_SONG_ENTRIES = 400;
const MAX_ALBUM_ENTRIES = 120;
const DEFAULT_PRUNE_RATIO = 0.25;

type AutoDjHistory = {
    albums: string[];
    songs: SongHistoryEntry[];
};

type HistorySong = {
    albumArtists?: Array<{ name: string }>;
    artists?: Array<{ name: string }>;
    id: string;
    name?: string;
};

type SongHistoryEntry = {
    id: string;
    key: string;
};

const storageKey = (serverId: string) => `${STORAGE_PREFIX}${serverId}`;

const normalizeText = (value: string) =>
    value
        .toLowerCase()
        .normalize('NFKD')
        .replace(/\p{M}+/gu, '')
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();

export const autoDjSongKey = (song: HistorySong): string => {
    const artist = song.albumArtists?.[0]?.name ?? song.artists?.[0]?.name ?? '';
    return `${normalizeText(artist)}|${normalizeText(song.name ?? '')}`;
};

const readHistory = (serverId: string): AutoDjHistory => {
    try {
        const raw = localStorage.getItem(storageKey(serverId));
        if (!raw) {
            return { albums: [], songs: [] };
        }

        const parsed = JSON.parse(raw) as Partial<AutoDjHistory>;
        return {
            albums: Array.isArray(parsed.albums) ? parsed.albums : [],
            songs: Array.isArray(parsed.songs) ? parsed.songs : [],
        };
    } catch {
        return { albums: [], songs: [] };
    }
};

const writeHistory = (serverId: string, history: AutoDjHistory): void => {
    try {
        localStorage.setItem(storageKey(serverId), JSON.stringify(history));
    } catch {
        return;
    }
};

export const getAutoDjSongBlocklist = (
    serverId: string,
): { ids: Set<string>; keys: Set<string> } => {
    const history = readHistory(serverId);
    return {
        ids: new Set(history.songs.map((entry) => entry.id)),
        keys: new Set(history.songs.map((entry) => entry.key)),
    };
};

export const getAutoDjAlbumBlocklist = (serverId: string): Set<string> =>
    new Set(readHistory(serverId).albums);

export const rememberAutoDjSongs = (serverId: string, songs: HistorySong[]): void => {
    if (!songs.length) {
        return;
    }

    const history = readHistory(serverId);
    const seen = new Set(history.songs.map((entry) => entry.id));

    for (const song of songs) {
        if (!song.id || seen.has(song.id)) {
            continue;
        }

        seen.add(song.id);
        history.songs.push({ id: song.id, key: autoDjSongKey(song) });
    }

    if (history.songs.length > MAX_SONG_ENTRIES) {
        history.songs = history.songs.slice(-MAX_SONG_ENTRIES);
    }

    writeHistory(serverId, history);
};

export const rememberAutoDjAlbums = (serverId: string, albumIds: string[]): void => {
    if (!albumIds.length) {
        return;
    }

    const history = readHistory(serverId);
    const seen = new Set(history.albums);

    for (const albumId of albumIds) {
        if (albumId && !seen.has(albumId)) {
            seen.add(albumId);
            history.albums.push(albumId);
        }
    }

    if (history.albums.length > MAX_ALBUM_ENTRIES) {
        history.albums = history.albums.slice(-MAX_ALBUM_ENTRIES);
    }

    writeHistory(serverId, history);
};

export const pruneAutoDjSongs = (serverId: string, keepRatio = DEFAULT_PRUNE_RATIO): void => {
    const history = readHistory(serverId);
    const keepCount = Math.max(1, Math.floor(history.songs.length * keepRatio));
    history.songs = history.songs.slice(-keepCount);
    writeHistory(serverId, history);
};

export const pruneAutoDjAlbums = (serverId: string, keepRatio = DEFAULT_PRUNE_RATIO): void => {
    const history = readHistory(serverId);
    const keepCount = Math.max(1, Math.floor(history.albums.length * keepRatio));
    history.albums = history.albums.slice(-keepCount);
    writeHistory(serverId, history);
};
