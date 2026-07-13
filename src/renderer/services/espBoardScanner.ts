import {
  CHIP_FAMILY_ESP32C5,
  connectWithPort,
  formatMacAddr,
  type ESPLoader,
  type Logger
} from "tasmota-webserial-esptool";
import type { DetectedEspBoard } from "../../shared/types/serial";
import type {
  SerialPortSelection,
  SerialPortSelectionPort
} from "../../shared/types/api";
import { loadReservedSerialPortNames } from "./reservedSerialPorts";
import { readChipMetadata, type ChipMetadata } from "./chipMetadata";
import { readBoardPartitionTable } from "./espPartitionScanner";

type ScannerLogLevel = "log" | "debug" | "error";

interface FlashChipInfo {
  flashChipId: number | null;
  flashChipIdHex: string | null;
  flashManufacturerId: number | null;
  flashManufacturerIdHex: string | null;
  flashManufacturerName: string | null;
  flashDeviceId: number | null;
  flashDeviceIdHex: string | null;
}

interface FlashSizeInfo {
  flashSizeBytes: number | null;
  flashSizeLabel: string | null;
}

interface SecurityInfo {
  securityFlags: number | null;
  securityFlagsHex: string | null;
  flashCryptCnt: number | null;
  flashCryptCntHex: string | null;
  securityKeyPurposes: number[] | null;
  securityChipId: number | null;
  securityApiVersion: number | null;
  secureBootEnabled: boolean | null;
  flashEncryptionEnabled: boolean | null;
}

const FLASH_MANUFACTURER_NAMES: Record<number, string> = {
  0x1c: "Eon",
  0x20: "Micron",
  0x68: "Boya",
  0x85: "Puya",
  0x9d: "ISSI",
  0xbf: "SST",
  0xc2: "Macronix",
  0xc8: "GigaDevice",
  0xcd: "TH",
  0xe0: "XMC",
  0xef: "Winbond"
};

const DETECTED_FLASH_SIZE_LABELS: Record<number, string> = {
  0x12: "256KB",
  0x13: "512KB",
  0x14: "1MB",
  0x15: "2MB",
  0x16: "4MB",
  0x17: "8MB",
  0x18: "16MB",
  0x19: "32MB",
  0x1a: "64MB",
  0x1b: "128MB",
  0x1c: "256MB",
  0x20: "64MB",
  0x21: "128MB",
  0x22: "256MB",
  0x32: "256KB",
  0x33: "512KB",
  0x34: "1MB",
  0x35: "2MB",
  0x36: "4MB",
  0x37: "8MB",
  0x38: "16MB",
  0x39: "32MB",
  0x3a: "64MB"
};
const DISCONNECT_AFTER_SCAN_TIMEOUT_MS = 3000;
const OPERATION_TIMED_OUT = Symbol("operation timed out");

export async function scanEspBoard(
  onLog?: (level: ScannerLogLevel, message: string) => void
): Promise<DetectedEspBoard> {
  const boards = await scanEspBoards(onLog);
  return boards[0];
}

export async function scanEspBoards(
  onLog?: (level: ScannerLogLevel, message: string) => void
): Promise<DetectedEspBoard[]> {
  if (!("serial" in navigator)) {
    throw new Error(
      "Web Serial is not available. Use the Electron desktop app or a Chromium browser."
    );
  }

  const ports = await requestSelectedSerialPorts(onLog);
  const detectedBoards: DetectedEspBoard[] = [];

  for (const [index, port] of ports.entries()) {
    onLog?.("log", `Scanning selected serial port ${index + 1} of ${ports.length}.`);

    try {
      detectedBoards.push(await scanEspBoardFromPort(port, onLog));
    } catch (error) {
      onLog?.(
        "error",
        `Selected serial port ${index + 1} scan failed: ${getErrorMessage(error)}`
      );
    }
  }

  if (!detectedBoards.length) {
    throw new Error("No selected boards could be scanned.");
  }

  return detectedBoards;
}

async function requestSelectedSerialPorts(
  onLog?: (level: ScannerLogLevel, message: string) => void
): Promise<SerialPort[]> {
  await configureReservedSerialPorts(onLog);
  const firstPort = await navigator.serial.requestPort();
  const selection = await getLastSerialSelection();
  const selectionCount = selection.selectedCount || 1;

  if (selectionCount <= 1) {
    return [firstPort];
  }

  const grantedPorts = dedupeSerialPorts(await navigator.serial.getPorts());
  const selectedPorts = selectRequestedSerialPorts(
    firstPort,
    grantedPorts,
    selection
  );

  if (selectedPorts.length < selectionCount) {
    onLog?.(
      "error",
      `Only ${selectedPorts.length} of ${selectionCount} selected serial ports were made available by Web Serial.`
    );
  }

  return selectedPorts;
}

async function configureReservedSerialPorts(
  onLog?: (level: ScannerLogLevel, message: string) => void
): Promise<void> {
  try {
    const reservedPortNames = await loadReservedSerialPortNames();
    await window.api.serial.setReservedPortNames(reservedPortNames);

    if (reservedPortNames.length) {
      onLog?.("log", `${reservedPortNames.length} reserved serial port(s) will start unchecked.`);
    }
  } catch {
    onLog?.("debug", "Reserved serial ports could not be loaded; using default selection.");
  }
}

function dedupeSerialPorts(ports: SerialPort[]): SerialPort[] {
  return ports.filter((port, index) => ports.indexOf(port) === index);
}

function selectRequestedSerialPorts(
  firstPort: SerialPort,
  grantedPorts: SerialPort[],
  selection: SerialPortSelection
): SerialPort[] {
  if (
    selection.availableCount > 0 &&
    selection.selectedCount === selection.availableCount &&
    grantedPorts.length >= selection.selectedCount
  ) {
    return grantedPorts.slice(0, selection.selectedCount);
  }

  const matchedPorts = matchSelectedSerialPorts(grantedPorts, selection);
  return dedupeSerialPorts([firstPort, ...matchedPorts]).slice(
    0,
    selection.selectedCount || 1
  );
}

function matchSelectedSerialPorts(
  ports: SerialPort[],
  selection: SerialPortSelection
): SerialPort[] {
  const remainingSelectionCounts = new Map<string, number>();

  for (const selectedPort of selection.selectedPorts) {
    const key = getSerialPortSelectionKey(selectedPort);
    if (key) {
      remainingSelectionCounts.set(
        key,
        (remainingSelectionCounts.get(key) ?? 0) + 1
      );
    }
  }

  const matchedPorts: SerialPort[] = [];

  for (const port of ports) {
    const key = getSerialPortInfoKey(port.getInfo());
    const remainingCount = key ? remainingSelectionCounts.get(key) ?? 0 : 0;

    if (!key || remainingCount <= 0) {
      continue;
    }

    matchedPorts.push(port);
    remainingSelectionCounts.set(key, remainingCount - 1);
  }

  return matchedPorts;
}

function getSerialPortSelectionKey(port: SerialPortSelectionPort): string | null {
  return getUsbSerialPortKey(port.usbVendorId, port.usbProductId);
}

function getSerialPortInfoKey(portInfo: SerialPortInfo): string | null {
  return getUsbSerialPortKey(portInfo.usbVendorId ?? null, portInfo.usbProductId ?? null);
}

function getUsbSerialPortKey(
  usbVendorId: number | null,
  usbProductId: number | null
): string | null {
  if (usbVendorId === null && usbProductId === null) {
    return null;
  }

  return `${usbVendorId ?? ""}:${usbProductId ?? ""}`;
}

async function getLastSerialSelection(): Promise<SerialPortSelection> {
  try {
    return normalizeSerialPortSelection(await window.api.serial.getLastSelection());
  } catch {
    return {
      availableCount: 0,
      selectedCount: await getLastSerialSelectionCount(),
      selectedPorts: []
    };
  }
}

function normalizeSerialPortSelection(
  selection: SerialPortSelection
): SerialPortSelection {
  return {
    availableCount: normalizeCount(selection.availableCount),
    selectedCount: normalizeCount(selection.selectedCount),
    selectedPorts: Array.isArray(selection.selectedPorts)
      ? selection.selectedPorts.map((port) => ({
          usbProductId: normalizeUsbId(port.usbProductId),
          usbVendorId: normalizeUsbId(port.usbVendorId)
        }))
      : []
  };
}

function normalizeCount(value: number): number {
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function normalizeUsbId(value: number | null): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

async function getLastSerialSelectionCount(): Promise<number> {
  try {
    const count = await window.api.serial.getLastSelectionCount();
    return Number.isInteger(count) && count > 0 ? count : 1;
  } catch {
    return 1;
  }
}

async function scanEspBoardFromPort(
  port: SerialPort,
  onLog?: (level: ScannerLogLevel, message: string) => void
): Promise<DetectedEspBoard> {
  const logs: string[] = [];
  const logger = createLogger(logs, onLog);
  let loader: ESPLoader | null = null;

  try {
    loader = await connectWithPort(port, logger);
    await loader.initialize();
    const bootloaderMacAddress = readMacAddress(loader, logger);

    const scanLoader = await runStubForFlashMetadata(loader, logger);
    loader = scanLoader;

    const chipFamily = readChipFamily(loader, logger);
    const chipMetadata = await readChipMetadata(loader, chipFamily, logger);
    const flashChipInfo = await readFlashChipInfo(loader, logger);
    const flashSizeInfo = await readFlashSize(
      loader,
      flashChipInfo.flashChipId,
      logger
    );
    const crystalFrequency =
      chipMetadata.crystalFrequency ??
      (await readCrystalFrequency(loader, chipFamily, logger));
    const bootloaderOffset = readBootloaderOffset(loader, logger);
    const securityInfo = await readSecurityInfo(loader, logger);
    const partitionTableInfo = await readBoardPartitionTable(loader, logger);
    logChipMetadata(chipMetadata, logger);

    return {
      chipModel: loader.chipName,
      chipRevision: loader.chipRevision,
      chipVariant: chipMetadata.chipVariant ?? loader.chipVariant,
      chipFamily,
      chipFamilyHex: formatHex(chipFamily, 4),
      macAddress: selectMacAddress(bootloaderMacAddress, chipMetadata.macAddress),
      ...flashSizeInfo,
      ...flashChipInfo,
      psramSizeBytes: chipMetadata.psramSizeBytes,
      psramDetected: chipMetadata.psramDetected,
      crystalFrequency,
      ...securityInfo,
      bootloaderOffset,
      bootloaderOffsetHex: formatHex(bootloaderOffset, 4),
      ...partitionTableInfo,
      detectedAt: new Date().toISOString(),
      logs
    };
  } finally {
    if (loader) {
      await resetAndDisconnect(loader, logger);
    } else {
      await closeSerialPort(port, logger);
    }
  }
}

async function runStubForFlashMetadata(
  loader: ESPLoader,
  logger: Logger
): Promise<ESPLoader> {
  try {
    return await loader.runStub();
  } catch (error) {
    logger.error(
      `Stub loader unavailable; flash metadata may be incomplete: ${getErrorMessage(error)}`
    );
    return loader;
  }
}

async function readFlashSize(
  loader: ESPLoader,
  flashChipId: number | null,
  logger: Logger
): Promise<FlashSizeInfo> {
  let flashSizeLabel = normalizeFlashSizeLabel(loader.flashSize);

  if (!flashSizeLabel) {
    try {
      await loader.detectFlashSize();
      flashSizeLabel = normalizeFlashSizeLabel(loader.flashSize);
    } catch (error) {
      logger.error(`Flash size detection failed: ${getErrorMessage(error)}`);
    }
  }

  if (!flashSizeLabel) {
    flashSizeLabel = inferFlashSizeLabelFromFlashId(flashChipId);

    if (flashSizeLabel) {
      logger.log(`Flash size inferred from flash ID: ${flashSizeLabel}`);
    }
  }

  return {
    flashSizeBytes: parseFlashSize(flashSizeLabel),
    flashSizeLabel
  };
}

function createLogger(
  logs: string[],
  onLog?: (level: ScannerLogLevel, message: string) => void
): Logger {
  const write = (level: ScannerLogLevel, message: string, args: unknown[]) => {
    const rendered = [message, ...args.map(String)].join(" ");
    logs.push(rendered);
    onLog?.(level, rendered);
  };

  return {
    log: (message, ...args) => write("log", message, args),
    debug: (message, ...args) => write("debug", message, args),
    error: (message, ...args) => write("error", message, args)
  };
}

function readMacAddress(loader: ESPLoader, logger: Logger): string | null {
  try {
    const macAddress = formatMacAddr(loader.macAddr().map(Number));
    if (!isValidMacAddress(macAddress)) {
      logger.debug(`MAC address read returned invalid value: ${macAddress}`);
      return null;
    }

    return macAddress;
  } catch (error) {
    logger.error(`MAC address read failed: ${getErrorMessage(error)}`);
    return null;
  }
}

function selectMacAddress(
  bootloaderMacAddress: string | null,
  efuseMacAddress: string | null
): string | null {
  return isValidMacAddress(bootloaderMacAddress)
    ? bootloaderMacAddress
    : efuseMacAddress;
}

function readChipFamily(loader: ESPLoader, logger: Logger): number | null {
  try {
    return loader.getChipFamily();
  } catch (error) {
    logger.debug(`Chip family read failed: ${getErrorMessage(error)}`);
    return null;
  }
}

async function readFlashChipInfo(
  loader: ESPLoader,
  logger: Logger
): Promise<FlashChipInfo> {
  try {
    const flashChipId = await loader.flashId();
    if (!isValidFlashChipId(flashChipId)) {
      logger.debug(`Flash chip ID read returned invalid value: ${formatHex(flashChipId, 3)}`);
      return emptyFlashChipInfo();
    }

    const flashManufacturerId = flashChipId & 0xff;
    const flashDeviceId = (flashChipId >> 8) & 0xffff;

    return {
      flashChipId,
      flashChipIdHex: formatHex(flashChipId, 3),
      flashManufacturerId,
      flashManufacturerIdHex: formatHex(flashManufacturerId, 1),
      flashManufacturerName: FLASH_MANUFACTURER_NAMES[flashManufacturerId] ?? null,
      flashDeviceId,
      flashDeviceIdHex: formatHex(flashDeviceId, 2)
    };
  } catch (error) {
    logger.error(`Flash chip ID read failed: ${getErrorMessage(error)}`);
    return emptyFlashChipInfo();
  }
}

async function readSecurityInfo(
  loader: ESPLoader,
  logger: Logger
): Promise<SecurityInfo> {
  try {
    const securityInfo = await loader.getSecurityInfo();

    return {
      securityFlags: securityInfo.flags,
      securityFlagsHex: formatHex(securityInfo.flags, 4),
      flashCryptCnt: securityInfo.flashCryptCnt,
      flashCryptCntHex: formatHex(securityInfo.flashCryptCnt, 1),
      securityKeyPurposes: securityInfo.keyPurposes,
      securityChipId: securityInfo.chipId,
      securityApiVersion: securityInfo.apiVersion,
      secureBootEnabled: (securityInfo.flags & 0x01) !== 0,
      flashEncryptionEnabled: hasOddBitCount(securityInfo.flashCryptCnt)
    };
  } catch (error) {
    logger.debug(`Security info read unavailable: ${getErrorMessage(error)}`);
    return emptySecurityInfo();
  }
}

async function readCrystalFrequency(
  loader: ESPLoader,
  chipFamily: number | null,
  logger: Logger
): Promise<string | null> {
  if (chipFamily !== CHIP_FAMILY_ESP32C5) {
    return null;
  }

  try {
    const frequency = await loader.getC5CrystalFreqDetected();
    return `${frequency} MHz`;
  } catch (error) {
    logger.debug(`Crystal frequency read failed: ${getErrorMessage(error)}`);
    return null;
  }
}

function readBootloaderOffset(loader: ESPLoader, logger: Logger): number | null {
  try {
    return loader.getBootloaderOffset();
  } catch (error) {
    logger.debug(`Bootloader offset read failed: ${getErrorMessage(error)}`);
    return null;
  }
}

function logChipMetadata(metadata: ChipMetadata, logger: Logger): void {
  if (metadata.chipVariant) {
    logger.log(`Chip variant: ${metadata.chipVariant}`);
  }

  if (metadata.macAddress) {
    logger.log(`MAC address from eFuse: ${metadata.macAddress}`);
  }

  if (metadata.embeddedFlashSizeBytes !== null) {
    logger.log(
      `Embedded flash from eFuse: ${formatBytes(metadata.embeddedFlashSizeBytes)}${
        metadata.embeddedFlashVendor ? ` (${metadata.embeddedFlashVendor})` : ""
      }`
    );
  }

  if (metadata.psramDetected === true) {
    logger.log(
      `PSRAM from eFuse: ${
        metadata.psramSizeBytes === null
          ? "detected"
          : formatBytes(metadata.psramSizeBytes)
      }${metadata.psramVendor ? ` (${metadata.psramVendor})` : ""}`
    );
  } else if (metadata.psramDetected === false) {
    logger.log("PSRAM from eFuse: not detected");
  }
}

function parseFlashSize(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const match = value.match(/^(\d+(?:\.\d+)?)\s*(KB|MB)$/i);
  if (!match) {
    return null;
  }

  const amount = Number(match[1]);
  const unit = match[2].toUpperCase();

  if (!Number.isFinite(amount)) {
    return null;
  }

  return Math.trunc(amount * (unit === "MB" ? 1024 * 1024 : 1024));
}

function normalizeFlashSizeLabel(value: string | null | undefined): string | null {
  const label = value?.trim();
  return label ? label : null;
}

function formatBytes(value: number): string {
  if (value < 1024 * 1024) {
    const kilobytes = value / 1024;
    return Number.isInteger(kilobytes)
      ? `${kilobytes} KB`
      : `${kilobytes.toFixed(1)} KB`;
  }

  const megabytes = value / 1024 / 1024;
  return Number.isInteger(megabytes)
    ? `${megabytes} MB`
    : `${megabytes.toFixed(1)} MB`;
}

function isValidMacAddress(value: string | null): boolean {
  const normalized = value?.trim().toUpperCase();
  return Boolean(
    normalized &&
      normalized !== "00:00:00:00:00:00" &&
      normalized !== "FF:FF:FF:FF:FF:FF"
  );
}

function inferFlashSizeLabelFromFlashId(flashChipId: number | null): string | null {
  if (flashChipId === null) {
    return null;
  }

  const capacityCode = (flashChipId >> 16) & 0xff;
  return DETECTED_FLASH_SIZE_LABELS[capacityCode] ?? null;
}

function isValidFlashChipId(value: number): boolean {
  return value !== 0 && value !== 0xffffff;
}

function emptyFlashChipInfo(): FlashChipInfo {
  return {
    flashChipId: null,
    flashChipIdHex: null,
    flashManufacturerId: null,
    flashManufacturerIdHex: null,
    flashManufacturerName: null,
    flashDeviceId: null,
    flashDeviceIdHex: null
  };
}

function emptySecurityInfo(): SecurityInfo {
  return {
    securityFlags: null,
    securityFlagsHex: null,
    flashCryptCnt: null,
    flashCryptCntHex: null,
    securityKeyPurposes: null,
    securityChipId: null,
    securityApiVersion: null,
    secureBootEnabled: null,
    flashEncryptionEnabled: null
  };
}

function formatHex(value: number | null, bytes: number): string | null {
  if (value === null) {
    return null;
  }

  return `0x${value.toString(16).toUpperCase().padStart(bytes * 2, "0")}`;
}

function hasOddBitCount(value: number): boolean {
  let remaining = value;
  let count = 0;

  while (remaining > 0) {
    count += remaining & 1;
    remaining >>= 1;
  }

  return count % 2 === 1;
}

async function resetAndDisconnect(loader: ESPLoader, logger: Logger): Promise<void> {
  try {
    await loader.hardReset(false);
  } catch (error) {
    logger.debug(`Reset after scan failed: ${getErrorMessage(error)}`);
  }

  try {
    const disconnectResult = await waitForOperationOrTimeout(
      loader.disconnect(),
      DISCONNECT_AFTER_SCAN_TIMEOUT_MS
    );

    if (disconnectResult === OPERATION_TIMED_OUT) {
      logger.error(
        `Serial port cleanup timed out after ${formatSeconds(
          DISCONNECT_AFTER_SCAN_TIMEOUT_MS
        )}; scan data was retained. If the port remains busy, unplug and reconnect the board.`
      );
    }
  } catch (error) {
    logger.debug(`Disconnect after scan failed: ${getErrorMessage(error)}`);
  }
}

async function closeSerialPort(port: SerialPort, logger: Logger): Promise<void> {
  if (!port.readable && !port.writable) {
    return;
  }

  try {
    await port.close();
  } catch (error) {
    logger.debug(`Close after failed scan failed: ${getErrorMessage(error)}`);
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function waitForOperationOrTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number
): Promise<T | typeof OPERATION_TIMED_OUT> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      operation,
      new Promise<typeof OPERATION_TIMED_OUT>((resolve) => {
        timeoutId = setTimeout(() => {
          resolve(OPERATION_TIMED_OUT);
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
  }
}

function formatSeconds(milliseconds: number): string {
  return `${milliseconds / 1000} seconds`;
}
