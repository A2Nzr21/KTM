import type { QueryClient } from '@tanstack/react-query';

import { autoDjSongKey, getAutoDjSongBlocklist, pruneAutoDjSongs } from './auto-dj-history';
import { autoDjGenreIdsForSongGenre } from './auto-dj-utils';

import { queryKeys } from '/@/renderer/api/query-keys';
import { songsQueries } from '/@/renderer/features/songs/api/songs-api';
import { AUTO_DJ_STRATEGY, type AutoDJStrategy } from '/@/renderer/store/settings.store';
import { shuffle } from '/@/renderer/utils/shuffle';
import {
    Played,
    type QueueSong,
    type ServerListItem,
    Song,
    SongListSort,
    SortOrder,
} from '/@/shared/types/domain-types';

const SIMILAR_POOL_FACTOR = 6;
const MIN_SIMILAR_POOL = 30;
const GENRE_POOL_LIMIT = 200;
const ARTIST_POOL_LIMIT = 120;
const RANDOM_POOL_LIMIT = 200;
const MAX_SEEDS = 3;

export type AutoDjSongCollectArgs = {
    allowDuplicates: boolean;
    currentSong: QueueSong;
    itemCount: number;
    musicFolderId: string | string[] | undefined;
    onlySimilar: boolean;
    queryClient: QueryClient;
    queueSongIdSet: Set<string>;
    queueSongKeySet: Set<string>;
    runId: string;
    seedSongIds: string[];
    server: null | ServerListItem | undefined;
    serverId: string;
    songStrategy: AutoDJStrategy;
    trySimilarSongs: boolean;
};

export const runAutoDjSongs = async (args: AutoDjSongCollectArgs): Promise<Song[]> => {
    switch (args.songStrategy) {
        case AUTO_DJ_STRATEGY.LIBRARY_RANDOM: {
            return collectSongsLibraryRandom(args);
        }
        default: {
            return collectSongsSimilar(args);
        }
    }
};

const collectSongsLibraryRandom = async (args: AutoDjSongCollectArgs): Promise<Song[]> => {
    const randomSongs = await args.queryClient.fetchQuery({
        ...songsQueries.random({
            query: {
                limit: RANDOM_POOL_LIMIT,
                played: Played.All,
            },
            serverId: args.serverId,
        }),
        queryKey: queryKeys.player.fetch({
            autoDjLibraryRandomSongs: args.currentSong.id,
            run: args.runId,
        }),
    });

    const history = getAutoDjSongBlocklist(args.serverId);
    const pool = randomSongs.items.filter((song) =>
        isSongAvailable(song, args, history, new Set(), new Set()),
    );

    return shuffle(pool).slice(0, args.itemCount);
};

const collectSongsSimilar = async (args: AutoDjSongCollectArgs): Promise<Song[]> => {
    const requested = Math.max(1, args.itemCount);
    const similarPoolSize = Math.max(requested * SIMILAR_POOL_FACTOR, MIN_SIMILAR_POOL);
    const selected: Song[] = [];
    const selectedIds = new Set<string>();
    const selectedKeys = new Set<string>();
    const remainingCount = () => requested - selected.length;

    let history = getAutoDjSongBlocklist(args.serverId);
    const deferred: Song[] = [];

    const addCandidates = (songs: Song[], cap: number) => {
        let added = 0;

        for (const song of shuffle(songs)) {
            if (added >= cap || remainingCount() <= 0) {
                break;
            }

            if (!isSongAvailable(song, args, history, selectedIds, selectedKeys)) {
                if (!args.allowDuplicates) {
                    deferred.push(song);
                }
                continue;
            }

            selectedIds.add(song.id);
            selectedKeys.add(autoDjSongKey(song));
            selected.push(song);
            added += 1;
        }
    };

    if (args.trySimilarSongs) {
        const seedIds = Array.from(new Set([args.currentSong.id, ...args.seedSongIds])).slice(
            0,
            MAX_SEEDS,
        );

        const similarLists = await Promise.all(
            seedIds.filter(Boolean).map((songId) =>
                args.queryClient
                    .fetchQuery({
                        ...songsQueries.similar({
                            query: { count: similarPoolSize, songId },
                            serverId: args.serverId,
                        }),
                        queryKey: queryKeys.player.fetch({
                            autoDjSimilar: songId,
                            run: args.runId,
                        }),
                    })
                    .catch(() => [] as Song[]),
            ),
        );

        const similarSongs = similarLists.flat().filter((song) => song.id !== args.currentSong.id);
        addCandidates(similarSongs, Math.max(requested * 2, 10));

        if (args.onlySimilar && selected.length > 0) {
            return shuffle(selected).slice(0, requested);
        }
    }

    if (remainingCount() > 0 && args.currentSong && args.server) {
        const genres = (args.currentSong.genres ?? []).slice(0, 2);

        for (const genre of genres) {
            const genreIds = autoDjGenreIdsForSongGenre(genre, args.server.type);

            const genreSongs = await args.queryClient
                .fetchQuery({
                    ...songsQueries.random({
                        query: {
                            genre: genreIds[0],
                            limit: GENRE_POOL_LIMIT,
                            played: Played.All,
                        },
                        serverId: args.serverId,
                    }),
                    queryKey: queryKeys.player.fetch({
                        autoDjGenre: genreIds,
                        run: args.runId,
                        song: args.currentSong.id,
                    }),
                })
                .catch(() => null);

            if (genreSongs) {
                addCandidates(genreSongs.items, GENRE_POOL_LIMIT);
            }

            if (remainingCount() <= 0) {
                break;
            }
        }

        if (args.onlySimilar && selected.length > 0) {
            return shuffle(selected).slice(0, requested);
        }
    }

    if (remainingCount() > 0) {
        const albumArtist = args.currentSong?.albumArtists?.[0];

        if (albumArtist) {
            const artistSongs = await args.queryClient
                .fetchQuery({
                    ...songsQueries.list({
                        query: {
                            albumArtistIds: [albumArtist.id],
                            limit: ARTIST_POOL_LIMIT,
                            sortBy: SongListSort.RANDOM,
                            sortOrder: SortOrder.ASC,
                            startIndex: 0,
                        },
                        serverId: args.serverId,
                    }),
                    queryKey: queryKeys.player.fetch({
                        autoDjArtist: albumArtist.id,
                        run: args.runId,
                        song: args.currentSong.id,
                    }),
                })
                .catch(() => null);

            if (artistSongs) {
                addCandidates(artistSongs.items, ARTIST_POOL_LIMIT);
            }
        }
    }

    if (remainingCount() > 0) {
        const randomSongs = await args.queryClient
            .fetchQuery({
                ...songsQueries.random({
                    query: { limit: RANDOM_POOL_LIMIT, played: Played.All },
                    serverId: args.serverId,
                }),
                queryKey: queryKeys.player.fetch({ autoDjRandom: args.runId }),
            })
            .catch(() => null);

        if (randomSongs) {
            addCandidates(randomSongs.items, RANDOM_POOL_LIMIT);
        }
    }

    if (remainingCount() > 0 && !args.allowDuplicates && deferred.length > 0) {
        pruneAutoDjSongs(args.serverId);
        history = getAutoDjSongBlocklist(args.serverId);
        addCandidates(deferred, RANDOM_POOL_LIMIT);
    }

    return shuffle(selected).slice(0, requested);
};

const isSongAvailable = (
    song: Song,
    args: AutoDjSongCollectArgs,
    history: { ids: Set<string>; keys: Set<string> },
    selectedIds: Set<string>,
    selectedKeys: Set<string>,
): boolean => {
    if (args.allowDuplicates) {
        return true;
    }

    if (song.id === args.currentSong.id) {
        return false;
    }

    if (args.queueSongIdSet.has(song.id) || selectedIds.has(song.id) || history.ids.has(song.id)) {
        return false;
    }

    const key = autoDjSongKey(song);
    return !args.queueSongKeySet.has(key) && !selectedKeys.has(key) && !history.keys.has(key);
};
