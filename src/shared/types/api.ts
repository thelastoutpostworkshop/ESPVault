export interface EspBoardVaultApi {
  backup: {
    open(): Promise<BackupOpenResult>;
    restoreFiles(
      request: BackupRestoreFilesRequest
    ): Promise<BackupRestoreFilesResult>;
    save(content: string, defaultFileName: string): Promise<BackupSaveResult>;
  };
  clipboard: {
    writeText(text: string): Promise<void>;
  };
  database: {
    changeLocation(backupContent: string): Promise<DatabaseChangeLocationResult>;
    clearPendingMove(): Promise<void>;
    getLocation(): Promise<DatabaseLocation>;
    getPendingMove(): Promise<DatabasePendingMove | null>;
  };
  projectImages: {
    chooseCover(projectId: string): Promise<ProjectCoverImageResult>;
    deleteCover(localPath: string): Promise<void>;
    readCoverDataUrl(localPath: string): Promise<string | null>;
  };
  serial: {
    getLastSelectionCount(): Promise<number>;
  };
  shell: {
    openExternal(url: string): Promise<void>;
  };
  window: {
    resetSize(): Promise<void>;
  };
}

export interface BackupSaveResult {
  canceled: boolean;
  filePath?: string;
  includedFileCount?: number;
  includedFileSizeBytes?: number;
}

export interface BackupOpenResult extends BackupSaveResult {
  content?: string;
}

export interface BackupRestoreFilesResult {
  content: string;
  restoredFileCount: number;
}

export interface BackupRestoreFilesRequest {
  content?: string;
  filePath?: string;
}

export interface DatabaseLocation {
  databaseName: string;
  defaultUserDataPath: string;
  indexedDbPath: string;
  isDefaultLocation: boolean;
  userDataPath: string;
}

export interface DatabaseChangeLocationResult {
  canceled: boolean;
  indexedDbPath?: string;
  restartRequired?: boolean;
  userDataPath?: string;
}

export interface DatabasePendingMove {
  content?: string;
  filePath?: string;
}

export interface ProjectCoverImageResult {
  canceled: boolean;
  dataUrl?: string | null;
  filename?: string;
  localPath?: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
}
