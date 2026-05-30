# AGENTS.md - ESP Board Vault

## Project Overview

ESP Board Vault is a free, local-first desktop application for ESP32 makers.
It is a smart local notebook for remembering ESP32 boards, firmware, projects,
hardware capabilities, notes, and physical locations.

The first version is a standalone Electron desktop app built from a Vue 3 web app.
There is no hosted backend, no user accounts, no cloud sync, no payment system,
and no telemetry.

## Working Preferences

Always include a short commit comment suggestion in the final response.

For browser-based visual checks of the Vue renderer, use local Playwright
against the browser harness. Do not rely on the Codex in-app browser backend
for this repo's visual testing path.

```bash
npm run test:visual
```

Use `npm run test:visual:headed` when interactive inspection is useful. For
manual exploratory checks, run `npm run dev:browser` and open the printed
`browser-harness.html` URL. The harness provides a typed mock preload API and
seeds sample boards and projects in browser IndexedDB when empty, which lets
renderer pages be inspected without Electron.

## UI Style Guidelines

Keep the interface colorful, modern, and professional for ESP32 makers. The app
should feel like a focused electronics workbench: technical, clean, and useful,
without looking childish or like a marketing landing page.

Use the existing Vuetify theme system and shared renderer styles before adding
one-off visual rules. Preserve both light and dark mode support when changing
colors, surfaces, borders, shadows, chips, tables, cards, or empty states. Avoid
hard-coded light-only colors in page-scoped styles; prefer Vuetify theme tokens
and shared CSS variables from `src/renderer/styles.css`.

Use consistent 8px rounded corners, subtle shadows, clear section spacing, and
theme-aware borders. Cards should be used for real panels, repeated items, and
tools, not as nested decoration. Keep operational pages dense enough for repeat
use while still readable.

Use icons for navigation, actions, tool cards, status chips, and empty states.
Status chips should remain color-coded and easy to scan. Empty states should
explain the next useful action and include a clear call to action when one is
available.

Prefer list/detail layouts for inventory management pages where records need a
selected detail view. The Projects and Boards pages establish the current
pattern: a selectable list on the left and a detailed record view on the right,
collapsing responsively on smaller screens.

Tools and external resources should be presented as curated in-app pages when
they need descriptions or context. External links must continue to open through
the typed preload API, not direct renderer Node.js or raw IPC.

## Technical Stack

Use Electron, Vue 3, TypeScript, Vite, Vuetify 3, Pinia, Dexie, and
IndexedDB. Use `tasmota-webserial-esptool` for ESP board scanning through Web
Serial.
https://github.com/Jason2866/WebSerial_ESPTool/tree/development

Use Dexie from the Vue renderer for structured local data. The renderer must
not use Node.js APIs directly. It communicates with the main process only for
privileged operations through a typed preload API exposed with `contextBridge`.

## Architecture

```text
Vue Renderer
  -> Pinia stores
  -> Repository interfaces
  -> Storage implementation
     -> Dexie / IndexedDB for structured local data

Vue Renderer
  -> Preload API using contextBridge
  -> Electron IPC only for privileged operations
  -> Main Process Services for serial, files, export/import, and attachments
```

Structured local data belongs in the renderer storage layer. Electron main and
preload must not own board CRUD or other normal inventory CRUD unless the data
operation needs privileged OS access.

## Storage Abstraction

Keep storage replaceable. Vue pages and components must not import Dexie,
IndexedDB helpers, or concrete storage implementation files directly.

Use this dependency direction:

```text
Vue pages/components
  -> Pinia stores
  -> repository interfaces from src/renderer/repositories/
  -> implementation selected in src/renderer/repositories/index.ts
  -> concrete storage under src/renderer/storage/{provider}/
```

Current implementation:

```text
src/renderer/repositories/BoardRepository.ts
src/renderer/repositories/ProjectRepository.ts
src/renderer/repositories/BackupRepository.ts
src/renderer/repositories/index.ts
src/renderer/storage/dexie/DexieBoardRepository.ts
src/renderer/storage/dexie/DexieProjectRepository.ts
src/renderer/storage/dexie/DexieBackupRepository.ts
src/renderer/storage/dexie/vaultDatabase.ts
```

When adding new data areas such as projects, firmware history, attachments
metadata, pin assignments, or settings:

1. Define a storage-neutral repository interface in `src/renderer/repositories/`.
2. Implement it under `src/renderer/storage/dexie/`.
3. Wire it through `src/renderer/repositories/index.ts`.
4. Use the repository from Pinia stores.

To switch storage in the future, add a new implementation folder such as:

```text
src/renderer/storage/file/
src/renderer/storage/sqlite/
```

Then change only the implementation wiring in
`src/renderer/repositories/index.ts` where practical.

Do not leak provider-specific types from repository interfaces. Interfaces
should use shared domain types from `src/shared/types/`.

Keep service responsibilities clear:

```text
BoardRepository
ProjectRepository
BackupRepository
FirmwareHistoryRepository
AttachmentRepository
```

## ESP Board Scanning

Use `tasmota-webserial-esptool` for scan and detection flows. The package is
browser/WebSerial-based, so scan orchestration belongs in the renderer. Electron
main should only handle Web Serial permission and port selection through the
session Web Serial APIs.

Current scanner path:

```text
src/renderer/pages/ScanBoardPage.vue
src/renderer/services/espBoardScanner.ts
src/renderer/services/chipMetadata.ts
src/main/main.ts
```

The scan flow should read chip model, chip revision, MAC address, and flash
size when available. Do not flash firmware or erase devices from the scan flow.
Reset and disconnect after scanning where practical.

The scanner may load the `tasmota-webserial-esptool` stub for read-only
operations such as flash ID, flash size, security info, and register reads.
Do not call destructive stub operations such as erase or flash from scanning.

PSRAM and package metadata are detected from chip eFuse/register metadata in
`src/renderer/services/chipMetadata.ts` when available. This is read-only and
mainly detects embedded/in-package PSRAM; not every external PSRAM setup can be
guaranteed from this path. If `loader.macAddr()` returns an invalid MAC such as
`00:00:00:00:00:00`, fall back to the eFuse MAC reader where supported.

When more than one serial board is connected, the app should present a port
picker, default all ports to selected, and scan the selected ports sequentially.
The scan log should be copyable and should autoscroll to the latest message.

## Projects

Projects are first-class local records used to group boards that belong to the
same build, device, installation, or experiment. The Projects page should help
the user answer: which boards are part of this project, what state are they in,
where are they, and what metadata is needed to repair or reproduce the project
later.

Board assignment belongs on both sides of the workflow:

```text
Boards page/editor -> choose a project from a selector
Projects page -> assign or remove existing boards from the selected project
```

Deleting a project should clear board assignments but must not delete the
boards themselves.

## Electron Security Requirements

Use secure Electron defaults:

```ts
nodeIntegration: false
contextIsolation: true
sandbox: true
webSecurity: true
```

Do not expose raw IPC to the renderer. Do not use `remote`, insecure browser
flags, remote app content, telemetry, analytics, or tracking.

## Local Data Storage

Store all app data locally under Electron `app.getPath("userData")`:

```text
userData/
  esp-board-vault/
    database/
    attachments/
    exports/
    logs/
```

Create missing directories automatically. Never hard-code absolute user paths.

Do not change app identity casually. These values determine where Electron and
Chromium store user data and must remain stable across upgrades unless there is
an explicit migration plan:

```text
electron-builder appId: com.thelastoutpostworkshop.espboardvault
electron-builder productName: ESP Board Vault
app.setName("ESP Board Vault")
Dexie database name: esp-board-vault
```

The Settings page may let the user change the app data location. Be explicit in
the UI that this moves Electron app data needed by the vault, not just one
plain database file. Preserve window state across that move. The configured
location is read by the main process before `app.whenReady()` so Electron uses
the selected `userData` path.

Database backup and restore should use a structured JSON export/import through
the renderer repository layer. Importing a backup replaces local vault data only
after user confirmation.

## Database Requirements

Use Dexie schema versions for IndexedDB. The first useful schema must support
`boards`, `projects`, `board_tags`, `firmware_history`, `attachments`,
`pin_assignments`, and `app_settings`.

Do not use native database modules such as `better-sqlite3`, `sqlite3`, or
native LevelDB bindings.

Dexie-specific schema and table declarations belong under
`src/renderer/storage/dexie/`. Repository interfaces must stay Dexie-free.

Whenever adding a new Dexie schema version, add or update migration tests that
open every supported historical schema version and verify it normalizes into
the current schema. Keep these tests near the Dexie repository tests, currently
`src/renderer/storage/dexie/dexieRepositories.test.ts`.

Binary files such as photos, firmware files, and backups must not be stored
directly in IndexedDB for the MVP. Store metadata in Dexie and copy the actual
files into Electron `userData` through the main process.

Board status values:

```text
available
in_use
needs_flashing
broken
archived
unknown
```

## Definition of Done

A task is done only when the app builds, relevant UI works, data persists after
restart, TypeScript types are clean, the renderer does not access Node.js
directly, and no cloud/backend/payment/telemetry code was added.
