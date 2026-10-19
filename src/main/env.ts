export const disableAutoUpdates = () => {
    // KTM has no update server; never check for updates.
    return true;
};

export const isMacOS = () => {
    return process.platform === 'darwin';
};

export const isWindows = () => {
    return process.platform === 'win32';
};

export const isLinux = () => {
    return process.platform === 'linux';
};
