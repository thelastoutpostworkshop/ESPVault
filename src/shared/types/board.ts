import type { BoardPartition } from "./partition";

export const BOARD_STATUSES = [
  "available",
  "in_use",
  "needs_flashing",
  "broken",
  "archived",
  "unknown"
] as const;

export type BoardStatus = (typeof BOARD_STATUSES)[number];

export interface Board {
  id: string;
  name: string;
  description: string | null;
  coverImagePath: string | null;
  coverImageFilename: string | null;
  coverImageMimeType: string | null;
  coverImageSizeBytes: number | null;
  secondaryImagePath: string | null;
  secondaryImageFilename: string | null;
  secondaryImageMimeType: string | null;
  secondaryImageSizeBytes: number | null;
  status: BoardStatus;
  chipModel: string | null;
  chipRevision: number | null;
  chipVariant: string | null;
  chipFamily: number | null;
  chipFamilyHex: string | null;
  macAddress: string | null;
  flashSizeBytes: number | null;
  flashSizeLabel: string | null;
  flashChipId: number | null;
  flashChipIdHex: string | null;
  flashManufacturerId: number | null;
  flashManufacturerIdHex: string | null;
  flashManufacturerName: string | null;
  flashDeviceId: number | null;
  flashDeviceIdHex: string | null;
  psramSizeBytes: number | null;
  psramDetected: boolean | null;
  crystalFrequency: string | null;
  securityFlags: number | null;
  securityFlagsHex: string | null;
  flashCryptCnt: number | null;
  flashCryptCntHex: string | null;
  securityKeyPurposes: number[] | null;
  securityChipId: number | null;
  securityApiVersion: number | null;
  secureBootEnabled: boolean | null;
  flashEncryptionEnabled: boolean | null;
  bootloaderOffset: number | null;
  bootloaderOffsetHex: string | null;
  partitions: BoardPartition[] | null;
  partitionTableOffset: number | null;
  partitionTableOffsetHex: string | null;
  partitionsDetectedAt: string | null;
  partitionTableReadError: string | null;
  boardType: string | null;
  manufacturer: string | null;
  purchaseUrl: string | null;
  physicalLocation: string | null;
  projectId: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  lastConnectedAt: string | null;
  lastScannedAt: string | null;
}

export interface CreateBoardInput {
  name: string;
  description?: string | null;
  coverImagePath?: string | null;
  coverImageFilename?: string | null;
  coverImageMimeType?: string | null;
  coverImageSizeBytes?: number | null;
  secondaryImagePath?: string | null;
  secondaryImageFilename?: string | null;
  secondaryImageMimeType?: string | null;
  secondaryImageSizeBytes?: number | null;
  status?: BoardStatus;
  chipModel?: string | null;
  chipRevision?: number | null;
  chipVariant?: string | null;
  chipFamily?: number | null;
  chipFamilyHex?: string | null;
  macAddress?: string | null;
  flashSizeBytes?: number | null;
  flashSizeLabel?: string | null;
  flashChipId?: number | null;
  flashChipIdHex?: string | null;
  flashManufacturerId?: number | null;
  flashManufacturerIdHex?: string | null;
  flashManufacturerName?: string | null;
  flashDeviceId?: number | null;
  flashDeviceIdHex?: string | null;
  psramSizeBytes?: number | null;
  psramDetected?: boolean | null;
  crystalFrequency?: string | null;
  securityFlags?: number | null;
  securityFlagsHex?: string | null;
  flashCryptCnt?: number | null;
  flashCryptCntHex?: string | null;
  securityKeyPurposes?: number[] | null;
  securityChipId?: number | null;
  securityApiVersion?: number | null;
  secureBootEnabled?: boolean | null;
  flashEncryptionEnabled?: boolean | null;
  bootloaderOffset?: number | null;
  bootloaderOffsetHex?: string | null;
  partitions?: BoardPartition[] | null;
  partitionTableOffset?: number | null;
  partitionTableOffsetHex?: string | null;
  partitionsDetectedAt?: string | null;
  partitionTableReadError?: string | null;
  boardType?: string | null;
  manufacturer?: string | null;
  purchaseUrl?: string | null;
  physicalLocation?: string | null;
  projectId?: string | null;
  notes?: string | null;
  lastConnectedAt?: string | null;
  lastScannedAt?: string | null;
}

export type UpdateBoardInput = Partial<CreateBoardInput>;

export interface BoardListFilters {
  search?: string;
  status?: BoardStatus | "all";
  chipModel?: string;
}

export interface BoardDashboardStats {
  totalBoards: number;
  availableBoards: number;
  inUseBoards: number;
  brokenBoards: number;
  needsFlashingBoards: number;
  recentlyUpdatedBoards: Board[];
  recentlyConnectedBoards: Board[];
}
