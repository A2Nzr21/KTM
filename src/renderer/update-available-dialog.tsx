import isElectron from 'is-electron';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { Button } from '/@/shared/components/button/button';
import { Dialog } from '/@/shared/components/dialog/dialog';
import { Group } from '/@/shared/components/group/group';
import { Stack } from '/@/shared/components/stack/stack';
import { Text } from '/@/shared/components/text/text';
import { useLocalStorage } from '/@/shared/hooks/use-local-storage';

const REMIND_LATER_MS = 24 * 60 * 60 * 1000;

type UpdatePhase = 'downloading' | 'idle' | 'ready';

export const UpdateAvailableDialog = () => {
    const [opened, setOpened] = useState(false);
    const [version, setVersion] = useState<string>('');
    const [phase, setPhase] = useState<UpdatePhase>('idle');
    const [progress, setProgress] = useState(0);
    const { t } = useTranslation();
    const [versionDismissed, setVersionDismissed] = useLocalStorage<string>({
        key: 'version_dismissed',
    });
    const [remindAfter, setRemindAfter] = useLocalStorage<string>({
        key: 'version_remind_after',
    });

    useEffect(() => {
        if (!isElectron()) return;

        const handleUpdateAvailable = (newVersion: string) => {
            if (versionDismissed === newVersion) {
                return;
            }

            const remindAt = Number(remindAfter);
            if (Number.isFinite(remindAt) && remindAt > Date.now()) {
                return;
            }

            setVersion(newVersion);
            setPhase('idle');
            setProgress(0);
            setOpened(true);
        };

        const handleDownloadProgress = (payload: {
            percent: number;
            total: number;
            transferred: number;
        }) => {
            setPhase('downloading');
            setProgress(Math.max(0, Math.min(100, payload.percent ?? 0)));
        };

        const handleDownloaded = (downloadedVersion: string) => {
            if (!downloadedVersion) {
                return;
            }

            setProgress(100);
            setPhase('ready');
        };

        window.api.utils.rendererUpdateAvailable(handleUpdateAvailable);
        window.api.utils.rendererUpdateDownloadProgress(handleDownloadProgress);
        window.api.utils.rendererUpdateDownloaded(handleDownloaded);

        return () => {
            window.api.ipc.removeListener?.('update-available', handleUpdateAvailable);
            window.api.ipc.removeListener?.('update-download-progress', handleDownloadProgress);
            window.api.ipc.removeListener?.('update-downloaded', handleDownloaded);
        };
    }, [versionDismissed, remindAfter]);

    if (!opened) return null;

    const handleSkip = () => {
        if (version) {
            setVersionDismissed(version);
        }
        setOpened(false);
    };

    const handleRemindLater = () => {
        setRemindAfter(String(Date.now() + REMIND_LATER_MS));
        setOpened(false);
    };

    const handleUpdate = async () => {
        setPhase('downloading');
        setProgress(0);
        await window.api.utils.downloadUpdate();
    };

    const handleInstall = async () => {
        await window.api.utils.installUpdate();
    };

    return (
        <Dialog
            onClose={handleRemindLater}
            opened={opened}
            position={{ bottom: 100, right: 12 }}
            radius="md"
            size="lg"
            withCloseButton
        >
            <Stack gap="md">
                <Text fw={700} size="md">
                    {t('common.newVersionAvailable')} - {version}
                </Text>
                {phase === 'downloading' && (
                    <Text isMuted size="sm">
                        {t('common.updateDownloading')} {progress.toFixed(0)}%
                    </Text>
                )}
                {phase === 'ready' && (
                    <Text isMuted size="sm">
                        {t('common.updateReady')}
                    </Text>
                )}
                <Group justify="flex-end">
                    {phase === 'idle' && (
                        <>
                            <Button onClick={handleSkip} size="xs" variant="subtle">
                                {t('common.skipVersion')}
                            </Button>
                            <Button onClick={handleRemindLater} size="xs" variant="default">
                                {t('common.remindLater')}
                            </Button>
                            <Button onClick={handleUpdate} size="xs" variant="filled">
                                {t('common.updateNow')}
                            </Button>
                        </>
                    )}
                    {phase === 'downloading' && (
                        <Button disabled size="xs" variant="filled">
                            {t('common.updateDownloading')}
                        </Button>
                    )}
                    {phase === 'ready' && (
                        <Button onClick={handleInstall} size="xs" variant="filled">
                            {t('common.restartAndInstall')}
                        </Button>
                    )}
                </Group>
            </Stack>
        </Dialog>
    );
};
