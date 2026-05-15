<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref } from "vue";
import type { CreateBoardInput } from "../../shared/types/board";
import type { DetectedEspBoard } from "../../shared/types/serial";
import { scanEspBoards } from "../services/espBoardScanner";
import { useBoardStore } from "../stores/boardStore";
import { formatBytes, formatDate, formatFlashSize } from "../utils/boardDisplay";

const boardStore = useBoardStore();
const detectedBoards = ref<DetectedEspBoard[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const scanLogs = ref<string[]>([]);
const logCopied = ref(false);
const scanLogElement = ref<HTMLElement | null>(null);
let copyResetTimeout: number | null = null;

async function runScan(): Promise<void> {
  loading.value = true;
  error.value = null;
  scanLogs.value = [];
  detectedBoards.value = [];

  try {
    detectedBoards.value = await scanEspBoards((_level, message) => {
      scanLogs.value = [...scanLogs.value.slice(-80), message];
      void scrollScanLogToBottom();
    });
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
  await boardStore.createBoard(buildBoardInput(board));
}

async function addDetectedBoards(): Promise<void> {
  for (const board of detectedBoards.value) {
    await addDetectedBoard(board);
  }
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
    lastConnectedAt: board.detectedAt,
    notes: "Created from tasmota-webserial-esptool scan data."
  };
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

    <v-card v-if="detectedBoards.length" flat border>
      <v-card-title class="detected-board-title">
        <span class="text-subtitle-1 font-weight-bold">
          Detected boards
        </span>
        <v-btn
          v-if="detectedBoards.length > 1"
          color="primary"
          size="small"
          prepend-icon="mdi-plus"
          @click="addDetectedBoards"
        >
          Add all
        </v-btn>
      </v-card-title>
      <v-divider />
      <v-table class="detected-board-table">
        <thead>
          <tr>
            <th>Board</th>
            <th>Chip</th>
            <th>MAC address</th>
            <th>Flash</th>
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
            :key="`${detectedBoard.macAddress ?? 'board'}-${detectedBoard.detectedAt}-${index}`"
          >
            <td>
              <div class="board-name">
                {{ formatBoardLabel(detectedBoard, index) }}
              </div>
              <div class="text-caption muted">
                {{ detectedBoard.chipVariant ?? "No variant detected" }}
              </div>
            </td>
            <td>{{ formatChipSummary(detectedBoard) }}</td>
            <td class="metadata-mono">{{ detectedBoard.macAddress ?? "Unknown" }}</td>
            <td>
              {{ formatFlashSize(detectedBoard.flashSizeBytes, detectedBoard.flashSizeLabel) }}
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
              <v-btn
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
      <v-icon icon="mdi-usb-port" size="40" color="secondary" />
      <div class="text-subtitle-1 font-weight-bold mt-3">No board scanned yet</div>
      <div class="text-body-2 muted mt-1">
        The app will ask for serial ports, reset into the ESP bootloader, and read chip details.
      </div>
    </div>

    <v-card v-if="scanLogs.length" class="mt-4" flat border>
      <v-card-title class="scan-log-title">
        <span class="text-subtitle-1 font-weight-bold">Scan log</span>
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

.scan-log-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
</style>
