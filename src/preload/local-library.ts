import { ipcRenderer } from 'electron';

export type LocalLibraryScanStatus = {
    folders: number;
    scanning: boolean;
};

export const localLibrary = {
    addFolder: (folder: string) => ipcRenderer.invoke('local-library:add-folder', folder),
    getLibrary: () => ipcRenderer.invoke('local-library:get-library'),
    pickFolder: () => ipcRenderer.invoke('local-library:pick-folder'),
    removeFolder: (folder: string) => ipcRenderer.invoke('local-library:remove-folder', folder),
    scanStatus: () => ipcRenderer.invoke('local-library:scan-status'),
    scrobble: (songId: string) => ipcRenderer.invoke('local-library:scrobble', songId),
    startScan: () => ipcRenderer.invoke('local-library:start-scan'),
    toggleFavorite: (songId: string) => ipcRenderer.invoke('local-library:toggle-favorite', songId),
};

export type LocalLibraryApi = typeof localLibrary;
