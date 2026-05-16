import { contextBridge, ipcRenderer } from "electron";
import type { EspBoardVaultApi } from "../shared/types/api";

const api: EspBoardVaultApi = {
  clipboard: {
    writeText: (text) =>
      ipcRenderer.invoke("clipboard:write-text", text) as Promise<void>
  },
  serial: {
    getLastSelectionCount: () =>
      ipcRenderer.invoke("serial:get-last-selection-count") as Promise<number>
  },
  window: {
    resetSize: () => ipcRenderer.invoke("window:reset-size") as Promise<void>
  }
};

contextBridge.exposeInMainWorld("api", api);
