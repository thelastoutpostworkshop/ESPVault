export interface EspBoardVaultApi {
  backup: {
    open(): Promise<BackupOpenResult>;
    save(content: string, defaultFileName: string): Promise<BackupSaveResult>;
  };
  clipboard: {
    writeText(text: string): Promise<void>;
  };
  database: {
    getLocation(): Promise<DatabaseLocation>;
  };
  serial: {
    getLastSelectionCount(): Promise<number>;
  };
  window: {
    resetSize(): Promise<void>;
  };
}

export interface BackupSaveResult {
  canceled: boolean;
  filePath?: string;
}

export interface BackupOpenResult extends BackupSaveResult {
  content?: string;
}

export interface DatabaseLocation {
  databaseName: string;
  indexedDbPath: string;
  userDataPath: string;
}
