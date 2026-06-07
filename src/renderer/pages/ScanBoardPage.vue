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
import { useScanSessionStore } from "../stores/scanSessionStore";
import { formatBytes, formatDate, formatFlashSize } from "../utils/boardDisplay";

const boardStore = useBoardStore();
const scanSessionStore = useScanSessionStore();
const { boards } = storeToRefs(boardStore);
const { scanLogs } = storeToRefs(scanSessionStore);
const props = defineProps<{
  scanRequestId?: number;
}>();
const emit = defineEmits<{
  "open-board": [id: string];
  "scan-success": [detectedBoardCount: number];
}>();
const detectedBoards = ref<DetectedEspBoard[]>([]);
const loading = ref(false);
const scanProgressStarted = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const logCopied = ref(false);
const scanLogElement = ref<HTMLElement | null>(null);
const appliedScanUpdateKeys = ref<Set<string>>(new Set());
const pendingScanUpdateKeys = ref<Set<string>>(new Set());
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
const scanProgressMessage = computed(() =>
  formatEssentialScanProgress(scanLogs.value)
);
const savedDetectedBoardCount = computed(
  () => detectedBoards.value.length - newDetectedBoards.value.length
);
const scanAnimationSteps = [
  { icon: "mdi-usb-port", label: "Serial link" },
  { icon: "mdi-chip", label: "Chip identity" },
  { icon: "mdi-memory", label: "Flash map" },
  { icon: "mdi-shield-check-outline", label: "Safe reset" }
];
const scanReadyFeedback = computed(() => {
  if (loading.value || !detectedBoards.value.length) {
    return null;
  }

  const parts = [
    newDetectedBoards.value.length
      ? `${newDetectedBoards.value.length} new board${
          newDetectedBoards.value.length === 1 ? "" : "s"
        } ready to add`
      : null,
    savedDetectedBoardCount.value
      ? `${savedDetectedBoardCount.value} saved board${
          savedDetectedBoardCount.value === 1 ? "" : "s"
        } ready to update`
      : null
  ].filter((value): value is string => Boolean(value));

  return parts.length ? parts.join(" / ") : "Review the detected boards below.";
});

async function runScan(): Promise<void> {
  if (loading.value) {
    return;
  }

  loading.value = true;
  scanProgressStarted.value = false;
  error.value = null;
  notice.value = null;
  detectedBoards.value = [];
  appliedScanUpdateKeys.value = new Set();
  pendingScanUpdateKeys.value = new Set();

  try {
    const scannedBoards = await scanEspBoards((_level, message) => {
      if (!scanProgressStarted.value) {
        scanProgressStarted.value = true;
        scanSessionStore.clearScanLogs();
      }

      scanSessionStore.appendScanLog(message);
      void scrollScanLogToBottom();
    });
    await boardStore.loadBoards();
    detectedBoards.value = scannedBoards;
    emit("scan-success", scannedBoards.length);
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : "The board scan could not be completed.";
  } finally {
    loading.value = false;
    scanProgressStarted.value = false;
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

function formatEssentialScanProgress(logs: string[]): string {
  const currentBoard = findCurrentScanBoard(logs);
  const prefix = currentBoard ? `Board ${currentBoard}: ` : "";

  for (const log of logs.slice(-12).reverse()) {
    const normalizedLog = log.toLowerCase();

    if (
      normalizedLog.includes("retrying") ||
      normalizedLog.includes("recovery") ||
      normalizedLog.includes("timed out")
    ) {
      return `${prefix}recovering serial read`;
    }

    if (
      normalizedLog.includes("resetting to firmware") ||
      normalizedLog.includes("hard reset") ||
      normalizedLog.includes("reset to firmware")
    ) {
      return `${prefix}resetting safely`;
    }

    if (
      normalizedLog.includes("partition table") ||
      normalizedLog.includes("reading 3072 bytes") ||
      normalizedLog.includes("reading chunk")
    ) {
      return `${prefix}reading partition map`;
    }

    if (
      normalizedLog.includes("detecting flash size") ||
      normalizedLog.includes("auto-detected flash size") ||
      normalizedLog.includes("flash chip") ||
      normalizedLog.includes("flash size")
    ) {
      return `${prefix}reading flash details`;
    }

    if (
      normalizedLog.includes("chip variant") ||
      normalizedLog.includes("detected chip") ||
      normalizedLog.includes("revision") ||
      normalizedLog.includes("mac address") ||
      normalizedLog.includes("psram")
    ) {
      return `${prefix}reading chip identity`;
    }

    if (
      normalizedLog.includes("uploading stub") ||
      normalizedLog.includes("stub is now running") ||
      normalizedLog.includes("loading stub")
    ) {
      return `${prefix}preparing read-only scanner`;
    }

    if (
      normalizedLog.includes("connected") ||
      normalizedLog.includes("opening port") ||
      normalizedLog.includes("serial port")
    ) {
      return `${prefix}connecting to board`;
    }
  }

  return currentBoard ? `Board ${currentBoard}: scanning hardware` : "Scanning hardware";
}

function findCurrentScanBoard(logs: string[]): string | null {
  for (const log of logs.slice().reverse()) {
    const match = log.match(/Scanning selected serial port (\d+) of (\d+)/i);

    if (match) {
      return `${match[1]} of ${match[2]}`;
    }
  }

  return null;
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
    if (
      !scanRequestId ||
      scanSessionStore.hasHandledScanRequest(scanRequestId)
    ) {
      return;
    }

    scanSessionStore.markScanRequestHandled(scanRequestId);
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

    <v-card
      v-if="scanProgressStarted"
      class="scan-progress-card mb-4"
      flat
      role="status"
      aria-live="polite"
    >
      <div class="scan-progress-visual" aria-hidden="true">
        <div class="scan-radar-field">
          <span class="scan-radar-ring scan-radar-ring--outer" />
          <span class="scan-radar-ring scan-radar-ring--middle" />
          <span class="scan-radar-ring scan-radar-ring--inner" />
          <span class="scan-radar-sweep" />
          <span class="scan-radar-dot scan-radar-dot--one" />
          <span class="scan-radar-dot scan-radar-dot--two" />
          <span class="scan-radar-dot scan-radar-dot--three" />
          <v-icon icon="mdi-chip" size="42" />
        </div>
      </div>
      <div class="scan-progress-copy">
        <div class="scan-progress-kicker">Scanning in progress</div>
        <h2 class="scan-progress-title">Reading ESP board hardware</h2>
        <p class="scan-progress-line">{{ scanProgressMessage }}</p>
        <div class="scan-step-grid">
          <div
            v-for="step in scanAnimationSteps"
            :key="step.label"
            class="scan-step"
          >
            <v-icon :icon="step.icon" size="20" />
            <span>{{ step.label }}</span>
          </div>
        </div>
      </div>
    </v-card>

    <v-card v-if="detectedBoards.length" class="vault-table-card" flat>
      <v-card-title
        :class="[
          'detected-board-title',
          { 'detected-board-title--ready': scanReadyFeedback }
        ]"
      >
        <div
          v-if="scanReadyFeedback"
          class="scan-ready-heading"
          role="status"
          aria-live="polite"
        >
          <div class="scan-ready-orb" aria-hidden="true">
            <span />
            <span />
            <v-icon icon="mdi-radar" size="28" />
          </div>
          <div class="scan-ready-copy">
            <div class="scan-ready-kicker">Scan complete</div>
            <div class="scan-ready-message">{{ scanReadyFeedback }}</div>
            <div class="scan-ready-chip-row">
              <v-chip
                v-if="newDetectedBoards.length"
                color="primary"
                prepend-icon="mdi-plus-circle-outline"
                size="small"
                variant="tonal"
              >
                {{ newDetectedBoards.length }} ready to add
              </v-chip>
              <v-chip
                v-if="savedDetectedBoardCount"
                color="info"
                prepend-icon="mdi-refresh-circle"
                size="small"
                variant="tonal"
              >
                {{ savedDetectedBoardCount }} ready to update
              </v-chip>
            </div>
          </div>
        </div>
        <span v-else class="text-subtitle-1 font-weight-bold">
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

    <div v-else-if="!loading" class="empty-state">
      <v-icon icon="mdi-usb-port" size="40" color="primary" />
      <div class="text-subtitle-1 font-weight-bold mt-3">
        {{ scanLogs.length ? "No detected boards shown" : "No board scanned yet" }}
      </div>
      <div class="text-body-2 muted mt-1">
        {{
          scanLogs.length
            ? "The last scan log is still available below. Run a new scan to refresh detected boards."
            : "The app will ask for serial ports, reset into the ESP bootloader, and read chip details."
        }}
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
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  overflow: hidden;
  min-height: 52px;
}

.scan-progress-card {
  position: relative;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 22px;
  align-items: center;
  overflow: hidden;
  border: 1px solid rgba(var(--v-theme-primary), 0.3);
  border-radius: 8px;
  padding: 22px;
  background:
    radial-gradient(circle at 10% 50%, rgba(var(--v-theme-primary), 0.2), transparent 34%),
    radial-gradient(circle at 90% 20%, rgba(var(--v-theme-info), 0.12), transparent 28%),
    linear-gradient(135deg, rgba(var(--v-theme-primary), 0.14), rgba(var(--v-theme-surface), 0.82));
  box-shadow:
    0 22px 54px rgba(var(--v-theme-primary), 0.13),
    inset 0 0 0 1px rgba(var(--v-theme-primary), 0.08);
}

.scan-progress-card::before {
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(rgba(var(--v-theme-primary), 0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(var(--v-theme-primary), 0.08) 1px, transparent 1px);
  background-size: 30px 30px;
  content: "";
  mask-image: linear-gradient(90deg, rgba(0, 0, 0, 0.9), transparent 72%);
  pointer-events: none;
}

.scan-progress-card::after {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 44%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(var(--v-theme-primary), 0.14),
    transparent
  );
  content: "";
  transform: translateX(-120%);
  animation: scan-progress-sweep 2300ms ease-in-out infinite;
  pointer-events: none;
}

.scan-progress-visual,
.scan-progress-copy {
  position: relative;
  z-index: 1;
}

.scan-progress-visual {
  display: grid;
  place-items: center;
  min-height: 170px;
}

.scan-radar-field {
  position: relative;
  display: grid;
  width: 156px;
  height: 156px;
  place-items: center;
  border-radius: 999px;
  background:
    radial-gradient(circle, rgba(var(--v-theme-primary), 0.24), rgba(var(--v-theme-primary), 0.08) 48%, transparent 70%);
  color: rgb(var(--v-theme-primary));
  filter: drop-shadow(0 0 28px rgba(var(--v-theme-primary), 0.24));
}

.scan-radar-field :deep(.v-icon) {
  position: relative;
  z-index: 3;
  filter: drop-shadow(0 0 14px rgba(var(--v-theme-primary), 0.6));
}

.scan-radar-ring {
  position: absolute;
  border: 1px solid rgba(var(--v-theme-primary), 0.28);
  border-radius: inherit;
}

.scan-radar-ring--outer {
  inset: 0;
}

.scan-radar-ring--middle {
  inset: 22px;
}

.scan-radar-ring--inner {
  inset: 48px;
}

.scan-radar-sweep {
  position: absolute;
  inset: 4px;
  border-radius: inherit;
  background: conic-gradient(
    from 0deg,
    rgba(var(--v-theme-primary), 0.48),
    rgba(var(--v-theme-primary), 0.12) 42deg,
    transparent 78deg,
    transparent 360deg
  );
  mask-image: radial-gradient(circle, transparent 0 26%, #000 27% 100%);
  animation: scan-radar-spin 1800ms linear infinite;
}

.scan-radar-dot {
  position: absolute;
  width: 9px;
  height: 9px;
  border-radius: 999px;
  background: rgb(var(--v-theme-primary));
  box-shadow: 0 0 14px rgba(var(--v-theme-primary), 0.75);
  animation: scan-radar-dot-pulse 1400ms ease-in-out infinite;
}

.scan-radar-dot--one {
  top: 28px;
  right: 44px;
}

.scan-radar-dot--two {
  bottom: 34px;
  left: 42px;
  animation-delay: 280ms;
}

.scan-radar-dot--three {
  right: 28px;
  bottom: 54px;
  animation-delay: 560ms;
}

.scan-progress-kicker {
  color: rgb(var(--v-theme-primary));
  font-size: 0.78rem;
  font-weight: 850;
  letter-spacing: 0;
  text-transform: uppercase;
}

.scan-progress-title {
  margin: 4px 0 8px;
  color: var(--vault-text);
  font-size: clamp(1.35rem, 2vw, 2rem);
  line-height: 1.12;
}

.scan-progress-line {
  min-height: 1.5rem;
  margin: 0;
  color: var(--vault-muted);
  font-family: "Cascadia Mono", "Segoe UI Mono", monospace;
  font-size: 0.86rem;
  overflow-wrap: anywhere;
}

.scan-step-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
  margin-top: 18px;
}

.scan-step {
  display: inline-flex;
  align-items: center;
  min-width: 0;
  gap: 8px;
  border: 1px solid rgba(var(--v-theme-primary), 0.16);
  border-radius: 8px;
  padding: 10px 12px;
  background: rgba(var(--v-theme-surface), 0.56);
  color: var(--vault-muted);
  font-size: 0.78rem;
  font-weight: 800;
  animation: scan-step-glow 1600ms ease-in-out infinite;
}

.scan-step :deep(.v-icon) {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-primary));
}

.scan-step span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.scan-step:nth-child(2) {
  animation-delay: 160ms;
}

.scan-step:nth-child(3) {
  animation-delay: 320ms;
}

.scan-step:nth-child(4) {
  animation-delay: 480ms;
}

.detected-board-title--ready {
  min-height: 104px;
  padding: 16px 18px;
  background:
    radial-gradient(circle at 8% 50%, rgba(var(--v-theme-primary), 0.2), transparent 28%),
    linear-gradient(135deg, rgba(var(--v-theme-primary), 0.16), rgba(var(--v-theme-surface), 0.78));
  box-shadow:
    0 18px 42px rgba(var(--v-theme-primary), 0.12),
    inset 0 0 0 1px rgba(var(--v-theme-primary), 0.08);
  animation: scan-ready-enter 520ms cubic-bezier(0.2, 0.8, 0.2, 1);
}

.detected-board-title--ready::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    110deg,
    transparent 0%,
    transparent 34%,
    rgba(255, 255, 255, 0.16) 48%,
    transparent 62%,
    transparent 100%
  );
  content: "";
  transform: translateX(-120%);
  animation: scan-ready-sweep 1450ms ease-out 180ms both;
  pointer-events: none;
}

.detected-board-title :deep(.v-btn) {
  position: relative;
  z-index: 1;
}

.scan-ready-heading {
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  flex: 1 1 auto;
  gap: 16px;
  align-items: center;
  min-width: 0;
}

.scan-ready-orb {
  position: relative;
  display: grid;
  width: 58px;
  height: 58px;
  place-items: center;
  border: 1px solid rgba(var(--v-theme-primary), 0.34);
  border-radius: 999px;
  background:
    radial-gradient(circle, rgba(var(--v-theme-primary), 0.28), rgba(var(--v-theme-primary), 0.08) 58%, transparent 70%);
  color: rgb(var(--v-theme-primary));
}

.scan-ready-orb span {
  position: absolute;
  inset: 6px;
  border: 1px solid rgba(var(--v-theme-primary), 0.45);
  border-radius: inherit;
  animation: scan-ready-pulse 1650ms ease-out infinite;
}

.scan-ready-orb span:nth-child(2) {
  animation-delay: 420ms;
}

.scan-ready-orb :deep(.v-icon) {
  position: relative;
  z-index: 1;
  filter: drop-shadow(0 0 12px rgba(var(--v-theme-primary), 0.45));
}

.scan-ready-copy {
  position: relative;
  z-index: 1;
  min-width: 0;
}

.scan-ready-kicker {
  color: rgb(var(--v-theme-primary));
  font-size: 0.76rem;
  font-weight: 850;
  text-transform: uppercase;
}

.scan-ready-message {
  margin-top: 3px;
  color: var(--vault-text);
  font-size: 1.05rem;
  font-weight: 800;
}

.scan-ready-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

@keyframes scan-ready-enter {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes scan-ready-sweep {
  to {
    transform: translateX(120%);
  }
}

@keyframes scan-ready-pulse {
  0% {
    opacity: 0.9;
    transform: scale(0.72);
  }

  70%,
  100% {
    opacity: 0;
    transform: scale(1.55);
  }
}

@keyframes scan-progress-sweep {
  0% {
    transform: translateX(-120%);
  }

  52%,
  100% {
    transform: translateX(280%);
  }
}

@keyframes scan-radar-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes scan-radar-dot-pulse {
  0%,
  100% {
    opacity: 0.45;
    transform: scale(0.86);
  }

  45% {
    opacity: 1;
    transform: scale(1.28);
  }
}

@keyframes scan-step-glow {
  0%,
  100% {
    border-color: rgba(var(--v-theme-primary), 0.16);
    box-shadow: none;
  }

  45% {
    border-color: rgba(var(--v-theme-primary), 0.44);
    box-shadow: 0 0 22px rgba(var(--v-theme-primary), 0.12);
    color: var(--vault-text);
  }
}

@media (prefers-reduced-motion: reduce) {
  .scan-progress-card::after,
  .scan-radar-sweep,
  .scan-radar-dot,
  .scan-step,
  .detected-board-title--ready,
  .detected-board-title--ready::after,
  .scan-ready-orb span {
    animation: none;
  }
}

@media (max-width: 980px) {
  .scan-progress-card {
    grid-template-columns: 1fr;
  }

  .scan-progress-visual {
    min-height: 132px;
  }

  .scan-radar-field {
    width: 132px;
    height: 132px;
  }

  .scan-step-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 760px) {
  .detected-board-title--ready {
    flex-direction: column;
    align-items: stretch;
  }

  .scan-ready-heading {
    grid-template-columns: 1fr;
  }

  .scan-ready-orb {
    display: none;
  }

  .scan-step-grid {
    grid-template-columns: 1fr;
  }
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
