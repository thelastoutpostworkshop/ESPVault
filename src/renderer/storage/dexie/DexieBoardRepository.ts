import {
  BOARD_STATUSES,
  type Board,
  type BoardDashboardStats,
  type BoardListFilters,
  type BoardStatus,
  type CreateBoardInput,
  type UpdateBoardInput
} from "../../../shared/types/board";
import type { BoardRepository } from "../../repositories/BoardRepository";
import { vaultDatabase, type VaultDatabase } from "./vaultDatabase";

export class DexieBoardRepository implements BoardRepository {
  constructor(private readonly database: VaultDatabase = vaultDatabase) {}

  async list(filters: BoardListFilters = {}): Promise<Board[]> {
    const boards = await this.database.boards
      .orderBy("updatedAt")
      .reverse()
      .toArray();

    return boards
      .map((board) => this.normalizeBoard(board))
      .filter((board) => this.matchesFilters(board, filters));
  }

  async get(id: string): Promise<Board | null> {
    const board = await this.database.boards.get(id);
    return board ? this.normalizeBoard(board) : null;
  }

  async create(input: CreateBoardInput): Promise<Board> {
    const now = new Date().toISOString();
    const board: Board = {
      id: crypto.randomUUID(),
      name: this.requireName(input.name),
      description: this.optionalText(input.description),
      coverImagePath: this.optionalText(input.coverImagePath),
      coverImageFilename: this.optionalText(input.coverImageFilename),
      coverImageMimeType: this.optionalText(input.coverImageMimeType),
      coverImageSizeBytes: this.optionalNumber(input.coverImageSizeBytes),
      secondaryImagePath: this.optionalText(input.secondaryImagePath),
      secondaryImageFilename: this.optionalText(input.secondaryImageFilename),
      secondaryImageMimeType: this.optionalText(input.secondaryImageMimeType),
      secondaryImageSizeBytes: this.optionalNumber(input.secondaryImageSizeBytes),
      status: input.status ?? "unknown",
      chipModel: this.optionalText(input.chipModel),
      chipRevision: this.optionalNumber(input.chipRevision),
      chipVariant: this.optionalText(input.chipVariant),
      chipFamily: this.optionalNumber(input.chipFamily),
      chipFamilyHex: this.optionalText(input.chipFamilyHex),
      macAddress: this.optionalText(input.macAddress),
      flashSizeBytes: this.optionalNumber(input.flashSizeBytes),
      flashSizeLabel: this.optionalText(input.flashSizeLabel),
      flashChipId: this.optionalNumber(input.flashChipId),
      flashChipIdHex: this.optionalText(input.flashChipIdHex),
      flashManufacturerId: this.optionalNumber(input.flashManufacturerId),
      flashManufacturerIdHex: this.optionalText(input.flashManufacturerIdHex),
      flashManufacturerName: this.optionalText(input.flashManufacturerName),
      flashDeviceId: this.optionalNumber(input.flashDeviceId),
      flashDeviceIdHex: this.optionalText(input.flashDeviceIdHex),
      psramSizeBytes: this.optionalNumber(input.psramSizeBytes),
      psramDetected: this.optionalBoolean(input.psramDetected),
      crystalFrequency: this.optionalText(input.crystalFrequency),
      securityFlags: this.optionalNumber(input.securityFlags),
      securityFlagsHex: this.optionalText(input.securityFlagsHex),
      flashCryptCnt: this.optionalNumber(input.flashCryptCnt),
      flashCryptCntHex: this.optionalText(input.flashCryptCntHex),
      securityKeyPurposes: this.optionalNumberArray(input.securityKeyPurposes),
      securityChipId: this.optionalNumber(input.securityChipId),
      securityApiVersion: this.optionalNumber(input.securityApiVersion),
      secureBootEnabled: this.optionalBoolean(input.secureBootEnabled),
      flashEncryptionEnabled: this.optionalBoolean(input.flashEncryptionEnabled),
      bootloaderOffset: this.optionalNumber(input.bootloaderOffset),
      bootloaderOffsetHex: this.optionalText(input.bootloaderOffsetHex),
      partitions: this.optionalPartitionArray(input.partitions),
      partitionTableOffset: this.optionalNumber(input.partitionTableOffset),
      partitionTableOffsetHex: this.optionalText(input.partitionTableOffsetHex),
      partitionsDetectedAt: this.optionalText(input.partitionsDetectedAt),
      partitionTableReadError: this.optionalText(input.partitionTableReadError),
      boardType: this.optionalText(input.boardType),
      manufacturer: this.optionalText(input.manufacturer),
      purchaseUrl: this.optionalText(input.purchaseUrl),
      physicalLocation: this.optionalText(input.physicalLocation),
      projectId: this.optionalText(input.projectId),
      notes: this.optionalText(input.notes),
      createdAt: now,
      updatedAt: now,
      lastConnectedAt: this.optionalText(input.lastConnectedAt),
      lastScannedAt: this.optionalText(input.lastScannedAt)
    };

    this.assertStatus(board.status);
    await this.database.boards.add(board);

    return board;
  }

  async update(id: string, input: UpdateBoardInput): Promise<Board> {
    const existing = await this.get(id);
    if (!existing) {
      throw new Error("Board not found.");
    }

    const board: Board = {
      ...existing,
      name:
        input.name === undefined
          ? existing.name
          : this.requireName(input.name),
      description:
        input.description === undefined
          ? existing.description
          : this.optionalText(input.description),
      coverImagePath:
        input.coverImagePath === undefined
          ? existing.coverImagePath
          : this.optionalText(input.coverImagePath),
      coverImageFilename:
        input.coverImageFilename === undefined
          ? existing.coverImageFilename
          : this.optionalText(input.coverImageFilename),
      coverImageMimeType:
        input.coverImageMimeType === undefined
          ? existing.coverImageMimeType
          : this.optionalText(input.coverImageMimeType),
      coverImageSizeBytes:
        input.coverImageSizeBytes === undefined
          ? existing.coverImageSizeBytes
          : this.optionalNumber(input.coverImageSizeBytes),
      secondaryImagePath:
        input.secondaryImagePath === undefined
          ? existing.secondaryImagePath
          : this.optionalText(input.secondaryImagePath),
      secondaryImageFilename:
        input.secondaryImageFilename === undefined
          ? existing.secondaryImageFilename
          : this.optionalText(input.secondaryImageFilename),
      secondaryImageMimeType:
        input.secondaryImageMimeType === undefined
          ? existing.secondaryImageMimeType
          : this.optionalText(input.secondaryImageMimeType),
      secondaryImageSizeBytes:
        input.secondaryImageSizeBytes === undefined
          ? existing.secondaryImageSizeBytes
          : this.optionalNumber(input.secondaryImageSizeBytes),
      status: input.status ?? existing.status,
      chipModel:
        input.chipModel === undefined
          ? existing.chipModel
          : this.optionalText(input.chipModel),
      chipRevision:
        input.chipRevision === undefined
          ? existing.chipRevision
          : this.optionalNumber(input.chipRevision),
      chipVariant:
        input.chipVariant === undefined
          ? existing.chipVariant
          : this.optionalText(input.chipVariant),
      chipFamily:
        input.chipFamily === undefined
          ? existing.chipFamily
          : this.optionalNumber(input.chipFamily),
      chipFamilyHex:
        input.chipFamilyHex === undefined
          ? existing.chipFamilyHex
          : this.optionalText(input.chipFamilyHex),
      macAddress:
        input.macAddress === undefined
          ? existing.macAddress
          : this.optionalText(input.macAddress),
      flashSizeBytes:
        input.flashSizeBytes === undefined
          ? existing.flashSizeBytes
          : this.optionalNumber(input.flashSizeBytes),
      flashSizeLabel:
        input.flashSizeLabel === undefined
          ? existing.flashSizeLabel
          : this.optionalText(input.flashSizeLabel),
      flashChipId:
        input.flashChipId === undefined
          ? existing.flashChipId
          : this.optionalNumber(input.flashChipId),
      flashChipIdHex:
        input.flashChipIdHex === undefined
          ? existing.flashChipIdHex
          : this.optionalText(input.flashChipIdHex),
      flashManufacturerId:
        input.flashManufacturerId === undefined
          ? existing.flashManufacturerId
          : this.optionalNumber(input.flashManufacturerId),
      flashManufacturerIdHex:
        input.flashManufacturerIdHex === undefined
          ? existing.flashManufacturerIdHex
          : this.optionalText(input.flashManufacturerIdHex),
      flashManufacturerName:
        input.flashManufacturerName === undefined
          ? existing.flashManufacturerName
          : this.optionalText(input.flashManufacturerName),
      flashDeviceId:
        input.flashDeviceId === undefined
          ? existing.flashDeviceId
          : this.optionalNumber(input.flashDeviceId),
      flashDeviceIdHex:
        input.flashDeviceIdHex === undefined
          ? existing.flashDeviceIdHex
          : this.optionalText(input.flashDeviceIdHex),
      psramSizeBytes:
        input.psramSizeBytes === undefined
          ? existing.psramSizeBytes
          : this.optionalNumber(input.psramSizeBytes),
      psramDetected:
        input.psramDetected === undefined
          ? existing.psramDetected
          : this.optionalBoolean(input.psramDetected),
      crystalFrequency:
        input.crystalFrequency === undefined
          ? existing.crystalFrequency
          : this.optionalText(input.crystalFrequency),
      securityFlags:
        input.securityFlags === undefined
          ? existing.securityFlags
          : this.optionalNumber(input.securityFlags),
      securityFlagsHex:
        input.securityFlagsHex === undefined
          ? existing.securityFlagsHex
          : this.optionalText(input.securityFlagsHex),
      flashCryptCnt:
        input.flashCryptCnt === undefined
          ? existing.flashCryptCnt
          : this.optionalNumber(input.flashCryptCnt),
      flashCryptCntHex:
        input.flashCryptCntHex === undefined
          ? existing.flashCryptCntHex
          : this.optionalText(input.flashCryptCntHex),
      securityKeyPurposes:
        input.securityKeyPurposes === undefined
          ? existing.securityKeyPurposes
          : this.optionalNumberArray(input.securityKeyPurposes),
      securityChipId:
        input.securityChipId === undefined
          ? existing.securityChipId
          : this.optionalNumber(input.securityChipId),
      securityApiVersion:
        input.securityApiVersion === undefined
          ? existing.securityApiVersion
          : this.optionalNumber(input.securityApiVersion),
      secureBootEnabled:
        input.secureBootEnabled === undefined
          ? existing.secureBootEnabled
          : this.optionalBoolean(input.secureBootEnabled),
      flashEncryptionEnabled:
        input.flashEncryptionEnabled === undefined
          ? existing.flashEncryptionEnabled
          : this.optionalBoolean(input.flashEncryptionEnabled),
      bootloaderOffset:
        input.bootloaderOffset === undefined
          ? existing.bootloaderOffset
          : this.optionalNumber(input.bootloaderOffset),
      bootloaderOffsetHex:
        input.bootloaderOffsetHex === undefined
          ? existing.bootloaderOffsetHex
          : this.optionalText(input.bootloaderOffsetHex),
      partitions:
        input.partitions === undefined
          ? existing.partitions
          : this.optionalPartitionArray(input.partitions),
      partitionTableOffset:
        input.partitionTableOffset === undefined
          ? existing.partitionTableOffset
          : this.optionalNumber(input.partitionTableOffset),
      partitionTableOffsetHex:
        input.partitionTableOffsetHex === undefined
          ? existing.partitionTableOffsetHex
          : this.optionalText(input.partitionTableOffsetHex),
      partitionsDetectedAt:
        input.partitionsDetectedAt === undefined
          ? existing.partitionsDetectedAt
          : this.optionalText(input.partitionsDetectedAt),
      partitionTableReadError:
        input.partitionTableReadError === undefined
          ? existing.partitionTableReadError
          : this.optionalText(input.partitionTableReadError),
      boardType:
        input.boardType === undefined
          ? existing.boardType
          : this.optionalText(input.boardType),
      manufacturer:
        input.manufacturer === undefined
          ? existing.manufacturer
          : this.optionalText(input.manufacturer),
      purchaseUrl:
        input.purchaseUrl === undefined
          ? existing.purchaseUrl
          : this.optionalText(input.purchaseUrl),
      physicalLocation:
        input.physicalLocation === undefined
          ? existing.physicalLocation
          : this.optionalText(input.physicalLocation),
      projectId:
        input.projectId === undefined
          ? existing.projectId
          : this.optionalText(input.projectId),
      notes:
        input.notes === undefined ? existing.notes : this.optionalText(input.notes),
      lastConnectedAt:
        input.lastConnectedAt === undefined
          ? existing.lastConnectedAt
          : this.optionalText(input.lastConnectedAt),
      lastScannedAt:
        input.lastScannedAt === undefined
          ? existing.lastScannedAt
          : this.optionalText(input.lastScannedAt),
      updatedAt: new Date().toISOString()
    };

    this.assertStatus(board.status);
    await this.database.boards.put(board);

    return board;
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.get(id);
    if (!existing) {
      return false;
    }

    await this.database.transaction(
      "rw",
      [
        this.database.boards,
        this.database.boardTags,
        this.database.firmwareHistory,
        this.database.attachments,
        this.database.pinAssignments,
        this.database.projectChecklistItems
      ],
      async () => {
        const now = new Date().toISOString();
        const linkedChecklistItems =
          await this.database.projectChecklistItems
            .where("boardId")
            .equals(id)
            .toArray();

        await Promise.all([
          this.database.boardTags.where("boardId").equals(id).delete(),
          this.database.firmwareHistory.where("boardId").equals(id).delete(),
          this.database.attachments.where("boardId").equals(id).delete(),
          this.database.pinAssignments.where("boardId").equals(id).delete(),
          ...linkedChecklistItems.map((item) =>
            this.database.projectChecklistItems.put({
              ...item,
              boardId: null,
              updatedAt: now
            })
          )
        ]);
        await this.database.boards.delete(id);
      }
    );

    return true;
  }

  async dashboardStats(): Promise<BoardDashboardStats> {
    const boards = await this.list();

    return {
      totalBoards: boards.length,
      availableBoards: boards.filter((board) => board.status === "available").length,
      inUseBoards: boards.filter((board) => board.status === "in_use").length,
      brokenBoards: boards.filter((board) => board.status === "broken").length,
      needsFlashingBoards: boards.filter(
        (board) => board.status === "needs_flashing"
      ).length,
      recentlyUpdatedBoards: boards.slice(0, 5),
      recentlyConnectedBoards: boards
        .filter((board) => Boolean(board.lastConnectedAt))
        .sort((left, right) =>
          (right.lastConnectedAt ?? "").localeCompare(left.lastConnectedAt ?? "")
        )
        .slice(0, 5)
    };
  }

  private matchesFilters(board: Board, filters: BoardListFilters): boolean {
    const search = filters.search?.trim().toLowerCase();
    const matchesSearch =
      !search ||
      [
        board.name,
        board.description,
        board.chipModel,
        board.macAddress,
        board.notes
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(search));

    const matchesStatus =
      !filters.status || filters.status === "all" || board.status === filters.status;
    const matchesChipModel =
      !filters.chipModel?.trim() || board.chipModel === filters.chipModel.trim();

    return matchesSearch && matchesStatus && matchesChipModel;
  }

  private normalizeBoard(board: Board): Board {
    return {
      ...board,
      coverImagePath: board.coverImagePath ?? null,
      coverImageFilename: board.coverImageFilename ?? null,
      coverImageMimeType: board.coverImageMimeType ?? null,
      coverImageSizeBytes: board.coverImageSizeBytes ?? null,
      secondaryImagePath: board.secondaryImagePath ?? null,
      secondaryImageFilename: board.secondaryImageFilename ?? null,
      secondaryImageMimeType: board.secondaryImageMimeType ?? null,
      secondaryImageSizeBytes: board.secondaryImageSizeBytes ?? null,
      chipRevision: board.chipRevision ?? null,
      chipVariant: board.chipVariant ?? null,
      chipFamily: board.chipFamily ?? null,
      chipFamilyHex: board.chipFamilyHex ?? null,
      flashSizeLabel: board.flashSizeLabel ?? null,
      flashChipId: board.flashChipId ?? null,
      flashChipIdHex: board.flashChipIdHex ?? null,
      flashManufacturerId: board.flashManufacturerId ?? null,
      flashManufacturerIdHex: board.flashManufacturerIdHex ?? null,
      flashManufacturerName: board.flashManufacturerName ?? null,
      flashDeviceId: board.flashDeviceId ?? null,
      flashDeviceIdHex: board.flashDeviceIdHex ?? null,
      psramDetected: board.psramDetected ?? null,
      securityFlags: board.securityFlags ?? null,
      securityFlagsHex: board.securityFlagsHex ?? null,
      flashCryptCnt: board.flashCryptCnt ?? null,
      flashCryptCntHex: board.flashCryptCntHex ?? null,
      securityKeyPurposes: board.securityKeyPurposes ?? null,
      securityChipId: board.securityChipId ?? null,
      securityApiVersion: board.securityApiVersion ?? null,
      secureBootEnabled: board.secureBootEnabled ?? null,
      flashEncryptionEnabled: board.flashEncryptionEnabled ?? null,
      bootloaderOffset: board.bootloaderOffset ?? null,
      bootloaderOffsetHex: board.bootloaderOffsetHex ?? null,
      partitions: this.optionalPartitionArray(board.partitions),
      partitionTableOffset: board.partitionTableOffset ?? null,
      partitionTableOffsetHex: board.partitionTableOffsetHex ?? null,
      partitionsDetectedAt: board.partitionsDetectedAt ?? null,
      partitionTableReadError: board.partitionTableReadError ?? null,
      lastScannedAt: board.lastScannedAt ?? null
    };
  }

  private requireName(value: string): string {
    const name = value.trim();
    if (!name) {
      throw new Error("Board name is required.");
    }

    return name;
  }

  private optionalText(value: string | null | undefined): string | null {
    const text = value?.trim();
    return text ? text : null;
  }

  private optionalNumber(value: number | null | undefined): number | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (!Number.isFinite(value) || value < 0) {
      throw new Error("Numeric board fields must be positive numbers.");
    }

    return Math.trunc(value);
  }

  private optionalBoolean(value: boolean | null | undefined): boolean | null {
    return value ?? null;
  }

  private optionalNumberArray(value: number[] | null | undefined): number[] | null {
    if (value === null || value === undefined) {
      return null;
    }

    if (
      !Array.isArray(value) ||
      value.some((item) => !Number.isFinite(item) || item < 0)
    ) {
      throw new Error("Numeric board array fields must contain positive numbers.");
    }

    return value.map((item) => Math.trunc(item));
  }

  private optionalPartitionArray(
    value: Board["partitions"] | null | undefined
  ): Board["partitions"] {
    if (value === null || value === undefined) {
      return null;
    }

    if (!Array.isArray(value)) {
      throw new Error("Board partitions must be an array.");
    }

    return value.map((partition) => ({
      label: this.optionalText(partition.label) ?? "Unnamed",
      type: this.optionalNumber(partition.type) ?? 0,
      typeHex: this.optionalText(partition.typeHex) ?? "0x00",
      subtype: this.optionalNumber(partition.subtype) ?? 0,
      subtypeHex: this.optionalText(partition.subtypeHex) ?? "0x00",
      offset: this.optionalNumber(partition.offset) ?? 0,
      offsetHex: this.optionalText(partition.offsetHex) ?? "0x00000000",
      sizeBytes: this.optionalNumber(partition.sizeBytes) ?? 0,
      sizeHex: this.optionalText(partition.sizeHex) ?? "0x00000000",
      flags: this.optionalNumber(partition.flags) ?? 0,
      flagsHex: this.optionalText(partition.flagsHex) ?? "0x00000000",
      filesystem: partition.filesystem ?? null
    }));
  }

  private assertStatus(value: BoardStatus): void {
    if (!BOARD_STATUSES.includes(value)) {
      throw new Error("Unsupported board status.");
    }
  }
}
