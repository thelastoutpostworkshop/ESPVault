import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  screen,
  shell,
  type SaveDialogOptions,
  type OpenDialogOptions
} from "electron";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { randomUUID } from "node:crypto";
import { deflateRawSync, inflateRawSync } from "node:zlib";
import path from "node:path";
import {
  parseVaultBackup,
  type VaultBackup,
  type VaultBackupFile
} from "../shared/types/backup";
import type {
  SerialPortSelection,
  SerialPortSelectionPort
} from "../shared/types/api";
import {
  isLegacyLinuxTtyPort,
  isPreferredSerialPort,
  shouldHideLegacyLinuxTtyPortsByDefault,
  type SelectableSerialPort
} from "./serialPorts";
import { prepareUpgradeSnapshot } from "./upgradeSnapshots";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);
const SERIAL_SELECTION_CHANNEL = "serial:get-last-selection";
const SERIAL_SELECTION_COUNT_CHANNEL = "serial:get-last-selection-count";
const APP_GET_VERSION_CHANNEL = "app:get-version";
const CLIPBOARD_WRITE_TEXT_CHANNEL = "clipboard:write-text";
const DATABASE_CHANGE_LOCATION_CHANNEL = "database:change-location";
const DATABASE_CLEAR_PENDING_MOVE_CHANNEL = "database:clear-pending-move";
const DATABASE_LOCATION_CHANNEL = "database:get-location";
const DATABASE_PENDING_MOVE_CHANNEL = "database:get-pending-move";
const WINDOW_RESET_SIZE_CHANNEL = "window:reset-size";
const BACKUP_SAVE_CHANNEL = "backup:save";
const BACKUP_OPEN_CHANNEL = "backup:open";
const BACKUP_RESTORE_FILES_CHANNEL = "backup:restore-files";
const SHELL_OPEN_EXTERNAL_CHANNEL = "shell:open-external";
const BOARD_IMAGE_CHOOSE_COVER_CHANNEL = "board-image:choose-cover";
const BOARD_IMAGE_COPY_COVER_CHANNEL = "board-image:copy-cover";
const BOARD_IMAGE_DELETE_COVER_CHANNEL = "board-image:delete-cover";
const BOARD_IMAGE_READ_COVER_DATA_URL_CHANNEL = "board-image:read-cover-data-url";
const PROJECT_IMAGE_CHOOSE_COVER_CHANNEL = "project-image:choose-cover";
const PROJECT_IMAGE_COPY_COVER_CHANNEL = "project-image:copy-cover";
const PROJECT_IMAGE_DELETE_COVER_CHANNEL = "project-image:delete-cover";
const PROJECT_IMAGE_READ_COVER_DATA_URL_CHANNEL =
  "project-image:read-cover-data-url";

interface WindowSize {
  width: number;
  height: number;
}

const DEFAULT_WINDOW_SIZE: WindowSize = {
  width: 1280,
  height: 820
};
const MIN_WINDOW_SIZE: WindowSize = {
  width: 980,
  height: 680
};
const LINUX_DESKTOP_NAME = "esp-board-vault.desktop";

let lastSerialPortSelection: SerialPortSelection = createEmptySerialPortSelection();
let mainWindow: BrowserWindow | null = null;
let windowSizeSaveTimer: ReturnType<typeof setTimeout> | null = null;

interface BackupPackage {
  includedFileCount: number;
  includedFileSizeBytes: number;
  zipBuffer: Buffer;
}

interface BackupOpenPackage {
  backup: VaultBackup;
  includedFileCount: number;
  includedFileSizeBytes: number;
}

interface ZipEntryInput {
  data: Buffer;
  path: string;
}

interface ZipEntry {
  data: Buffer;
  path: string;
  uncompressedSize: number;
}

interface CoverImageFilePayload {
  data: Buffer;
  filename: string;
  mimeType: string | null;
}

app.setName(isDevelopment ? "ESP Board Vault Dev" : "ESP Board Vault");
if (process.platform === "linux") {
  app.setDesktopName(LINUX_DESKTOP_NAME);
}
applyConfiguredUserDataPath();

ipcMain.handle(APP_GET_VERSION_CHANNEL, () => app.getVersion());
ipcMain.handle(SERIAL_SELECTION_CHANNEL, () => lastSerialPortSelection);
ipcMain.handle(
  SERIAL_SELECTION_COUNT_CHANNEL,
  () => lastSerialPortSelection.selectedCount
);
ipcMain.handle(CLIPBOARD_WRITE_TEXT_CHANNEL, (_event, text: unknown) => {
  if (typeof text !== "string") {
    throw new Error("Clipboard text must be a string.");
  }

  clipboard.writeText(text);
});
ipcMain.handle(DATABASE_CHANGE_LOCATION_CHANNEL, async (event, backupContent) => {
  if (typeof backupContent !== "string" || !backupContent.trim()) {
    throw new Error("App data move content is invalid.");
  }

  const result = await showOpenDialogForSender(event.sender, {
    title: "Choose app data location",
    buttonLabel: "Move app data here",
    properties: ["openDirectory", "createDirectory"]
  });

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }

  const targetUserDataPath = path.resolve(result.filePaths[0]);
  const currentUserDataPath = path.resolve(app.getPath("userData"));

  if (isSamePath(targetUserDataPath, currentUserDataPath)) {
    return {
      canceled: false,
      indexedDbPath: path.join(currentUserDataPath, "IndexedDB"),
      restartRequired: false,
      userDataPath: currentUserDataPath
    };
  }

  assertDatabaseLocationTarget(targetUserDataPath, currentUserDataPath);
  const packagedBackup = buildBackupZipArchive(backupContent);
  writePendingDatabaseMove(targetUserDataPath, packagedBackup.zipBuffer);
  writeWindowSizeForMove(targetUserDataPath);
  writeDatabaseLocationConfig(targetUserDataPath);
  scheduleRelaunch();

  return {
    canceled: false,
    indexedDbPath: path.join(targetUserDataPath, "IndexedDB"),
    restartRequired: true,
    userDataPath: targetUserDataPath
  };
});
ipcMain.handle(DATABASE_CLEAR_PENDING_MOVE_CHANNEL, () => {
  clearPendingDatabaseMove();
});
ipcMain.handle(DATABASE_LOCATION_CHANNEL, () => getDatabaseLocation());
ipcMain.handle(DATABASE_PENDING_MOVE_CHANNEL, () => readPendingDatabaseMove());
ipcMain.handle(WINDOW_RESET_SIZE_CHANNEL, (event) => {
  const window = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;

  if (!window) {
    throw new Error("The application window is not available.");
  }

  resetWindowSize(window);
});
ipcMain.handle(BACKUP_SAVE_CHANNEL, async (event, request: unknown) => {
  const backupRequest = parseBackupSaveRequest(request);
  const packagedBackup = buildBackupZipArchive(backupRequest.content);
  const result = await showSaveDialogForSender(event.sender, {
    title: "Export backup",
    defaultPath: backupRequest.defaultFileName,
    filters: [
      { name: "ESP Board Vault Backup", extensions: ["zip"] },
      { name: "ZIP", extensions: ["zip"] }
    ]
  });

  if (result.canceled || !result.filePath) {
    return { canceled: true };
  }

  writeFileSync(result.filePath, packagedBackup.zipBuffer);
  return {
    canceled: false,
    filePath: result.filePath,
    includedFileCount: packagedBackup.includedFileCount,
    includedFileSizeBytes: packagedBackup.includedFileSizeBytes
  };
});
ipcMain.handle(BACKUP_OPEN_CHANNEL, async (event) => {
  const result = await showOpenDialogForSender(event.sender, {
    title: "Import backup",
    properties: ["openFile"],
    filters: [
      { name: "ESP Board Vault Backup", extensions: ["zip", "json"] },
      { name: "ZIP", extensions: ["zip"] },
      { name: "JSON", extensions: ["json"] }
    ]
  });

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const backupPackage = readBackupPackage(filePath);

  return {
    canceled: false,
    filePath,
    content: formatBackupContent(backupPackage.backup),
    includedFileCount: backupPackage.includedFileCount,
    includedFileSizeBytes: backupPackage.includedFileSizeBytes
  };
});
ipcMain.handle(BACKUP_RESTORE_FILES_CHANNEL, (_event, request: unknown) => {
  return restoreBackupFiles(parseBackupRestoreFilesRequest(request));
});
ipcMain.handle(BOARD_IMAGE_CHOOSE_COVER_CHANNEL, async (event, request) => {
  const { boardId } = parseBoardImageChooseRequest(request);
  const result = await showOpenDialogForSender(event.sender, {
    title: "Choose board photo",
    buttonLabel: "Use photo",
    properties: ["openFile"],
    filters: [
      {
        name: "Images",
        extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp"]
      }
    ]
  });

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }

  return copyBoardCoverImage(boardId, result.filePaths[0]);
});
ipcMain.handle(BOARD_IMAGE_COPY_COVER_CHANNEL, (_event, request) => {
  const { boardId, file } = parseBoardImageCopyRequest(request);
  return copyBoardCoverImageFile(boardId, file);
});
ipcMain.handle(BOARD_IMAGE_DELETE_COVER_CHANNEL, (_event, localPath) => {
  if (typeof localPath !== "string" || !localPath.trim()) {
    return;
  }

  deleteBoardCoverImage(localPath);
});
ipcMain.handle(BOARD_IMAGE_READ_COVER_DATA_URL_CHANNEL, (_event, localPath) => {
  if (typeof localPath !== "string" || !localPath.trim()) {
    return null;
  }

  return readBoardCoverImageDataUrl(localPath);
});
ipcMain.handle(PROJECT_IMAGE_CHOOSE_COVER_CHANNEL, async (event, request) => {
  const { projectId } = parseProjectImageChooseRequest(request);
  const result = await showOpenDialogForSender(event.sender, {
    title: "Choose project photo",
    buttonLabel: "Use photo",
    properties: ["openFile"],
    filters: [
      {
        name: "Images",
        extensions: ["jpg", "jpeg", "png", "webp", "gif", "bmp"]
      }
    ]
  });

  if (result.canceled || !result.filePaths[0]) {
    return { canceled: true };
  }

  return copyProjectCoverImage(projectId, result.filePaths[0]);
});
ipcMain.handle(PROJECT_IMAGE_COPY_COVER_CHANNEL, (_event, request) => {
  const { projectId, file } = parseProjectImageCopyRequest(request);
  return copyProjectCoverImageFile(projectId, file);
});
ipcMain.handle(PROJECT_IMAGE_DELETE_COVER_CHANNEL, (_event, localPath) => {
  if (typeof localPath !== "string" || !localPath.trim()) {
    return;
  }

  deleteProjectCoverImage(localPath);
});
ipcMain.handle(PROJECT_IMAGE_READ_COVER_DATA_URL_CHANNEL, (_event, localPath) => {
  if (typeof localPath !== "string" || !localPath.trim()) {
    return null;
  }

  return readCoverImageDataUrl(localPath);
});
ipcMain.handle(SHELL_OPEN_EXTERNAL_CHANNEL, async (_event, url: unknown) => {
  if (typeof url !== "string") {
    throw new Error("External URL must be a string.");
  }

  const parsedUrl = new URL(url);
  if (!["https:", "http:"].includes(parsedUrl.protocol)) {
    throw new Error("Only http and https URLs can be opened externally.");
  }

  await shell.openExternal(parsedUrl.toString());
});

function createMainWindow(): BrowserWindow {
  const windowSize = loadWindowSize();
  const window = new BrowserWindow({
    width: windowSize.width,
    height: windowSize.height,
    minWidth: MIN_WINDOW_SIZE.width,
    minHeight: MIN_WINDOW_SIZE.height,
    autoHideMenuBar: true,
    title: app.getName(),
    icon: getLinuxWindowIconPath(),
    backgroundColor: "#f7f8f5",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow = window;
  persistWindowSizeChanges(window);
  configureWebSerial(window);

  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  return window;
}

function getLinuxWindowIconPath(): string | undefined {
  if (process.platform !== "linux") {
    return undefined;
  }

  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, "icon.png")
    : path.join(__dirname, "..", "build", "icon.png");

  return existsSync(iconPath) ? iconPath : undefined;
}

function persistWindowSizeChanges(window: BrowserWindow): void {
  window.on("resize", () => {
    scheduleWindowSizeSave(window);
  });

  window.on("close", () => {
    saveWindowSize(window);
  });

  window.on("closed", () => {
    if (mainWindow === window) {
      mainWindow = null;
    }
  });
}

function scheduleWindowSizeSave(window: BrowserWindow): void {
  if (windowSizeSaveTimer !== null) {
    clearTimeout(windowSizeSaveTimer);
  }

  windowSizeSaveTimer = setTimeout(() => {
    saveWindowSize(window);
    windowSizeSaveTimer = null;
  }, 300);
}

function resetWindowSize(window: BrowserWindow): void {
  if (window.isMaximized()) {
    window.unmaximize();
  }

  const defaultSize = normalizeWindowSize(DEFAULT_WINDOW_SIZE);
  window.setSize(defaultSize.width, defaultSize.height);
  window.center();
  saveWindowSize(window);
}

function loadWindowSize(): WindowSize {
  try {
    const rawState = readFileSync(getWindowStateFilePath(), "utf8");
    const parsedState = JSON.parse(rawState) as Partial<WindowSize>;
    return normalizeWindowSize(parsedState);
  } catch {
    return DEFAULT_WINDOW_SIZE;
  }
}

function saveWindowSize(window: BrowserWindow): void {
  if (window.isDestroyed() || window.isMinimized() || window.isFullScreen()) {
    return;
  }

  const bounds = normalizeWindowSize(window.getBounds());

  try {
    ensureVaultDataDirectory();
    writeFileSync(
      getWindowStateFilePath(),
      `${JSON.stringify(bounds, null, 2)}\n`,
      "utf8"
    );
  } catch (caughtError) {
    console.warn("Window size could not be saved.", caughtError);
  }
}

function normalizeWindowSize(size: Partial<WindowSize>): WindowSize {
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const width = normalizeWindowDimension(
    size.width,
    MIN_WINDOW_SIZE.width,
    Math.max(MIN_WINDOW_SIZE.width, workArea.width),
    DEFAULT_WINDOW_SIZE.width
  );
  const height = normalizeWindowDimension(
    size.height,
    MIN_WINDOW_SIZE.height,
    Math.max(MIN_WINDOW_SIZE.height, workArea.height),
    DEFAULT_WINDOW_SIZE.height
  );

  return { width, height };
}

function normalizeWindowDimension(
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number
): number {
  const dimension =
    typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return Math.min(Math.max(Math.round(dimension), minimum), maximum);
}

function getWindowStateFilePath(): string {
  return path.join(ensureVaultDataDirectory(), "window-state.json");
}

function ensureVaultDataDirectory(): string {
  return ensureVaultDataDirectoryForUserData(app.getPath("userData"));
}

function ensureVaultDataDirectoryForUserData(userDataPath: string): string {
  const directory = path.join(userDataPath, "esp-board-vault");
  mkdirSync(directory, { recursive: true });
  return directory;
}

function applyConfiguredUserDataPath(): void {
  const configuredPath = loadConfiguredUserDataPath();
  if (configuredPath && !isSamePath(configuredPath, getDefaultUserDataPath())) {
    app.setPath("userData", configuredPath);
  }
}

function loadConfiguredUserDataPath(): string | null {
  try {
    const rawConfig = readFileSync(getDatabaseLocationConfigFilePath(), "utf8");
    const parsedConfig = JSON.parse(rawConfig) as Record<string, unknown>;
    const userDataPath = parsedConfig.userDataPath;

    return typeof userDataPath === "string" && userDataPath.trim()
      ? path.resolve(userDataPath)
      : null;
  } catch {
    return null;
  }
}

function writeDatabaseLocationConfig(userDataPath: string): void {
  const config = {
    userDataPath: path.resolve(userDataPath),
    updatedAt: new Date().toISOString()
  };

  mkdirSync(path.dirname(getDatabaseLocationConfigFilePath()), { recursive: true });
  writeFileSync(
    getDatabaseLocationConfigFilePath(),
    `${JSON.stringify(config, null, 2)}\n`,
    "utf8"
  );
}

function getDatabaseLocationConfigFilePath(): string {
  return path.join(
    getDefaultUserDataPath(),
    "esp-board-vault",
    "database-location.json"
  );
}

function getDefaultUserDataPath(): string {
  return path.join(app.getPath("appData"), app.getName());
}

function getDatabaseLocation(): {
  databaseName: string;
  defaultUserDataPath: string;
  indexedDbPath: string;
  isDefaultLocation: boolean;
  userDataPath: string;
} {
  const userDataPath = app.getPath("userData");
  const defaultUserDataPath = getDefaultUserDataPath();

  return {
    databaseName: "esp-board-vault",
    defaultUserDataPath,
    indexedDbPath: path.join(userDataPath, "IndexedDB"),
    isDefaultLocation: isSamePath(userDataPath, defaultUserDataPath),
    userDataPath
  };
}

function assertDatabaseLocationTarget(
  targetUserDataPath: string,
  currentUserDataPath: string
): void {
  if (isPathInside(targetUserDataPath, currentUserDataPath)) {
    throw new Error("Choose a folder outside the current app data folder.");
  }

  if (isSamePath(targetUserDataPath, getDefaultUserDataPath())) {
    return;
  }

  mkdirSync(targetUserDataPath, { recursive: true });

  const entries = readdirSync(targetUserDataPath);
  if (entries.length > 0) {
    throw new Error("Choose an empty folder for the app data location.");
  }
}

function writePendingDatabaseMove(
  targetUserDataPath: string,
  backupContent: Buffer
): void {
  const pendingMovePath = getPendingDatabaseMoveFilePath(targetUserDataPath);
  mkdirSync(path.dirname(pendingMovePath), { recursive: true });
  writeFileSync(pendingMovePath, backupContent);
}

function writeWindowSizeForMove(targetUserDataPath: string): void {
  if (
    !mainWindow ||
    mainWindow.isDestroyed() ||
    mainWindow.isMinimized() ||
    mainWindow.isFullScreen()
  ) {
    return;
  }

  const bounds = normalizeWindowSize(mainWindow.getBounds());
  const targetVaultDirectory =
    ensureVaultDataDirectoryForUserData(targetUserDataPath);

  writeFileSync(
    path.join(targetVaultDirectory, "window-state.json"),
    `${JSON.stringify(bounds, null, 2)}\n`,
    "utf8"
  );
}

function readPendingDatabaseMove(): { content?: string; filePath?: string } | null {
  const pendingMovePath = getPendingDatabaseMoveFilePath(app.getPath("userData"));

  if (existsSync(pendingMovePath)) {
    return {
      filePath: pendingMovePath
    };
  }

  const legacyPendingMovePath = getLegacyPendingDatabaseMoveFilePath(
    app.getPath("userData")
  );

  if (existsSync(legacyPendingMovePath)) {
    return {
      content: readFileSync(legacyPendingMovePath, "utf8")
    };
  }

  return null;
}

function clearPendingDatabaseMove(): void {
  const pendingMovePath = getPendingDatabaseMoveFilePath(app.getPath("userData"));

  if (existsSync(pendingMovePath)) {
    unlinkSync(pendingMovePath);
  }

  const legacyPendingMovePath = getLegacyPendingDatabaseMoveFilePath(
    app.getPath("userData")
  );

  if (existsSync(legacyPendingMovePath)) {
    unlinkSync(legacyPendingMovePath);
  }
}

function getPendingDatabaseMoveFilePath(userDataPath: string): string {
  return path.join(userDataPath, "esp-board-vault", "pending-database-move.zip");
}

function getLegacyPendingDatabaseMoveFilePath(userDataPath: string): string {
  return path.join(userDataPath, "esp-board-vault", "pending-database-move.json");
}

function scheduleRelaunch(): void {
  setTimeout(() => {
    app.relaunch();
    app.exit(0);
  }, 500);
}

function isSamePath(left: string, right: string): boolean {
  return path.resolve(left).toLowerCase() === path.resolve(right).toLowerCase();
}

function isPathInside(candidatePath: string, parentPath: string): boolean {
  const relativePath = path.relative(
    path.resolve(parentPath),
    path.resolve(candidatePath)
  );

  return (
    Boolean(relativePath) &&
    !relativePath.startsWith("..") &&
    !path.isAbsolute(relativePath)
  );
}

function parseBackupSaveRequest(request: unknown): {
  content: string;
  defaultFileName: string;
} {
  if (
    typeof request !== "object" ||
    request === null ||
    Array.isArray(request)
  ) {
    throw new Error("Backup save request is invalid.");
  }

  const { content, defaultFileName } = request as Record<string, unknown>;

  if (typeof content !== "string" || typeof defaultFileName !== "string") {
    throw new Error("Backup save request is incomplete.");
  }

  return { content, defaultFileName };
}

function parseBackupRestoreFilesRequest(request: unknown): {
  content?: string;
  filePath?: string;
} {
  if (
    typeof request !== "object" ||
    request === null ||
    Array.isArray(request)
  ) {
    throw new Error("Backup restore request is invalid.");
  }

  const { content, filePath } = request as Record<string, unknown>;
  const parsedRequest = {
    content: typeof content === "string" && content.trim() ? content : undefined,
    filePath: typeof filePath === "string" && filePath.trim() ? filePath : undefined
  };

  if (!parsedRequest.content && !parsedRequest.filePath) {
    throw new Error("Backup restore request is incomplete.");
  }

  return parsedRequest;
}

function buildBackupZipArchive(content: string): BackupPackage {
  const backup = parseBackupContent(content);
  const backupForArchive = cloneBackupWithoutLegacyFiles(backup);
  const attachmentEntries = collectBackupAttachmentEntries(backupForArchive);
  const archiveEntries: ZipEntryInput[] = [
    {
      path: "backup.json",
      data: Buffer.from(formatBackupContent(backupForArchive), "utf8")
    },
    ...attachmentEntries.map((entry) => ({
      path: entry.path,
      data: readFileSync(entry.sourcePath)
    }))
  ];

  return {
    zipBuffer: createZipArchive(archiveEntries),
    includedFileCount: attachmentEntries.length,
    includedFileSizeBytes: attachmentEntries.reduce(
      (total, entry) => total + entry.sizeBytes,
      0
    )
  };
}

function restoreBackupFiles(request: {
  content?: string;
  filePath?: string;
}): {
  content: string;
  restoredFileCount: number;
} {
  if (request.filePath) {
    const filePath = path.resolve(request.filePath);
    const fileBuffer = readFileSync(filePath);

    if (isZipBuffer(fileBuffer)) {
      return restoreZipBackup(fileBuffer);
    }

    return restoreLegacyJsonBackup(fileBuffer.toString("utf8"));
  }

  if (!request.content) {
    throw new Error("Backup restore request is incomplete.");
  }

  return restoreLegacyJsonBackup(request.content);
}

function restoreZipBackup(zipBuffer: Buffer): {
  content: string;
  restoredFileCount: number;
} {
  const zipEntries = readZipArchive(zipBuffer);
  const backupEntry = zipEntries.find((entry) => entry.path === "backup.json");
  if (!backupEntry) {
    throw new Error("Backup archive is missing backup.json.");
  }

  const backup = parseBackupContent(backupEntry.data.toString("utf8"));
  let restoredFileCount = 0;

  for (const entry of zipEntries) {
    if (!isRestorableAttachmentPath(entry.path)) {
      continue;
    }

    const targetPath = getBackupAttachmentRestorePath(entry.path);
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, entry.data);
    restoredFileCount += 1;
  }

  rewriteBackupAttachmentPaths(backup);

  return {
    content: formatBackupContent(backup),
    restoredFileCount
  };
}

function restoreLegacyJsonBackup(content: string): {
  content: string;
  restoredFileCount: number;
} {
  const backup = parseBackupContent(content);
  const legacyFiles = backup.files ?? [];

  if (!legacyFiles.length) {
    rewriteBackupAttachmentPaths(backup);
    return {
      content: formatBackupContent(backup),
      restoredFileCount: 0
    };
  }

  let restoredFileCount = 0;

  for (const file of legacyFiles) {
    const targetPath = getBackupAttachmentRestorePath(file.relativePath);
    mkdirSync(path.dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, Buffer.from(file.contentBase64, "base64"));
    restoredFileCount += 1;

    rewriteLegacyBackupFilePath(backup, file, targetPath);
  }

  delete backup.files;

  return {
    content: formatBackupContent(backup),
    restoredFileCount
  };
}

function rewriteLegacyBackupFilePath(
  backup: VaultBackup,
  file: VaultBackupFile,
  targetPath: string
): void {
  if (file.kind === "board_cover") {
    const board = backup.data.boards.find((item) => item.id === file.ownerId);

    if (board) {
      board.coverImagePath = targetPath;
      board.coverImageFilename = file.filename;
      board.coverImageMimeType = file.mimeType;
      board.coverImageSizeBytes = file.sizeBytes;
    }
  }

  if (file.kind === "project_cover") {
    const project = backup.data.projects.find((item) => item.id === file.ownerId);

    if (project) {
      project.coverImagePath = targetPath;
      project.coverImageFilename = file.filename;
      project.coverImageMimeType = file.mimeType;
      project.coverImageSizeBytes = file.sizeBytes;
    }
  }

  if (file.kind === "attachment_image") {
    const attachment = backup.data.attachments.find(
      (item) => item.id === file.ownerId
    );

    if (attachment) {
      attachment.localPath = targetPath;
      attachment.filename = file.filename;
      attachment.mimeType = file.mimeType;
      attachment.sizeBytes = file.sizeBytes;
    }
  }
}

function readBackupPackage(filePath: string): BackupOpenPackage {
  const fileBuffer = readFileSync(filePath);

  if (isZipBuffer(fileBuffer)) {
    const zipEntries = readZipArchive(fileBuffer);
    const backupEntry = zipEntries.find((entry) => entry.path === "backup.json");
    if (!backupEntry) {
      throw new Error("Backup archive is missing backup.json.");
    }

    const attachmentEntries = zipEntries.filter((entry) =>
      isRestorableAttachmentPath(entry.path)
    );

    return {
      backup: parseBackupContent(backupEntry.data.toString("utf8")),
      includedFileCount: attachmentEntries.length,
      includedFileSizeBytes: attachmentEntries.reduce(
        (total, entry) => total + entry.uncompressedSize,
        0
      )
    };
  }

  const backup = parseBackupContent(fileBuffer.toString("utf8"));
  const legacyFiles = backup.files ?? [];

  return {
    backup,
    includedFileCount: legacyFiles.length,
    includedFileSizeBytes: legacyFiles.reduce(
      (total, file) => total + (file.sizeBytes ?? 0),
      0
    )
  };
}

function parseBackupContent(content: string): VaultBackup {
  return parseVaultBackup(JSON.parse(content) as unknown);
}

function formatBackupContent(backup: VaultBackup): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

function cloneBackupWithoutLegacyFiles(backup: VaultBackup): VaultBackup {
  const clone = structuredClone(backup) as VaultBackup;
  delete clone.files;
  return clone;
}

function collectBackupAttachmentEntries(backup: VaultBackup): Array<{
  path: string;
  sizeBytes: number;
  sourcePath: string;
}> {
  const entries: Array<{
    path: string;
    sizeBytes: number;
    sourcePath: string;
  }> = [];
  const seen = new Set<string>();

  for (const board of backup.data.boards) {
    if (!board.coverImagePath) {
      continue;
    }

    const entry = createBackupAttachmentEntry(board.coverImagePath);

    if (entry && !seen.has(entry.path)) {
      seen.add(entry.path);
      entries.push(entry);
      board.coverImagePath = entry.path;
    }
  }

  for (const project of backup.data.projects) {
    if (!project.coverImagePath) {
      continue;
    }

    const entry = createBackupAttachmentEntry(project.coverImagePath);

    if (entry && !seen.has(entry.path)) {
      seen.add(entry.path);
      entries.push(entry);
      project.coverImagePath = entry.path;
    }
  }

  for (const attachment of backup.data.attachments) {
    if (!isImageAttachment(attachment.type, attachment.mimeType)) {
      continue;
    }

    const entry = createBackupAttachmentEntry(attachment.localPath);

    if (entry && !seen.has(entry.path)) {
      seen.add(entry.path);
      entries.push(entry);
      attachment.localPath = entry.path;
    }
  }

  return entries;
}

function createBackupAttachmentEntry(sourcePath: string): {
  path: string;
  sizeBytes: number;
  sourcePath: string;
} | null {
  const trimmedSourcePath = sourcePath.trim();

  if (!trimmedSourcePath) {
    return null;
  }

  const resolvedPath = path.resolve(trimmedSourcePath);
  const vaultDirectory = ensureVaultDataDirectory();

  if (!isPathInside(resolvedPath, vaultDirectory) || !existsSync(resolvedPath)) {
    return null;
  }

  const stats = statSync(resolvedPath);
  if (!stats.isFile()) {
    return null;
  }

  return {
    path: toVaultRelativePath(resolvedPath),
    sizeBytes: stats.size,
    sourcePath: resolvedPath
  };
}

function isImageAttachment(type: string, mimeType: string | null): boolean {
  return type === "photo" || Boolean(mimeType?.startsWith("image/"));
}

function toVaultRelativePath(filePath: string): string {
  return path
    .relative(ensureVaultDataDirectory(), filePath)
    .split(path.sep)
    .join("/");
}

function rewriteBackupAttachmentPaths(backup: VaultBackup): void {
  for (const board of backup.data.boards) {
    if (board.coverImagePath) {
      board.coverImagePath = resolveRestoredAttachmentPath(board.coverImagePath);
    }
  }

  for (const project of backup.data.projects) {
    if (project.coverImagePath) {
      project.coverImagePath = resolveRestoredAttachmentPath(project.coverImagePath);
    }
  }

  for (const attachment of backup.data.attachments) {
    if (attachment.localPath) {
      attachment.localPath = resolveRestoredAttachmentPath(attachment.localPath);
    }
  }

  delete backup.files;
}

function resolveRestoredAttachmentPath(value: string): string {
  return isRestorableAttachmentPath(value)
    ? getBackupAttachmentRestorePath(value)
    : value;
}

function getBackupAttachmentRestorePath(relativePath: string): string {
  const normalizedRelativePath = path.normalize(
    relativePath.replaceAll("/", path.sep)
  );

  if (
    path.isAbsolute(normalizedRelativePath) ||
    normalizedRelativePath.startsWith("..") ||
    !normalizedRelativePath.startsWith(`attachments${path.sep}`)
  ) {
    throw new Error("Backup contains an unsafe file path.");
  }

  const targetPath = path.resolve(
    ensureVaultDataDirectory(),
    normalizedRelativePath
  );

  if (!isPathInside(targetPath, ensureVaultDataDirectory())) {
    throw new Error("Backup contains a file outside the app data folder.");
  }

  return targetPath;
}

function isZipBuffer(buffer: Buffer): boolean {
  return buffer.length >= 4 && buffer.readUInt32LE(0) === 0x04034b50;
}

function isRestorableAttachmentPath(value: string): boolean {
  const normalizedPath = value.replaceAll("\\", "/");

  return (
    normalizedPath.startsWith("attachments/") &&
    !normalizedPath.endsWith("/") &&
    !path.isAbsolute(normalizedPath) &&
    !normalizedPath.split("/").includes("..")
  );
}

function createZipArchive(entries: ZipEntryInput[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const normalizedPath = normalizeZipEntryPath(entry.path);
    const nameBuffer = Buffer.from(normalizedPath, "utf8");
    const compressedData = deflateRawSync(entry.data);
    const crc = crc32(entry.data);
    const { date, time } = getCurrentDosDateTime();

    assertZipUint32(entry.data.length, "Backup entry is too large.");
    assertZipUint32(compressedData.length, "Compressed backup entry is too large.");
    assertZipUint32(offset, "Backup archive is too large.");

    const localHeader = Buffer.alloc(30);
    localHeader.writeUInt32LE(0x04034b50, 0);
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0x0800, 6);
    localHeader.writeUInt16LE(8, 8);
    localHeader.writeUInt16LE(time, 10);
    localHeader.writeUInt16LE(date, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compressedData.length, 18);
    localHeader.writeUInt32LE(entry.data.length, 22);
    localHeader.writeUInt16LE(nameBuffer.length, 26);
    localHeader.writeUInt16LE(0, 28);

    const centralHeader = Buffer.alloc(46);
    centralHeader.writeUInt32LE(0x02014b50, 0);
    centralHeader.writeUInt16LE(20, 4);
    centralHeader.writeUInt16LE(20, 6);
    centralHeader.writeUInt16LE(0x0800, 8);
    centralHeader.writeUInt16LE(8, 10);
    centralHeader.writeUInt16LE(time, 12);
    centralHeader.writeUInt16LE(date, 14);
    centralHeader.writeUInt32LE(crc, 16);
    centralHeader.writeUInt32LE(compressedData.length, 20);
    centralHeader.writeUInt32LE(entry.data.length, 24);
    centralHeader.writeUInt16LE(nameBuffer.length, 28);
    centralHeader.writeUInt16LE(0, 30);
    centralHeader.writeUInt16LE(0, 32);
    centralHeader.writeUInt16LE(0, 34);
    centralHeader.writeUInt16LE(0, 36);
    centralHeader.writeUInt32LE(0, 38);
    centralHeader.writeUInt32LE(offset, 42);

    localParts.push(localHeader, nameBuffer, compressedData);
    centralParts.push(centralHeader, nameBuffer);
    offset += localHeader.length + nameBuffer.length + compressedData.length;
  }

  const centralDirectoryOffset = offset;
  const centralDirectory = Buffer.concat(centralParts);
  const centralDirectorySize = centralDirectory.length;

  assertZipUint32(centralDirectoryOffset, "Backup archive is too large.");
  assertZipUint32(centralDirectorySize, "Backup archive is too large.");

  const endOfCentralDirectory = Buffer.alloc(22);
  endOfCentralDirectory.writeUInt32LE(0x06054b50, 0);
  endOfCentralDirectory.writeUInt16LE(0, 4);
  endOfCentralDirectory.writeUInt16LE(0, 6);
  endOfCentralDirectory.writeUInt16LE(entries.length, 8);
  endOfCentralDirectory.writeUInt16LE(entries.length, 10);
  endOfCentralDirectory.writeUInt32LE(centralDirectorySize, 12);
  endOfCentralDirectory.writeUInt32LE(centralDirectoryOffset, 16);
  endOfCentralDirectory.writeUInt16LE(0, 20);

  return Buffer.concat([...localParts, centralDirectory, endOfCentralDirectory]);
}

function readZipArchive(zipBuffer: Buffer): ZipEntry[] {
  const endOfCentralDirectoryOffset = findEndOfCentralDirectory(zipBuffer);
  const entryCount = zipBuffer.readUInt16LE(endOfCentralDirectoryOffset + 10);
  const centralDirectoryOffset = zipBuffer.readUInt32LE(
    endOfCentralDirectoryOffset + 16
  );
  const entries: ZipEntry[] = [];
  let offset = centralDirectoryOffset;

  for (let index = 0; index < entryCount; index += 1) {
    assertZipSignature(zipBuffer, offset, 0x02014b50, "Invalid ZIP directory.");

    const method = zipBuffer.readUInt16LE(offset + 10);
    const expectedCrc = zipBuffer.readUInt32LE(offset + 16);
    const compressedSize = zipBuffer.readUInt32LE(offset + 20);
    const uncompressedSize = zipBuffer.readUInt32LE(offset + 24);
    const fileNameLength = zipBuffer.readUInt16LE(offset + 28);
    const extraLength = zipBuffer.readUInt16LE(offset + 30);
    const commentLength = zipBuffer.readUInt16LE(offset + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + fileNameLength;
    const entryPath = normalizeZipEntryPath(
      zipBuffer.subarray(nameStart, nameEnd).toString("utf8")
    );

    offset = nameEnd + extraLength + commentLength;

    if (entryPath.endsWith("/")) {
      continue;
    }

    assertZipSignature(
      zipBuffer,
      localHeaderOffset,
      0x04034b50,
      "Invalid ZIP file entry."
    );

    const localFileNameLength = zipBuffer.readUInt16LE(localHeaderOffset + 26);
    const localExtraLength = zipBuffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localFileNameLength + localExtraLength;
    const dataEnd = dataStart + compressedSize;
    const compressedData = zipBuffer.subarray(dataStart, dataEnd);
    const data =
      method === 0
        ? Buffer.from(compressedData)
        : method === 8
          ? inflateRawSync(compressedData)
          : null;

    if (!data) {
      throw new Error("Backup archive uses an unsupported compression method.");
    }

    if (data.length !== uncompressedSize || crc32(data) !== expectedCrc) {
      throw new Error("Backup archive contains a damaged file.");
    }

    entries.push({
      data,
      path: entryPath,
      uncompressedSize
    });
  }

  return entries;
}

function findEndOfCentralDirectory(zipBuffer: Buffer): number {
  const minimumOffset = Math.max(0, zipBuffer.length - 65557);

  for (let offset = zipBuffer.length - 22; offset >= minimumOffset; offset -= 1) {
    if (zipBuffer.readUInt32LE(offset) === 0x06054b50) {
      return offset;
    }
  }

  throw new Error("Backup file is not a valid ZIP archive.");
}

function assertZipSignature(
  zipBuffer: Buffer,
  offset: number,
  signature: number,
  message: string
): void {
  if (offset < 0 || offset + 4 > zipBuffer.length) {
    throw new Error(message);
  }

  if (zipBuffer.readUInt32LE(offset) !== signature) {
    throw new Error(message);
  }
}

function normalizeZipEntryPath(value: string): string {
  const normalizedPath = value.replaceAll("\\", "/");

  if (
    !normalizedPath ||
    path.isAbsolute(normalizedPath) ||
    normalizedPath.split("/").includes("..")
  ) {
    throw new Error("Backup archive contains an unsafe file path.");
  }

  return normalizedPath;
}

function assertZipUint32(value: number, message: string): void {
  if (value > 0xffffffff) {
    throw new Error(message);
  }
}

function getCurrentDosDateTime(): { date: number; time: number } {
  const now = new Date();
  const year = Math.max(now.getFullYear(), 1980);

  return {
    date:
      ((year - 1980) << 9) |
      ((now.getMonth() + 1) << 5) |
      now.getDate(),
    time:
      (now.getHours() << 11) |
      (now.getMinutes() << 5) |
      Math.floor(now.getSeconds() / 2)
  };
}

const CRC32_TABLE = createCrc32Table();

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;

  for (const byte of buffer) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function createCrc32Table(): number[] {
  const table: number[] = [];

  for (let index = 0; index < 256; index += 1) {
    let value = index;

    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }

    table[index] = value >>> 0;
  }

  return table;
}

function parseBoardImageChooseRequest(request: unknown): { boardId: string } {
  if (
    typeof request !== "object" ||
    request === null ||
    Array.isArray(request)
  ) {
    throw new Error("Board photo request is invalid.");
  }

  const { boardId } = request as Record<string, unknown>;

  if (typeof boardId !== "string" || !boardId.trim()) {
    throw new Error("Board photo request is missing a board ID.");
  }

  return { boardId };
}

function parseBoardImageCopyRequest(request: unknown): {
  boardId: string;
  file: CoverImageFilePayload;
} {
  const { boardId } = parseBoardImageChooseRequest(request);
  const file = parseCoverImageFile(request, "Board");
  return { boardId, file };
}

function parseProjectImageChooseRequest(request: unknown): { projectId: string } {
  if (
    typeof request !== "object" ||
    request === null ||
    Array.isArray(request)
  ) {
    throw new Error("Project photo request is invalid.");
  }

  const { projectId } = request as Record<string, unknown>;

  if (typeof projectId !== "string" || !projectId.trim()) {
    throw new Error("Project photo request is missing a project ID.");
  }

  return { projectId };
}

function parseProjectImageCopyRequest(request: unknown): {
  projectId: string;
  file: CoverImageFilePayload;
} {
  const { projectId } = parseProjectImageChooseRequest(request);
  const file = parseCoverImageFile(request, "Project");
  return { projectId, file };
}

function parseCoverImageFile(
  request: unknown,
  label: string
): CoverImageFilePayload {
  if (
    typeof request !== "object" ||
    request === null ||
    Array.isArray(request)
  ) {
    throw new Error(`${label} photo request is invalid.`);
  }

  const { file } = request as Record<string, unknown>;

  if (typeof file !== "object" || file === null || Array.isArray(file)) {
    throw new Error(`${label} photo request is missing an image file.`);
  }

  const { data, filename, mimeType } = file as Record<string, unknown>;

  if (typeof filename !== "string" || !filename.trim()) {
    throw new Error(`${label} photo request is missing a file name.`);
  }

  const buffer = toBuffer(data);
  if (!buffer.length) {
    throw new Error(`${label} photo file is empty.`);
  }

  return {
    data: buffer,
    filename: path.basename(filename),
    mimeType: typeof mimeType === "string" && mimeType.trim() ? mimeType : null
  };
}

function toBuffer(value: unknown): Buffer {
  if (Buffer.isBuffer(value)) {
    return value;
  }

  if (value instanceof ArrayBuffer) {
    return Buffer.from(value);
  }

  if (ArrayBuffer.isView(value)) {
    return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  }

  throw new Error("Photo file content is invalid.");
}

function copyBoardCoverImage(
  boardId: string,
  sourcePath: string
): {
  canceled: false;
  dataUrl: string | null;
  filename: string;
  localPath: string;
  mimeType: string | null;
  sizeBytes: number | null;
} {
  return copyCoverImage(
    boardId,
    sourcePath,
    getBoardCoverImageDirectory,
    readBoardCoverImageDataUrl
  );
}

function copyBoardCoverImageFile(
  boardId: string,
  file: CoverImageFilePayload
): {
  canceled: false;
  dataUrl: string | null;
  filename: string;
  localPath: string;
  mimeType: string | null;
  sizeBytes: number | null;
} {
  return copyCoverImageFile(
    boardId,
    file,
    getBoardCoverImageDirectory,
    readBoardCoverImageDataUrl
  );
}

function copyProjectCoverImage(
  projectId: string,
  sourcePath: string
): {
  canceled: false;
  dataUrl: string | null;
  filename: string;
  localPath: string;
  mimeType: string | null;
  sizeBytes: number | null;
} {
  return copyCoverImage(
    projectId,
    sourcePath,
    getProjectCoverImageDirectory,
    readCoverImageDataUrl
  );
}

function copyProjectCoverImageFile(
  projectId: string,
  file: CoverImageFilePayload
): {
  canceled: false;
  dataUrl: string | null;
  filename: string;
  localPath: string;
  mimeType: string | null;
  sizeBytes: number | null;
} {
  return copyCoverImageFile(
    projectId,
    file,
    getProjectCoverImageDirectory,
    readCoverImageDataUrl
  );
}

function copyCoverImage(
  ownerId: string,
  sourcePath: string,
  getTargetDirectory: (ownerId: string) => string,
  readDataUrl: (localPath: string) => string | null
): {
  canceled: false;
  dataUrl: string | null;
  filename: string;
  localPath: string;
  mimeType: string | null;
  sizeBytes: number | null;
} {
  const resolvedSourcePath = path.resolve(sourcePath);
  const extension = getSupportedImageExtension(resolvedSourcePath);

  if (!extension) {
    throw new Error("Choose a JPG, PNG, WebP, GIF, or BMP image.");
  }

  const targetDirectory = getTargetDirectory(ownerId);
  const targetFilename = `cover-${Date.now()}-${randomUUID()}${extension}`;
  const targetPath = path.join(targetDirectory, targetFilename);

  mkdirSync(targetDirectory, { recursive: true });
  copyFileSync(resolvedSourcePath, targetPath);

  const stats = statSync(targetPath);
  const mimeType = getImageMimeType(targetPath);

  return {
    canceled: false,
    dataUrl: readDataUrl(targetPath),
    filename: path.basename(resolvedSourcePath),
    localPath: targetPath,
    mimeType,
    sizeBytes: stats.size
  };
}

function copyCoverImageFile(
  ownerId: string,
  file: CoverImageFilePayload,
  getTargetDirectory: (ownerId: string) => string,
  readDataUrl: (localPath: string) => string | null
): {
  canceled: false;
  dataUrl: string | null;
  filename: string;
  localPath: string;
  mimeType: string | null;
  sizeBytes: number | null;
} {
  const extension = getSupportedImageExtension(file.filename);

  if (!extension) {
    throw new Error("Choose a JPG, PNG, WebP, GIF, or BMP image.");
  }

  const targetDirectory = getTargetDirectory(ownerId);
  const targetFilename = `cover-${Date.now()}-${randomUUID()}${extension}`;
  const targetPath = path.join(targetDirectory, targetFilename);

  mkdirSync(targetDirectory, { recursive: true });
  writeFileSync(targetPath, file.data);

  const stats = statSync(targetPath);
  const mimeType = getImageMimeType(targetPath) ?? file.mimeType;

  return {
    canceled: false,
    dataUrl: readDataUrl(targetPath),
    filename: file.filename,
    localPath: targetPath,
    mimeType,
    sizeBytes: stats.size
  };
}

function deleteBoardCoverImage(localPath: string): void {
  const resolvedPath = path.resolve(localPath);
  assertPathInBoardImages(resolvedPath);

  if (existsSync(resolvedPath)) {
    unlinkSync(resolvedPath);
  }
}

function deleteProjectCoverImage(localPath: string): void {
  const resolvedPath = path.resolve(localPath);
  assertPathInProjectImages(resolvedPath);

  if (existsSync(resolvedPath)) {
    unlinkSync(resolvedPath);
  }
}

function readBoardCoverImageDataUrl(localPath: string): string | null {
  const resolvedPath = path.resolve(localPath);
  assertPathInBoardImages(resolvedPath);

  if (!existsSync(resolvedPath)) {
    return null;
  }

  const mimeType = getImageMimeType(resolvedPath);
  if (!mimeType) {
    throw new Error("Board photo format is not supported.");
  }

  return `data:${mimeType};base64,${readFileSync(resolvedPath).toString("base64")}`;
}

function readCoverImageDataUrl(localPath: string): string | null {
  const resolvedPath = path.resolve(localPath);
  assertPathInProjectImages(resolvedPath);

  if (!existsSync(resolvedPath)) {
    return null;
  }

  const mimeType = getImageMimeType(resolvedPath);
  if (!mimeType) {
    throw new Error("Project photo format is not supported.");
  }

  return `data:${mimeType};base64,${readFileSync(resolvedPath).toString("base64")}`;
}

function getBoardCoverImageDirectory(boardId: string): string {
  return path.join(getBoardImagesRootDirectory(), sanitizePathSegment(boardId));
}

function getBoardImagesRootDirectory(): string {
  return path.join(ensureVaultDataDirectory(), "attachments", "boards");
}

function getProjectCoverImageDirectory(projectId: string): string {
  return path.join(
    getProjectImagesRootDirectory(),
    sanitizePathSegment(projectId)
  );
}

function getProjectImagesRootDirectory(): string {
  return path.join(ensureVaultDataDirectory(), "attachments", "projects");
}

function sanitizePathSegment(value: string): string {
  const segment = value.trim().replaceAll(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);

  if (!segment) {
    throw new Error("Photo path segment is invalid.");
  }

  return segment;
}

function assertPathInBoardImages(filePath: string): void {
  const boardImagesDirectory = getBoardImagesRootDirectory();

  if (!isPathInside(filePath, boardImagesDirectory)) {
    throw new Error("Board photo must be stored inside the board images folder.");
  }
}

function assertPathInProjectImages(filePath: string): void {
  const projectImagesDirectory = getProjectImagesRootDirectory();

  if (!isPathInside(filePath, projectImagesDirectory)) {
    throw new Error("Project photo must be stored inside the project images folder.");
  }
}

function getSupportedImageExtension(filePath: string): string | null {
  const extension = path.extname(filePath).toLowerCase();
  return getImageMimeTypeByExtension(extension) ? extension : null;
}

function getImageMimeType(filePath: string): string | null {
  return getImageMimeTypeByExtension(path.extname(filePath).toLowerCase());
}

function getImageMimeTypeByExtension(extension: string): string | null {
  switch (extension) {
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    case ".bmp":
      return "image/bmp";
    default:
      return null;
  }
}

function showSaveDialogForSender(
  sender: Electron.WebContents,
  options: SaveDialogOptions
): Promise<Electron.SaveDialogReturnValue> {
  const window = BrowserWindow.fromWebContents(sender);
  return window
    ? dialog.showSaveDialog(window, options)
    : dialog.showSaveDialog(options);
}

function showOpenDialogForSender(
  sender: Electron.WebContents,
  options: OpenDialogOptions
): Promise<Electron.OpenDialogReturnValue> {
  const window = BrowserWindow.fromWebContents(sender);
  return window
    ? dialog.showOpenDialog(window, options)
    : dialog.showOpenDialog(options);
}

function configureWebSerial(window: BrowserWindow): void {
  const session = window.webContents.session;

  session.setDevicePermissionHandler((details) => {
    return details.deviceType === "serial" && isTrustedAppOrigin(details.origin);
  });

  session.setPermissionCheckHandler((_webContents, permission, origin) => {
    if ((permission as string) === "serial") {
      return isTrustedAppOrigin(origin);
    }

    return false;
  });

  session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if ((permission as string) === "serial") {
      callback(isTrustedAppOrigin(details.requestingUrl));
      return;
    }

    callback(false);
  });

  session.on("select-serial-port", async (event, portList, _webContents, callback) => {
    event.preventDefault();

    if (portList.length <= 1) {
      rememberSerialPortSelection(portList, portList);
      callback(portList[0]?.portId ?? "");
      return;
    }

    const selectedPorts = await showSerialPortPicker(window, portList);
    rememberSerialPortSelection(portList, selectedPorts);
    callback(selectedPorts[0]?.portId ?? "");
  });
}

function rememberSerialPortSelection(
  availablePorts: SelectableSerialPort[],
  selectedPorts: SelectableSerialPort[]
): void {
  lastSerialPortSelection = {
    availableCount: availablePorts.length,
    selectedCount: selectedPorts.length,
    selectedPorts: selectedPorts.map(toSerialPortSelectionPort)
  };
}

function toSerialPortSelectionPort(
  port: SelectableSerialPort
): SerialPortSelectionPort {
  return {
    usbProductId: parseUsbId(port.productId),
    usbVendorId: parseUsbId(port.vendorId)
  };
}

function createEmptySerialPortSelection(): SerialPortSelection {
  return {
    availableCount: 0,
    selectedCount: 0,
    selectedPorts: []
  };
}

function parseUsbId(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value.replace(/^0x/i, ""), 16);
  return Number.isFinite(parsed) ? parsed : null;
}

function isTrustedAppOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return false;
  }

  return (
    origin.startsWith("file://") ||
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1")
  );
}

async function showSerialPortPicker<TPort extends SelectableSerialPort>(
  window: BrowserWindow,
  ports: TPort[]
): Promise<TPort[]> {
  return new Promise((resolve) => {
    let settled = false;
    const picker = new BrowserWindow({
      width: 680,
      height: 560,
      minWidth: 560,
      minHeight: 460,
      autoHideMenuBar: true,
      parent: window,
      modal: true,
      title: "Select ESP Boards",
      icon: getLinuxWindowIconPath(),
      backgroundColor: "#f7f8f5",
      show: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        webSecurity: true
      }
    });

    const finish = (selectedIndexes: number[]) => {
      if (settled) {
        return;
      }

      settled = true;
      resolve(
        selectedIndexes
          .map((index) => ports[index])
          .filter((port): port is TPort => Boolean(port))
      );
      picker.close();
    };

    picker.webContents.on("will-navigate", (event, url) => {
      if (!url.startsWith("https://esp-board-vault.local/serial-picker/")) {
        return;
      }

      event.preventDefault();
      const parsedUrl = new URL(url);

      if (parsedUrl.pathname.endsWith("/cancel")) {
        finish([]);
        return;
      }

      const indexes = (parsedUrl.searchParams.get("indexes") ?? "")
        .split(",")
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 0);
      finish(indexes);
    });

    picker.on("closed", () => {
      if (!settled) {
        settled = true;
        resolve([]);
      }
    });

    picker.once("ready-to-show", () => {
      picker.show();
    });

    void picker.loadURL(
      `data:text/html;charset=utf-8,${encodeURIComponent(
        renderSerialPortPickerHtml(ports)
      )}`
    );
  });
}

function renderSerialPortPickerHtml(ports: SelectableSerialPort[]): string {
  const hideLegacyPortsByDefault = shouldHideLegacyLinuxTtyPortsByDefault(ports);
  const legacyPortCount = ports.filter((port) => isLegacyLinuxTtyPort(port)).length;
  const rows = ports
    .map(
      (port, index) => {
        const isLegacyPort = isLegacyLinuxTtyPort(port);
        const isInitiallyHidden = hideLegacyPortsByDefault && isLegacyPort;
        const rowClasses = ["port-row", isLegacyPort ? "legacy-port" : ""]
          .filter(Boolean)
          .join(" ");

        return `
        <label class="${rowClasses}"${isInitiallyHidden ? " hidden" : ""}>
          <input class="port-checkbox" type="checkbox" value="${index}"${
            isInitiallyHidden ? "" : " checked"
          } data-legacy="${isLegacyPort ? "true" : "false"}" />
          <span class="port-body">
            <span class="port-title">
              ${escapeHtml(formatSerialPortButton(port))}
              ${isPreferredSerialPort(port) ? '<span class="badge">Suggested</span>' : ""}
              ${isLegacyPort ? '<span class="badge badge-muted">Legacy</span>' : ""}
            </span>
            <span class="port-detail">${escapeHtml(formatSerialPortDetail(port))}</span>
          </span>
        </label>
      `;
      }
    )
    .join("");
  const legacyToggle = hideLegacyPortsByDefault
    ? `
      <label class="legacy-toggle">
        <input id="showLegacy" type="checkbox" />
        <span>Show legacy serial ports</span>
        <span class="legacy-count">${legacyPortCount} hidden</span>
      </label>
    `
    : "";

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';" />
  <title>Select ESP Boards</title>
  <style>
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #242622;
      background: #f7f8f5;
      font-family: Segoe UI, Arial, sans-serif;
      font-size: 14px;
    }
    .shell { display: flex; flex-direction: column; min-height: 100vh; }
    header { padding: 22px 24px 14px; border-bottom: 1px solid #dcded8; }
    h1 { margin: 0; font-size: 22px; font-weight: 700; }
    .subtitle { margin: 8px 0 0; color: #666d61; line-height: 1.4; }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 10px;
      flex-wrap: wrap;
      padding: 14px 24px;
      border-bottom: 1px solid #e2e4df;
      background: #ffffff;
    }
    .toolbar-spacer { flex: 1; }
    .select-all-state { color: #596154; font-size: 13px; }
    .legacy-toggle {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      color: #394035;
      font-size: 13px;
      white-space: nowrap;
    }
    .legacy-toggle input {
      width: 16px;
      height: 16px;
      margin: 0;
      accent-color: #466a3f;
    }
    .legacy-count { color: #6f7669; }
    main {
      flex: 1;
      min-height: 0;
      overflow: auto;
      padding: 14px 24px 20px;
    }
    .port-list {
      display: grid;
      gap: 8px;
    }
    .port-row {
      display: grid;
      grid-template-columns: 24px 1fr;
      gap: 12px;
      align-items: start;
      padding: 12px;
      border: 1px solid #d8dbd3;
      border-radius: 8px;
      background: #ffffff;
      cursor: pointer;
    }
    .port-row[hidden] { display: none !important; }
    .port-row:hover { border-color: #8d9a82; }
    .port-checkbox {
      width: 18px;
      height: 18px;
      margin: 2px 0 0;
      accent-color: #466a3f;
    }
    .port-body { display: grid; gap: 4px; min-width: 0; }
    .port-title {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      align-items: center;
      font-weight: 650;
      overflow-wrap: anywhere;
    }
    .port-detail {
      color: #666d61;
      line-height: 1.35;
      overflow-wrap: anywhere;
    }
    .badge {
      padding: 2px 7px;
      border-radius: 999px;
      color: #2f6d3a;
      background: #e3f0e2;
      font-size: 12px;
      font-weight: 600;
    }
    .badge-muted {
      color: #5d6458;
      background: #eef0eb;
    }
    footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 14px 24px;
      border-top: 1px solid #dcded8;
      background: #ffffff;
    }
    button {
      min-height: 34px;
      padding: 0 14px;
      border: 1px solid #c6cac1;
      border-radius: 7px;
      background: #ffffff;
      color: #242622;
      font: inherit;
      cursor: pointer;
    }
    button:hover { background: #f1f3ef; }
    button.primary {
      border-color: #466a3f;
      background: #466a3f;
      color: #ffffff;
      font-weight: 650;
    }
    button.primary:hover { background: #3c5f36; }
    button:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
  </style>
</head>
<body>
  <div class="shell">
    <header>
      <h1>Select ESP boards</h1>
      <p class="subtitle">Choose the serial ports to scan. All detected ports are selected by default.</p>
    </header>
    <div class="toolbar">
      <button id="selectAll" type="button">Select all</button>
      <button id="clearAll" type="button">Clear</button>
      ${legacyToggle}
      <span class="toolbar-spacer"></span>
      <span id="selectionState" class="select-all-state"></span>
    </div>
    <main>
      <div class="port-list">${rows}</div>
    </main>
    <footer>
      <button id="cancel" type="button">Cancel</button>
      <button id="scan" class="primary" type="button">Scan selected</button>
    </footer>
  </div>
  <script>
    const checkboxes = Array.from(document.querySelectorAll(".port-checkbox"));
    const showLegacyCheckbox = document.getElementById("showLegacy");
    const scanButton = document.getElementById("scan");
    const selectionState = document.getElementById("selectionState");

    function visibleCheckboxes() {
      return checkboxes.filter((checkbox) => !checkbox.closest(".port-row").hidden);
    }

    function checkedIndexes() {
      return visibleCheckboxes()
        .filter((checkbox) => checkbox.checked)
        .map((checkbox) => checkbox.value);
    }

    function updateState() {
      const count = checkedIndexes().length;
      const visibleCount = visibleCheckboxes().length;
      const hiddenCount = checkboxes.length - visibleCount;
      selectionState.textContent = count + " of " + visibleCount + (
        hiddenCount > 0 ? " visible" : ""
      ) + " selected";
      scanButton.disabled = count === 0;
      scanButton.textContent = count === visibleCount
        ? "Scan all (" + count + ")"
        : "Scan selected (" + count + ")";
    }

    document.getElementById("selectAll").addEventListener("click", () => {
      visibleCheckboxes().forEach((checkbox) => { checkbox.checked = true; });
      updateState();
    });

    document.getElementById("clearAll").addEventListener("click", () => {
      checkboxes.forEach((checkbox) => { checkbox.checked = false; });
      updateState();
    });

    if (showLegacyCheckbox) {
      showLegacyCheckbox.addEventListener("change", () => {
        const showLegacy = showLegacyCheckbox.checked;

        document.querySelectorAll(".legacy-port").forEach((row) => {
          row.hidden = !showLegacy;
        });

        updateState();
      });
    }

    document.getElementById("cancel").addEventListener("click", () => {
      window.location.href = "https://esp-board-vault.local/serial-picker/cancel";
    });

    document.getElementById("scan").addEventListener("click", () => {
      const indexes = checkedIndexes().join(",");
      window.location.href = "https://esp-board-vault.local/serial-picker/select?indexes=" + encodeURIComponent(indexes);
    });

    checkboxes.forEach((checkbox) => {
      checkbox.addEventListener("change", updateState);
    });

    updateState();
  </script>
</body>
</html>`;
}

function formatSerialPortButton(port: SelectableSerialPort): string {
  return port.displayName || port.portName || port.portId;
}

function formatSerialPortDetail(port: SelectableSerialPort): string {
  const identifiers = [
    port.displayName,
    port.portName,
    formatVendorProduct(port),
    port.serialNumber ? `Serial: ${port.serialNumber}` : null
  ].filter((value): value is string => Boolean(value));

  return identifiers.join(" - ") || port.portId;
}

function formatVendorProduct(port: SelectableSerialPort): string | null {
  if (!port.vendorId && !port.productId) {
    return null;
  }

  return `VID: ${port.vendorId ?? "unknown"}, PID: ${port.productId ?? "unknown"}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

app.whenReady().then(() => {
  prepareUpgradeSnapshotBeforeRenderer();

  if (process.platform !== "darwin") {
    Menu.setApplicationMenu(null);
  }

  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

function prepareUpgradeSnapshotBeforeRenderer(): void {
  if (isDevelopment) {
    return;
  }

  try {
    prepareUpgradeSnapshot({
      appVersion: app.getVersion(),
      userDataPath: app.getPath("userData")
    });
  } catch (caughtError) {
    console.warn("Upgrade safety snapshot could not be created.", caughtError);
  }
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
