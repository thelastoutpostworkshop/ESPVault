import { afterEach, describe, expect, it, vi } from "vitest";

const connectWithPortMock = vi.hoisted(() => vi.fn());
const formatMacAddrMock = vi.hoisted(() =>
  vi.fn((bytes: number[]) =>
    bytes.map((byte) => byte.toString(16).padStart(2, "0")).join(":")
  )
);

vi.mock("tasmota-webserial-esptool", () => ({
  CHIP_FAMILY_ESP32: 0,
  CHIP_FAMILY_ESP32C3: 5,
  CHIP_FAMILY_ESP32C5: 6,
  CHIP_FAMILY_ESP32S2: 2,
  CHIP_FAMILY_ESP32S3: 9,
  connectWithPort: connectWithPortMock,
  formatMacAddr: formatMacAddrMock
}));

import { scanEspBoards } from "./espBoardScanner";

const ESP32S3_EFUSE_BASE = 0x60007000;
const ESP32S3_MAC_EFUSE_REG = ESP32S3_EFUSE_BASE + 0x044;
const ESP32S3_EFUSE_BLOCK1_ADDR = ESP32S3_EFUSE_BASE + 0x044;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("ESP board scanner", () => {
  it("scans selected ports sequentially and maps read-only loader data", async () => {
    const failingPort = { id: "port-a" };
    const workingPort = { id: "port-b" };
    const requestPort = vi.fn().mockResolvedValueOnce(failingPort);
    const getPorts = vi.fn().mockResolvedValue([failingPort, workingPort]);
    const { bootloaderLoader, scanLoader } = createSuccessfulLoader();
    const logs: string[] = [];

    vi.stubGlobal("navigator", {
      serial: { requestPort, getPorts }
    });
    vi.stubGlobal("window", {
      api: {
        serial: {
          getLastSelection: vi.fn(async () => ({
            availableCount: 2,
            selectedCount: 2,
            selectedPorts: [
              { usbProductId: null, usbVendorId: null },
              { usbProductId: null, usbVendorId: null }
            ]
          })),
          getLastSelectionCount: vi.fn(async () => 2)
        }
      }
    });
    connectWithPortMock.mockImplementation(async (port: unknown) => {
      if (port === failingPort) {
        throw new Error("port busy");
      }

      return bootloaderLoader;
    });

    const boards = await scanEspBoards((level, message) => {
      logs.push(`${level}:${message}`);
    });

    expect(requestPort).toHaveBeenCalledTimes(1);
    expect(getPorts).toHaveBeenCalledOnce();
    expect(connectWithPortMock).toHaveBeenCalledTimes(2);
    expect(logs).toContain("log:Scanning selected serial port 1 of 2.");
    expect(logs).toContain(
      "error:Selected serial port 1 scan failed: port busy"
    );
    expect(bootloaderLoader.initialize).toHaveBeenCalledOnce();
    expect(bootloaderLoader.runStub).toHaveBeenCalledOnce();
    expect(scanLoader.detectFlashSize).toHaveBeenCalledOnce();
    expect(scanLoader.hardReset).toHaveBeenCalledWith(false);
    expect(scanLoader.disconnect).toHaveBeenCalledOnce();
    expect(scanLoader.eraseFlash).not.toHaveBeenCalled();
    expect(scanLoader.writeFlash).not.toHaveBeenCalled();

    expect(boards).toHaveLength(1);
    expect(boards[0]).toMatchObject({
      chipModel: "ESP32-S3",
      chipRevision: 1,
      chipVariant: "ESP32-S3 (QFN56)",
      chipFamily: 9,
      chipFamilyHex: "0x00000009",
      macAddress: "98:a3:16:d8:26:2c",
      flashSizeBytes: 16 * 1024 * 1024,
      flashSizeLabel: "16MB",
      flashChipId: 0x1840ef,
      flashChipIdHex: "0x1840EF",
      flashManufacturerId: 0xef,
      flashManufacturerIdHex: "0xEF",
      flashManufacturerName: "Winbond",
      flashDeviceId: 0x1840,
      flashDeviceIdHex: "0x1840",
      psramSizeBytes: 8 * 1024 * 1024,
      psramDetected: true,
      crystalFrequency: "40 MHz",
      securityFlags: 1,
      securityFlagsHex: "0x00000001",
      flashCryptCnt: 1,
      flashCryptCntHex: "0x01",
      securityKeyPurposes: [4],
      securityChipId: 9,
      securityApiVersion: 1,
      secureBootEnabled: true,
      flashEncryptionEnabled: true,
      bootloaderOffset: 0,
      bootloaderOffsetHex: "0x00000000",
      partitionTableOffset: 0x8000,
      partitionTableOffsetHex: "0x00008000",
      partitionTableReadError: null
    });
    expect(boards[0].partitions).toEqual([
      {
        label: "app0",
        type: 0,
        typeHex: "0x00",
        subtype: 0x10,
        subtypeHex: "0x10",
        offset: 0x10000,
        offsetHex: "0x00010000",
        sizeBytes: 0x140000,
        sizeHex: "0x00140000",
        flags: 0,
        flagsHex: "0x00000000",
        filesystem: null
      }
    ]);
    expect(boards[0].logs.length).toBeGreaterThan(0);
  });

  it("rejects when Web Serial is unavailable", async () => {
    vi.stubGlobal("navigator", {});

    await expect(scanEspBoards()).rejects.toThrow("Web Serial is not available");
  });

  it("closes a partially opened serial port when connection fails", async () => {
    const close = vi.fn(async () => undefined);
    const failingPort = {
      close,
      id: "port-a",
      readable: {},
      writable: null
    };
    const requestPort = vi.fn().mockResolvedValueOnce(failingPort);

    vi.stubGlobal("navigator", {
      serial: { requestPort }
    });
    vi.stubGlobal("window", {
      api: {
        serial: {
          getLastSelection: vi.fn(async () => ({
            availableCount: 1,
            selectedCount: 1,
            selectedPorts: [{ usbProductId: null, usbVendorId: null }]
          })),
          getLastSelectionCount: vi.fn(async () => 1)
        }
      }
    });
    connectWithPortMock.mockRejectedValueOnce(new Error("open failed"));

    await expect(scanEspBoards()).rejects.toThrow(
      "No selected boards could be scanned"
    );

    expect(close).toHaveBeenCalledOnce();
  });

  it("returns scan data when serial disconnect cleanup stalls", async () => {
    vi.useFakeTimers();

    const port = { id: "port-a" };
    const requestPort = vi.fn().mockResolvedValueOnce(port);
    const { bootloaderLoader, scanLoader } = createSuccessfulLoader();
    const logs: string[] = [];
    let resolveDisconnectStarted: () => void = () => undefined;
    const disconnectStarted = new Promise<void>((resolve) => {
      resolveDisconnectStarted = resolve;
    });
    const disconnect = vi.fn(() => {
      resolveDisconnectStarted();
      return new Promise<void>(() => undefined);
    });

    scanLoader.disconnect = disconnect;
    vi.stubGlobal("navigator", {
      serial: { requestPort }
    });
    vi.stubGlobal("window", {
      api: {
        serial: {
          getLastSelection: vi.fn(async () => ({
            availableCount: 1,
            selectedCount: 1,
            selectedPorts: [{ usbProductId: null, usbVendorId: null }]
          })),
          getLastSelectionCount: vi.fn(async () => 1)
        }
      }
    });
    connectWithPortMock.mockResolvedValueOnce(bootloaderLoader);

    const scanPromise = scanEspBoards((level, message) => {
      logs.push(`${level}:${message}`);
    });
    await disconnectStarted;
    await vi.advanceTimersByTimeAsync(3000);

    const boards = await scanPromise;

    expect(boards).toHaveLength(1);
    expect(disconnect).toHaveBeenCalledOnce();
    expect(logs).toContain(
      "error:Serial port cleanup timed out after 3 seconds; scan data was retained. If the port remains busy, unplug and reconnect the board."
    );
  });
});

function createSuccessfulLoader(): {
  bootloaderLoader: Record<string, unknown>;
  scanLoader: Record<string, unknown>;
} {
  const registerValues = new Map<number, number>([
    [ESP32S3_MAC_EFUSE_REG, 0x16d8262c],
    [ESP32S3_MAC_EFUSE_REG + 4, 0x000098a3],
    [ESP32S3_EFUSE_BLOCK1_ADDR + 4 * 3, 2 << 27],
    [
      ESP32S3_EFUSE_BLOCK1_ADDR + 4 * 4,
      2 | (1 << 3) | (1 << 7)
    ]
  ]);
  const flashChunks = new Map<number, Uint8Array>([
    [0x8000, createPartitionEntry("app0", 0x00, 0x10, 0x10000, 0x140000)],
    [0x8020, createEndEntry()]
  ]);
  const scanLoader = {
    chipName: "ESP32-S3",
    chipRevision: 1,
    chipVariant: null,
    flashSize: null as string | null,
    getChipFamily: vi.fn(() => 9),
    readRegister: vi.fn(async (address: number) => registerValues.get(address) ?? 0),
    flashId: vi.fn(async () => 0x1840ef),
    detectFlashSize: vi.fn(async () => {
      scanLoader.flashSize = "16MB";
    }),
    getSecurityInfo: vi.fn(async () => ({
      flags: 1,
      flashCryptCnt: 1,
      keyPurposes: [4],
      chipId: 9,
      apiVersion: 1
    })),
    getBootloaderOffset: vi.fn(() => 0),
    readFlash: vi.fn(async (address: number) => {
      const chunk = flashChunks.get(address);
      if (!chunk) {
        throw new Error(`Unexpected read at 0x${address.toString(16)}`);
      }

      return chunk;
    }),
    hardReset: vi.fn(async () => undefined),
    disconnect: vi.fn(async () => undefined),
    eraseFlash: vi.fn(),
    writeFlash: vi.fn()
  };
  const bootloaderLoader = {
    initialize: vi.fn(async () => undefined),
    macAddr: vi.fn(() => [0, 0, 0, 0, 0, 0]),
    runStub: vi.fn(async () => scanLoader)
  };

  return { bootloaderLoader, scanLoader };
}

function createPartitionEntry(
  label: string,
  type: number,
  subtype: number,
  offset: number,
  sizeBytes: number
): Uint8Array {
  const entry = new Uint8Array(32);
  const view = new DataView(entry.buffer);
  view.setUint16(0, 0x50aa, true);
  view.setUint8(2, type);
  view.setUint8(3, subtype);
  view.setUint32(4, offset, true);
  view.setUint32(8, sizeBytes, true);
  view.setUint32(28, 0, true);
  entry.set(new TextEncoder().encode(label).slice(0, 16), 12);

  return entry;
}

function createEndEntry(): Uint8Array {
  const entry = new Uint8Array(32);
  new DataView(entry.buffer).setUint16(0, 0xffff, true);
  return entry;
}
