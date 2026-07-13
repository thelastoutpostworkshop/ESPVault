<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { DatabaseLocation } from "../../shared/types/api";
import {
  useVaultTheme,
  type VaultThemeName
} from "../composables/useVaultTheme";
import { repositories } from "../repositories";
import {
  getBackupReminder,
  getBackupStatus
} from "../services/backupStatus";
import {
  DEFAULT_SCAN_FRESHNESS_THRESHOLD_DAYS,
  MAX_SCAN_FRESHNESS_THRESHOLD_DAYS,
  MIN_SCAN_FRESHNESS_THRESHOLD_DAYS,
  loadScanFreshnessThresholdDays,
  saveScanFreshnessThresholdDays
} from "../services/scanFreshnessThreshold";
import {
  loadReservedSerialPortNames,
  saveReservedSerialPortNames
} from "../services/reservedSerialPorts";

const backupRepository = repositories.backups;
const {
  currentTheme,
  isDarkTheme,
  persistCurrentTheme,
  setTheme,
  themeLabel
} = useVaultTheme();
const resettingWindowSize = ref(false);
const copyingDatabaseLocation = ref(false);
const changingDatabaseLocation = ref(false);
const confirmingAppDataMove = ref(false);
const currentAppVersion = ref<string | null>(null);
const error = ref<string | null>(null);
const lastBackupAppVersion = ref<string | null>(null);
const lastBackupAt = ref<string | null>(null);
const notice = ref<string | null>(null);
const backupReminderSnackbar = ref(false);
const databaseLocation = ref<DatabaseLocation | null>(null);
const scanFreshnessThresholdInput = ref(
  String(DEFAULT_SCAN_FRESHNESS_THRESHOLD_DAYS)
);
const scanFreshnessThresholdLoaded = ref(false);
const savingScanFreshnessThreshold = ref(false);
const reservedSerialPortsInput = ref("");
const reservedSerialPortsLoaded = ref(false);
const savingReservedSerialPorts = ref(false);
const backupReminder = computed(() =>
  getBackupReminder(lastBackupAt.value, undefined, {
    currentAppVersion: currentAppVersion.value,
    lastBackupAppVersion: lastBackupAppVersion.value
  })
);
const backupReminderMessage = computed(() => backupReminder.value.message ?? "");
const themeOptions: {
  title: string;
  value: VaultThemeName;
  icon: string;
}[] = [
  { title: "Light", value: "vaultLight", icon: "mdi-weather-sunny" },
  { title: "Dark", value: "vaultDark", icon: "mdi-weather-night" }
];

async function resetWindowSize(): Promise<void> {
  resettingWindowSize.value = true;
  error.value = null;
  notice.value = null;

  try {
    await window.api.window.resetSize();
    notice.value = "Window size reset.";
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : "The window size could not be reset.";
  } finally {
    resettingWindowSize.value = false;
  }
}

async function loadDatabaseLocation(): Promise<void> {
  try {
    databaseLocation.value = await window.api.database.getLocation();
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : "The app data location could not be loaded.";
  }
}

async function loadLastBackupStatus(): Promise<void> {
  try {
    const backupStatus = await getBackupStatus();
    lastBackupAt.value = backupStatus.lastBackupAt;
    lastBackupAppVersion.value = backupStatus.lastBackupAppVersion;
  } catch {
    lastBackupAt.value = null;
    lastBackupAppVersion.value = null;
  }
}

async function loadCurrentAppVersion(): Promise<void> {
  try {
    currentAppVersion.value = await window.api.app.getVersion();
  } catch {
    currentAppVersion.value = null;
  }
}

async function loadScanFreshnessThresholdSetting(): Promise<void> {
  try {
    scanFreshnessThresholdInput.value = String(
      await loadScanFreshnessThresholdDays()
    );
  } catch {
    scanFreshnessThresholdInput.value = String(
      DEFAULT_SCAN_FRESHNESS_THRESHOLD_DAYS
    );
  } finally {
    scanFreshnessThresholdLoaded.value = true;
  }
}

function updateTheme(themeName: unknown): void {
  if (themeName === "vaultLight" || themeName === "vaultDark") {
    setTheme(themeName);
  }
}

function openAppDataMoveConfirmation(): void {
  confirmingAppDataMove.value = true;

  if (backupReminder.value.shouldWarn) {
    backupReminderSnackbar.value = true;
  }
}

async function copyDatabaseLocation(): Promise<void> {
  if (!databaseLocation.value) {
    return;
  }

  copyingDatabaseLocation.value = true;
  error.value = null;
  notice.value = null;

  try {
    await window.api.clipboard.writeText(databaseLocation.value.userDataPath);
    notice.value = "App data location copied.";
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : "The app data location could not be copied.";
  } finally {
    copyingDatabaseLocation.value = false;
  }
}

async function changeDatabaseLocation(): Promise<void> {
  changingDatabaseLocation.value = true;
  confirmingAppDataMove.value = false;
  error.value = null;
  notice.value = null;

  try {
    await persistCurrentTheme();
    const backup = await backupRepository.exportBackup();
    const result = await window.api.database.changeLocation(
      JSON.stringify(backup, null, 2)
    );

    if (result.canceled) {
      return;
    }

    if (result.restartRequired) {
      notice.value = "App data location changed. Restarting app...";
      return;
    }

    notice.value = "App data is already using that location.";
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : "The app data location could not be changed.";
  } finally {
    changingDatabaseLocation.value = false;
  }
}

async function saveScanFreshnessThreshold(): Promise<void> {
  savingScanFreshnessThreshold.value = true;
  error.value = null;
  notice.value = null;

  try {
    const days = await saveScanFreshnessThresholdDays(
      scanFreshnessThresholdInput.value
    );
    scanFreshnessThresholdInput.value = String(days);
    notice.value = "Stale scan threshold saved.";
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : "The stale scan threshold could not be saved.";
  } finally {
    savingScanFreshnessThreshold.value = false;
  }
}

async function resetScanFreshnessThreshold(): Promise<void> {
  scanFreshnessThresholdInput.value = String(
    DEFAULT_SCAN_FRESHNESS_THRESHOLD_DAYS
  );
  await saveScanFreshnessThreshold();
}

async function loadReservedSerialPortsSetting(): Promise<void> {
  try {
    reservedSerialPortsInput.value = (await loadReservedSerialPortNames()).join("\n");
  } finally {
    reservedSerialPortsLoaded.value = true;
  }
}

async function saveReservedSerialPorts(): Promise<void> {
  savingReservedSerialPorts.value = true;
  error.value = null;
  notice.value = null;

  try {
    const portNames = await saveReservedSerialPortNames(reservedSerialPortsInput.value);
    reservedSerialPortsInput.value = portNames.join("\n");
    notice.value = "Reserved serial ports saved.";
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : "The reserved serial ports could not be saved.";
  } finally {
    savingReservedSerialPorts.value = false;
  }
}

onMounted(() => {
  void loadDatabaseLocation();
  void loadCurrentAppVersion();
  void loadLastBackupStatus();
  void loadScanFreshnessThresholdSetting();
  void loadReservedSerialPortsSetting();
});
</script>

<template>
  <section class="page-shell">
    <div class="page-header">
      <div>
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Local preferences for this app.</p>
      </div>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error }}
    </v-alert>

    <v-alert v-if="notice" type="success" variant="tonal" class="mb-4">
      {{ notice }}
    </v-alert>

    <v-card class="panel-card" flat>
      <v-card-title class="text-subtitle-1 font-weight-bold">
        Appearance
      </v-card-title>
      <v-divider />
      <v-card-text class="settings-row">
        <div class="settings-detail">
          <div class="settings-detail-heading">
            <v-icon
              :icon="isDarkTheme ? 'mdi-weather-night' : 'mdi-weather-sunny'"
              color="primary"
            />
            <div>
              <div class="font-weight-medium">{{ themeLabel }}</div>
              <div class="text-body-2 muted mt-1">
                Choose the color mode for the vault interface.
              </div>
            </div>
          </div>
        </div>
        <v-btn-toggle
          class="theme-toggle"
          :model-value="currentTheme"
          mandatory
          divided
          color="primary"
          variant="outlined"
          @update:model-value="updateTheme"
        >
          <v-btn
            v-for="option in themeOptions"
            :key="option.value"
            :value="option.value"
          >
            <v-icon :icon="option.icon" class="mr-2" />
            {{ option.title }}
          </v-btn>
        </v-btn-toggle>
      </v-card-text>
    </v-card>

    <v-card class="panel-card mt-4" flat>
      <v-card-title class="text-subtitle-1 font-weight-bold">
        Serial scanning
      </v-card-title>
      <v-divider />
      <v-card-text class="settings-row settings-row--stacked">
        <div class="settings-detail">
          <div class="settings-detail-heading">
            <v-icon icon="mdi-serial-port" color="primary" />
            <div>
              <div class="font-weight-medium">Reserved serial ports</div>
              <div class="text-body-2 muted mt-1">
                Enter one port name per line, such as <span class="mono">COM1</span> or
                <span class="mono">/dev/ttyUSB0</span>. Reserved ports stay visible in
                the picker but start unchecked.
              </div>
            </div>
          </div>
        </div>
        <div class="settings-reserved-ports-actions">
          <v-textarea
            v-model="reservedSerialPortsInput"
            auto-grow
            density="comfortable"
            hide-details
            label="Reserved port names"
            placeholder="COM1&#10;/dev/ttyUSB0"
            rows="3"
            variant="outlined"
            :disabled="!reservedSerialPortsLoaded || savingReservedSerialPorts"
          />
          <v-btn
            color="primary"
            variant="outlined"
            prepend-icon="mdi-content-save"
            :disabled="!reservedSerialPortsLoaded"
            :loading="savingReservedSerialPorts"
            @click="saveReservedSerialPorts"
          >
            Save ports
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <v-card class="panel-card mt-4" flat>
      <v-card-title class="text-subtitle-1 font-weight-bold">
        Dashboard
      </v-card-title>
      <v-divider />
      <v-card-text class="settings-row">
        <div class="settings-detail">
          <div class="settings-detail-heading">
            <v-icon icon="mdi-clock-alert-outline" color="primary" />
            <div>
              <div class="font-weight-medium">Stale scan threshold</div>
              <div class="text-body-2 muted mt-1">
                Dashboard scan freshness uses this day count.
              </div>
            </div>
          </div>
        </div>
        <div class="settings-actions settings-threshold-actions">
          <v-text-field
            v-model="scanFreshnessThresholdInput"
            class="settings-number-input"
            density="comfortable"
            hide-details
            label="Stale scan threshold"
            :min="MIN_SCAN_FRESHNESS_THRESHOLD_DAYS"
            :max="MAX_SCAN_FRESHNESS_THRESHOLD_DAYS"
            step="1"
            suffix="days"
            type="number"
            variant="outlined"
            :disabled="!scanFreshnessThresholdLoaded || savingScanFreshnessThreshold"
            @keydown.enter.prevent="saveScanFreshnessThreshold"
          />
          <v-btn
            color="primary"
            variant="outlined"
            prepend-icon="mdi-content-save"
            :disabled="!scanFreshnessThresholdLoaded"
            :loading="savingScanFreshnessThreshold"
            @click="saveScanFreshnessThreshold"
          >
            Save threshold
          </v-btn>
          <v-btn
            variant="text"
            prepend-icon="mdi-restore"
            :disabled="!scanFreshnessThresholdLoaded || savingScanFreshnessThreshold"
            @click="resetScanFreshnessThreshold"
          >
            Use default
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <v-card class="panel-card mt-4" flat>
      <v-card-title class="text-subtitle-1 font-weight-bold">
        Window
      </v-card-title>
      <v-divider />
      <v-card-text class="settings-row">
        <div>
          <div class="font-weight-medium">Window size</div>
          <div class="text-body-2 muted mt-1">
            Restores the default app window size.
          </div>
        </div>
        <v-btn
          color="primary"
          variant="outlined"
          prepend-icon="mdi-window-restore"
          :loading="resettingWindowSize"
          @click="resetWindowSize"
        >
          Reset window size
        </v-btn>
      </v-card-text>
    </v-card>

    <v-card class="panel-card mt-4" flat>
      <v-card-title class="text-subtitle-1 font-weight-bold">
        App data
      </v-card-title>
      <v-divider />
      <v-card-text class="settings-row">
        <div class="settings-detail">
          <div class="font-weight-medium">Current app data location</div>
          <div class="text-body-2 muted mt-1">
            Contains the local vault database and Electron profile files.
          </div>
          <div class="database-path mono mt-3">
            {{ databaseLocation?.userDataPath ?? "Loading..." }}
          </div>
          <div class="text-caption muted mt-2">
            Vault database folder: {{ databaseLocation?.indexedDbPath ?? "Loading..." }}
          </div>
        </div>
        <div class="settings-actions">
          <v-btn
            color="primary"
            variant="outlined"
            prepend-icon="mdi-folder-move-outline"
            :loading="changingDatabaseLocation"
            @click="openAppDataMoveConfirmation"
          >
            Change app data location
          </v-btn>
          <v-btn
            variant="outlined"
            prepend-icon="mdi-content-copy"
            :disabled="!databaseLocation"
            :loading="copyingDatabaseLocation"
            @click="copyDatabaseLocation"
          >
            Copy app data location
          </v-btn>
        </div>
      </v-card-text>
    </v-card>

    <v-dialog v-model="confirmingAppDataMove" max-width="620" persistent>
      <v-card>
        <v-card-title>Move app data location?</v-card-title>
        <v-divider />
        <v-card-text>
          <v-alert
            v-if="backupReminder.shouldWarn"
            type="warning"
            variant="tonal"
            class="mb-4"
          >
            {{ backupReminder.message }}
          </v-alert>
          <p class="mt-0">
            The selected folder becomes the Electron app data folder for ESP Board Vault.
          </p>
          <p>
            It will contain the vault database plus profile files created by Electron and Chromium, including IndexedDB, Local Storage, Session Storage, Cache, Preferences, GPUCache, and related files.
          </p>
          <p class="mb-0">
            The vault database and current window size are migrated. Cache and profile files are recreated as needed. The app will restart after the new folder is selected.
          </p>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            :disabled="changingDatabaseLocation"
            @click="confirmingAppDataMove = false"
          >
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            prepend-icon="mdi-folder-move-outline"
            :loading="changingDatabaseLocation"
            @click="changeDatabaseLocation"
          >
            Choose folder
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-snackbar
      v-model="backupReminderSnackbar"
      color="warning"
      location="bottom right"
      timeout="8000"
    >
      {{ backupReminderMessage }}
      <template #actions>
        <v-btn
          variant="text"
          @click="backupReminderSnackbar = false"
        >
          Dismiss
        </v-btn>
      </template>
    </v-snackbar>

  </section>
</template>

<style scoped>
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.settings-row--stacked {
  align-items: stretch;
  flex-direction: column;
}

.settings-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.settings-threshold-actions {
  align-items: center;
}

.settings-number-input {
  flex: 0 0 190px;
  width: 190px;
}

.settings-detail {
  min-width: 0;
}

.settings-detail-heading {
  display: flex;
  align-items: center;
  gap: 12px;
}

.settings-reserved-ports-actions {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
}

.database-path {
  max-width: 100%;
  overflow-wrap: anywhere;
  color: var(--vault-text);
  font-size: 0.84rem;
}

.theme-toggle {
  flex: 0 0 auto;
}

@media (max-width: 720px) {
  .settings-row {
    align-items: stretch;
    flex-direction: column;
  }

  .settings-actions {
    justify-content: stretch;
  }

  .settings-number-input {
    flex: 1 1 auto;
    width: 100%;
  }

  .settings-reserved-ports-actions {
    grid-template-columns: 1fr;
  }

  .theme-toggle {
    width: 100%;
  }

  .theme-toggle :deep(.v-btn) {
    flex: 1 1 0;
  }
}
</style>
