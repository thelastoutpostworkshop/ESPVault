# ESP Vault

ESP Vault is a local desktop inventory for ESP32 makers. It helps you keep
track of boards, hardware details, projects, firmware notes, physical locations,
and recovery information without using a cloud service.

The app is designed for the common maker problem: months later, you can answer
"what is this board, where is it used, what firmware did I put on it, and how do
I get it working again?"

## What You Can Do

- Keep a local inventory of ESP boards.
- Scan connected ESP boards over Web Serial.
- Detect board metadata such as chip model, revision, MAC address, flash size,
  flash chip details, PSRAM when available, security flags, and bootloader
  offset.
- Scan more than one selected serial port in sequence.
- Copy the scan log when you need to paste diagnostics elsewhere.
- Save detected boards into the vault or update an existing saved board.
- Group boards into projects.
- Assign and remove boards from a project from either the board editor or the
  project view.
- See project health, assigned boards, board status, hardware metadata, and
  locations in one place.
- Export a local backup and import it later.
- View and change the app data location from Settings.
- Reset the remembered app window size from Settings.

## Boards

The Boards view is the main inventory table. It shows the board name, status,
chip, MAC address, flash, PSRAM, location, and last update time.

Each board can store:

- name and notes
- status
- chip and revision
- MAC address
- flash size and flash chip ID
- PSRAM state
- security information
- bootloader offset
- physical location
- project assignment
- purchase or manufacturer details

## Scanning Boards

The Scan board view uses Web Serial and `tasmota-webserial-esptool` to connect
to ESP boards in bootloader mode. Scanning is read-only: it does not flash,
erase, or modify the board.

The scan flow can detect:

- chip model and revision
- MAC address, including eFuse fallback when supported
- flash size and flash chip details
- PSRAM from eFuse metadata when available
- crystal frequency when supported
- secure boot and flash encryption state
- bootloader offset

If multiple boards are connected, the app lets you select the serial ports to
scan. The scan log autoscrolls and can be copied.

## Projects

Projects group related boards together. Use them for installed devices,
experiments, customer builds, home automation nodes, test rigs, or any hardware
set that should be remembered as one unit.

The Projects view shows:

- project status
- assigned board count
- project health
- assigned boards with MAC, chip, flash, PSRAM, status, and location
- quick open actions for board records
- controls to assign or remove boards from the current project

Deleting a project does not delete its boards. It only clears their project
assignment.

## Backups And Local Data

ESP Board Vault is local-first. There are no accounts, cloud sync, telemetry,
payments, or hosted services.

Settings includes tools to:

- export a backup
- import a backup
- see the current app data location
- move the app data location
- reset the remembered window size

Changing the app data location moves the Electron app data needed by the vault,
not just a single plain database file.

## Privacy

Your inventory stays on your machine. Serial scans, board metadata, backups, and
project notes remain local unless you explicitly export or share them.

## For Contributors

Install and run:

```bash
npm install
npm run dev
```

Verify:

```bash
npm run typecheck
npm run build
```

Main stack:

- Electron
- Vue 3
- TypeScript
- Vite
- Vuetify
- Pinia
- Dexie and IndexedDB
- `tasmota-webserial-esptool`
