<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import type {
  Board,
  CreateBoardInput,
  UpdateBoardInput
} from "../../shared/types/board";
import type { DetectedEspBoard } from "../../shared/types/serial";
import { scanEspBoards } from "../services/espBoardScanner";
import { useBoardStore } from "../stores/boardStore";
import { formatBytes, formatDate, formatFlashSize } from "../utils/boardDisplay";

const boardStore = useBoardStore();
const { boards } = storeToRefs(boardStore);
const props = defineProps<{
  scanRequestId?: number;
}>();
const emit = defineEmits<{
  "open-board": [id: string];
}>();
const detectedBoards = ref<DetectedEspBoard[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const scanLogs = ref<string[]>([]);
const logCopied = ref(false);
const scanLogElement = ref<HTMLElement | null>(null);
const appliedScanUpdateKeys = ref<Set<string>>(new Set());
const pendingScanUpdateKeys = ref<Set<string>>(new Set());
const handledScanRequestId = ref(0);
let copyResetTimeout: number | null = null;

const savedBoardsByMac = computed(() => {
  const matches = new Map<string, Board>();

  for (const board of boards.value) {
    const macAddress = normalizeMacAddress(board.macAddress);
    if (macAddress) {
      matches.set(macAddress, board);
    }
  }

  return matches;
});

const newDetectedBoards = computed(() =>
  detectedBoards.value.filter((board) => !getSavedBoard(board))
);

async function runScan(): Promise<void> {
  if (loading.value) {
    return;
  }

  loading.value = true;
  error.value = null;
  notice.value = null;
  scanLogs.value = [];
  detectedBoards.value = [];
  appliedScanUpdateKeys.value = new Set();
  pendingScanUpdateKeys.value = new Set();

  try {
    const scannedBoards = await scanEspBoards((_level, message) => {
      scanLogs.value = [...scanLogs.value.slice(-80), message];
      void scrollScanLogToBottom();
    });
    await boardStore.loadBoards();
    detectedBoards.value = scannedBoards;
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : "The board scan could not be completed.";
  } finally {
    loading.value = false;
  }
}

async function scrollScanLogToBottom(): Promise<void> {
  await nextTick();

  if (!scanLogElement.value) {
    return;
  }

  scanLogElement.value.scrollTop = scanLogElement.value.scrollHeight;
}

async function addDetectedBoard(board: DetectedEspBoard): Promise<void> {
  const savedBoard = getSavedBoard(board);
  if (savedBoard) {
    notice.value = `${savedBoard.name} is already saved.`;
    return;
  }

  await boardStore.createBoard(buildBoardInput(board));
  notice.value = "Board added to the vault.";
}

async function addDetectedBoards(): Promise<void> {
  const boardsToAdd = [...newDetectedBoards.value];
  const skippedCount = detectedBoards.value.length - boardsToAdd.length;

  for (const board of boardsToAdd) {
    await addDetectedBoard(board);
  }

  const addedCount = boardsToAdd.length;

  if (addedCount || skippedCount) {
    notice.value = [
      addedCount ? `${addedCount} new board${addedCount === 1 ? "" : "s"} added` : null,
      skippedCount
        ? `${skippedCount} already saved board${skippedCount === 1 ? "" : "s"} skipped`
        : null
    ]
      .filter((value): value is string => Boolean(value))
      .join(", ");
  }
}

async function updateSavedBoardFromScan(
  board: DetectedEspBoard,
  index: number
): Promise<void> {
  const savedBoard = getSavedBoard(board);
  const scanUpdateKey = getDetectedBoardKey(board, index);
  if (
    !savedBoard ||
    appliedScanUpdateKeys.value.has(scanUpdateKey) ||
    pendingScanUpdateKeys.value.has(scanUpdateKey)
  ) {
    return;
  }

  pendingScanUpdateKeys.value = new Set(pendingScanUpdateKeys.value).add(
    scanUpdateKey
  );

  try {
    await boardStore.updateBoard(
      savedBoard.id,
      buildBoardUpdateInput(board, savedBoard)
    );
    appliedScanUpdateKeys.value = new Set(appliedScanUpdateKeys.value).add(
      scanUpdateKey
    );
    notice.value = `${savedBoard.name} updated from scan data.`;
  } finally {
    const nextPendingScanUpdateKeys = new Set(pendingScanUpdateKeys.value);
    nextPendingScanUpdateKeys.delete(scanUpdateKey);
    pendingScanUpdateKeys.value = nextPendingScanUpdateKeys;
  }
}

function keepSavedBoard(board: DetectedEspBoard): void {
  const savedBoard = getSavedBoard(board);
  if (!savedBoard) {
    return;
  }

  notice.value = `${savedBoard.name} kept unchanged.`;
}

function openSavedBoard(board: DetectedEspBoard): void {
  const savedBoard = getSavedBoard(board);
  if (!savedBoard) {
    return;
  }

  emit("open-board", savedBoard.id);
}

async function copyScanLog(): Promise<void> {
  if (!scanLogs.value.length) {
    return;
  }

  try {
    await window.api.clipboard.writeText(scanLogs.value.join("\n"));
    logCopied.value = true;

    if (copyResetTimeout !== null) {
      window.clearTimeout(copyResetTimeout);
    }

    copyResetTimeout = window.setTimeout(() => {
      logCopied.value = false;
      copyResetTimeout = null;
    }, 1600);
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : "The scan log could not be copied.";
  }
}

function buildBoardInput(board: DetectedEspBoard): CreateBoardInput {
  return {
    name: `${board.chipModel ?? "ESP32"} board`,
    status: "available",
    chipModel: board.chipModel,
    chipRevision: board.chipRevision,
    chipVariant: board.chipVariant,
    chipFamily: board.chipFamily,
    chipFamilyHex: board.chipFamilyHex,
    macAddress: board.macAddress,
    flashSizeBytes: board.flashSizeBytes,
    flashSizeLabel: board.flashSizeLabel,
    flashChipId: board.flashChipId,
    flashChipIdHex: board.flashChipIdHex,
    flashManufacturerId: board.flashManufacturerId,
    flashManufacturerIdHex: board.flashManufacturerIdHex,
    flashManufacturerName: board.flashManufacturerName,
    flashDeviceId: board.flashDeviceId,
    flashDeviceIdHex: board.flashDeviceIdHex,
    psramSizeBytes: board.psramSizeBytes,
    psramDetected: board.psramDetected,
    crystalFrequency: board.crystalFrequency,
    securityFlags: board.securityFlags,
    securityFlagsHex: board.securityFlagsHex,
    flashCryptCnt: board.flashCryptCnt,
    flashCryptCntHex: board.flashCryptCntHex,
    securityKeyPurposes: board.securityKeyPurposes,
    securityChipId: board.securityChipId,
    securityApiVersion: board.securityApiVersion,
    secureBootEnabled: board.secureBootEnabled,
    flashEncryptionEnabled: board.flashEncryptionEnabled,
    bootloaderOffset: board.bootloaderOffset,
    bootloaderOffsetHex: board.bootloaderOffsetHex,
    partitions: board.partitions,
    partitionTableOffset: board.partitionTableOffset,
    partitionTableOffsetHex: board.partitionTableOffsetHex,
    partitionsDetectedAt: board.partitionsDetectedAt,
    partitionTableReadError: board.partitionTableReadError,
    lastConnectedAt: board.detectedAt,
    lastScannedAt: board.detectedAt,
    notes: "Created from scan data."
  };
}

function buildBoardUpdateInput(
  board: DetectedEspBoard,
  savedBoard: Board
): UpdateBoardInput {
  const partitionFields = buildPartitionUpdateFields(board, savedBoard);

  return {
    chipModel: keepExistingWhenUnknown(board.chipModel, savedBoard.chipModel),
    chipRevision: keepExistingWhenUnknown(board.chipRevision, savedBoard.chipRevision),
    chipVariant: keepExistingWhenUnknown(board.chipVariant, savedBoard.chipVariant),
    chipFamily: keepExistingWhenUnknown(board.chipFamily, savedBoard.chipFamily),
    chipFamilyHex: keepExistingWhenUnknown(board.chipFamilyHex, savedBoard.chipFamilyHex),
    macAddress: keepExistingWhenUnknown(board.macAddress, savedBoard.macAddress),
    flashSizeBytes: keepExistingWhenUnknown(
      board.flashSizeBytes,
      savedBoard.flashSizeBytes
    ),
    flashSizeLabel: keepExistingWhenUnknown(
      board.flashSizeLabel,
      savedBoard.flashSizeLabel
    ),
    flashChipId: keepExistingWhenUnknown(board.flashChipId, savedBoard.flashChipId),
    flashChipIdHex: keepExistingWhenUnknown(
      board.flashChipIdHex,
      savedBoard.flashChipIdHex
    ),
    flashManufacturerId: keepExistingWhenUnknown(
      board.flashManufacturerId,
      savedBoard.flashManufacturerId
    ),
    flashManufacturerIdHex: keepExistingWhenUnknown(
      board.flashManufacturerIdHex,
      savedBoard.flashManufacturerIdHex
    ),
    flashManufacturerName: keepExistingWhenUnknown(
      board.flashManufacturerName,
      savedBoard.flashManufacturerName
    ),
    flashDeviceId: keepExistingWhenUnknown(
      board.flashDeviceId,
      savedBoard.flashDeviceId
    ),
    flashDeviceIdHex: keepExistingWhenUnknown(
      board.flashDeviceIdHex,
      savedBoard.flashDeviceIdHex
    ),
    psramSizeBytes:
      board.psramDetected === false
        ? null
        : keepExistingWhenUnknown(board.psramSizeBytes, savedBoard.psramSizeBytes),
    psramDetected: keepExistingWhenUnknown(
      board.psramDetected,
      savedBoard.psramDetected
    ),
    crystalFrequency: keepExistingWhenUnknown(
      board.crystalFrequency,
      savedBoard.crystalFrequency
    ),
    securityFlags: keepExistingWhenUnknown(
      board.securityFlags,
      savedBoard.securityFlags
    ),
    securityFlagsHex: keepExistingWhenUnknown(
      board.securityFlagsHex,
      savedBoard.securityFlagsHex
    ),
    flashCryptCnt: keepExistingWhenUnknown(
      board.flashCryptCnt,
      savedBoard.flashCryptCnt
    ),
    flashCryptCntHex: keepExistingWhenUnknown(
      board.flashCryptCntHex,
      savedBoard.flashCryptCntHex
    ),
    securityKeyPurposes: keepExistingWhenUnknown(
      board.securityKeyPurposes,
      savedBoard.securityKeyPurposes
    ),
    securityChipId: keepExistingWhenUnknown(
      board.securityChipId,
      savedBoard.securityChipId
    ),
    securityApiVersion: keepExistingWhenUnknown(
      board.securityApiVersion,
      savedBoard.securityApiVersion
    ),
    secureBootEnabled: keepExistingWhenUnknown(
      board.secureBootEnabled,
      savedBoard.secureBootEnabled
    ),
    flashEncryptionEnabled: keepExistingWhenUnknown(
      board.flashEncryptionEnabled,
      savedBoard.flashEncryptionEnabled
    ),
    bootloaderOffset: keepExistingWhenUnknown(
      board.bootloaderOffset,
      savedBoard.bootloaderOffset
    ),
    bootloaderOffsetHex: keepExistingWhenUnknown(
      board.bootloaderOffsetHex,
      savedBoard.bootloaderOffsetHex
    ),
    ...partitionFields,
    lastConnectedAt: board.detectedAt,
    lastScannedAt: board.detectedAt
  };
}

function buildPartitionUpdateFields(
  board: DetectedEspBoard,
  savedBoard: Board
): Pick<
  UpdateBoardInput,
  | "partitions"
  | "partitionTableOffset"
  | "partitionTableOffsetHex"
  | "partitionsDetectedAt"
  | "partitionTableReadError"
> {
  if (board.partitionTableReadError) {
    return {
      partitions: savedBoard.partitions,
      partitionTableOffset: savedBoard.partitionTableOffset,
      partitionTableOffsetHex: savedBoard.partitionTableOffsetHex,
      partitionsDetectedAt: savedBoard.partitionsDetectedAt,
      partitionTableReadError: board.partitionTableReadError
    };
  }

  return {
    partitions: board.partitions,
    partitionTableOffset: board.partitionTableOffset,
    partitionTableOffsetHex: board.partitionTableOffsetHex,
    partitionsDetectedAt: board.partitionsDetectedAt,
    partitionTableReadError: null
  };
}

function keepExistingWhenUnknown<T>(value: T | null, existing: T | null): T | null {
  return value === null ? existing : value;
}

function getSavedBoard(board: DetectedEspBoard): Board | null {
  const macAddress = normalizeMacAddress(board.macAddress);
  return macAddress ? savedBoardsByMac.value.get(macAddress) ?? null : null;
}

function getDetectedBoardKey(board: DetectedEspBoard, index: number): string {
  return [
    normalizeMacAddress(board.macAddress) ?? "unknown",
    board.detectedAt,
    index
  ].join("-");
}

function isScanUpdateApplied(board: DetectedEspBoard, index: number): boolean {
  return appliedScanUpdateKeys.value.has(getDetectedBoardKey(board, index));
}

function isScanUpdatePending(board: DetectedEspBoard, index: number): boolean {
  return pendingScanUpdateKeys.value.has(getDetectedBoardKey(board, index));
}

function normalizeMacAddress(value: string | null | undefined): string | null {
  const normalized = value?.trim().replaceAll("-", ":").toUpperCase();
  if (
    !normalized ||
    normalized === "00:00:00:00:00:00" ||
    normalized === "FF:FF:FF:FF:FF:FF"
  ) {
    return null;
  }

  return normalized;
}

function formatBoardLabel(board: DetectedEspBoard, index: number): string {
  return board.chipModel ? `${board.chipModel} board` : `Detected board ${index + 1}`;
}

function formatChipSummary(board: DetectedEspBoard): string {
  return [board.chipModel ?? "Unknown", formatRevision(board.chipRevision)]
    .filter((value): value is string => Boolean(value))
    .join(" / ");
}

function formatRevision(value: number | null): string | null {
  return value === null ? null : `rev ${value}`;
}

function formatFlashChipSummary(board: DetectedEspBoard): string {
  if (board.flashManufacturerName && board.flashChipIdHex) {
    return `${board.flashManufacturerName} ${board.flashChipIdHex}`;
  }

  return board.flashChipIdHex ?? board.flashManufacturerName ?? "Unknown";
}

function formatPartitionSummary(board: DetectedEspBoard): string {
  if (board.partitions?.length) {
    return `${board.partitions.length} partition${
      board.partitions.length === 1 ? "" : "s"
    }`;
  }

  return board.partitionTableReadError ? "Read failed" : "None found";
}

function formatPsramSummary(board: DetectedEspBoard): string {
  if (board.psramSizeBytes !== null) {
    return formatBytes(board.psramSizeBytes);
  }

  if (board.psramDetected === null) {
    return "Unknown";
  }

  return board.psramDetected ? "Detected" : "Not detected";
}

function formatSecuritySummary(board: DetectedEspBoard): string {
  const secureBoot = formatEnabledState(board.secureBootEnabled);
  const flashEncryption = formatEnabledState(board.flashEncryptionEnabled);

  if (secureBoot === "Unknown" && flashEncryption === "Unknown") {
    return "Unknown";
  }

  return `Boot ${secureBoot.toLowerCase()} / flash ${flashEncryption.toLowerCase()}`;
}

function formatEnabledState(value: boolean | null): string {
  if (value === null) {
    return "Unknown";
  }

  return value ? "Enabled" : "Disabled";
}

onBeforeUnmount(() => {
  if (copyResetTimeout !== null) {
    window.clearTimeout(copyResetTimeout);
  }
});

onMounted(() => {
  void boardStore.loadBoards();
});

watch(
  () => props.scanRequestId,
  (scanRequestId) => {
    if (!scanRequestId || scanRequestId === handledScanRequestId.value) {
      return;
    }

    handledScanRequestId.value = scanRequestId;
    void runScan();
  },
  { immediate: true }
);
</script>

<template>
  <section class="page-shell">
    <div class="page-header">
      <div>
        <h1 class="page-title">Scan board</h1>
        <p class="page-subtitle">
          Connect an ESP board in bootloader mode and read chip details through Web Serial.
        </p>
      </div>
      <v-btn
        color="primary"
        prepend-icon="mdi-usb-port"
        :loading="loading"
        @click="runScan"
      >
        Scan boards
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error }}
    </v-alert>

    <v-alert v-if="notice" type="success" variant="tonal" class="mb-4">
      {{ notice }}
    </v-alert>

    <v-card v-if="detectedBoards.length" class="vault-table-card" flat>
      <v-card-title class="detected-board-title">
        <span class="text-subtitle-1 font-weight-bold">
          <v-icon class="mr-2" color="primary" icon="mdi-radar" />
          Detected boards
        </span>
        <v-btn
          v-if="detectedBoards.length > 1 && newDetectedBoards.length"
          color="primary"
          size="small"
          prepend-icon="mdi-plus"
          @click="addDetectedBoards"
        >
          Add all new
        </v-btn>
      </v-card-title>
      <v-divider />
      <v-table class="vault-data-table detected-board-table">
        <thead>
          <tr>
            <th>Board</th>
            <th>Chip</th>
            <th>MAC address</th>
            <th>Flash</th>
            <th>Partitions</th>
            <th>Flash chip</th>
            <th>PSRAM</th>
            <th>Security</th>
            <th>Detected</th>
            <th class="text-right">Actions</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="(detectedBoard, index) in detectedBoards"
            :key="getDetectedBoardKey(detectedBoard, index)"
          >
            <td>
              <div class="board-name">
                {{ getSavedBoard(detectedBoard)?.name ?? formatBoardLabel(detectedBoard, index) }}
              </div>
              <div class="text-caption muted">
                {{
                  getSavedBoard(detectedBoard)
                    ? "Already saved"
                    : detectedBoard.chipVariant ?? "No variant detected"
                }}
              </div>
            </td>
            <td>{{ formatChipSummary(detectedBoard) }}</td>
            <td class="metadata-mono">{{ detectedBoard.macAddress ?? "Unknown" }}</td>
            <td>
              {{ formatFlashSize(detectedBoard.flashSizeBytes, detectedBoard.flashSizeLabel) }}
            </td>
            <td>
              <div>{{ formatPartitionSummary(detectedBoard) }}</div>
              <div class="text-caption muted">
                {{ detectedBoard.partitionTableOffsetHex ?? "No table offset" }}
              </div>
            </td>
            <td>
              <div>{{ formatFlashChipSummary(detectedBoard) }}</div>
              <div class="text-caption muted">
                {{ detectedBoard.flashDeviceIdHex ?? "No device ID" }}
              </div>
            </td>
            <td>{{ formatPsramSummary(detectedBoard) }}</td>
            <td>{{ formatSecuritySummary(detectedBoard) }}</td>
            <td>{{ formatDate(detectedBoard.detectedAt) }}</td>
            <td class="text-right">
              <div v-if="getSavedBoard(detectedBoard)" class="known-board-actions">
                <v-btn
                  color="primary"
                  size="small"
                  variant="tonal"
                  prepend-icon="mdi-open-in-new"
                  @click="openSavedBoard(detectedBoard)"
                >
                  Open
                </v-btn>
                <v-btn
                  color="primary"
                  size="small"
                  variant="outlined"
                  :prepend-icon="
                    isScanUpdateApplied(detectedBoard, index)
                      ? 'mdi-check'
                      : 'mdi-refresh'
                  "
                  :disabled="
                    isScanUpdateApplied(detectedBoard, index) ||
                    isScanUpdatePending(detectedBoard, index)
                  "
                  :loading="isScanUpdatePending(detectedBoard, index)"
                  @click="updateSavedBoardFromScan(detectedBoard, index)"
                >
                  {{
                    isScanUpdateApplied(detectedBoard, index)
                      ? "Updated"
                      : "Update from scan"
                  }}
                </v-btn>
                <v-btn
                  size="small"
                  variant="text"
                  @click="keepSavedBoard(detectedBoard)"
                >
                  Keep saved
                </v-btn>
              </div>
              <v-btn
                v-else
                color="primary"
                size="small"
                variant="tonal"
                prepend-icon="mdi-plus"
                @click="addDetectedBoard(detectedBoard)"
              >
                Add
              </v-btn>
            </td>
          </tr>
        </tbody>
      </v-table>
    </v-card>

    <div v-else class="empty-state">
      <v-icon icon="mdi-usb-port" size="40" color="primary" />
      <div class="text-subtitle-1 font-weight-bold mt-3">No board scanned yet</div>
      <div class="text-body-2 muted mt-1">
        The app will ask for serial ports, reset into the ESP bootloader, and read chip details.
      </div>
    </div>

    <v-card v-if="scanLogs.length" class="panel-card mt-4" flat>
      <v-card-title class="scan-log-title">
        <span class="text-subtitle-1 font-weight-bold">
          <v-icon class="mr-2" color="primary" icon="mdi-console-line" />
          Scan log
        </span>
        <v-btn
          size="small"
          variant="text"
          :prepend-icon="logCopied ? 'mdi-check' : 'mdi-content-copy'"
          @click="copyScanLog"
        >
          {{ logCopied ? "Copied" : "Copy" }}
        </v-btn>
      </v-card-title>
      <v-divider />
      <v-card-text>
        <pre ref="scanLogElement" class="scan-log">{{ scanLogs.join("\n") }}</pre>
      </v-card-text>
    </v-card>
  </section>
</template>

<style scoped>
.detected-board-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 52px;
}

.detected-board-table {
  font-size: 0.875rem;
}

.detected-board-table :deep(th),
.detected-board-table :deep(td) {
  padding: 10px 12px;
  vertical-align: top;
  white-space: nowrap;
}

.detected-board-table :deep(th:first-child),
.detected-board-table :deep(td:first-child),
.detected-board-table :deep(th:nth-child(5)),
.detected-board-table :deep(td:nth-child(5)),
.detected-board-table :deep(th:nth-child(7)),
.detected-board-table :deep(td:nth-child(7)) {
  white-space: normal;
}

.board-name {
  font-weight: 650;
}

.metadata-mono {
  font-family: "Cascadia Mono", "Segoe UI Mono", monospace;
  font-size: 0.8125rem;
}

.known-board-actions {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.scan-log-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
