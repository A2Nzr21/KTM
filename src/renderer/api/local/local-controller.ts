import {
    Album,
    AlbumArtist,
    AlbumArtistListSort,
    AlbumListSort,
    AuthenticationResponse,
    Genre,
    InternalControllerEndpoint,
    LibraryItem,
    ReplaceApiClientProps,
    ScanStatus,
    ServerInfo,
    ServerType,
    Song,
    SongListSort,
    SortOrder,
    UserInfoResponse,
} from '/@/shared/types/domain-types';

type LocalAlbumRow = {
    artistName: string;
    duration: number;
    genreNames: string[];
    id: string;
    imageUrl: null | string;
    name: string;
    songCount: number;
    year: null | number;
};

type LocalArtistRow = {
    albumCount: number;
    id: string;
    imageUrl: null | string;
    name: string;
    songCount: number;
};

type LocalGenreRow = { id: string; name: string };

type LocalLibrarySnapshot = {
    albums: LocalAlbumRow[];
    artists: LocalArtistRow[];
    folders: string[];
    genres: LocalGenreRow[];
    scannedAt: null | string;
    scanning: boolean;
    songs: LocalSongRow[];
};

type LocalSongRow = {
    albumArtistName: string;
    albumId: string;
    albumName: string;
    artistName: string;
    bitRate: number;
    channels: null | number;
    codec: null | string;
    discNumber: number;
    duration: number;
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

const getLibrary = async (): Promise<LocalLibraryData> => {
    const data = (await window.api.localLibrary.getLibrary()) as LocalLibraryData | undefined;

    if (!data) {
        return {
            albums: [],
            artists: [],
            folders: [],
            genres: [],
            scannedAt: null,
            scanning: false,
            songs: [],
        };
    }

    return data;
};

export type LocalLibraryData = LocalLibrarySnapshot;

const shuffle = <T>(items: T[]): T[] => {
    const copy = [...items];

    for (let i = copy.length - 1; i > 0; i -= 1) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }

    return copy;
};

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

const compare = (a: null | string, b: null | string) => collator.compare(a ?? '', b ?? '');

const paginate = <T>(items: T[], startIndex: number, limit?: number) => ({
    items:
        limit === undefined ? items.slice(startIndex) : items.slice(startIndex, startIndex + limit),
    startIndex,
    totalRecordCount: items.length,
});

const matchesSearch = (value: null | string | undefined, term: string) =>
    typeof value === 'string' && value.toLowerCase().includes(term.toLowerCase());

const songSortValue = (song: LocalSongRow, sortBy: SongListSort): null | number | string => {
    switch (sortBy) {
        case SongListSort.ALBUM:
            return song.albumName;
        case SongListSort.ALBUM_ARTIST:
            return song.albumArtistName;
        case SongListSort.ARTIST:
            return song.artistName;
        case SongListSort.DURATION:
            return song.duration;
        case SongListSort.NAME:
            return song.name;
        case SongListSort.PLAY_COUNT:
            return song.playCount;
        case SongListSort.RELEASE_YEAR:
        case SongListSort.YEAR:
            return song.year;
        case SongListSort.SORT_NAME:
            return song.name.toLowerCase();
        default:
            return null;
    }
};

const toGenre = (row: LocalGenreRow, serverId: string): Genre => ({
    _itemType: LibraryItem.GENRE,
    _serverId: serverId,
    _serverType: ServerType.LOCAL,
    albumCount: null,
    id: row.id,
    imageId: null,
    imageUrl: null,
    name: row.name,
    songCount: null,
});

const toSong = (row: LocalSongRow, serverId: string): Song => ({
    _itemType: LibraryItem.SONG,
    _serverId: serverId,
    _serverType: ServerType.LOCAL,
    album: row.albumName,
    albumArtistName: row.albumArtistName,
    albumArtists: [
        {
            id: `loc-ar-${row.albumArtistName.toLowerCase()}`,
            imageId: null,
            imageUrl: row.imageUrl,
            name: row.albumArtistName,
            userFavorite: false,
            userRating: null,
        },
    ],
    albumId: row.albumId,
    artistName: row.artistName,
    artists: [
        {
            id: `loc-ar-${row.artistName.toLowerCase()}`,
            imageId: null,
            imageUrl: row.imageUrl,
            name: row.artistName,
            userFavorite: false,
            userRating: null,
        },
    ],
    bitDepth: null,
    bitRate: row.bitRate,
    blurHash: null,
    bpm: null,
    channels: row.channels,
    codec: row.codec,
    comment: null,
    compilation: false,
    container: row.codec,
    createdAt: '',
    date: null,
    discNumber: row.discNumber,
    discSubtitle: null,
    duration: row.duration,
    explicitStatus: null,
    folderId: null,
    gain: null,
    genres: [],
    id: row.id,
    imageId: null,
    imageUrl: row.imageUrl,
    lastPlayedAt: null,
    libraryId: null,
    libraryName: null,
    lyrics: row.lyrics,
    mbzAlbumId: null,
    mbzAlbumType: null,
    mbzRecordingId: null,
    mbzReleaseGroupId: null,
    mbzTrackId: null,
    missing: false,
    name: row.name,
    originalDate: null,
    originalYear: null,
    participants: null,
    path: row.path,
    peak: null,
    playCount: row.playCount,
    releaseDate: null,
    releaseYear: row.year,
    sampleRate: row.sampleRate,
    size: row.size,
    sortName: row.name.toLowerCase(),
    tags: null,
    thumbHash: null,
    trackNumber: row.trackNumber,
    trackSubtitle: null,
    updatedAt: '',
    userFavorite: row.userFavorite,
    userRating: null,
    year: row.year,
});

const toAlbum = (row: LocalAlbumRow, serverId: string): Album => ({
    _itemType: LibraryItem.ALBUM,
    _serverId: serverId,
    _serverType: ServerType.LOCAL,
    albumArtistName: row.artistName,
    albumArtists: [
        {
            id: `loc-ar-${row.artistName.toLowerCase()}`,
            imageId: null,
            imageUrl: row.imageUrl,
            name: row.artistName,
            userFavorite: false,
            userRating: null,
        },
    ],
    artists: [],
    blurHash: null,
    comment: null,
    createdAt: '',
    discs: null,
    dominantColor: null,
    duration: row.duration,
    explicitStatus: null,
    gain: null,
    genres: [],
    id: row.id,
    imageId: null,
    imageUrl: row.imageUrl,
    isCompilation: false,
    lastPlayedAt: null,
    mbzId: null,
    mbzReleaseGroupId: null,
    missing: false,
    name: row.name,
    originalDate: null,
    originalYear: null,
    participants: null,
    peak: null,
    playCount: null,
    ratedAt: null,
    recordLabels: [],
    releaseDate: null,
    releaseType: null,
    releaseTypes: [],
    releaseYear: row.year,
    size: null,
    songCount: row.songCount,
    sortName: row.name.toLowerCase(),
    starredAt: null,
    tags: null,
    thumbHash: null,
    trackYearRange: null,
    updatedAt: '',
    userFavorite: false,
    userRating: null,
    version: null,
});

const toAlbumArtist = (row: LocalArtistRow, serverId: string): AlbumArtist => ({
    _itemType: LibraryItem.ALBUM_ARTIST,
    _serverId: serverId,
    _serverType: ServerType.LOCAL,
    albumCount: row.albumCount,
    biography: null,
    blurHash: null,
    dominantColor: null,
    duration: null,
    genres: [],
    id: row.id,
    imageId: null,
    imageUrl: row.imageUrl,
    lastPlayedAt: null,
    mbz: null,
    missing: false,
    name: row.name,
    playCount: null,
    ratedAt: null,
    similarArtists: null,
    songCount: row.songCount,
    starredAt: null,
    thumbHash: null,
    userFavorite: false,
    userRating: null,
});

const sortRows = <T>(
    rows: T[],
    sortOrder: SortOrder,
    valueOf: (row: T) => null | number | string,
) => {
    const sorted = [...rows];

    sorted.sort((a, b) => {
        const av = valueOf(a);
        const bv = valueOf(b);

        if (av === null || bv === null) {
            return 0;
        }

        if (typeof av === 'number' && typeof bv === 'number') {
            return sortOrder === SortOrder.ASC ? av - bv : bv - av;
        }

        return sortOrder === SortOrder.ASC
            ? compare(String(av), String(bv))
            : compare(String(bv), String(av));
    });

    return sorted;
};

const albumSortValue = (album: LocalAlbumRow, sortBy: AlbumListSort): null | number | string => {
    switch (sortBy) {
        case AlbumListSort.ALBUM_ARTIST:
        case AlbumListSort.ARTIST:
            return album.artistName;
        case AlbumListSort.DURATION:
            return album.duration;
        case AlbumListSort.NAME:
        case AlbumListSort.SORT_NAME:
            return album.name;
        case AlbumListSort.PLAY_COUNT:
            return 0;
        case AlbumListSort.RECENTLY_ADDED:
            return 0;
        case AlbumListSort.RELEASE_DATE:
        case AlbumListSort.YEAR:
            return album.year;
        case AlbumListSort.SONG_COUNT:
            return album.songCount;
        default:
            return null;
    }
};

const albumArtistSortValue = (artist: LocalArtistRow, sortBy: string): null | number | string => {
    switch (sortBy) {
        case AlbumArtistListSort.ALBUM_COUNT:
            return artist.albumCount;
        case AlbumArtistListSort.NAME:
            return artist.name;
        case AlbumArtistListSort.SONG_COUNT:
            return artist.songCount;
        default:
            return null;
    }
};

export const LocalController: InternalControllerEndpoint = {
    addToPlaylist: async () => {
        throw new Error('Local songs do not support playlists yet');
    },
    authenticate: async () => {
        const response: AuthenticationResponse = {
            credential: 'local',
            isAdmin: true,
            userId: 'local-user',
            username: 'Local',
        };

        return response;
    },
    createFavorite: async ({ query }) => {
        for (const id of query.id) {
            await window.api.localLibrary.toggleFavorite(id);
        }

        return null;
    },
    createInternetRadioStation: async () => {
        throw new Error('Radio is not supported for local songs');
    },
    createPlaylist: async () => {
        throw new Error('Local songs do not support playlists yet');
    },
    deleteFavorite: async ({ query }) => {
        for (const id of query.id) {
            await window.api.localLibrary.toggleFavorite(id);
        }

        return null;
    },
    deleteInternetRadioStation: async () => {
        throw new Error('Radio is not supported for local songs');
    },
    deletePlaylist: async () => {
        throw new Error('Local songs do not support playlists yet');
    },
    getAlbumArtistDetail: async ({ apiClientProps, query }) => {
        const library = await getLibrary();
        const row = library.artists.find((a) => a.id === query.id);

        if (!row) {
            return null;
        }

        return toAlbumArtist(row, apiClientProps.serverId);
    },
    getAlbumArtistList: async (args) => {
        const library = await getLibrary();
        const { query } = args as ReplaceApiClientProps<any>;
        const serverId = args.apiClientProps.serverId;

        let rows = library.artists.filter((a) =>
            query?.searchTerm ? matchesSearch(a.name, query.searchTerm) : true,
        );

        if (query?.favorite) {
            rows = rows.filter(() => false);
        }

        rows = sortRows(rows, query?.sortOrder ?? 'asc', (r) =>
            albumArtistSortValue(r, query?.sortBy ?? ''),
        );

        return paginate(
            rows.map((r) => toAlbumArtist(r, serverId)),
            query?.startIndex ?? 0,
            query?.limit,
        );
    },
    getAlbumArtistListCount: async () => {
        const library = await getLibrary();
        return library.artists.length;
    },
    getAlbumDetail: async ({ apiClientProps, query }) => {
        const library = await getLibrary();
        const row = library.albums.find((a) => a.id === query.id);

        if (!row) {
            throw new Error('Album not found');
        }

        const songs = library.songs
            .filter((s) => s.albumId === query.id)
            .sort((a, b) => a.discNumber - b.discNumber || a.trackNumber - b.trackNumber)
            .map((s) => toSong(s, apiClientProps.serverId));

        return { ...toAlbum(row, apiClientProps.serverId), songs };
    },
    getAlbumList: async (args) => {
        const library = await getLibrary();
        const { query } = args as ReplaceApiClientProps<any>;
        const serverId = args.apiClientProps.serverId;

        let rows = library.albums;

        if (query?.searchTerm) {
            rows = rows.filter(
                (a) =>
                    matchesSearch(a.name, query.searchTerm as string) ||
                    matchesSearch(a.artistName, query.searchTerm as string),
            );
        }

        if (query?.favorite) {
            rows = [];
        }

        if (query?.genreIds?.length) {
            const wanted = new Set(query.genreIds);
            rows = rows.filter((a) => a.genreNames.some((g) => wanted.has(g)));
        }

        if (query?.minYear) {
            rows = rows.filter((a) => (a.year ?? 0) >= (query.minYear as number));
        }

        if (query?.maxYear) {
            rows = rows.filter((a) => (a.year ?? 0) <= (query.maxYear as number));
        }

        if (query?.sortBy === AlbumListSort.RANDOM) {
            rows = shuffle(rows);
        } else {
            rows = sortRows(rows, query?.sortOrder ?? 'asc', (r) =>
                albumSortValue(r, query?.sortBy ?? AlbumListSort.NAME),
            );
        }

        return paginate(
            rows.map((r) => toAlbum(r, serverId)),
            query?.startIndex ?? 0,
            query?.limit,
        );
    },
    getAlbumListCount: async () => {
        const library = await getLibrary();
        return library.albums.length;
    },
    getAlbumRadio: async () => [],
    getArtistList: async (args) => {
        const library = await getLibrary();
        const { query } = args as ReplaceApiClientProps<any>;
        const serverId = args.apiClientProps.serverId;

        let rows = library.artists;

        if (query?.searchTerm) {
            rows = rows.filter((a) => matchesSearch(a.name, query.searchTerm as string));
        }

        return paginate(
            rows.map((r) => toAlbumArtist(r, serverId)),
            query?.startIndex ?? 0,
            query?.limit,
        );
    },
    getArtistListCount: async () => {
        const library = await getLibrary();
        return library.artists.length;
    },
    getArtistRadio: async () => [],
    getDownloadUrl: ({ query }) => `ktm://local/stream/${encodeURIComponent(query.id)}`,
    getFavoriteSongs: async ({ apiClientProps }) => {
        const library = await getLibrary();

        const favorites = library.songs
            .filter((s) => s.userFavorite)
            .sort((a, b) => compare(a.name, b.name))
            .map((s) => toSong(s, apiClientProps.serverId));

        return {
            items: favorites,
            startIndex: 0,
            totalRecordCount: favorites.length,
        };
    },
    getFolder: async () => {
        throw new Error('Folder view is not supported for local songs');
    },
    getGenreList: async ({ apiClientProps }) => {
        const library = await getLibrary();

        return {
            items: library.genres.map((g) => toGenre(g, apiClientProps.serverId)),
            startIndex: 0,
            totalRecordCount: library.genres.length,
        };
    },
    getImageRequest: ({ query }) => {
        return {
            cacheKey: `${query.id}-${query.size ?? 0}`,
            url: `ktm://local/img/${encodeURIComponent(query.id)}`,
        };
    },
    getImageUrl: ({ query }) => {
        return `ktm://local/img/${encodeURIComponent(query.id)}`;
    },
    getInternetRadioStations: async () => [],
    getLyrics: async ({ query }) => {
        const library = await getLibrary();
        const row = library.songs.find((s) => s.id === query.songId);
        return row?.lyrics ?? '';
    },
    getMusicFolderList: async () => {
        const library = await getLibrary();

        return {
            items: library.folders.map((folder) => ({ id: folder, name: folder })),
            startIndex: 0,
            totalRecordCount: library.folders.length,
        };
    },
    getPlaylistDetail: async () => {
        throw new Error('Local songs do not support playlists yet');
    },
    getPlaylistList: async () => ({
        items: [],
        startIndex: 0,
        totalRecordCount: 0,
    }),
    getPlaylistListCount: async () => 0,
    getPlaylistSongIds: async () => ({ items: [], startIndex: 0, totalRecordCount: 0 }),
    getPlaylistSongList: async () => ({
        items: [],
        startIndex: 0,
        totalRecordCount: 0,
    }),
    getPlayQueue: async () => ({
        changed: '',
        changedBy: '',
        currentIndex: 0,
        entry: [],
        positionMs: 0,
        username: 'Local',
    }),
    getRandomSongList: async (args) => {
        const library = await getLibrary();
        const { query } = args as ReplaceApiClientProps<any>;

        let rows = library.songs;

        if (query?.genre) {
            rows = rows.filter((s) => s.genreNames.includes(query.genre as string));
        }

        return {
            items: shuffle(rows)
                .slice(0, query?.limit ?? 50)
                .map((s) => toSong(s, args.apiClientProps.serverId)),
            startIndex: 0,
            totalRecordCount: rows.length,
        };
    },
    getRoles: async () => ['admin'],
    getScanStatus: async () => {
        const status = (await window.api.localLibrary.scanStatus()) as
            | undefined
            | { folders: number; scanning: boolean };
        const library = await getLibrary();

        const scanStatus: ScanStatus = {
            count: library.songs.length,
            folderCount: status?.folders ?? library.folders.length,
            scanning: status?.scanning ?? false,
        };

        if (library.scannedAt) {
            scanStatus.lastScan = library.scannedAt;
        }

        return scanStatus;
    },
    getServerInfo: async ({ apiClientProps }) => {
        const info: ServerInfo = {
            features: {},
            id: apiClientProps.serverId,
            version: '1.0-local',
        };

        return info;
    },
    getSimilarSongs: async (args) => {
        const library = await getLibrary();
        const song = library.songs.find((s) => s.id === (args as any).query.id);

        if (!song) {
            return [];
        }

        const sameArtist = library.songs.filter((s) => s.artistName === song.artistName);

        return shuffle(sameArtist)
            .slice(0, 10)
            .map((s) => toSong(s, (args as any).apiClientProps.serverId));
    },
    getSongDetail: async ({ apiClientProps, query }) => {
        const library = await getLibrary();
        const row = library.songs.find((s) => s.id === query.id);

        if (!row) {
            throw new Error('Song not found');
        }

        return toSong(row, apiClientProps.serverId);
    },
    getSongList: async (args) => {
        const library = await getLibrary();
        const { query } = args as ReplaceApiClientProps<any>;
        const serverId = args.apiClientProps.serverId;

        let rows = library.songs;

        if (query?.albumIds?.length) {
            const wanted = new Set(query.albumIds);
            rows = rows.filter((s) => wanted.has(s.albumId));
        }

        if (query?.artistIds?.length || query?.albumArtistIds?.length) {
            const wanted = new Set([...(query.albumArtistIds ?? []), ...(query.artistIds ?? [])]);
            rows = rows.filter((s) => wanted.has(`loc-ar-${s.albumArtistName.toLowerCase()}`));
        }

        if (query?.genreIds?.length) {
            const wanted = new Set(query.genreIds);
            rows = rows.filter((s) => s.genreNames.some((g) => wanted.has(g)));
        }

        if (query?.favorite) {
            rows = rows.filter((s) => s.userFavorite);
        }

        if (query?.searchTerm) {
            rows = rows.filter(
                (s) =>
                    matchesSearch(s.name, query.searchTerm as string) ||
                    matchesSearch(s.albumName, query.searchTerm as string) ||
                    matchesSearch(s.artistName, query.searchTerm as string),
            );
        }

        if (query?.sortBy === SongListSort.RANDOM) {
            rows = shuffle(rows);
        } else {
            rows = sortRows(rows, query?.sortOrder ?? 'asc', (r) =>
                songSortValue(r, query?.sortBy ?? SongListSort.NAME),
            );
        }

        rows.sort((a, b) =>
            query?.sortBy === undefined
                ? a.discNumber - b.discNumber || a.trackNumber - b.trackNumber
                : 0,
        );

        return paginate(
            rows.map((s) => toSong(s, serverId)),
            query?.startIndex ?? 0,
            query?.limit,
        );
    },
    getSongListCount: async (args) => {
        const library = await getLibrary();
        const { query } = args as ReplaceApiClientProps<any>;

        let rows = library.songs;

        if (query?.albumIds?.length) {
            const wanted = new Set(query.albumIds);
            rows = rows.filter((s) => wanted.has(s.albumId));
        }

        if (query?.favorite) {
            rows = rows.filter((s) => s.userFavorite);
        }

        return rows.length;
    },
    getStreamUrl: ({ query }) => {
        return Promise.resolve(`ktm://local/stream/${encodeURIComponent(query.id)}`);
    },
    getTopSongs: async () => ({
        items: [],
        startIndex: 0,
        totalRecordCount: 0,
    }),
    getUserInfo: async () => {
        const info: UserInfoResponse = {
            id: 'local-user',
            isAdmin: true,
            name: 'Local',
        };

        return info;
    },
    refreshItems: async () => {
        await window.api.localLibrary.startScan();
        return null;
    },
    removeFromPlaylist: async () => {
        throw new Error('Local songs do not support playlists yet');
    },
    replacePlaylist: async () => {
        throw new Error('Local songs do not support playlists yet');
    },
    savePlayQueue: async () => undefined,
    scrobble: async ({ query }) => {
        if (query.submission) {
            await window.api.localLibrary.scrobble(query.id);
        }

        return null;
    },
    search: async ({ apiClientProps, query }) => {
        const library = await getLibrary();
        const term = query?.query ?? '';

        const albumRows = library.albums
            .filter((a) => matchesSearch(a.name, term) || matchesSearch(a.artistName, term))
            .slice(0, query?.albumLimit ?? 20)
            .map((a) => toAlbum(a, apiClientProps.serverId));

        const artistRows = library.artists
            .filter((a) => matchesSearch(a.name, term))
            .map((a) => toAlbumArtist(a, apiClientProps.serverId));

        const songRows = library.songs
            .filter(
                (s) =>
                    matchesSearch(s.name, term) ||
                    matchesSearch(s.albumName, term) ||
                    matchesSearch(s.artistName, term),
            )
            .map((s) => toSong(s, apiClientProps.serverId));

        return {
            albumArtists: artistRows,
            albums: albumRows,
            songs: songRows,
        };
    },
    setPlaylistSongs: async () => {
        throw new Error('Local songs do not support playlists yet');
    },
    startLibraryScan: async () => {
        await window.api.localLibrary.startScan();
        return null;
    },
    updateInternetRadioStation: async () => {
        throw new Error('Radio is not supported for local songs');
    },
    updatePlaylist: async () => {
        throw new Error('Local songs do not support playlists yet');
    },
};
