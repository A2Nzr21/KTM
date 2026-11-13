import { useQueryClient } from '@tanstack/react-query';
import React, { useEffect, useRef } from 'react';

import { eventEmitter } from '/@/renderer/events/event-emitter';
import { runAutoDjAlbumIds } from '/@/renderer/features/player/auto-dj/auto-dj-albums';
import {
    autoDjSongKey,
    rememberAutoDjAlbums,
    rememberAutoDjSongs,
} from '/@/renderer/features/player/auto-dj/auto-dj-history';
import { runAutoDjSongs } from '/@/renderer/features/player/auto-dj/auto-dj-songs';
import { useIsPlayerFetching, usePlayer } from '/@/renderer/features/player/context/player-context';
import {
    AUTO_DJ_STRATEGY,
    isShuffleEnabled,
    mapShuffledToQueueIndex,
    useAutoDJSettings,
    useCurrentServer,
    useCurrentServerId,
    usePlayerStoreBase,
    useSettingsStore,
} from '/@/renderer/store';
import { logger } from '/@/renderer/utils/logger';
import { hasFeature } from '/@/shared/api/utils';
import { LibraryItem } from '/@/shared/types/domain-types';
import { ServerFeature } from '/@/shared/types/features-types';
import { Play } from '/@/shared/types/types';

export const useAutoDJ = () => {
    const queryClient = useQueryClient();
    const serverId = useCurrentServerId();
    const server = useCurrentServer();
    const player = usePlayer();
    const settings = useAutoDJSettings();
    const isFetching = useIsPlayerFetching();
    const runningRef = useRef(false);
    const lastRunEndRef = useRef(0);

    const hasSimilarSongsMusicFolder = hasFeature(server, ServerFeature.SIMILAR_SONGS_MUSIC_FOLDER);

    useEffect(() => {
        const albumStrategy = settings.albumStrategy ?? AUTO_DJ_STRATEGY.SIMILAR;
        const songStrategy = settings.songStrategy ?? AUTO_DJ_STRATEGY.SIMILAR;

        const unsubscribe = usePlayerStoreBase.subscribe(
            (state) => {
                const queue = state.getQueue();
                let index = state.player.index;
                let remaining: number;

                if (isShuffleEnabled(state)) {
                    remaining = state.queue.shuffled.length - index - 1;
                    index = mapShuffledToQueueIndex(index, state.queue.shuffled);
                } else {
                    remaining = queue.items.slice(index + 1).length;
                }

                return { index, remaining, song: queue.items[index] };
            },
            async (properties) => {
                if (!settings.enabled) {
                    return;
                }

                if (!properties.song?.id) {
                    return;
                }

                if (properties.remaining >= settings.timing) {
                    return;
                }

                logger.info('Auto DJ triggered', {
                    remaining: properties.remaining,
                    songId: properties.song?.id,
                    songName: properties.song?.name,
                });

                if (runningRef.current) {
                    return;
                }

                const now = Date.now();
                if (now - lastRunEndRef.current < 3000) {
                    return;
                }

                runningRef.current = true;

                try {
                    const playerState = usePlayerStoreBase.getState();
                    const queue = playerState.getQueue();
                    const runId = `${now}-${Math.random().toString(36).slice(2)}`;
                    const queueIndex = isShuffleEnabled(playerState)
                        ? mapShuffledToQueueIndex(
                              playerState.player.index,
                              playerState.queue.shuffled,
                          )
                        : playerState.player.index;
                    const seedSongIds = queue.items
                        .slice(Math.max(0, queueIndex - 2), queueIndex + 1)
                        .map((item) => item.id)
                        .reverse();
                    const queueSongKeySet = new Set(queue.items.map((item) => autoDjSongKey(item)));

                    const hasMusicFolder = server?.musicFolderId && server.musicFolderId.length > 0;
                    const musicFolderId =
                        hasMusicFolder && server?.musicFolderId ? server.musicFolderId : undefined;
                    const trySimilarSongs =
                        !hasMusicFolder || (hasMusicFolder && hasSimilarSongsMusicFolder);

                    const runnerDepsBase = {
                        allowDuplicates: settings.allowDuplicates,
                        itemCount: settings.itemCount,
                        musicFolderId,
                        onlySimilar: settings.onlySimilar,
                        queryClient,
                        runId,
                        seedSongIds,
                        server,
                        serverId,
                        trySimilarSongs,
                    };

                    if (settings.mode === 'albums') {
                        if (!serverId) {
                            return;
                        }

                        const queueAlbumIdSet = new Set(
                            queue.items
                                .map((item) => item.albumId)
                                .filter((id): id is string => Boolean(id)),
                        );

                        const albumsToAdd = await runAutoDjAlbumIds({
                            ...runnerDepsBase,
                            albumStrategy,
                            currentSong: properties.song,
                            queueAlbumIdSet,
                        });

                        if (albumsToAdd.length > 0) {
                            rememberAutoDjAlbums(serverId, albumsToAdd);

                            await player.addToQueueByFetch(
                                serverId,
                                albumsToAdd,
                                LibraryItem.ALBUM,
                                Play.LAST,
                            );

                            eventEmitter.emit('AUTODJ_QUEUE_ADDED', {
                                songCount: albumsToAdd.length,
                            });
                        }

                        return;
                    }

                    if (!serverId) {
                        return;
                    }

                    const queueSongIdSet = new Set(queue.items.map((item) => item.id));

                    const songsToAdd = await runAutoDjSongs({
                        ...runnerDepsBase,
                        currentSong: properties.song,
                        queueSongIdSet,
                        queueSongKeySet,
                        songStrategy,
                    });

                    if (songsToAdd.length > 0) {
                        rememberAutoDjSongs(serverId, [properties.song, ...songsToAdd]);

                        player.addToQueueByData(songsToAdd, Play.LAST);

                        eventEmitter.emit('AUTODJ_QUEUE_ADDED', {
                            songCount: songsToAdd.length,
                        });
                    }
                } catch (error) {
                    logger.error('Auto DJ failed', {
                        error: (error as Error).message,
                        songId: properties.song?.id,
                    });
                } finally {
                    runningRef.current = false;
                    lastRunEndRef.current = Date.now();
                }
            },
            {
                equalityFn: (a, b) => {
                    return a.song?._uniqueId === b.song?._uniqueId && a.remaining === b.remaining;
                },
            },
        );

        return () => unsubscribe();
    }, [
        hasSimilarSongsMusicFolder,
        isFetching,
        player,
        queryClient,
        server,
        serverId,
        settings.enabled,
        settings.albumStrategy,
        settings.allowDuplicates,
        settings.itemCount,
        settings.mode,
        settings.onlySimilar,
        settings.songStrategy,
        settings.timing,
    ]);
};

const AutoDJHookInner = () => {
    useAutoDJ();
    return null;
};

export const AutoDJHook = () => {
    const isAutoDJEnabled = useSettingsStore((state) => state.autoDJ.enabled);

    if (!isAutoDJEnabled) {
        return null;
    }

    return React.createElement(AutoDJHookInner);
};
