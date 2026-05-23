<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { DatabaseLocation } from "../../shared/types/api";
import {
  useVaultTheme,
  type VaultThemeName
} from "../composables/useVaultTheme";
import { repositories } from "../repositories";

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
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const databaseLocation = ref<DatabaseLocation | null>(null);
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

function updateTheme(themeName: unknown): void {
  if (themeName === "vaultLight" || themeName === "vaultDark") {
    setTheme(themeName);
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

onMounted(() => {
  void loadDatabaseLocation();
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
            @click="confirmingAppDataMove = true"
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

  </section>
</template>

<style scoped>
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.settings-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.settings-detail {
  min-width: 0;
}

.settings-detail-heading {
  display: flex;
  align-items: center;
  gap: 12px;
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

  .theme-toggle {
    width: 100%;
  }

  .theme-toggle :deep(.v-btn) {
    flex: 1 1 0;
  }
}
</style>
