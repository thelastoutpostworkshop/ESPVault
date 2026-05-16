export interface EspBoardVaultApi {
  clipboard: {
    writeText(text: string): Promise<void>;
  };
  serial: {
    getLastSelectionCount(): Promise<number>;
  };
  window: {
    resetSize(): Promise<void>;
  };
}
