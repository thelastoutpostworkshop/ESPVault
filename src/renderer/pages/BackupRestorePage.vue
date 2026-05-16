<script setup lang="ts">
import { ref } from "vue";
import type {
  VaultBackup,
  VaultBackupSummary
} from "../../shared/types/backup";
import {
  parseVaultBackup,
  summarizeVaultBackup
} from "../../shared/types/backup";
import { repositories } from "../repositories";
import { useBoardStore } from "../stores/boardStore";
import { formatBytes, formatDate } from "../utils/boardDisplay";

const boardStore = useBoardStore();
const backupRepository = repositories.backups;
const exportingBackup = ref(false);
const openingBackup = ref(false);
const importingBackup = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);
const pendingImport = ref<{
  backup: VaultBackup;
  filePath: string;
  summary: VaultBackupSummary;
} | null>(null);

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

    <div class="backup-grid">
      <v-card flat border>
        <v-card-title class="text-subtitle-1 font-weight-bold">
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

      <v-card flat border>
        <v-card-title class="text-subtitle-1 font-weight-bold">
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

.backup-card-body {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

.backup-summary {
  border: 1px solid #e1e4dc;
}

@media (max-width: 900px) {
  .backup-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 720px) {
  .backup-card-body {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
