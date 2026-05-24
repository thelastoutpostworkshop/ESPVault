import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareUpgradeSnapshot } from "./upgradeSnapshots";

const temporaryDirectories: string[] = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("upgrade snapshots", () => {
  it("creates a snapshot for existing data without a previous version marker", () => {
    const userDataPath = createTemporaryUserDataPath();
    const indexedDbFile = path.join(
      userDataPath,
      "IndexedDB",
      "file__0.indexeddb.leveldb",
      "LOG"
    );
    mkdirSync(path.dirname(indexedDbFile), { recursive: true });
    writeFileSync(indexedDbFile, "existing database");

    prepareUpgradeSnapshot({
      appVersion: "1.0.8",
      now: new Date("2026-05-24T12:00:00.000Z"),
      userDataPath
    });

    const [snapshotPath] = listSnapshotPaths(userDataPath);
    expect(snapshotPath).toBeDefined();
    expect(
      existsSync(
        path.join(snapshotPath, "IndexedDB", "file__0.indexeddb.leveldb", "LOG")
      )
    ).toBe(true);
    expect(readSnapshotManifest(snapshotPath)).toMatchObject({
      fromVersion: "unknown",
      includedPaths: ["IndexedDB"],
      toVersion: "1.0.8"
    });
    expect(readUpgradeState(userDataPath)).toMatchObject({
      appVersion: "1.0.8"
    });
  });

  it("writes the version marker without a snapshot for a fresh install", () => {
    const userDataPath = createTemporaryUserDataPath();

    prepareUpgradeSnapshot({
      appVersion: "1.0.8",
      now: new Date("2026-05-24T12:00:00.000Z"),
      userDataPath
    });

    expect(listSnapshotPaths(userDataPath)).toHaveLength(0);
    expect(readUpgradeState(userDataPath)).toMatchObject({
      appVersion: "1.0.8"
    });
  });

  it("creates a snapshot only when the recorded app version changes", () => {
    const userDataPath = createTemporaryUserDataPath();
    const attachmentPath = path.join(
      userDataPath,
      "esp-board-vault",
      "attachments",
      "boards",
      "cover.png"
    );
    mkdirSync(path.dirname(attachmentPath), { recursive: true });
    writeFileSync(attachmentPath, "image data");

    prepareUpgradeSnapshot({
      appVersion: "1.0.8",
      now: new Date("2026-05-24T12:00:00.000Z"),
      userDataPath
    });
    prepareUpgradeSnapshot({
      appVersion: "1.0.8",
      now: new Date("2026-05-24T12:05:00.000Z"),
      userDataPath
    });
    prepareUpgradeSnapshot({
      appVersion: "1.0.9",
      now: new Date("2026-05-24T12:10:00.000Z"),
      userDataPath
    });

    const snapshots = listSnapshotPaths(userDataPath);
    expect(snapshots).toHaveLength(2);
    expect(readSnapshotManifest(snapshots[0])).toMatchObject({
      fromVersion: "1.0.8",
      includedPaths: ["esp-board-vault/attachments"],
      toVersion: "1.0.9"
    });
  });

  it("keeps only the newest configured number of snapshots", () => {
    const userDataPath = createTemporaryUserDataPath();
    const indexedDbFile = path.join(userDataPath, "IndexedDB", "db.log");
    mkdirSync(path.dirname(indexedDbFile), { recursive: true });
    writeFileSync(indexedDbFile, "existing database");

    prepareUpgradeSnapshot({
      appVersion: "1.0.1",
      maxSnapshots: 2,
      now: new Date("2026-05-24T12:00:00.000Z"),
      userDataPath
    });
    prepareUpgradeSnapshot({
      appVersion: "1.0.2",
      maxSnapshots: 2,
      now: new Date("2026-05-24T12:10:00.000Z"),
      userDataPath
    });
    prepareUpgradeSnapshot({
      appVersion: "1.0.3",
      maxSnapshots: 2,
      now: new Date("2026-05-24T12:20:00.000Z"),
      userDataPath
    });

    const snapshots = listSnapshotPaths(userDataPath);
    expect(snapshots).toHaveLength(2);
    expect(readSnapshotManifest(snapshots[0])).toMatchObject({
      toVersion: "1.0.3"
    });
    expect(readSnapshotManifest(snapshots[1])).toMatchObject({
      toVersion: "1.0.2"
    });
  });
});

function createTemporaryUserDataPath(): string {
  const directory = mkdtempSync(path.join(tmpdir(), "esp-board-vault-test-"));
  temporaryDirectories.push(directory);
  return directory;
}

function listSnapshotPaths(userDataPath: string): string[] {
  const snapshotRoot = path.join(
    userDataPath,
    "esp-board-vault",
    "upgrade-snapshots"
  );

  if (!existsSync(snapshotRoot)) {
    return [];
  }

  return readdirSync(snapshotRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(snapshotRoot, entry.name))
    .sort((left, right) => path.basename(right).localeCompare(path.basename(left)));
}

function readSnapshotManifest(snapshotPath: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(path.join(snapshotPath, "snapshot-manifest.json"), "utf8")
  ) as Record<string, unknown>;
}

function readUpgradeState(userDataPath: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(
      path.join(userDataPath, "esp-board-vault", "upgrade-state.json"),
      "utf8"
    )
  ) as Record<string, unknown>;
}
