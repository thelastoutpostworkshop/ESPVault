# Contributing

## Install And Run

```bash
npm install
npm run dev
```

## Verify

```bash
npm run typecheck
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
