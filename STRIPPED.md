# KTM packaging exclusions

Starting with version 1.17.1 the installer no longer carries dependency sources that the
renderer already compiles into its bundle and the main process never loads. Nothing was removed
from the source tree, from the running app, or from the development build (`pnpm dev`). The
electron-builder `files` list in `electron-builder.yml` only leaves these entries out of
`app.asar`.

Measured effect: `app.asar` went from 278 MB to 89 MB, and the NSIS installer from 178.9 MB to
146.9 MB. Maximum 7z compression was already in use before this change, so the smaller size comes
entirely from packaging fewer unused files.

## Excluded from the installer

| Package | Size | Why it is safe to leave out |
|---|---:|---|
| `react-icons` | 83.0 MB | Icon set is tree-shaken into the renderer bundle at build time |
| `butterchurn-presets` | 16.1 MB | Visualizer presets, bundled into the renderer |
| `@mantine/core` | 8.0 MB | UI components, bundled into the renderer |
| `react-dom` | 7.0 MB | Renderer runtime, bundled |
| `react-router` | 4.6 MB | Renderer routing, bundled |
| `framer-motion` | 4.4 MB | Animation library (dependency of `motion`), bundled |
| `overlayscrollbars` | 2.9 MB | Renderer scrollbar styling, bundled |
| `dompurify` | 1.6 MB | Renderer HTML sanitizing, bundled |
| `react-player` | 1.4 MB | Renderer media player component, bundled |
| `@mantine/dates` | 1.3 MB | UI components, bundled |
| `wavesurfer.js` | 1.2 MB | Renderer waveform UI, bundled |
| `@mantine/hooks` | 1.2 MB | UI hooks, bundled |
| `fast-xml-parser` | 1.0 MB | Renderer-side parsing; main uses cheerio for XML |
| `react-i18next` | 0.9 MB | Renderer i18n bindings, bundled |
| `react-window` | 0.9 MB | Renderer list virtualization, bundled |
| `@tanstack/react-query` | 0.8 MB | Renderer data layer, bundled |
| `butterchurn` | 0.7 MB | Visualizer engine, bundled |
| `dayjs` | 0.6 MB | Renderer date formatting, bundled |
| `immer` | 0.6 MB | Renderer state helpers, bundled |
| `motion` | 0.6 MB | Animation library used by the renderer, bundled |
| `@atlaskit/pragmatic-drag-and-drop` | 0.5 MB | Drag-and-drop for renderer lists |
| `@atlaskit/pragmatic-drag-and-drop-auto-scroll` | 0.5 MB | Drag-and-drop helper for renderer lists |
| `@atlaskit/pragmatic-drag-and-drop-hitbox` | 0.4 MB | Drag-and-drop helper for renderer lists |
| `icecast-metadata-stats` | 0.4 MB | Renderer radio metadata, bundled |
| `@mantine/form` | 0.4 MB | UI form helpers, bundled |
| `qs` | 0.3 MB | Renderer query-string helper, bundled |
| `out/**/*.map` | 26 MB | Source maps; not loaded at runtime |

## Kept in the installer

Every module that `out/main` or `out/preload` requires at runtime is still packaged:

`@electron-toolkit/utils`, `@xhayper/discord-rpc`, `axios`, `cheerio`, `electron-localshortcut`,
`electron-log`, `electron-store`, `electron-updater`, `fuse.js`, `i18next`, `kuroshiro`,
`kuroshiro-analyzer-kuromoji`, `kuromoji` (with its dictionaries), `lodash`, `mpris-service`,
`music-metadata`, `node-mpv`, `semver`, `taglib-wasm`, `validate-color`, `ws`, `zod`, plus their
transitive dependencies and every native/wasm asset they need.

## Before adding a package back

If main-process code starts requiring one of the excluded packages, either import it from a
module that is already bundled or remove that package's `!**/node_modules/<name>/**` line from
`files` in `electron-builder.yml`. Renderer-only additions do not need any change.

## Updater note

The package contents did not change how updates work. Differential updates compare the new
installer against the published blockmap (`KTM-1.17.1-win-x64.exe.blockmap`), so only changed
blocks are downloaded even though the installed payload is smaller.
