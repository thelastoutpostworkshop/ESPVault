import Dexie, { type Table } from "dexie";
import type { Board } from "../../../shared/types/board";
import type {
  AppSetting,
  BoardAttachment,
  BoardTag,
  FirmwareHistoryEntry,
  PinAssignment,
  Project,
  ProjectChecklistItem
} from "../../../shared/types/inventory";

export class VaultDatabase extends Dexie {
  boards!: Table<Board, string>;
  projects!: Table<Project, string>;
  projectChecklistItems!: Table<ProjectChecklistItem, string>;
  boardTags!: Table<BoardTag, string>;
  firmwareHistory!: Table<FirmwareHistoryEntry, string>;
  attachments!: Table<BoardAttachment, string>;
  pinAssignments!: Table<PinAssignment, string>;
  appSettings!: Table<AppSetting, string>;

  constructor(databaseName = "esp-board-vault") {
    super(databaseName);

    this.version(1).stores({
      boards:
        "id, name, status, chipModel, projectId, updatedAt, lastConnectedAt, createdAt",
      projects: "id, name, status, updatedAt, createdAt",
      boardTags: "id, boardId, tag, createdAt",
      firmwareHistory: "id, boardId, firmwareName, flashedAt, createdAt",
      attachments: "id, boardId, type, filename, createdAt",
      pinAssignments: "id, boardId, gpio, updatedAt, createdAt",
      appSettings: "key, updatedAt"
    });

    this.version(2).stores({
      boards:
        "id, name, status, chipModel, chipFamily, flashChipId, flashManufacturerId, projectId, updatedAt, lastConnectedAt, createdAt",
      projects: "id, name, status, updatedAt, createdAt",
      boardTags: "id, boardId, tag, createdAt",
      firmwareHistory: "id, boardId, firmwareName, flashedAt, createdAt",
      attachments: "id, boardId, type, filename, createdAt",
      pinAssignments: "id, boardId, gpio, updatedAt, createdAt",
      appSettings: "key, updatedAt"
    });

    this.version(3).stores({
      boards:
        "id, name, status, chipModel, chipFamily, flashChipId, flashManufacturerId, projectId, updatedAt, lastConnectedAt, createdAt",
      projects: "id, name, status, location, updatedAt, createdAt",
      boardTags: "id, boardId, tag, createdAt",
      firmwareHistory: "id, boardId, firmwareName, flashedAt, createdAt",
      attachments: "id, boardId, type, filename, createdAt",
      pinAssignments: "id, boardId, gpio, updatedAt, createdAt",
      appSettings: "key, updatedAt"
    });

    this.version(4).stores({
      boards:
        "id, name, status, chipModel, chipFamily, flashChipId, flashManufacturerId, projectId, updatedAt, lastConnectedAt, createdAt",
      projects: "id, name, status, location, updatedAt, createdAt",
      projectChecklistItems:
        "id, projectId, boardId, category, completed, sortOrder, updatedAt, createdAt",
      boardTags: "id, boardId, tag, createdAt",
      firmwareHistory: "id, boardId, firmwareName, flashedAt, createdAt",
      attachments: "id, boardId, type, filename, createdAt",
      pinAssignments: "id, boardId, gpio, updatedAt, createdAt",
      appSettings: "key, updatedAt"
    });

    this.version(5)
      .stores({
        boards:
          "id, name, status, chipModel, chipFamily, flashChipId, flashManufacturerId, projectId, updatedAt, lastConnectedAt, createdAt",
        projects: "id, name, status, location, updatedAt, createdAt",
        projectChecklistItems:
          "id, projectId, boardId, category, completed, sortOrder, updatedAt, createdAt",
        boardTags: "id, boardId, tag, createdAt",
        firmwareHistory: "id, boardId, firmwareName, flashedAt, createdAt",
        attachments: "id, boardId, type, filename, createdAt",
        pinAssignments: "id, boardId, gpio, updatedAt, createdAt",
        appSettings: "key, updatedAt"
      })
      .upgrade((transaction) =>
        transaction.table("boards").toCollection().modify((board: Record<string, unknown>) => {
          board.secondaryImagePath ??= null;
          board.secondaryImageFilename ??= null;
          board.secondaryImageMimeType ??= null;
          board.secondaryImageSizeBytes ??= null;
        })
      );
  }
}

export const vaultDatabase = new VaultDatabase();
