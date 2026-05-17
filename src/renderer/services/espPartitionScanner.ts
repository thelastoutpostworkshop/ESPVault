import type { ESPLoader, Logger } from "tasmota-webserial-esptool";
import type {
  BoardPartition,
  BoardPartitionFilesystem
} from "../../shared/types/partition";

export interface PartitionTableScanResult {
  partitions: BoardPartition[] | null;
  partitionTableOffset: number | null;
  partitionTableOffsetHex: string | null;
  partitionsDetectedAt: string | null;
  partitionTableReadError: string | null;
}

const PARTITION_ENTRY_MAGIC_LE = 0x50aa;
const DEFAULT_PARTITION_TABLE_OFFSET = 0x8000;
const PARTITION_ENTRY_SIZE = 32;
const PARTITION_TABLE_LENGTH = 0xc00;
const PARTITION_TABLE_MAX_ENTRIES = Math.trunc(
  PARTITION_TABLE_LENGTH / PARTITION_ENTRY_SIZE
);
const PARTITION_ALIGNMENT = 0x1000;
const PARTITION_TABLE_PROBE_OFFSETS = [
  0x8000,
  0x9000,
  0xa000,
  0xc000,
  0xd000,
  0xe000,
  0x10000
];

export async function readBoardPartitionTable(
  loader: ESPLoader,
  logger: Logger
): Promise<PartitionTableScanResult> {
  const detectedAt = new Date().toISOString();

  try {
    const detectedOffset = await probePartitionTableOffset(loader, logger);
    const tableOffset = detectedOffset ?? DEFAULT_PARTITION_TABLE_OFFSET;

    if (detectedOffset === null) {
      logger.debug(
        `Partition table probe did not find a plausible entry; trying default offset ${formatHex(
          DEFAULT_PARTITION_TABLE_OFFSET,
          4
        )}.`
      );
    }

    const partitions = await readPartitionTableEntries(loader, tableOffset, logger);

    if (partitions.length) {
      logger.log(
        `Partition table: ${partitions.length} entr${
          partitions.length === 1 ? "y" : "ies"
        } read at ${formatHex(tableOffset, 4)}.`
      );
    } else {
      logger.debug(`Partition table read at ${formatHex(tableOffset, 4)} returned no entries.`);
    }

    return {
      partitions,
      partitionTableOffset: tableOffset,
      partitionTableOffsetHex: formatHex(tableOffset, 4),
      partitionsDetectedAt: detectedAt,
      partitionTableReadError: null
    };
  } catch (error) {
    const message = getErrorMessage(error);
    logger.debug(`Partition table read failed: ${message}`);

    return {
      partitions: null,
      partitionTableOffset: null,
      partitionTableOffsetHex: null,
      partitionsDetectedAt: detectedAt,
      partitionTableReadError: message
    };
  }
}

async function probePartitionTableOffset(
  loader: ESPLoader,
  logger: Logger
): Promise<number | null> {
  for (const candidate of PARTITION_TABLE_PROBE_OFFSETS) {
    try {
      const data = await loader.readFlash(candidate, PARTITION_ENTRY_SIZE);
      if (hasPlausiblePartitionEntry(data)) {
        if (candidate !== DEFAULT_PARTITION_TABLE_OFFSET) {
          logger.log(`Partition table detected at ${formatHex(candidate, 4)}.`);
        }

        return candidate;
      }
    } catch {
      // Some boards reject reads at non-table offsets. Keep probing.
    }
  }

  return null;
}

async function readPartitionTableEntries(
  loader: ESPLoader,
  tableOffset: number,
  logger: Logger
): Promise<BoardPartition[]> {
  const partitions: BoardPartition[] = [];

  logger.debug(
    `Reading partition table entries at ${formatHex(
      tableOffset,
      4
    )} in ${PARTITION_ENTRY_SIZE}-byte chunks.`
  );

  for (let index = 0; index < PARTITION_TABLE_MAX_ENTRIES; index += 1) {
    const entryOffset = tableOffset + index * PARTITION_ENTRY_SIZE;
    const data = await loader.readFlash(entryOffset, PARTITION_ENTRY_SIZE);

    if (isPartitionTableEnd(data)) {
      break;
    }

    const partition = parsePartitionEntry(data);
    if (partition) {
      partitions.push(partition);
    }
  }

  return partitions;
}

function hasPlausiblePartitionEntry(data: Uint8Array): boolean {
  if (data.length < PARTITION_ENTRY_SIZE) {
    return false;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  if (view.getUint16(0, true) !== PARTITION_ENTRY_MAGIC_LE) {
    return false;
  }

  const type = view.getUint8(2);
  const offset = view.getUint32(4, true);
  const size = view.getUint32(8, true);

  return (
    type !== 0xff &&
    offset >= PARTITION_ALIGNMENT &&
    size >= PARTITION_ALIGNMENT &&
    offset % PARTITION_ALIGNMENT === 0 &&
    size % PARTITION_ALIGNMENT === 0
  );
}

function isPartitionTableEnd(data: Uint8Array): boolean {
  if (data.length < 2) {
    return true;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = view.getUint16(0, true);
  return magic === 0xffff || magic === 0x0000;
}

function parsePartitionEntry(data: Uint8Array): BoardPartition | null {
  if (data.length < PARTITION_ENTRY_SIZE) {
    return null;
  }

  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const magic = view.getUint16(0, true);

  if (magic !== PARTITION_ENTRY_MAGIC_LE) {
    return null;
  }

  const decoder = new TextDecoder();
  const type = view.getUint8(2);
  const subtype = view.getUint8(3);
  const partitionOffset = view.getUint32(4, true);
  const sizeBytes = view.getUint32(8, true);
  const flags = view.getUint32(28, true);
  const labelBytes = data.subarray(12, 28);
  const label = decoder.decode(labelBytes).replace(/\0/g, "").trim();

  return {
    label: label || `type ${formatHex(type, 1)}`,
    type,
    typeHex: formatHex(type, 1),
    subtype,
    subtypeHex: formatHex(subtype, 1),
    offset: partitionOffset,
    offsetHex: formatHex(partitionOffset, 4),
    sizeBytes,
    sizeHex: formatHex(sizeBytes, 4),
    flags,
    flagsHex: formatHex(flags, 4),
    filesystem: inferFilesystem(type, subtype)
  };
}

function inferFilesystem(
  type: number,
  subtype: number
): BoardPartitionFilesystem | null {
  if (type !== 0x01) {
    return null;
  }

  if (subtype === 0x81) {
    return "fatfs";
  }

  if (subtype === 0x82) {
    return "spiffs";
  }

  if (subtype === 0x83) {
    return "littlefs";
  }

  return null;
}

function formatHex(value: number, bytes: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(bytes * 2, "0")}`;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
