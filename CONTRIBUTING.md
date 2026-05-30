# Contributing

## Install And Run

```bash
npm install
npm run dev
```

## Browser Visual Checks

Run the Playwright visual smoke tests against the browser harness:

```bash
npm run test:visual
```

Use `npm run test:visual:headed` for interactive inspection. If Playwright
browser binaries are missing on a fresh machine, install Chromium once:

```bash
npx playwright install chromium
```

For manual exploratory checks, run `npm run dev:browser` and open the printed
`browser-harness.html` URL. The harness installs a typed mock preload API and
seeds sample boards and projects when the browser IndexedDB vault is empty, so
pages such as Boards and Projects have realistic filter data available.

## Verify

```bash
npm run typecheck
npm run test:visual
npm run build
```

## Development Data

`npm run dev` uses a separate Electron app data profile named
`ESP Board Vault Dev`. This keeps development runs from changing a user's
packaged app data.

The development renderer runs from `http://127.0.0.1:5173`, while the packaged
app runs from `file://...`. Chromium stores IndexedDB separately for those
origins, so pointing dev mode at the same app data folder as the packaged app
will not show the same inventory.

To test with realistic data:

1. Open the packaged app.
2. Export a backup.
3. Start `npm run dev`.
4. Import the backup into the dev app.

## Main Stack

- Electron
- Vue 3
- TypeScript
- Vite
- Vuetify
- Pinia
- Dexie and IndexedDB
- `tasmota-webserial-esptool`
