<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type {
  VaultBackup,
  VaultBackupSummary
} from "../../shared/types/backup";
import {
  parseVaultBackup,
  summarizeVaultBackup
} from "../../shared/types/backup";
import { repositories } from "../repositories";
import {
  BACKUP_STALE_AFTER_DAYS,
  getBackupReminder,
  getBackupStatus,
  recordBackupExportedAt
} from "../services/backupStatus";
import { useBoardStore } from "../stores/boardStore";
import { formatBytes, formatDate } from "../utils/boardDisplay";

const boardStore = useBoardStore();
const backupRepository = repositories.backups;
const exportingBackup = ref(false);
const openingBackup = ref(false);
const importingBackup = ref(false);
const error = ref<string | null>(null);
const backupStatusLoaded = ref(false);
const currentAppVersion = ref<string | null>(null);
const lastBackupAppVersion = ref<string | null>(null);
const lastBackupAt = ref<string | null>(null);
const notice = ref<string | null>(null);
const pendingImport = ref<{
  backup: VaultBackup;
  filePath: string;
  summary: VaultBackupSummary;
} | null>(null);
const backupReminder = computed(() =>
  getBackupReminder(lastBackupAt.value, undefined, {
    currentAppVersion: currentAppVersion.value,
    lastBackupAppVersion: lastBackupAppVersion.value
  })
);
const lastBackupLabel = computed(() =>
  lastBackupAt.value ? formatDate(lastBackupAt.value) : "No backup recorded yet"
);
const lastBackupAppVersionLabel = computed(() => {
  if (!lastBackupAt.value) {
    return null;
  }

  return lastBackupAppVersion.value
    ? `Backup app ${lastBackupAppVersion.value}`
    : "Backup app version not recorded";
});
const currentAppVersionLabel = computed(() =>
  currentAppVersion.value ? `Current app ${currentAppVersion.value}` : null
);
const lastBackupStatusColor = computed(() =>
  backupReminder.value.shouldWarn ? "warning" : "success"
);
const lastBackupStatusIcon = computed(() =>
  backupReminder.value.shouldWarn
    ? "mdi-shield-alert-outline"
    : "mdi-shield-check-outline"
);
const lastBackupStatusLabel = computed(() => {
  if (backupReminder.value.status === "never") {
    return "Never";
  }

  if (backupReminder.value.status === "stale") {
    return "Stale";
  }

  return backupReminder.value.status === "version_mismatch"
    ? "Version"
    : "Current";
});

async function exportBackup(): Promise<void> {
  exportingBackup.value = true;
  error.value = null;
  notice.value = null;

  try {
    const backup = await backupRepository.exportBackup();
    const result = await window.api.backup.save(
      JSON.stringify(backup, null, 2),
      buildBackupFileName()
    );

    if (!result.canceled) {
      await updateLastBackupAfterExport(backup.exportedAt, backup.appVersion);
      const fileCount = result.includedFileCount ?? 0;
      notice.value =
        fileCount > 0
          ? `Backup exported with ${fileCount} image file${fileCount === 1 ? "" : "s"}.`
          : "Backup exported.";
    }
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : "The backup could not be exported.";
  } finally {
    exportingBackup.value = false;
  }
}

async function openBackup(): Promise<void> {
  openingBackup.value = true;
  error.value = null;
  notice.value = null;
  pendingImport.value = null;

  try {
    const result = await window.api.backup.open();

    if (result.canceled) {
      return;
    }

    if (!result.content) {
      throw new Error("Backup file was empty.");
    }

    if (!result.filePath) {
      throw new Error("Backup file path was not available.");
    }

    const backup = parseVaultBackup(JSON.parse(result.content) as unknown);
    const summary = summarizeVaultBackup(backup);

    pendingImport.value = {
      backup,
      filePath: result.filePath,
      summary: {
        ...summary,
        fileCount: result.includedFileCount ?? summary.fileCount,
        fileSizeBytes: result.includedFileSizeBytes ?? summary.fileSizeBytes
      }
    };
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : "The backup could not be opened.";
  } finally {
    openingBackup.value = false;
  }
}

async function importBackup(): Promise<void> {
  if (!pendingImport.value) {
    return;
  }

  importingBackup.value = true;
  error.value = null;
  notice.value = null;

  try {
    const restoredBackup = await window.api.backup.restoreFiles(
      { filePath: pendingImport.value.filePath }
    );
    const backup = parseVaultBackup(JSON.parse(restoredBackup.content) as unknown);
    const summary = await backupRepository.importBackup(backup);
    await updateLastBackupAfterExport(backup.exportedAt, backup.appVersion);
    await boardStore.refresh();
    pendingImport.value = null;
    notice.value =
      restoredBackup.restoredFileCount > 0
        ? `Backup restored with ${totalRecords(summary)} records and ${restoredBackup.restoredFileCount} image file${restoredBackup.restoredFileCount === 1 ? "" : "s"}.`
        : `Backup restored with ${totalRecords(summary)} records.`;
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : "The backup could not be restored.";
  } finally {
    importingBackup.value = false;
  }
}

function buildBackupFileName(): string {
  const timestamp = new Date().toISOString().replaceAll(":", "-").slice(0, 19);
  return `esp-board-vault-backup-${timestamp}.zip`;
}

function totalRecords(summary: VaultBackupSummary): number {
  return Object.values(summary.counts).reduce((total, count) => total + count, 0);
}

async function loadLastBackupStatus(): Promise<void> {
  try {
    const backupStatus = await getBackupStatus();
    lastBackupAt.value = backupStatus.lastBackupAt;
    lastBackupAppVersion.value = backupStatus.lastBackupAppVersion;
  } catch {
    lastBackupAt.value = null;
    lastBackupAppVersion.value = null;
  } finally {
    backupStatusLoaded.value = true;
  }
}

async function loadCurrentAppVersion(): Promise<void> {
  try {
    currentAppVersion.value = await window.api.app.getVersion();
  } catch {
    currentAppVersion.value = null;
  }
}

async function updateLastBackupAfterExport(
  exportedAt: string,
  appVersion: string | null
): Promise<void> {
  try {
    const backupStatus = await recordBackupExportedAt(exportedAt, appVersion);
    lastBackupAt.value = backupStatus.lastBackupAt;
    lastBackupAppVersion.value = backupStatus.lastBackupAppVersion;
  } catch {
    lastBackupAt.value = exportedAt;
    lastBackupAppVersion.value = appVersion;
  }
}

onMounted(() => {
  void loadCurrentAppVersion();
  void loadLastBackupStatus();
});
</script>

<template>
  <section class="page-shell">
    <div class="page-header">
      <div>
        <h1 class="page-title">Backup & Restore</h1>
        <p class="page-subtitle">
          Export or restore one ZIP file containing the vault database and copied images.
        </p>
      </div>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error }}
    </v-alert>

    <v-alert v-if="notice" type="success" variant="tonal" class="mb-4">
      {{ notice }}
    </v-alert>

    <v-card class="panel-card backup-status-card mb-4" flat>
      <v-card-text class="backup-status-row">
        <div class="backup-status-detail">
          <v-icon
            :color="lastBackupStatusColor"
            :icon="lastBackupStatusIcon"
          />
          <div>
            <div class="font-weight-medium">Last backup</div>
            <div class="text-body-2 muted mt-1">
              {{ lastBackupLabel }}
            </div>
            <div
              v-if="lastBackupAppVersionLabel"
              class="backup-version-row mt-2"
            >
              <span>
                <v-icon icon="mdi-tag-outline" size="14" />
                {{ lastBackupAppVersionLabel }}
              </span>
              <span
                v-if="backupReminder.status === 'version_mismatch' && currentAppVersionLabel"
              >
                <v-icon icon="mdi-update" size="14" />
                {{ currentAppVersionLabel }}
              </span>
            </div>
            <div
              v-if="backupStatusLoaded && backupReminder.status === 'stale'"
              class="text-caption muted mt-1"
            >
              Backup recommended every {{ BACKUP_STALE_AFTER_DAYS }} days.
            </div>
            <div
              v-if="backupStatusLoaded && backupReminder.status === 'version_mismatch'"
              class="text-caption muted mt-1"
            >
              Export a backup for this app version.
            </div>
          </div>
        </div>
        <v-chip
          :color="lastBackupStatusColor"
          variant="tonal"
        >
          {{ lastBackupStatusLabel }}
        </v-chip>
      </v-card-text>
    </v-card>

    <v-alert
      class="mb-4"
      type="info"
      variant="tonal"
    >
      <template #title>
        Automatic upgrade safety snapshots
      </template>
      ESP Board Vault creates local safety snapshots inside app data before
      release upgrades. They help recover from upgrade issues, but they are not
      portable backup files. Export a backup when you need a copy outside this
      app data folder.
    </v-alert>

    <div class="backup-grid">
      <v-card class="panel-card" flat>
        <v-card-title class="text-subtitle-1 font-weight-bold">
          <v-icon class="mr-2" color="primary" icon="mdi-database-export-outline" />
          Export backup
        </v-card-title>
        <v-divider />
        <v-card-text class="backup-card-body">
          <div>
            <div class="font-weight-medium">Create a backup file</div>
            <div class="text-body-2 muted mt-1">
              Creates one .zip with backup.json plus copied images under attachments/.
            </div>
          </div>
          <v-btn
            color="primary"
            prepend-icon="mdi-database-export-outline"
            :loading="exportingBackup"
            @click="exportBackup"
          >
            Export backup
          </v-btn>
        </v-card-text>
      </v-card>

      <v-card class="panel-card" flat>
        <v-card-title class="text-subtitle-1 font-weight-bold">
          <v-icon class="mr-2" color="primary" icon="mdi-database-import-outline" />
          Import backup
        </v-card-title>
        <v-divider />
        <v-card-text class="backup-card-body">
          <div>
            <div class="font-weight-medium">Restore from a backup file</div>
            <div class="text-body-2 muted mt-1">
              Restoring replaces the current local vault after you confirm the summary.
            </div>
          </div>
          <v-btn
            variant="outlined"
            prepend-icon="mdi-database-import-outline"
            :loading="openingBackup"
            @click="openBackup"
          >
            Import backup
          </v-btn>
        </v-card-text>
      </v-card>
    </div>

    <v-dialog :model-value="Boolean(pendingImport)" max-width="540" persistent>
      <v-card>
        <v-card-title>Restore backup?</v-card-title>
        <v-divider />
        <v-card-text v-if="pendingImport">
          <v-alert
            v-if="backupReminder.shouldWarn"
            type="warning"
            variant="tonal"
            class="mb-4"
          >
            {{ backupReminder.message }}
          </v-alert>
          <p class="mt-0">
            This will replace the current local vault database.
          </p>
          <v-list density="compact" class="backup-summary">
            <v-list-item
              title="Exported"
              :subtitle="formatDate(pendingImport.summary.exportedAt)"
            />
            <v-list-item
              title="App version"
              :subtitle="pendingImport.summary.appVersion"
            />
            <v-list-item
              title="Boards"
              :subtitle="String(pendingImport.summary.counts.boards)"
            />
            <v-list-item
              title="Total records"
              :subtitle="String(totalRecords(pendingImport.summary))"
            />
            <v-list-item
              title="Image files"
              :subtitle="`${pendingImport.summary.fileCount} (${formatBytes(pendingImport.summary.fileSizeBytes)})`"
            />
          </v-list>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn
            variant="text"
            :disabled="importingBackup"
            @click="pendingImport = null"
          >
            Cancel
          </v-btn>
          <v-btn
            color="primary"
            prepend-icon="mdi-database-import-outline"
            :loading="importingBackup"
            @click="importBackup"
          >
            Restore backup
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

  </section>
</template>

<style scoped>
.backup-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.backup-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.backup-status-detail {
  display: flex;
  align-items: center;
  gap: 12px;
}

.backup-version-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
}

.backup-version-row span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--vault-muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.backup-card-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.backup-summary {
  border: 1px solid var(--vault-border);
  border-radius: 8px;
}

@media (max-width: 900px) {
  .backup-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .backup-status-row {
    align-items: flex-start;
    flex-direction: column;
  }

  .backup-card-body {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
