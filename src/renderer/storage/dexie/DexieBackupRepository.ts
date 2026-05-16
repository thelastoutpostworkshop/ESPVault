import packageMetadata from "../../../../package.json";
import {
  BACKUP_FORMAT,
  BACKUP_VERSION,
  summarizeVaultBackup,
  type VaultBackup,
  type VaultBackupSummary
} from "../../../shared/types/backup";
import type { BackupRepository } from "../../repositories/BackupRepository";
import { vaultDatabase } from "./vaultDatabase";

export class DexieBackupRepository implements BackupRepository {
  async exportBackup(): Promise<VaultBackup> {
    const [
      boards,
      projects,
      boardTags,
      firmwareHistory,
      attachments,
      pinAssignments,
      appSettings
    ] = await Promise.all([
      vaultDatabase.boards.toArray(),
      vaultDatabase.projects.toArray(),
      vaultDatabase.boardTags.toArray(),
      vaultDatabase.firmwareHistory.toArray(),
      vaultDatabase.attachments.toArray(),
      vaultDatabase.pinAssignments.toArray(),
      vaultDatabase.appSettings.toArray()
    ]);

    return {
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      appVersion: packageMetadata.version,
      exportedAt: new Date().toISOString(),
      databaseName: vaultDatabase.name,
      schemaVersion: vaultDatabase.verno,
      data: {
        boards,
        projects,
        boardTags,
        firmwareHistory,
        attachments,
        pinAssignments,
        appSettings
      }
    };
  }

  async importBackup(backup: VaultBackup): Promise<VaultBackupSummary> {
    await vaultDatabase.transaction(
      "rw",
      [
        vaultDatabase.boards,
        vaultDatabase.projects,
        vaultDatabase.boardTags,
        vaultDatabase.firmwareHistory,
        vaultDatabase.attachments,
        vaultDatabase.pinAssignments,
        vaultDatabase.appSettings
      ],
      async () => {
        await Promise.all([
          vaultDatabase.boards.clear(),
          vaultDatabase.projects.clear(),
          vaultDatabase.boardTags.clear(),
          vaultDatabase.firmwareHistory.clear(),
          vaultDatabase.attachments.clear(),
          vaultDatabase.pinAssignments.clear(),
          vaultDatabase.appSettings.clear()
        ]);

        await Promise.all([
          vaultDatabase.boards.bulkPut(backup.data.boards),
          vaultDatabase.projects.bulkPut(backup.data.projects),
          vaultDatabase.boardTags.bulkPut(backup.data.boardTags),
          vaultDatabase.firmwareHistory.bulkPut(backup.data.firmwareHistory),
          vaultDatabase.attachments.bulkPut(backup.data.attachments),
          vaultDatabase.pinAssignments.bulkPut(backup.data.pinAssignments),
          vaultDatabase.appSettings.bulkPut(backup.data.appSettings)
        ]);
      }
    );

    return summarizeVaultBackup(backup);
  }
}
