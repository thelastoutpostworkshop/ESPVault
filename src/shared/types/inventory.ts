export const PROJECT_STATUSES = [
  "active",
  "on_hold",
  "completed",
  "archived"
] as const;

export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface Project {
  id: string;
  name: string;
  description: string | null;
  location: string | null;
  status: ProjectStatus;
  coverImagePath: string | null;
  coverImageFilename: string | null;
  coverImageMimeType: string | null;
  coverImageSizeBytes: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string | null;
  location?: string | null;
  status?: ProjectStatus;
  coverImagePath?: string | null;
  coverImageFilename?: string | null;
  coverImageMimeType?: string | null;
  coverImageSizeBytes?: number | null;
}

export type UpdateProjectInput = Partial<CreateProjectInput>;

export interface BoardTag {
  id: string;
  boardId: string;
  tag: string;
  createdAt: string;
}

export interface FirmwareHistoryEntry {
  id: string;
  boardId: string;
  firmwareName: string;
  version: string | null;
  source: string | null;
  filePath: string | null;
  notes: string | null;
  flashedAt: string | null;
  createdAt: string;
}

export type AttachmentType = "photo" | "firmware" | "backup" | "document" | "other";

export interface BoardAttachment {
  id: string;
  boardId: string;
  type: AttachmentType;
  filename: string;
  localPath: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export interface PinAssignment {
  id: string;
  boardId: string;
  gpio: string;
  label: string | null;
  function: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AppSetting {
  key: string;
  value: unknown;
  updatedAt: string;
}
