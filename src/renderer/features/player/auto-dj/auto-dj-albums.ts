import type { QueryClient } from '@tanstack/react-query';

import { getAutoDjAlbumBlocklist, pruneAutoDjAlbums } from './auto-dj-history';
import { autoDjGenreIdsForSongGenre } from './auto-dj-utils';

import { queryKeys } from '/@/renderer/api/query-keys';
import { albumQueries } from '/@/renderer/features/albums/api/album-api';
import { songsQueries } from '/@/renderer/features/songs/api/songs-api';
import { AUTO_DJ_STRATEGY, type AutoDJStrategy } from '/@/renderer/store/settings.store';
import { shuffle } from '/@/renderer/utils/shuffle';
import {
    AlbumListSort,
    type QueueSong,
    type ServerListItem,
    SortOrder,
} from '/@/shared/types/domain-types';

const SIMILAR_POOL_FACTOR = 6;
const MIN_SIMILAR_POOL = 30;
const GENRE_POOL_LIMIT = 150;
const ARTIST_POOL_LIMIT = 100;
const RANDOM_POOL_LIMIT = 150;
const MAX_SEEDS = 3;

export type AutoDjAlbumCollectArgs = {
    albumStrategy: AutoDJStrategy;
    allowDuplicates: boolean;
    currentSong: QueueSong;
    itemCount: number;
    musicFolderId: string | string[] | undefined;
    onlySimilar: boolean;
    queryClient: QueryClient;
    queueAlbumIdSet: Set<string>;
    runId: string;
    seedSongIds: string[];
    server: null | ServerListItem | undefined;
    serverId: string;
    trySimilarSongs: boolean;
};

export const runAutoDjAlbumIds = async (args: AutoDjAlbumCollectArgs): Promise<string[]> => {
    switch (args.albumStrategy) {
        case AUTO_DJ_STRATEGY.LIBRARY_RANDOM: {
            return collectAlbumsLibraryRandom(args);
        }
        default: {
            return collectAlbumsSimilar(args);
        }
    }
};

const collectAlbumsLibraryRandom = async (args: AutoDjAlbumCollectArgs): Promise<string[]> => {
    const page = await args.queryClient.fetchQuery({
        ...albumQueries.list({
            query: {
                limit: RANDOM_POOL_LIMIT,
                musicFolderId: args.musicFolderId,
                sortBy: AlbumListSort.RANDOM,
                sortOrder: SortOrder.ASC,
                startIndex: 0,
            },
            serverId: args.serverId,
        }),
        queryKey: queryKeys.player.fetch({
            autoDjAlbumLibraryRandom: args.currentSong?.id,
            run: args.runId,
        }),
    });

    const history = getAutoDjAlbumBlocklist(args.serverId);
    const selected = new Set<string>();
    const ids: string[] = [];

    for (const album of shuffle(page.items)) {
        const albumId = album.id;

        if (
            !albumId ||
            (!args.allowDuplicates &&
                (args.queueAlbumIdSet.has(albumId) ||
                    history.has(albumId) ||
                    selected.has(albumId)))
        ) {
            continue;
        }

        selected.add(albumId);
        ids.push(albumId);

        if (ids.length >= args.itemCount) {
            break;
        }
    }

    return ids;
};

const collectAlbumsSimilar = async (args: AutoDjAlbumCollectArgs): Promise<string[]> => {
    const requested = Math.max(1, args.itemCount);
    const similarPoolSize = Math.max(requested * SIMILAR_POOL_FACTOR, MIN_SIMILAR_POOL);
    const selected: string[] = [];
    const selectedIds = new Set<string>();
    const remainingCount = () => requested - selected.length;

    let history = getAutoDjAlbumBlocklist(args.serverId);
    const deferred: string[] = [];

    const addCandidates = (albumIds: string[], cap: number) => {
        let added = 0;

        for (const albumId of shuffle(albumIds)) {
            if (added >= cap || remainingCount() <= 0) {
                break;
            }

            if (!albumId || albumId === args.currentSong.albumId) {
                continue;
            }

            if (
                !args.allowDuplicates &&
                (args.queueAlbumIdSet.has(albumId) ||
                    history.has(albumId) ||
                    selectedIds.has(albumId))
            ) {
                if (!args.queueAlbumIdSet.has(albumId) && !selectedIds.has(albumId)) {
                    deferred.push(albumId);
                }
                continue;
            }

            selectedIds.add(albumId);
            selected.push(albumId);
            added += 1;
        }
    };

    if (args.trySimilarSongs && args.currentSong?.id) {
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
                            autoDjSimilarSongAlbum: songId,
                            run: args.runId,
                        }),
                    })
                    .catch(() => []),
            ),
        );

        const albumIds = similarLists
            .flat()
            .map((song) => song.albumId)
            .filter((albumId): albumId is string => Boolean(albumId));

        addCandidates(albumIds, Math.max(requested * 2, 10));

        if (args.onlySimilar && selected.length > 0) {
            return shuffle(selected).slice(0, requested);
        }
    }

    if (remainingCount() > 0 && args.currentSong && args.server) {
        const genres = (args.currentSong.genres ?? []).slice(0, 2);

        for (const genre of genres) {
            const genreIds = autoDjGenreIdsForSongGenre(genre, args.server.type);

            const genreAlbums = await args.queryClient
                .fetchQuery({
                    ...albumQueries.list({
                        query: {
                            genreIds,
                            limit: GENRE_POOL_LIMIT,
                            musicFolderId: args.musicFolderId,
                            sortBy: AlbumListSort.RANDOM,
                            sortOrder: SortOrder.ASC,
                            startIndex: 0,
                        },
                        serverId: args.serverId,
                    }),
                    queryKey: queryKeys.player.fetch({
                        autoDjGenreAlbum: genreIds,
                        run: args.runId,
                        song: args.currentSong.id,
                    }),
                })
                .catch(() => null);

            if (genreAlbums) {
                addCandidates(
                    genreAlbums.items.map((album) => album.id),
                    GENRE_POOL_LIMIT,
                );
            }

            if (remainingCount() <= 0) {
                break;
            }
        }

        if (args.onlySimilar && selected.length > 0) {
            return shuffle(selected).slice(0, requested);
        }
    }

    if (remainingCount() > 0 && args.currentSong) {
        const albumArtist = args.currentSong?.albumArtists?.[0];

        if (albumArtist) {
            const albumsByArtist = await args.queryClient
                .fetchQuery({
                    ...albumQueries.list({
                        query: {
                            artistIds: [albumArtist.id],
                            limit: ARTIST_POOL_LIMIT,
                            musicFolderId: args.musicFolderId,
                            sortBy: AlbumListSort.RANDOM,
                            sortOrder: SortOrder.ASC,
                            startIndex: 0,
                        },
                        serverId: args.serverId,
                    }),
                    queryKey: queryKeys.player.fetch({
                        autoDjArtistAlbum: albumArtist.id,
                        run: args.runId,
                        song: args.currentSong.id,
                    }),
                })
                .catch(() => null);

            if (albumsByArtist) {
                addCandidates(
                    albumsByArtist.items.map((album) => album.id),
                    ARTIST_POOL_LIMIT,
                );
            }
        }
    }

    if (remainingCount() > 0) {
        const randomAlbums = await args.queryClient
            .fetchQuery({
                ...albumQueries.list({
                    query: {
                        limit: RANDOM_POOL_LIMIT,
                        musicFolderId: args.musicFolderId,
                        sortBy: AlbumListSort.RANDOM,
                        sortOrder: SortOrder.ASC,
                        startIndex: 0,
                    },
                    serverId: args.serverId,
                }),
                queryKey: queryKeys.player.fetch({ autoDjRandomAlbum: args.runId }),
            })
            .catch(() => null);

        if (randomAlbums) {
            addCandidates(
                randomAlbums.items.map((album) => album.id),
                RANDOM_POOL_LIMIT,
            );
        }
    }

    if (remainingCount() > 0 && !args.allowDuplicates && deferred.length > 0) {
        pruneAutoDjAlbums(args.serverId);
        history = getAutoDjAlbumBlocklist(args.serverId);
        addCandidates(deferred, RANDOM_POOL_LIMIT);
    }

    return shuffle(selected).slice(0, requested);
};
