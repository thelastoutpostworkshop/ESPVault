import type { Board } from "./board";
import type {
  AppSetting,
  BoardAttachment,
  BoardTag,
  FirmwareHistoryEntry,
  PinAssignment,
  Project
} from "./inventory";

export const BACKUP_FORMAT = "esp-board-vault-backup";
export const BACKUP_VERSION = 1;

export interface VaultBackupTables {
  boards: Board[];
  projects: Project[];
  boardTags: BoardTag[];
  firmwareHistory: FirmwareHistoryEntry[];
  attachments: BoardAttachment[];
  pinAssignments: PinAssignment[];
  appSettings: AppSetting[];
}

export type VaultBackupCounts = Record<keyof VaultBackupTables, number>;
export type VaultBackupFileKind = "project_cover" | "attachment_image";

export interface VaultBackupFile {
  id: string;
  kind: VaultBackupFileKind;
  ownerId: string;
  filename: string;
  originalPath: string;
  relativePath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  contentBase64: string;
}

export interface VaultBackup {
  format: typeof BACKUP_FORMAT;
  version: typeof BACKUP_VERSION;
  appVersion: string;
  exportedAt: string;
  databaseName: string;
  schemaVersion: number;
  data: VaultBackupTables;
  files?: VaultBackupFile[];
}

export interface VaultBackupSummary {
  appVersion: string;
  exportedAt: string;
  schemaVersion: number;
  counts: VaultBackupCounts;
  fileCount: number;
  fileSizeBytes: number;
}

export function parseVaultBackup(value: unknown): VaultBackup {
  if (!isRecord(value)) {
    throw new Error("Backup file is not valid JSON data.");
  }

  if (value.format !== BACKUP_FORMAT) {
    throw new Error("Backup file is not an ESP Board Vault backup.");
  }

  if (value.version !== BACKUP_VERSION) {
    throw new Error("Backup version is not supported.");
  }

  if (
    typeof value.appVersion !== "string" ||
    typeof value.exportedAt !== "string" ||
    typeof value.databaseName !== "string" ||
    typeof value.schemaVersion !== "number" ||
    !isRecord(value.data)
  ) {
    throw new Error("Backup metadata is incomplete.");
  }

  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    appVersion: value.appVersion,
    exportedAt: value.exportedAt,
    databaseName: value.databaseName,
    schemaVersion: value.schemaVersion,
    data: {
      boards: readObjectArray<Board>(value.data, "boards", "id"),
      projects: readObjectArray<Project>(value.data, "projects", "id"),
      boardTags: readObjectArray<BoardTag>(value.data, "boardTags", "id"),
      firmwareHistory: readObjectArray<FirmwareHistoryEntry>(
        value.data,
        "firmwareHistory",
        "id"
      ),
      attachments: readObjectArray<BoardAttachment>(
        value.data,
        "attachments",
        "id"
      ),
      pinAssignments: readObjectArray<PinAssignment>(
        value.data,
        "pinAssignments",
        "id"
      ),
      appSettings: readObjectArray<AppSetting>(value.data, "appSettings", "key")
    },
    files: readBackupFiles(value.files)
  };
}

export function summarizeVaultBackup(backup: VaultBackup): VaultBackupSummary {
  return {
    appVersion: backup.appVersion,
    exportedAt: backup.exportedAt,
    schemaVersion: backup.schemaVersion,
    counts: {
      boards: backup.data.boards.length,
      projects: backup.data.projects.length,
      boardTags: backup.data.boardTags.length,
      firmwareHistory: backup.data.firmwareHistory.length,
      attachments: backup.data.attachments.length,
      pinAssignments: backup.data.pinAssignments.length,
      appSettings: backup.data.appSettings.length
    },
    fileCount: (backup.files ?? []).length,
    fileSizeBytes: (backup.files ?? []).reduce(
      (total, file) => total + (file.sizeBytes ?? 0),
      0
    )
  };
}

function readObjectArray<TRecord>(
  container: Record<string, unknown>,
  key: string,
  primaryKey: string
): TRecord[] {
  const value = container[key];

  if (!Array.isArray(value)) {
    throw new Error(`Backup table "${key}" is missing.`);
  }

  if (
    value.some(
      (item) => !isRecord(item) || typeof item[primaryKey] !== "string"
    )
  ) {
    throw new Error(`Backup table "${key}" contains invalid records.`);
  }

  return value as TRecord[];
}

function readBackupFiles(value: unknown): VaultBackupFile[] {
  if (value === undefined) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new Error('Backup field "files" is invalid.');
  }

  return value.map((item) => {
    if (!isRecord(item)) {
      throw new Error('Backup field "files" contains invalid entries.');
    }

    const kindValue = item.kind;
    if (kindValue !== "project_cover" && kindValue !== "attachment_image") {
      throw new Error("Backup contains an unsupported file entry.");
    }
    const kind: VaultBackupFileKind = kindValue;

    const file = {
      id: readString(item, "id"),
      kind,
      ownerId: readString(item, "ownerId"),
      filename: readString(item, "filename"),
      originalPath: readString(item, "originalPath"),
      relativePath: readString(item, "relativePath"),
      mimeType: readNullableString(item, "mimeType"),
      sizeBytes: readNullableNumber(item, "sizeBytes"),
      contentBase64: readString(item, "contentBase64")
    };

    if (!file.contentBase64) {
      throw new Error("Backup contains an empty file entry.");
    }

    return file;
  });
}

function readString(container: Record<string, unknown>, key: string): string {
  const value = container[key];
  if (typeof value !== "string") {
    throw new Error(`Backup file field "${key}" is invalid.`);
  }

  return value;
}

function readNullableString(
  container: Record<string, unknown>,
  key: string
): string | null {
  const value = container[key];
  if (value === null) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error(`Backup file field "${key}" is invalid.`);
  }

  return value;
}

function readNullableNumber(
  container: Record<string, unknown>,
  key: string
): number | null {
  const value = container[key];
  if (value === null) {
    return null;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Backup file field "${key}" is invalid.`);
  }

  return value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
