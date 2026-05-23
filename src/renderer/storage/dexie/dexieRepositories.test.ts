import Dexie from "dexie";
import { afterEach, describe, expect, it } from "vitest";
import type { BoardPartition } from "../../../shared/types/partition";
import { DexieAppSettingsRepository } from "./DexieAppSettingsRepository";
import { DexieBackupRepository } from "./DexieBackupRepository";
import { DexieBoardRepository } from "./DexieBoardRepository";
import { DexieProjectChecklistRepository } from "./DexieProjectChecklistRepository";
import { DexieProjectRepository } from "./DexieProjectRepository";
import { VaultDatabase } from "./vaultDatabase";

const testDatabases: VaultDatabase[] = [];

const samplePartition: BoardPartition = {
  label: "app0",
  type: 0,
  typeHex: "0x00",
  subtype: 16,
  subtypeHex: "0x10",
  offset: 0x10000,
  offsetHex: "0x00010000",
  sizeBytes: 0x140000,
  sizeHex: "0x00140000",
  flags: 0,
  flagsHex: "0x00000000",
  filesystem: null
};

afterEach(async () => {
  await Promise.all(
    testDatabases.splice(0).map(async (database) => {
      database.close();
      await database.delete();
    })
  );
});

describe("Dexie repositories", () => {
  it("opens the current schema with the expected tables", async () => {
    const database = createTestDatabase();

    await database.open();

    expect(database.verno).toBe(4);
    expect(database.tables.map((table) => table.name).sort()).toEqual([
      "appSettings",
      "attachments",
      "boardTags",
      "boards",
      "firmwareHistory",
      "pinAssignments",
      "projectChecklistItems",
      "projects"
    ]);
    expect(database.boards.schema.idxByName.updatedAt).toBeDefined();
    expect(database.boards.schema.idxByName.projectId).toBeDefined();
    expect(database.projects.schema.idxByName.location).toBeDefined();
    expect(database.projectChecklistItems.schema.idxByName.projectId).toBeDefined();
  });

  it("creates, lists, updates, and filters boards with scan metadata", async () => {
    const database = createTestDatabase();
    const boards = new DexieBoardRepository(database);

    const board = await boards.create({
      name: " Waveshare ESP32-S3 ",
      status: "available",
      chipModel: "ESP32-S3",
      chipRevision: 2,
      macAddress: "98:A3:16:D8:26:2C",
      flashSizeBytes: 16 * 1024 * 1024,
      flashSizeLabel: "16MB",
      flashManufacturerName: "Winbond",
      psramSizeBytes: 8 * 1024 * 1024,
      psramDetected: true,
      physicalLocation: "Bench drawer",
      partitions: [samplePartition],
      partitionTableOffset: 0x8000,
      partitionTableOffsetHex: "0x00008000",
      partitionsDetectedAt: "2026-05-18T10:00:00.000Z",
      notes: "Created from scan data."
    });

    expect(board.name).toBe("Waveshare ESP32-S3");
    expect(board.partitions).toEqual([samplePartition]);

    const updated = await boards.update(board.id, {
      status: "in_use",
      physicalLocation: "Office shelf"
    });

    expect(updated.status).toBe("in_use");
    expect(updated.chipModel).toBe("ESP32-S3");
    expect(updated.partitions).toEqual([samplePartition]);
    expect(updated.physicalLocation).toBe("Office shelf");

    await boards.create({
      name: "ESP32-C6 spare",
      status: "available",
      chipModel: "ESP32-C6"
    });

    expect(await boards.get(board.id)).toMatchObject({
      id: board.id,
      chipModel: "ESP32-S3",
      flashSizeLabel: "16MB"
    });
    expect(await boards.list({ search: "waveshare" })).toHaveLength(1);
    expect(await boards.list({ status: "available" })).toHaveLength(1);
    expect(await boards.list({ chipModel: "ESP32-S3" })).toHaveLength(1);
  });

  it("deletes board-owned records when deleting a board", async () => {
    const database = createTestDatabase();
    const boards = new DexieBoardRepository(database);
    const projects = new DexieProjectRepository(database);
    const checklists = new DexieProjectChecklistRepository(database);
    const project = await projects.create({ name: "Linked project" });
    const board = await boards.create({ name: "Delete target" });
    const now = "2026-05-18T11:00:00.000Z";

    await database.boardTags.add({
      id: "tag-1",
      boardId: board.id,
      tag: "display",
      createdAt: now
    });
    await database.firmwareHistory.add({
      id: "firmware-1",
      boardId: board.id,
      firmwareName: "factory.bin",
      version: "1.0.0",
      source: null,
      filePath: null,
      notes: null,
      flashedAt: now,
      createdAt: now
    });
    await database.attachments.add({
      id: "attachment-1",
      boardId: board.id,
      type: "photo",
      filename: "board.jpg",
      localPath: "attachments/board.jpg",
      mimeType: "image/jpeg",
      sizeBytes: 42,
      createdAt: now
    });
    await database.pinAssignments.add({
      id: "pin-1",
      boardId: board.id,
      gpio: "GPIO4",
      label: "LED",
      function: "output",
      notes: null,
      createdAt: now,
      updatedAt: now
    });
    const checklistItem = await checklists.create({
      projectId: project.id,
      boardId: board.id,
      title: "Replace board in enclosure",
      category: "hardware"
    });

    expect(await boards.delete(board.id)).toBe(true);
    expect(await boards.get(board.id)).toBeNull();
    expect(await database.boardTags.count()).toBe(0);
    expect(await database.firmwareHistory.count()).toBe(0);
    expect(await database.attachments.count()).toBe(0);
    expect(await database.pinAssignments.count()).toBe(0);
    expect(await checklists.get(checklistItem.id)).toMatchObject({
      id: checklistItem.id,
      boardId: null
    });
  });

  it("manages projects and clears board assignments without deleting boards", async () => {
    const database = createTestDatabase();
    const projects = new DexieProjectRepository(database);
    const boards = new DexieBoardRepository(database);
    const checklists = new DexieProjectChecklistRepository(database);

    const project = await projects.create({
      name: "Door panel",
      description: "Controls a prop door",
      location: "Workshop wall",
      status: "active"
    });
    const board = await boards.create({
      name: "Project board",
      projectId: project.id,
      status: "in_use"
    });
    await checklists.create({
      projectId: project.id,
      title: "Flash release firmware",
      category: "firmware"
    });

    const updatedProject = await projects.update(project.id, {
      status: "needs_repair",
      location: "Office bench"
    });

    expect(updatedProject.location).toBe("Office bench");
    expect(await projects.list({ search: "office" })).toHaveLength(1);
    expect(await projects.list({ status: "needs_repair" })).toHaveLength(1);

    expect(await projects.delete(project.id)).toBe(true);
    expect(await projects.get(project.id)).toBeNull();
    expect(await boards.get(board.id)).toMatchObject({
      id: board.id,
      projectId: null
    });
    expect(await checklists.list({ projectId: project.id })).toHaveLength(0);
  });

  it("creates, updates, orders, and deletes project checklist items", async () => {
    const database = createTestDatabase();
    const projects = new DexieProjectRepository(database);
    const checklists = new DexieProjectChecklistRepository(database);
    const project = await projects.create({ name: "Bench sensor" });

    const first = await checklists.create({
      projectId: project.id,
      title: " Label board ",
      category: "hardware"
    });
    const second = await checklists.create({
      projectId: project.id,
      title: "Test Wi-Fi connection",
      category: "testing",
      notes: "Use the workshop AP."
    });

    expect(first.title).toBe("Label board");
    expect(second.sortOrder).toBeGreaterThan(first.sortOrder);
    expect((await checklists.list({ projectId: project.id })).map((item) => item.id))
      .toEqual([first.id, second.id]);

    const completed = await checklists.update(second.id, {
      completed: true,
      sortOrder: 0
    });

    expect(completed.completed).toBe(true);
    expect(completed.completedAt).toBeTruthy();
    expect((await checklists.list({ projectId: project.id })).map((item) => item.id))
      .toEqual([second.id, first.id]);

    expect(await checklists.delete(first.id)).toBe(true);
    expect(await checklists.get(first.id)).toBeNull();
  });

  it("stores app settings", async () => {
    const database = createTestDatabase();
    const appSettings = new DexieAppSettingsRepository(database);

    const created = await appSettings.set("theme", "vaultDark");

    expect(created).toMatchObject({
      key: "theme",
      value: "vaultDark"
    });
    expect(await appSettings.get("theme")).toMatchObject({
      value: "vaultDark"
    });

    await appSettings.set("theme", "vaultLight");
    expect(await appSettings.get("theme")).toMatchObject({
      value: "vaultLight"
    });

    expect(await appSettings.delete("theme")).toBe(true);
    expect(await appSettings.get("theme")).toBeNull();
    expect(await appSettings.delete("theme")).toBe(false);
  });

  it("exports and imports a complete vault backup", async () => {
    const sourceDatabase = createTestDatabase();
    const targetDatabase = createTestDatabase();
    const sourceBoards = new DexieBoardRepository(sourceDatabase);
    const sourceProjects = new DexieProjectRepository(sourceDatabase);
    const sourceChecklists = new DexieProjectChecklistRepository(sourceDatabase);
    const sourceBackups = new DexieBackupRepository(sourceDatabase);
    const targetBoards = new DexieBoardRepository(targetDatabase);
    const targetChecklists = new DexieProjectChecklistRepository(targetDatabase);
    const targetBackups = new DexieBackupRepository(targetDatabase);
    const now = "2026-05-18T12:00:00.000Z";

    const project = await sourceProjects.create({
      name: "Millennium Falcon console",
      location: "Star Wars office"
    });
    const board = await sourceBoards.create({
      name: "Console MCU",
      projectId: project.id,
      status: "available",
      partitions: [samplePartition]
    });
    await sourceChecklists.create({
      projectId: project.id,
      boardId: board.id,
      title: "Verify control panel boot",
      category: "testing",
      completed: true
    });

    await sourceDatabase.boardTags.add({
      id: "tag-1",
      boardId: board.id,
      tag: "console",
      createdAt: now
    });
    await sourceDatabase.appSettings.add({
      key: "theme",
      value: "vaultDark",
      updatedAt: now
    });
    await targetBoards.create({ name: "Existing board", status: "broken" });

    const backup = await sourceBackups.exportBackup();
    const summary = await targetBackups.importBackup(backup);

    expect(summary.counts.boards).toBe(1);
    expect(summary.counts.projects).toBe(1);
    expect(summary.counts.projectChecklistItems).toBe(1);
    expect(summary.counts.boardTags).toBe(1);
    expect(await targetDatabase.boards.count()).toBe(1);
    expect(await targetDatabase.projects.count()).toBe(1);
    expect(await targetDatabase.projectChecklistItems.count()).toBe(1);
    expect(await targetDatabase.boardTags.count()).toBe(1);
    expect(await targetDatabase.appSettings.count()).toBe(1);
    expect((await targetBoards.list())[0]).toMatchObject({
      name: "Console MCU",
      projectId: project.id
    });
    expect((await targetChecklists.list({ projectId: project.id }))[0]).toMatchObject({
      title: "Verify control panel boot",
      completed: true,
      boardId: board.id
    });
  });

  it("calculates dashboard stats from persisted boards", async () => {
    const database = createTestDatabase();
    const boards = new DexieBoardRepository(database);

    await boards.create({
      name: "Ready board",
      status: "available",
      lastConnectedAt: "2026-05-18T10:00:00.000Z"
    });
    await boards.create({
      name: "Installed board",
      status: "in_use",
      lastConnectedAt: "2026-05-18T11:00:00.000Z"
    });
    await boards.create({ name: "Broken board", status: "broken" });
    await boards.create({ name: "Flash me", status: "needs_flashing" });

    const stats = await boards.dashboardStats();

    expect(stats.totalBoards).toBe(4);
    expect(stats.availableBoards).toBe(1);
    expect(stats.inUseBoards).toBe(1);
    expect(stats.brokenBoards).toBe(1);
    expect(stats.needsFlashingBoards).toBe(1);
    expect(stats.recentlyConnectedBoards.map((board) => board.name)).toEqual([
      "Installed board",
      "Ready board"
    ]);
  });

  it("opens data created with the v1 schema and normalizes current fields", async () => {
    const databaseName = createTestDatabaseName();
    const legacyDatabase = new Dexie(databaseName);

    legacyDatabase.version(1).stores({
      boards:
        "id, name, status, chipModel, projectId, updatedAt, lastConnectedAt, createdAt",
      projects: "id, name, status, updatedAt, createdAt",
      boardTags: "id, boardId, tag, createdAt",
      firmwareHistory: "id, boardId, firmwareName, flashedAt, createdAt",
      attachments: "id, boardId, type, filename, createdAt",
      pinAssignments: "id, boardId, gpio, updatedAt, createdAt",
      appSettings: "key, updatedAt"
    });

    await legacyDatabase.open();
    await legacyDatabase.table("projects").add({
      id: "legacy-project",
      name: "Legacy project",
      description: "Imported from v1",
      status: "active",
      createdAt: "2026-05-17T10:00:00.000Z",
      updatedAt: "2026-05-17T10:00:00.000Z"
    });
    await legacyDatabase.table("boards").add({
      id: "legacy-board",
      name: "Legacy board",
      description: "Older schema board",
      status: "available",
      chipModel: "ESP32",
      projectId: "legacy-project",
      createdAt: "2026-05-17T10:00:00.000Z",
      updatedAt: "2026-05-17T10:00:00.000Z",
      lastConnectedAt: null
    });
    legacyDatabase.close();

    const database = new VaultDatabase(databaseName);
    testDatabases.push(database);
    const boards = new DexieBoardRepository(database);
    const projects = new DexieProjectRepository(database);

    await database.open();

    expect(database.verno).toBe(4);
    expect(await projects.get("legacy-project")).toMatchObject({
      id: "legacy-project",
      location: null
    });
    expect(await boards.get("legacy-board")).toMatchObject({
      id: "legacy-board",
      chipModel: "ESP32",
      partitions: null,
      lastScannedAt: null
    });
    await projects.update("legacy-project", { location: "Archive shelf" });
    expect(await projects.get("legacy-project")).toMatchObject({
      location: "Archive shelf"
    });
  });
});

function createTestDatabase(): VaultDatabase {
  const database = new VaultDatabase(createTestDatabaseName());
  testDatabases.push(database);
  return database;
}

function createTestDatabaseName(): string {
  return `esp-board-vault-test-${crypto.randomUUID()}`;
}
