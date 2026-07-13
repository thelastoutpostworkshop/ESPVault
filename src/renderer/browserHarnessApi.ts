import type {
  CoverImageFileInput,
  CoverImageResult,
  EspBoardVaultApi
} from "../shared/types/api";

const coverImageDataUrls = new Map<string, string>();

export function installBrowserHarnessApi(): void {
  window.api = {
    app: {
      getVersion: async () => "browser-harness"
    },
    backup: {
      open: async () => ({ canceled: true }),
      restoreFiles: async () => ({
        content: "{}",
        restoredFileCount: 0
      }),
      save: async () => ({ canceled: true })
    },
    clipboard: {
      writeText: async (text) => {
        await writeClipboardText(text);
      }
    },
    database: {
      changeLocation: async () => ({ canceled: true }),
      clearPendingMove: async () => undefined,
      getLocation: async () => ({
        databaseName: "esp-board-vault",
        defaultUserDataPath: "browser-harness",
        indexedDbPath: "browser-harness/IndexedDB",
        isDefaultLocation: true,
        userDataPath: "browser-harness"
      }),
      getPendingMove: async () => null
    },
    boardImages: createCoverImageApi("board"),
    projectImages: createCoverImageApi("project"),
    serial: {
      getLastSelection: async () => ({
        availableCount: 0,
        selectedCount: 0,
        selectedPorts: []
      }),
      getLastSelectionCount: async () => 0,
      setReservedPortNames: async () => undefined
    },
    shell: {
      openExternal: async (url) => {
        console.info("Browser harness blocked external open.", url);
      }
    },
    window: {
      resetSize: async () => undefined
    }
  };
}

function createCoverImageApi(ownerType: "board" | "project"): EspBoardVaultApi["boardImages"] {
  return {
    chooseCover: async () => ({ canceled: true }),
    copyCoverFromFile: async (ownerId, file) =>
      copyCoverImageFromFile(ownerType, ownerId, file),
    deleteCover: async (localPath) => {
      coverImageDataUrls.delete(localPath);
    },
    readCoverDataUrl: async (localPath) => coverImageDataUrls.get(localPath) ?? null
  };
}

async function copyCoverImageFromFile(
  ownerType: "board" | "project",
  ownerId: string,
  file: CoverImageFileInput
): Promise<CoverImageResult> {
  const dataUrl = arrayBufferToDataUrl(file.data, file.mimeType ?? "application/octet-stream");
  const localPath = `browser-harness://${ownerType}-images/${ownerId}/${Date.now()}-${file.filename}`;
  coverImageDataUrls.set(localPath, dataUrl);

  return {
    canceled: false,
    dataUrl,
    filename: file.filename,
    localPath,
    mimeType: file.mimeType ?? null,
    sizeBytes: file.data.byteLength
  };
}

function arrayBufferToDataUrl(data: ArrayBuffer, mimeType: string): string {
  const bytes = new Uint8Array(data);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return `data:${mimeType};base64,${btoa(binary)}`;
}

async function writeClipboardText(text: string): Promise<void> {
  if (!navigator.clipboard?.writeText) {
    console.info("Browser harness clipboard write.", text);
    return;
  }

  try {
    await navigator.clipboard.writeText(text);
  } catch {
    console.info("Browser harness clipboard write.", text);
  }
}
