import { contextBridge, ipcRenderer } from "electron";
import type { EspBoardVaultApi } from "../shared/types/api";

const api: EspBoardVaultApi = {
  app: {
    getVersion: () => ipcRenderer.invoke("app:get-version") as Promise<string>
  },
  backup: {
    open: () => ipcRenderer.invoke("backup:open") as Promise<{
      canceled: boolean;
      filePath?: string;
      content?: string;
    }>,
    restoreFiles: (request) =>
      ipcRenderer.invoke("backup:restore-files", request) as Promise<{
        content: string;
        restoredFileCount: number;
      }>,
    save: (content, defaultFileName) =>
      ipcRenderer.invoke("backup:save", {
        content,
        defaultFileName
      }) as Promise<{
        canceled: boolean;
        filePath?: string;
        includedFileCount?: number;
        includedFileSizeBytes?: number;
      }>
  },
  clipboard: {
    writeText: (text) =>
      ipcRenderer.invoke("clipboard:write-text", text) as Promise<void>
  },
  database: {
    changeLocation: (backupContent) =>
      ipcRenderer.invoke(
        "database:change-location",
        backupContent
      ) as Promise<{
        canceled: boolean;
        indexedDbPath?: string;
        restartRequired?: boolean;
        userDataPath?: string;
      }>,
    clearPendingMove: () =>
      ipcRenderer.invoke("database:clear-pending-move") as Promise<void>,
    getLocation: () =>
      ipcRenderer.invoke("database:get-location") as Promise<{
        databaseName: string;
        defaultUserDataPath: string;
        indexedDbPath: string;
        isDefaultLocation: boolean;
        userDataPath: string;
      }>,
    getPendingMove: () =>
      ipcRenderer.invoke("database:get-pending-move") as Promise<{
        content?: string;
        filePath?: string;
      } | null>
  },
  boardImages: {
    chooseCover: (boardId) =>
      ipcRenderer.invoke("board-image:choose-cover", {
        boardId
      }) as Promise<{
        canceled: boolean;
        dataUrl?: string | null;
        filename?: string;
        localPath?: string;
        mimeType?: string | null;
        sizeBytes?: number | null;
      }>,
    copyCoverFromFile: (boardId, file) =>
      ipcRenderer.invoke("board-image:copy-cover", {
        boardId,
        file
      }) as Promise<{
        canceled: boolean;
        dataUrl?: string | null;
        filename?: string;
        localPath?: string;
        mimeType?: string | null;
        sizeBytes?: number | null;
      }>,
    deleteCover: (localPath) =>
      ipcRenderer.invoke("board-image:delete-cover", localPath) as Promise<void>,
    readCoverDataUrl: (localPath) =>
      ipcRenderer.invoke(
        "board-image:read-cover-data-url",
        localPath
      ) as Promise<string | null>
  },
  projectImages: {
    chooseCover: (projectId) =>
      ipcRenderer.invoke("project-image:choose-cover", {
        projectId
      }) as Promise<{
        canceled: boolean;
        dataUrl?: string | null;
        filename?: string;
        localPath?: string;
        mimeType?: string | null;
        sizeBytes?: number | null;
      }>,
    copyCoverFromFile: (projectId, file) =>
      ipcRenderer.invoke("project-image:copy-cover", {
        projectId,
        file
      }) as Promise<{
        canceled: boolean;
        dataUrl?: string | null;
        filename?: string;
        localPath?: string;
        mimeType?: string | null;
        sizeBytes?: number | null;
      }>,
    deleteCover: (localPath) =>
      ipcRenderer.invoke("project-image:delete-cover", localPath) as Promise<void>,
    readCoverDataUrl: (localPath) =>
      ipcRenderer.invoke(
        "project-image:read-cover-data-url",
        localPath
      ) as Promise<string | null>
  },
  serial: {
    getLastSelectionCount: () =>
      ipcRenderer.invoke("serial:get-last-selection-count") as Promise<number>
  },
  shell: {
    openExternal: (url) =>
      ipcRenderer.invoke("shell:open-external", url) as Promise<void>
  },
  window: {
    resetSize: () => ipcRenderer.invoke("window:reset-size") as Promise<void>
  }
};

contextBridge.exposeInMainWorld("api", api);
