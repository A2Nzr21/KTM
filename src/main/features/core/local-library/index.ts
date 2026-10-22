import { app, dialog, ipcMain } from 'electron';
import { parseFile } from 'music-metadata';
import { createHash } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import { basename, dirname, extname, join, normalize, sep } from 'node:path';
import { Readable } from 'node:stream';

import log from '/@/main/logger';

const AUDIO_EXTENSIONS = new Set([
    '.aac',
    '.aif',
    '.aiff',
    '.flac',
    '.m4a',
    '.mp3',
    '.ogg',
    '.opus',
    '.wav',
    '.wma',
]);

const IMAGE_EXTENSIONS = new Set(['.jpeg', '.jpg', '.png', '.webp']);

const SCAN_YIELD_MS = 40;

const sha1 = (value: string) => createHash('sha1').update(value).digest('hex');

const songIdFor = (path: string) => `loc-${sha1(path).slice(0, 20)}`;

const artistIdFor = (name: string) => `loc-ar-${sha1(name.toLowerCase()).slice(0, 12)}`;

const albumIdFor = (artistName: string, albumName: string) =>
    `loc-al-${sha1(`${artistName.toLowerCase()}::${albumName.toLowerCase()}`).slice(0, 16)}`;

type LocalAlbum = {
    artistName: string;
    duration: number;
    genreNames: string[];
    id: string;
    imageUrl: null | string;
    name: string;
    songCount: number;
    year: null | number;
};

type LocalArtist = {
    albumCount: number;
    id: string;
    imageUrl: null | string;
    name: string;
    songCount: number;
};

type LocalGenre = { id: string; name: string };

type LocalLibraryData = {
    albums: LocalAlbum[];
    artists: LocalArtist[];
    folders: string[];
    genres: LocalGenre[];
    scannedAt: null | string;
    scanning: boolean;
    songs: LocalSong[];
};

type LocalSong = {
    albumArtistName: string;
    albumId: string;
    albumName: string;
    artistName: string;
    bitRate: number;
    channels: null | number;
    codec: null | string;
    discNumber: number;
    duration: number;
    folderPath: string;
    genreNames: string[];
    id: string;
    imageUrl: null | string;
    lyrics: null | string;
    name: string;
    path: string;
    playCount: number;
    sampleRate: null | number;
    size: number;
    trackNumber: number;
    userFavorite: boolean;
    year: null | number;
};

const LIBRARY_FILE = 'local-library.json';

const getLibraryPath = () => join(app.getPath('userData'), LIBRARY_FILE);

let libraryData: LocalLibraryData = {
    albums: [],
    artists: [],
    folders: [],
    genres: [],
    scannedAt: null,
    scanning: false,
    songs: [],
};

const loadLibrary = async () => {
    try {
        const raw = await fs.readFile(getLibraryPath(), 'utf8');
        const parsed = JSON.parse(raw) as LocalLibraryData;
        libraryData = {
            albums: Array.isArray(parsed.albums) ? parsed.albums : [],
            artists: Array.isArray(parsed.artists) ? parsed.artists : [],
            folders: Array.isArray(parsed.folders) ? parsed.folders : [],
            genres: Array.isArray(parsed.genres) ? parsed.genres : [],
            scannedAt: typeof parsed.scannedAt === 'string' ? parsed.scannedAt : null,
            scanning: false,
            songs: Array.isArray(parsed.songs) ? parsed.songs : [],
        };
    } catch {
        libraryData = {
            albums: [],
            artists: [],
            folders: [],
            genres: [],
            scannedAt: null,
            scanning: false,
            songs: [],
        };
    }
};

const saveLibrary = async () => {
    try {
        await fs.mkdir(app.getPath('userData'), { recursive: true });
        await fs.writeFile(getLibraryPath(), JSON.stringify(libraryData), 'utf8');
    } catch (error) {
        log.error('local-library: failed to save library', error);
    }
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const statCache = new Map<string, null | { cover: null | string; size: number }>();

const walkDirs = async (root: string, out: LocalSong[]) => {
    const dirs = [root];

    while (dirs.length > 0) {
        const dir = dirs.shift() as string;

        try {
            const entries = await fs.readdir(dir, { withFileTypes: true });

            for (const entry of entries) {
                const full = join(dir, entry.name);

                if (entry.isDirectory()) {
                    dirs.push(full);
                } else if (AUDIO_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
                    await scanFile(full, out);
                }
            }
        } catch {
            continue;
        }

        await sleep(SCAN_YIELD_MS);
    }
};

const scanFile = async (filePath: string, songs: LocalSong[]) => {
    let stat: import('node:fs').Stats | null = null;

    try {
        stat = await fs.stat(filePath);
    } catch {
        return;
    }

    let name = basename(filePath) || filePath;
    let albumName = '';
    let artistName = '';
    let albumArtistName = '';
    const genreNames: string[] = [];
    let duration = 0;
    let trackNumber = 0;
    let discNumber = 1;
    let year: null | number = null;
    let bitRate = 0;
    let sampleRate: null | number = null;
    let channels: null | number = null;
    let codec: null | string = null;
    let lyrics: null | string = null;

    try {
        const meta = await parseFile(filePath, { duration: true });
        const common = meta.common;

        if (meta.format.duration) {
            duration = Math.round(meta.format.duration);
        }

        if (meta.format.bitrate) {
            bitRate = Math.round(meta.format.bitrate / 1000);
        }

        if (meta.format.sampleRate) {
            sampleRate = meta.format.sampleRate;
        }

        if (meta.format.numberOfChannels) {
            channels = meta.format.numberOfChannels;
        }

        if (meta.format.container) {
            codec = meta.format.container;
        }

        name = common.title?.trim() || name;
        albumName = common.album?.trim() || '';
        artistName = common.artist?.trim() || common.albumartist?.trim() || 'Unknown Artist';
        albumArtistName = common.albumartist?.trim() || artistName;
        trackNumber = common.track?.no ?? 0;
        discNumber = common.disk?.no ?? 1;
        year = common.year ?? null;

        for (const genre of common.genre ?? []) {
            if (genre && !genreNames.includes(genre)) {
                genreNames.push(genre);
            }
        }

        if (common.lyrics && common.lyrics.length > 0) {
            lyrics = common.lyrics.join('\n');
        }
    } catch {
        artistName = 'Unknown Artist';
    }

    const songDir = dirname(filePath);

    if (!albumName) {
        albumName = songDir.split(sep).pop() ?? 'Unknown Album';
    }

    const songId = songIdFor(filePath);
    const albumId = albumIdFor(albumArtistName, albumName);

    let cover = statCache.get(songDir);

    if (!cover) {
        cover = { cover: null, size: stat?.size ?? 0 };
        statCache.set(songDir, cover);

        try {
            const siblings = await fs.readdir(songDir, { withFileTypes: true });

            for (const entry of siblings) {
                if (entry.isFile() && IMAGE_EXTENSIONS.has(extname(entry.name).toLowerCase())) {
                    cover.cover = join(songDir, entry.name);
                    break;
                }
            }
        } catch {
            statCache.set(songDir, { cover: null, size: stat?.size ?? 0 });
        }
    }

    const imageUrl = cover?.cover ? `ktm://local/img/${encodeURIComponent(cover.cover)}` : null;

    songs.push({
        albumArtistName,
        albumId,
        albumName,
        artistName,
        bitRate,
        channels,
        codec,
        discNumber,
        duration,
        folderPath: songDir,
        genreNames,
        id: songId,
        imageUrl,
        lyrics,
        name,
        path: filePath,
        playCount: 0,
        sampleRate,
        size: stat?.size ?? 0,
        trackNumber,
        userFavorite: false,
        year,
    });
};

const buildAggregates = (songs: LocalSong[]) => {
    const albums = new Map<string, LocalAlbum>();
    const artists = new Map<string, LocalArtist>();
    const genres = new Map<string, LocalGenre>();

    for (const song of songs) {
        const albumId = song.albumId;

        if (!albums.has(albumId)) {
            albums.set(albumId, {
                artistName: song.albumArtistName,
                duration: 0,
                genreNames: [],
                id: albumId,
                imageUrl: song.imageUrl,
                name: song.albumName,
                songCount: 0,
                year: song.year,
            });
        }

        const album = albums.get(albumId) as LocalAlbum;
        album.duration += song.duration;
        album.songCount += 1;

        if (!album.imageUrl && song.imageUrl) {
            album.imageUrl = song.imageUrl;
        }

        if (album.year === null && song.year !== null) {
            album.year = song.year;
        }

        for (const genre of song.genreNames) {
            if (!album.genreNames.includes(genre)) {
                album.genreNames.push(genre);
            }
        }

        const artistKey = artistIdFor(song.albumArtistName);

        if (!artists.has(artistKey)) {
            artists.set(artistKey, {
                albumCount: 0,
                id: artistKey,
                imageUrl: null,
                name: song.albumArtistName,
                songCount: 0,
            });
        }

        const artist = artists.get(artistKey) as LocalArtist;
        artist.songCount += 1;

        for (const genre of song.genreNames) {
            if (!genres.has(genre)) {
                genres.set(genre, { id: `loc-g-${sha1(genre).slice(0, 12)}`, name: genre });
            }
        }
    }

    const albumList = [...albums.values()];
    const artistList = [...artists.values()];

    for (const artist of artistList) {
        artist.albumCount = albumList.filter((a) => a.artistName === artist.name).length;
    }

    libraryData.genres = [...genres.values()].sort((a, b) => a.name.localeCompare(b.name));

    return { albumList, artistList };
};

const startScan = async () => {
    if (libraryData.scanning) {
        return { started: false };
    }

    libraryData.scanning = true;

    const scanLibrary = async () => {
        statCache.clear();

        const songs: LocalSong[] = [];

        for (const folder of libraryData.folders) {
            await walkDirs(folder, songs);
        }

        for (const song of songs) {
            const existing = libraryData.songs.find((s) => s.id === song.id);

            if (existing) {
                song.playCount = existing.playCount;
                song.userFavorite = existing.userFavorite;
            }
        }

        const { albumList, artistList } = buildAggregates(songs);

        libraryData.songs = songs;
        libraryData.albums = albumList;
        libraryData.artists = artistList;
        libraryData.scannedAt = new Date().toISOString();
        libraryData.scanning = false;

        await saveLibrary();
        log.info('local-library: scan complete', { songs: songs.length });
    };

    void scanLibrary();
    return { started: true };
};

const getSongById = (songId: string) => libraryData.songs.find((song) => song.id === songId);

export const handleKtmLocalRoute = async (request: Request) => {
    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts[0] === 'stream' && parts[1]) {
        const song = getSongById(decodeURIComponent(parts[1]));

        if (!song) {
            return new Response(null, { status: 404, statusText: 'Not Found' });
        }

        return await createAudioResponse(
            song.path,
            request.headers.get('range') ?? url.searchParams.get('range'),
        );
    }

    if (parts[0] === 'img' && parts[1]) {
        const imgPath = decodeURIComponent(parts[1]);

        const imgIsSafe = /^[a-zA-Z]:[\\/]/.test(imgPath) || normalize(imgPath).startsWith(sep);

        if (!imgIsSafe || imgPath.includes('..')) {
            return new Response(null, { status: 403, statusText: 'Forbidden' });
        }

        try {
            const payload = await fs.readFile(imgPath);

            return new Response(payload, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Content-Type': guessImageMime(imgPath),
                },
            });
        } catch {
            return new Response(null, { status: 404, statusText: 'Not Found' });
        }
    }

    return null;
};

const MIME_BY_EXT: Record<string, string> = {
    '.aac': 'audio/aac',
    '.aif': 'audio/aiff',
    '.aiff': 'audio/aiff',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.mp3': 'audio/mpeg',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/ogg',
    '.wav': 'audio/wav',
    '.wma': 'audio/x-ms-wma',
};

const IMAGE_MIME_BY_EXT: Record<string, string> = {
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
};

const guessImageMime = (path: string) =>
    IMAGE_MIME_BY_EXT[extname(path).toLowerCase()] ?? 'application/octet-stream';

const createAudioResponse = async (filePath: string, rangeHeader: null | string) => {
    let stat: import('node:fs').Stats;

    try {
        stat = await fs.stat(filePath);
    } catch {
        return new Response(null, { status: 404, statusText: 'Not Found' });
    }

    const total = stat.size;
    const contentType = guessAudioMime(filePath);
    const stream = Readable.toWeb(createReadStream(filePath)) as ReadableStream;

    if (rangeHeader) {
        const match = /bytes=(\d*)-(\d*)/.exec(rangeHeader);

        if (match) {
            const start = match[1] ? Number(match[1]) : 0;
            const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;

            if (Number.isNaN(start) || start > end || start >= total) {
                return new Response(null, {
                    headers: { 'Content-Range': `bytes */${total}` },
                    status: 416,
                    statusText: 'Range Not Satisfiable',
                });
            }

            const rangeStream = Readable.toWeb(
                createReadStream(filePath, { end, start }),
            ) as ReadableStream;

            return new Response(rangeStream, {
                headers: {
                    'Accept-Ranges': 'bytes',
                    'Access-Control-Allow-Origin': '*',
                    'Content-Length': `${end - start + 1}`,
                    'Content-Range': `bytes ${start}-${end}/${total}`,
                    'Content-Type': contentType,
                },
                status: 206,
                statusText: 'Partial Content',
            });
        }
    }

    return new Response(stream, {
        headers: {
            'Accept-Ranges': 'bytes',
            'Access-Control-Allow-Origin': '*',
            'Content-Length': `${total}`,
            'Content-Type': contentType,
        },
    });
};

const guessAudioMime = (path: string) => MIME_BY_EXT[extname(path).toLowerCase()] ?? 'audio/mpeg';

const registerIpc = () => {
    ipcMain.handle('local-library:pick-folder', async () => {
        const result = await dialog.showOpenDialog({
            properties: ['openDirectory'],
            title: 'Select music folder',
        });

        return result.filePaths[0] ?? null;
    });

    ipcMain.handle('local-library:get-library', () => libraryData);

    ipcMain.handle('local-library:scan-status', () => ({
        folders: libraryData.folders.length,
        scanning: libraryData.scanning,
    }));

    ipcMain.handle('local-library:start-scan', async () => {
        await saveLibrary();
        return startScan();
    });

    ipcMain.handle('local-library:add-folder', async (_event, folder: string) => {
        const folderIsSafe = /^[a-zA-Z]:[\\/]/.test(folder) || normalize(folder).startsWith(sep);

        if (typeof folder !== 'string' || !folderIsSafe) {
            return { added: false };
        }

        if (!libraryData.folders.includes(folder)) {
            libraryData.folders.push(folder);
            await saveLibrary();
        }

        return { added: true };
    });

    ipcMain.handle('local-library:remove-folder', async (_event, folder: string) => {
        libraryData.folders = libraryData.folders.filter((f) => f !== folder);
        await saveLibrary();
        return { removed: true };
    });

    ipcMain.handle('local-library:toggle-favorite', (_event, songId: string) => {
        const song = getSongById(songId);

        if (!song) {
            return { favorite: false };
        }

        song.userFavorite = !song.userFavorite;
        void saveLibrary();
        return { favorite: song.userFavorite };
    });

    ipcMain.handle('local-library:scrobble', (_event, songId: string) => {
        const song = getSongById(songId);

        if (song) {
            song.playCount += 1;
            void saveLibrary();
        }

        return { playCount: song?.playCount ?? 0 };
    });
};

registerIpc();

void loadLibrary();

export const getLibrarySnapshot = () => libraryData;

export const getLyricsForSong = (songId: string) => getSongById(songId)?.lyrics ?? null;

export const toggleSongFavorite = (songId: string) => {
    const song = getSongById(songId);

    if (!song) {
        return false;
    }

    song.userFavorite = !song.userFavorite;
    void saveLibrary();
    return song.userFavorite;
};

export const setFolders = async (folders: string[]) => {
    libraryData.folders = folders;
    await saveLibrary();
};

export const addFolder = async (folder: string) => {
    if (!libraryData.folders.includes(folder)) {
        libraryData.folders.push(folder);
        await saveLibrary();
    }
};
