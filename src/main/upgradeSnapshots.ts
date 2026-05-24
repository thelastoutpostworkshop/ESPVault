import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import path from "node:path";

const VAULT_DIRECTORY_NAME = "esp-board-vault";
const UPGRADE_SNAPSHOTS_DIRECTORY_NAME = "upgrade-snapshots";
const UPGRADE_STATE_FILENAME = "upgrade-state.json";
const UPGRADE_SNAPSHOT_MANIFEST_FILENAME = "snapshot-manifest.json";
const DEFAULT_MAX_UPGRADE_SNAPSHOTS = 5;

interface UpgradeSnapshotOptions {
  appVersion: string;
  maxSnapshots?: number;
  now?: Date;
  userDataPath: string;
}

interface UpgradeState {
  appVersion: string;
  updatedAt: string;
}

interface UpgradeSnapshotManifest {
  createdAt: string;
  fromVersion: string;
  includedPaths: string[];
  toVersion: string;
  userDataPath: string;
}

interface SnapshotSource {
  relativePath: string;
  requiredForSnapshot: boolean;
}

const SNAPSHOT_SOURCES: SnapshotSource[] = [
  { relativePath: "IndexedDB", requiredForSnapshot: true },
  { relativePath: "Local Storage", requiredForSnapshot: true },
  {
    relativePath: path.join(VAULT_DIRECTORY_NAME, "attachments"),
    requiredForSnapshot: true
  },
  {
    relativePath: path.join(VAULT_DIRECTORY_NAME, "window-state.json"),
    requiredForSnapshot: false
  }
];

export function prepareUpgradeSnapshot(options: UpgradeSnapshotOptions): void {
  const userDataPath = path.resolve(options.userDataPath);
  const appVersion = normalizeVersion(options.appVersion);
  const now = options.now ?? new Date();
  const previousVersion = readUpgradeState(userDataPath)?.appVersion ?? null;
  const hasExistingData = hasSnapshotSourceData(userDataPath);
  const shouldSnapshot =
    hasExistingData &&
    (previousVersion === null || previousVersion !== appVersion);

  if (shouldSnapshot) {
    createUpgradeSnapshot({
      appVersion,
      fromVersion: previousVersion ?? "unknown",
      now,
      userDataPath
    });
  }

  writeUpgradeState(userDataPath, {
    appVersion,
    updatedAt: now.toISOString()
  });
  pruneUpgradeSnapshots(
    userDataPath,
    options.maxSnapshots ?? DEFAULT_MAX_UPGRADE_SNAPSHOTS
  );
}

function createUpgradeSnapshot(options: {
  appVersion: string;
  fromVersion: string;
  now: Date;
  userDataPath: string;
}): void {
  const snapshotRoot = getUpgradeSnapshotsDirectory(options.userDataPath);
  const snapshotName = formatSnapshotName(
    options.now,
    options.fromVersion,
    options.appVersion
  );
  const snapshotPath = getUniqueDirectoryPath(snapshotRoot, snapshotName);
  const temporarySnapshotPath = getUniqueDirectoryPath(
    snapshotRoot,
    `${snapshotName}.tmp-${process.pid}`
  );
  const includedPaths: string[] = [];

  mkdirSync(snapshotRoot, { recursive: true });
  mkdirSync(temporarySnapshotPath, { recursive: true });

  try {
    for (const source of SNAPSHOT_SOURCES) {
      const sourcePath = path.join(options.userDataPath, source.relativePath);

      if (!existsSync(sourcePath)) {
        continue;
      }

      const targetPath = path.join(temporarySnapshotPath, source.relativePath);
      mkdirSync(path.dirname(targetPath), { recursive: true });
      cpSync(sourcePath, targetPath, {
        dereference: false,
        errorOnExist: false,
        force: true,
        recursive: statSync(sourcePath).isDirectory()
      });
      includedPaths.push(normalizeManifestPath(source.relativePath));
    }

    const manifest: UpgradeSnapshotManifest = {
      createdAt: options.now.toISOString(),
      fromVersion: options.fromVersion,
      includedPaths,
      toVersion: options.appVersion,
      userDataPath: options.userDataPath
    };

    writeFileSync(
      path.join(temporarySnapshotPath, UPGRADE_SNAPSHOT_MANIFEST_FILENAME),
      `${JSON.stringify(manifest, null, 2)}\n`,
      "utf8"
    );
    renameSync(temporarySnapshotPath, snapshotPath);
  } catch (error) {
    removeDirectoryInsideSnapshotRoot(temporarySnapshotPath, snapshotRoot);
    throw error;
  }
}

function hasSnapshotSourceData(userDataPath: string): boolean {
  return SNAPSHOT_SOURCES.some(
    (source) =>
      source.requiredForSnapshot &&
      pathHasContent(path.join(userDataPath, source.relativePath))
  );
}

function pathHasContent(filePath: string): boolean {
  if (!existsSync(filePath)) {
    return false;
  }

  const stats = statSync(filePath);

  if (stats.isFile()) {
    return stats.size > 0;
  }

  if (stats.isDirectory()) {
    return readdirSync(filePath).length > 0;
  }

  return false;
}

function readUpgradeState(userDataPath: string): UpgradeState | null {
  try {
    const rawState = readFileSync(getUpgradeStateFilePath(userDataPath), "utf8");
    const parsedState = JSON.parse(rawState) as Partial<UpgradeState>;

    if (
      typeof parsedState.appVersion !== "string" ||
      !parsedState.appVersion.trim() ||
      typeof parsedState.updatedAt !== "string" ||
      !parsedState.updatedAt.trim()
    ) {
      return null;
    }

    return {
      appVersion: parsedState.appVersion,
      updatedAt: parsedState.updatedAt
    };
  } catch {
    return null;
  }
}

function writeUpgradeState(userDataPath: string, state: UpgradeState): void {
  mkdirSync(getVaultDataDirectory(userDataPath), { recursive: true });
  writeFileSync(
    getUpgradeStateFilePath(userDataPath),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8"
  );
}

function pruneUpgradeSnapshots(userDataPath: string, maxSnapshots: number): void {
  if (maxSnapshots < 1) {
    return;
  }

  const snapshotRoot = getUpgradeSnapshotsDirectory(userDataPath);

  if (!existsSync(snapshotRoot)) {
    return;
  }

  const snapshots = readdirSync(snapshotRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !entry.name.includes(".tmp-"))
    .map((entry) => entry.name)
    .sort((left, right) => right.localeCompare(left));

  for (const snapshotName of snapshots.slice(maxSnapshots)) {
    removeDirectoryInsideSnapshotRoot(
      path.join(snapshotRoot, snapshotName),
      snapshotRoot
    );
  }
}

function removeDirectoryInsideSnapshotRoot(
  directoryPath: string,
  snapshotRoot: string
): void {
  const resolvedDirectoryPath = path.resolve(directoryPath);
  const resolvedSnapshotRoot = path.resolve(snapshotRoot);

  if (!isPathInside(resolvedDirectoryPath, resolvedSnapshotRoot)) {
    throw new Error("Refusing to remove a path outside upgrade snapshots.");
  }

  rmSync(resolvedDirectoryPath, { force: true, recursive: true });
}

function getVaultDataDirectory(userDataPath: string): string {
  return path.join(userDataPath, VAULT_DIRECTORY_NAME);
}

function getUpgradeStateFilePath(userDataPath: string): string {
  return path.join(getVaultDataDirectory(userDataPath), UPGRADE_STATE_FILENAME);
}

function getUpgradeSnapshotsDirectory(userDataPath: string): string {
  return path.join(
    getVaultDataDirectory(userDataPath),
    UPGRADE_SNAPSHOTS_DIRECTORY_NAME
  );
}

function getUniqueDirectoryPath(parentDirectory: string, baseName: string): string {
  let candidatePath = path.join(parentDirectory, baseName);
  let suffix = 1;

  while (existsSync(candidatePath)) {
    candidatePath = path.join(parentDirectory, `${baseName}-${suffix}`);
    suffix += 1;
  }

  return candidatePath;
}

function formatSnapshotName(
  now: Date,
  fromVersion: string,
  toVersion: string
): string {
  const timestamp = now.toISOString().replaceAll(/[:.]/g, "-");
  return `${timestamp}-${sanitizePathSegment(fromVersion)}-to-${sanitizePathSegment(
    toVersion
  )}`;
}

function sanitizePathSegment(value: string): string {
  const sanitized = value.replaceAll(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
  return sanitized || "unknown";
}

function normalizeVersion(value: string): string {
  const version = value.trim();
  return version || "unknown";
}

function normalizeManifestPath(value: string): string {
  return value.replaceAll(path.sep, "/");
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
