# Releasing KTM updates

The app checks GitHub releases in `A2Nzr21/KTM` at startup and every six hours, and offers
**Update now / Skip this version / Remind me later** in the update dialog. Updates are downloaded
through electron-updater, which fetches only the changed blocks of the installer when a previous
blockmap is available on the machine; otherwise it falls back to the full installer once.

The repository must be public: the check calls `api.github.com` without a token.

## Publishing a release

1. Set the new version in `package.json` (for example `1.17.1`), then run the build:

```bash
pnpm build
```

2. Package the installer (Windows example):

```bash
cmd /c "D:\AI\NowPlayingRpc\build-ktm.cmd"
```

3. Create a GitHub release on `main` tagged `v<version>` (for example `v1.17.1`, not a draft and
   not marked as pre-release). Upload these three files from `dist/`:

   - `KTM-<version>-win-x64.exe`
   - `KTM-<version>-win-x64.exe.blockmap`
   - `latest.yml`

`latest.yml` and the blockmap are what make differential updates possible. A release without
them will not be offered by the in-app updater even though the GitHub button may show the new
version.

## What the app sends

- Startup and every six hours: `autoUpdater.checkForUpdates()` against `latest.yml`.
- Update now: `autoUpdater.downloadUpdate()`, with progress reported in the dialog.
- Restart and install: `autoUpdater.quitAndInstall()`.

## Skipping and reminding

- **Skip this version** stores the version in `version_dismissed` (localStorage). The dialog stays
  quiet for that version until a newer one is published.
- **Remind me later** stores a timestamp in `version_remind_after` (24 hours). The dialog will not
  open before that time; the next launch check shows it again.

## Notes

- Releases must come from the `main` branch of `A2Nzr21/KTM`; the updater reads releases, not
  raw branch files.
- The first update after a fresh install may download the full installer because there is no
  cached blockmap yet. Later updates reuse the cached blocks.
- The packaging exclusions in `STRIPPED.md` reduce the installer size; they do not affect the
  updater.
