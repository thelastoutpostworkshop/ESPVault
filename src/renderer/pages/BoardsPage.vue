<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import {
  BOARD_STATUSES,
  type Board,
  type BoardStatus,
  type CreateBoardInput
} from "../../shared/types/board";
import type {
  CoverImageFileInput,
  CoverImageResult
} from "../../shared/types/api";
import BoardEditorDialog from "../components/BoardEditorDialog.vue";
import { useBoardStore } from "../stores/boardStore";
import { useProjectStore } from "../stores/projectStore";
import {
  BOARD_STATUS_COLORS,
  BOARD_STATUS_ICONS,
  BOARD_STATUS_LABELS,
  formatBytes,
  formatFlashSize,
  formatDate,
  formatPsramSize
} from "../utils/boardDisplay";
import { rotateCoverImageDataUrl } from "../utils/imageRotation";
import {
  buildPartitionMapSegments,
  formatPartitionEndHex,
  formatPartitionFilesystem,
  formatPartitionFlags,
  formatPartitionLabel,
  formatPartitionSubtypeLabel,
  formatPartitionSummary,
  formatPartitionTypeLabel,
  getPartitionColor
} from "../utils/partitionDisplay";
import { buildPartitionBuilderUrl } from "../utils/partitionBuilder";

const UNASSIGNED_PROJECT_STATUS_FILTER = "unassigned_project";

type BoardStatusFilter =
  | BoardStatus
  | "all"
  | typeof UNASSIGNED_PROJECT_STATUS_FILTER;

interface BoardFilters {
  search: string;
  status: BoardStatusFilter;
  chipModel: string;
}

type ActiveBoardFilterKey = "status" | "chipModel";

interface ActiveBoardFilterChip {
  key: ActiveBoardFilterKey;
  label: string;
  value: string;
  icon: string;
  color: string;
}

const boardStore = useBoardStore();
const { boards, chipModels, error, loading } = storeToRefs(boardStore);
const projectStore = useProjectStore();
const { projects } = storeToRefs(projectStore);
const props = defineProps<{
  openBoardId?: string | null;
}>();
const emit = defineEmits<{
  "open-project": [id: string];
}>();
const editorOpen = ref(false);
const editingBoard = ref<Board | null>(null);
const deletingBoard = ref<Board | null>(null);
const saving = ref(false);
const openedBoardId = ref<string | null>(null);
const selectedBoardId = ref<string | null>(null);
const boardCoverError = ref<string | null>(null);
const boardCoverBusyId = ref<string | null>(null);
const boardCoverDragActiveId = ref<string | null>(null);
const boardCoverViewerOpen = ref(false);
const boardThumbnailUrls = ref<Record<string, string | null>>({});
const partitionBuilderError = ref<string | null>(null);
let boardThumbnailLoadToken = 0;

const filters = reactive<BoardFilters>({
  search: "",
  status: "all",
  chipModel: ""
});

const statusOptions: Array<{ title: string; value: BoardStatusFilter }> = [
  { title: "All statuses", value: "all" },
  {
    title: "Unassigned to project",
    value: UNASSIGNED_PROJECT_STATUS_FILTER
  },
  ...BOARD_STATUSES.map((status) => ({
    title: BOARD_STATUS_LABELS[status],
    value: status
  }))
];

const chipModelOptions = computed(() => [
  { title: "All chip models", value: "" },
  ...chipModels.value.map((model) => ({ title: model, value: model }))
]);
const activeBoardFilters = computed<ActiveBoardFilterChip[]>(() => {
  const activeFilters: ActiveBoardFilterChip[] = [];
  const status = filters.status;
  const chipModel = filters.chipModel.trim();

  if (status === UNASSIGNED_PROJECT_STATUS_FILTER) {
    activeFilters.push({
      key: "status",
      label: "Project",
      value: "Unassigned",
      icon: "mdi-link-variant-off",
      color: "warning"
    });
  } else if (status !== "all") {
    activeFilters.push({
      key: "status",
      label: "Status",
      value: BOARD_STATUS_LABELS[status],
      icon: BOARD_STATUS_ICONS[status],
      color: BOARD_STATUS_COLORS[status]
    });
  }

  if (chipModel) {
    activeFilters.push({
      key: "chipModel",
      label: "Chip model",
      value: chipModel,
      icon: "mdi-chip",
      color: "secondary"
    });
  }

  return activeFilters;
});
const locationOptions = computed(() =>
  uniqueLocationOptions([
    ...boards.value.map((board) => board.physicalLocation),
    ...projects.value.map((project) => project.location)
  ])
);

const filteredBoards = computed(() => {
  const search = filters.search.trim().toLowerCase();

  return boards.value.filter((board) => {
    const matchesSearch =
      !search ||
      [
        board.name,
        board.description,
        board.chipModel,
        board.macAddress,
        board.physicalLocation,
        board.notes
      ]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(search));

    const matchesStatus =
      filters.status === "all" ||
      (filters.status === UNASSIGNED_PROJECT_STATUS_FILTER
        ? !board.projectId
        : board.status === filters.status);
    const matchesChipModel =
      !filters.chipModel || board.chipModel === filters.chipModel;

    return matchesSearch && matchesStatus && matchesChipModel;
  });
});

const selectedBoard = computed(() => {
  if (!filteredBoards.value.length) {
    return null;
  }

  return (
    filteredBoards.value.find((board) => board.id === selectedBoardId.value) ??
    filteredBoards.value[0]
  );
});

const selectedPartitionRows = computed(() => selectedBoard.value?.partitions ?? []);
const selectedPartitionSegments = computed(() =>
  selectedBoard.value ? buildPartitionMapSegments(selectedBoard.value) : []
);

const boardCoverPathKey = computed(() =>
  boards.value
    .map((board) => `${board.id}:${board.coverImagePath ?? ""}`)
    .join("|")
);

onMounted(() => {
  void Promise.all([boardStore.loadBoards(), projectStore.loadProjects()]);
});

watch(
  filteredBoards,
  (nextBoards) => {
    if (!nextBoards.length) {
      selectedBoardId.value = null;
      return;
    }

    if (!nextBoards.some((board) => board.id === selectedBoardId.value)) {
      selectedBoardId.value = nextBoards[0].id;
    }
  },
  { immediate: true }
);

watch(
  () => props.openBoardId,
  () => {
    openedBoardId.value = null;
    openBoardFromProp();
  },
  { immediate: true }
);

watch(boards, () => {
  openBoardFromProp();
});

watch(
  boardCoverPathKey,
  () => {
    void loadBoardCoverThumbnails(boards.value);
  },
  { immediate: true }
);

function openCreateDialog(): void {
  editingBoard.value = null;
  editorOpen.value = true;
}

function openEditDialog(board: Board): void {
  editingBoard.value = board;
  editorOpen.value = true;
}

function selectBoard(board: Board): void {
  selectedBoardId.value = board.id;
}

function clearBoardFilter(filterKey: ActiveBoardFilterKey): void {
  if (filterKey === "status") {
    filters.status = "all";
    return;
  }

  filters.chipModel = "";
}

function openBoardFromProp(): void {
  if (!props.openBoardId || props.openBoardId === openedBoardId.value) {
    return;
  }

  const board = boards.value.find((candidate) => candidate.id === props.openBoardId);
  if (!board) {
    return;
  }

  selectBoard(board);
  openedBoardId.value = props.openBoardId;
}

function openAssignedProject(board: Board): void {
  if (board.projectId) {
    emit("open-project", board.projectId);
  }
}

async function saveBoard(input: CreateBoardInput): Promise<void> {
  saving.value = true;

  try {
    if (editingBoard.value) {
      const updatedBoard = await boardStore.updateBoard(editingBoard.value.id, input);
      selectedBoardId.value = updatedBoard.id;
    } else {
      const createdBoard = await boardStore.createBoard(input);
      selectedBoardId.value = createdBoard.id;
    }

    editorOpen.value = false;
    editingBoard.value = null;
  } finally {
    saving.value = false;
  }
}

async function confirmDelete(): Promise<void> {
  if (!deletingBoard.value) {
    return;
  }

  const coverImagePath = deletingBoard.value.coverImagePath;
  const deletedBoardId = deletingBoard.value.id;
  await boardStore.deleteBoard(deletingBoard.value.id);

  if (coverImagePath) {
    await window.api.boardImages.deleteCover(coverImagePath).catch(() => {
      // The board record is gone. A stale old image file is non-blocking.
    });
  }

  if (selectedBoardId.value === deletedBoardId) {
    selectedBoardId.value = filteredBoards.value[0]?.id ?? null;
  }

  deletingBoard.value = null;
}

async function loadBoardCoverThumbnails(boardList: Board[]): Promise<void> {
  const token = ++boardThumbnailLoadToken;
  const nextThumbnails: Record<string, string | null> = {};

  await Promise.all(
    boardList.map(async (board) => {
      if (!board.coverImagePath) {
        nextThumbnails[board.id] = null;
        return;
      }

      try {
        nextThumbnails[board.id] =
          await window.api.boardImages.readCoverDataUrl(board.coverImagePath);
      } catch {
        nextThumbnails[board.id] = null;
      }
    })
  );

  if (token === boardThumbnailLoadToken) {
    boardThumbnailUrls.value = nextThumbnails;
  }
}

async function chooseBoardCover(board: Board): Promise<void> {
  await applyBoardCoverImage(board, () => window.api.boardImages.chooseCover(board.id));
}

async function dropBoardCover(board: Board, file: File): Promise<void> {
  await applyBoardCoverImage(board, () =>
    readCoverImageFile(file).then((coverFile) =>
      window.api.boardImages.copyCoverFromFile(board.id, coverFile)
    )
  );
}

async function rotateBoardCover(board: Board): Promise<void> {
  const coverImagePath = board.coverImagePath;
  if (!coverImagePath) {
    return;
  }

  await applyBoardCoverImage(board, async () => {
    const dataUrl =
      boardThumbnailUrls.value[board.id] ??
      (await window.api.boardImages.readCoverDataUrl(coverImagePath));

    if (!dataUrl) {
      throw new Error("The board photo could not be loaded.");
    }

    const rotatedFile = await rotateCoverImageDataUrl(
      dataUrl,
      board.coverImageFilename,
      board.coverImageMimeType
    );
    return window.api.boardImages.copyCoverFromFile(board.id, rotatedFile);
  });
}

async function applyBoardCoverImage(
  board: Board,
  copyCoverImage: () => Promise<CoverImageResult>
): Promise<void> {
  if (boardCoverBusyId.value) {
    return;
  }

  boardCoverError.value = null;
  boardCoverBusyId.value = board.id;

  const previousPath = board.coverImagePath;
  let copiedPath: string | null = null;

  try {
    const result = await copyCoverImage();

    if (result.canceled || !result.localPath) {
      return;
    }

    copiedPath = result.localPath;
    const updatedBoard = await boardStore.updateBoard(board.id, {
      coverImagePath: result.localPath,
      coverImageFilename: result.filename ?? null,
      coverImageMimeType: result.mimeType ?? null,
      coverImageSizeBytes: result.sizeBytes ?? null
    });
    if (editingBoard.value?.id === updatedBoard.id) {
      editingBoard.value = updatedBoard;
    }
    boardThumbnailUrls.value = {
      ...boardThumbnailUrls.value,
      [board.id]:
        result.dataUrl ??
        (await window.api.boardImages.readCoverDataUrl(result.localPath))
    };

    if (previousPath && previousPath !== result.localPath) {
      await window.api.boardImages.deleteCover(previousPath).catch(() => {
        // The board now points at the new image. A stale old file is non-blocking.
      });
    }
  } catch (caughtError) {
    if (copiedPath) {
      await window.api.boardImages.deleteCover(copiedPath).catch(() => {
        // Cleanup failure should not hide the original save error.
      });
    }

    boardCoverError.value = getBoardCoverError(
      caughtError,
      "The board photo could not be saved."
    );
  } finally {
    boardCoverBusyId.value = null;
  }
}

function handleBoardCoverDrag(
  board: Board,
  event: DragEvent
): void {
  if (boardCoverBusyId.value === board.id) {
    return;
  }

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }

  boardCoverDragActiveId.value = board.id;
}

function clearBoardCoverDrag(board: Board): void {
  if (boardCoverDragActiveId.value === board.id) {
    boardCoverDragActiveId.value = null;
  }
}

function openBoardCoverViewer(board: Board): void {
  if (boardThumbnailUrls.value[board.id]) {
    boardCoverViewerOpen.value = true;
  }
}

async function dropBoardCoverFromEvent(
  board: Board,
  event: DragEvent
): Promise<void> {
  clearBoardCoverDrag(board);
  const file = getDroppedImageFile(event);

  if (!file) {
    boardCoverError.value = "Drop a JPG, PNG, WebP, GIF, or BMP image.";
    return;
  }

  await dropBoardCover(board, file);
}

async function removeBoardCover(board: Board): Promise<void> {
  if (!board.coverImagePath) {
    return;
  }

  const previousPath = board.coverImagePath;
  boardCoverError.value = null;
  boardCoverBusyId.value = board.id;

  try {
    const updatedBoard = await boardStore.updateBoard(board.id, {
      coverImagePath: null,
      coverImageFilename: null,
      coverImageMimeType: null,
      coverImageSizeBytes: null
    });
    if (editingBoard.value?.id === updatedBoard.id) {
      editingBoard.value = updatedBoard;
    }
    boardThumbnailUrls.value = {
      ...boardThumbnailUrls.value,
      [board.id]: null
    };

    try {
      await window.api.boardImages.deleteCover(previousPath);
    } catch (caughtError) {
      boardCoverError.value = getBoardCoverError(
        caughtError,
        "The board photo was removed from the board, but the file could not be deleted."
      );
    }
  } catch (caughtError) {
    boardCoverError.value = getBoardCoverError(
      caughtError,
      "The board photo could not be removed."
    );
  } finally {
    boardCoverBusyId.value = null;
  }
}

function getBoardCoverError(caughtError: unknown, fallback: string): string {
  return caughtError instanceof Error ? caughtError.message : fallback;
}

function getDroppedImageFile(event: DragEvent): File | null {
  const files = Array.from(event.dataTransfer?.files ?? []);
  return (
    files.find((file) =>
      file.type.startsWith("image/") || /\.(jpe?g|png|webp|gif|bmp)$/i.test(file.name)
    ) ?? null
  );
}

async function readCoverImageFile(file: File): Promise<CoverImageFileInput> {
  return {
    data: await file.arrayBuffer(),
    filename: file.name,
    mimeType: file.type || null
  };
}

async function openPartitionBuilder(board: Board): Promise<void> {
  partitionBuilderError.value = null;

  try {
    await window.api.shell.openExternal(buildPartitionBuilderUrl(board));
  } catch (caughtError) {
    partitionBuilderError.value =
      caughtError instanceof Error
        ? caughtError.message
        : "The ESP32 Partition Builder could not be opened.";
  }
}

function formatProjectName(board: Board): string {
  if (!board.projectId) {
    return "No project";
  }

  return (
    projects.value.find((project) => project.id === board.projectId)?.name ??
    "Project not found"
  );
}

function formatEnabledState(value: boolean | null): string {
  if (value === null) {
    return "Unknown";
  }

  return value ? "Enabled" : "Disabled";
}

function uniqueLocationOptions(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).sort((left, right) => left.localeCompare(right));
}
</script>

<template>
  <section class="page-shell">
    <div class="page-header">
      <div>
        <h1 class="page-title">Boards</h1>
        <p class="page-subtitle">
          Create and maintain the ESP32 boards stored in this local vault.
        </p>
      </div>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreateDialog">
        Add board
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error }}
    </v-alert>
    <v-alert v-if="boardCoverError" type="error" variant="tonal" class="mb-4">
      {{ boardCoverError }}
    </v-alert>

    <div class="toolbar-band board-toolbar">
      <v-text-field
        v-model="filters.search"
        clearable
        hide-details
        label="Search"
        prepend-inner-icon="mdi-magnify"
      />
      <v-select
        v-model="filters.status"
        hide-details
        :items="statusOptions"
        label="Status"
      />
      <v-select
        v-model="filters.chipModel"
        hide-details
        :items="chipModelOptions"
        label="Chip model"
      />
      <v-btn
        variant="outlined"
        prepend-icon="mdi-refresh"
        :loading="loading"
        @click="boardStore.loadBoards"
      >
        Refresh
      </v-btn>
    </div>

    <div
      v-if="activeBoardFilters.length"
      class="active-filter-chips"
      role="list"
      aria-label="Active board filters"
    >
      <v-chip
        v-for="filter in activeBoardFilters"
        :key="filter.key"
        class="active-filter-chip"
        :color="filter.color"
        :prepend-icon="filter.icon"
        size="small"
        variant="tonal"
        closable
        :close-label="`Clear ${filter.label} filter`"
        role="listitem"
        @click:close="clearBoardFilter(filter.key)"
      >
        <span class="active-filter-chip-label">{{ filter.label }}:</span>
        <span class="active-filter-chip-value">{{ filter.value }}</span>
      </v-chip>
    </div>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-3" />

    <div v-if="!filteredBoards.length && !loading" class="empty-state">
      <v-icon icon="mdi-developer-board" size="40" color="primary" />
      <div class="text-subtitle-1 font-weight-bold mt-3">No boards yet.</div>
      <div class="text-body-2 muted mt-1">
        Add an ESP32 board manually to start building your inventory.
      </div>
      <v-btn class="mt-4" color="primary" prepend-icon="mdi-plus" @click="openCreateDialog">
        Add board
      </v-btn>
    </div>

    <div v-else class="boards-layout">
      <v-card class="vault-table-card" flat>
        <v-card-title class="text-subtitle-1 font-weight-bold">
          <v-icon class="mr-2" color="primary" icon="mdi-developer-board" />
          Board list
        </v-card-title>
        <v-divider />
        <v-table class="vault-data-table boards-table">
          <thead>
            <tr>
              <th>Board</th>
              <th>Status</th>
              <th>Chip</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="board in filteredBoards"
              :key="board.id"
              class="board-row"
              :class="{ 'board-row--selected': selectedBoard?.id === board.id }"
              @click="selectBoard(board)"
            >
              <td>
                <div class="board-list-identity">
                  <div class="board-list-cover" aria-hidden="true">
                    <img
                      v-if="boardThumbnailUrls[board.id]"
                      class="board-list-cover-image"
                      :src="boardThumbnailUrls[board.id] ?? ''"
                      alt=""
                    >
                    <v-icon
                      v-else
                      icon="mdi-image-outline"
                      size="24"
                      color="secondary"
                    />
                  </div>
                  <div class="board-list-copy">
                    <div class="board-name">{{ board.name }}</div>
                    <div class="text-caption muted">
                      {{ board.physicalLocation || board.description || "No location set" }}
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <v-chip
                  class="status-chip"
                  :color="BOARD_STATUS_COLORS[board.status]"
                  :prepend-icon="BOARD_STATUS_ICONS[board.status]"
                  size="small"
                  variant="tonal"
                >
                  {{ BOARD_STATUS_LABELS[board.status] }}
                </v-chip>
              </td>
              <td>{{ board.chipModel || "Not set" }}</td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <v-card v-if="selectedBoard" class="panel-card board-detail-card" flat>
        <v-card-title class="board-detail-title">
          <div class="board-detail-heading">
            <div class="board-detail-copy">
              <div class="text-h6">{{ selectedBoard.name }}</div>
            </div>
            <div class="board-detail-actions">
              <v-chip
                class="status-chip"
                :color="BOARD_STATUS_COLORS[selectedBoard.status]"
                :prepend-icon="BOARD_STATUS_ICONS[selectedBoard.status]"
                size="small"
                variant="tonal"
              >
                {{ BOARD_STATUS_LABELS[selectedBoard.status] }}
              </v-chip>
              <v-btn
                icon="mdi-pencil"
                size="small"
                variant="text"
                aria-label="Edit board"
                @click="openEditDialog(selectedBoard)"
              />
              <v-btn
                icon="mdi-delete-outline"
                size="small"
                variant="text"
                color="error"
                aria-label="Delete board"
                @click="deletingBoard = selectedBoard"
              />
            </div>
          </div>
          <div class="text-body-2 muted detail-description">
            {{ selectedBoard.description || selectedBoard.notes || "No notes yet" }}
          </div>
          <div class="board-detail-timestamps">
            <span>
              <v-icon icon="mdi-pencil-circle-outline" size="15" />
              Updated {{ formatDate(selectedBoard.updatedAt) }}
            </span>
            <span v-if="selectedBoard.lastScannedAt">
              <v-icon icon="mdi-radar" size="15" />
              Scan updated {{ formatDate(selectedBoard.lastScannedAt) }}
            </span>
          </div>
        </v-card-title>
        <v-divider />
        <v-card-text>
          <div
            class="board-cover-panel cover-drop-target"
            :class="{
              'cover-drop-target--active':
                boardCoverDragActiveId === selectedBoard.id
            }"
            @dragenter.prevent="handleBoardCoverDrag(selectedBoard, $event)"
            @dragover.prevent="handleBoardCoverDrag(selectedBoard, $event)"
            @dragleave.prevent="clearBoardCoverDrag(selectedBoard)"
            @drop.prevent.stop="dropBoardCoverFromEvent(selectedBoard, $event)"
          >
            <div class="board-cover-preview">
              <button
                v-if="boardThumbnailUrls[selectedBoard.id]"
                class="board-cover-viewer-trigger"
                type="button"
                :aria-label="`View ${selectedBoard.coverImageFilename || 'board photo'}`"
                @click="openBoardCoverViewer(selectedBoard)"
              >
                <v-img
                  :src="boardThumbnailUrls[selectedBoard.id] ?? ''"
                  alt=""
                  height="180"
                />
              </button>
              <v-tooltip text="Rotate photo">
                <template #activator="{ props: tooltipProps }">
                  <v-btn
                    v-if="selectedBoard.coverImagePath"
                    v-bind="tooltipProps"
                    class="cover-rotate-button"
                    color="primary"
                    icon="mdi-rotate-right"
                    size="small"
                    variant="tonal"
                    :disabled="boardCoverBusyId === selectedBoard.id"
                    :loading="boardCoverBusyId === selectedBoard.id"
                    aria-label="Rotate board photo"
                    @click.stop="rotateBoardCover(selectedBoard)"
                  />
                </template>
              </v-tooltip>
              <div
                v-if="!boardThumbnailUrls[selectedBoard.id]"
                class="board-cover-placeholder"
              >
                <v-icon icon="mdi-image-plus-outline" size="34" color="primary" />
                <div class="text-caption muted mt-1">No board photo</div>
              </div>
            </div>
            <div class="board-cover-body">
              <div class="section-title">Board photo</div>
              <div class="text-body-2 mt-1">
                {{ selectedBoard.coverImageFilename || "Add a photo of the board, wiring, or enclosure." }}
              </div>
              <div
                v-if="selectedBoard.coverImageSizeBytes !== null"
                class="text-caption muted mt-1"
              >
                {{ formatBytes(selectedBoard.coverImageSizeBytes) }}
              </div>
              <div class="board-cover-meta">
                <div class="metric-label">MAC address</div>
                <strong class="metadata-mono">
                  {{ selectedBoard.macAddress || "Not set" }}
                </strong>
              </div>
              <div class="board-cover-actions">
                <v-btn
                  color="primary"
                  variant="tonal"
                  prepend-icon="mdi-image-plus-outline"
                  :loading="boardCoverBusyId === selectedBoard.id"
                  @click="chooseBoardCover(selectedBoard)"
                >
                  {{ selectedBoard.coverImagePath ? "Change photo" : "Add photo" }}
                </v-btn>
                <v-btn
                  v-if="selectedBoard.coverImagePath"
                  variant="text"
                  color="error"
                  prepend-icon="mdi-image-remove-outline"
                  :disabled="boardCoverBusyId === selectedBoard.id"
                  @click="removeBoardCover(selectedBoard)"
                >
                  Remove
                </v-btn>
              </div>
              <div class="text-caption muted mt-2">
                Drag an image here to update the board photo.
              </div>
            </div>
          </div>

          <div class="board-facts">
            <div>
              <div class="metric-label">Chip</div>
              <div class="board-fact-value">{{ selectedBoard.chipModel || "Not set" }}</div>
            </div>
            <div>
              <div class="metric-label">Flash</div>
              <div class="board-fact-value">
                {{ formatFlashSize(selectedBoard.flashSizeBytes, selectedBoard.flashSizeLabel) }}
              </div>
            </div>
            <div>
              <div class="metric-label">Project</div>
              <button
                v-if="selectedBoard.projectId"
                class="board-project-link"
                type="button"
                @click="openAssignedProject(selectedBoard)"
              >
                <span>{{ formatProjectName(selectedBoard) }}</span>
                <v-icon icon="mdi-open-in-new" size="16" />
              </button>
              <div v-else class="board-fact-value">No project</div>
            </div>
          </div>

          <div class="partitions-panel">
            <div class="partitions-header">
              <div>
                <div class="section-title">Partitions</div>
                <div class="text-body-2 muted mt-1">
                  {{ formatPartitionSummary(selectedBoard) }}
                </div>
              </div>
              <div class="partitions-actions">
                <v-chip
                  color="primary"
                  prepend-icon="mdi-table"
                  size="small"
                  variant="tonal"
                >
                  {{ selectedPartitionRows.length }} recorded
                </v-chip>
                <v-btn
                  color="primary"
                  prepend-icon="mdi-table-edit"
                  size="small"
                  variant="tonal"
                  @click="openPartitionBuilder(selectedBoard)"
                >
                  Modify the partitions
                </v-btn>
              </div>
            </div>

            <v-alert
              v-if="partitionBuilderError"
              class="mt-4"
              type="error"
              variant="tonal"
            >
              {{ partitionBuilderError }}
            </v-alert>

            <v-alert
              v-if="selectedBoard.partitionTableReadError"
              class="mt-4"
              type="warning"
              variant="tonal"
            >
              {{ selectedBoard.partitionTableReadError }}
            </v-alert>

            <template v-if="selectedPartitionRows.length">
              <div class="partition-map" aria-label="Board flash partition map">
                <v-tooltip
                  v-for="segment in selectedPartitionSegments"
                  :key="segment.key"
                  location="top"
                >
                  <template #activator="{ props: tooltipProps }">
                    <div
                      v-bind="tooltipProps"
                      class="partition-map-segment"
                      :class="{
                        'partition-map-segment--unused': segment.isUnused,
                        'partition-map-segment--reserved': segment.isReserved
                      }"
                      :style="{
                        width: segment.width,
                        flexBasis: segment.width,
                        backgroundColor: segment.color,
                        backgroundImage: segment.backgroundImage || undefined
                      }"
                    >
                      <span v-if="segment.showLabel" class="partition-segment-label">
                        {{ segment.label }}
                      </span>
                      <span v-if="segment.showMeta" class="partition-segment-meta">
                        {{ segment.sizeText }}
                      </span>
                    </div>
                  </template>
                  <div class="partition-tooltip">
                    <strong>{{ segment.label }}</strong>
                    <span
                      v-for="line in segment.tooltipLines"
                      :key="line"
                    >
                      {{ line }}
                    </span>
                  </div>
                </v-tooltip>
              </div>

              <v-table class="partition-table mt-4" density="compact">
                <thead>
                  <tr>
                    <th>Partition</th>
                    <th>Type</th>
                    <th>Offset</th>
                    <th>Size</th>
                    <th>Filesystem</th>
                    <th>Flags</th>
                  </tr>
                </thead>
                <tbody>
                  <tr
                    v-for="(partition, index) in selectedPartitionRows"
                    :key="`${partition.offsetHex}-${partition.label}-${index}`"
                  >
                    <td>
                      <div class="partition-name-cell">
                        <span
                          class="partition-color-dot"
                          :style="{ backgroundColor: getPartitionColor(partition, index) }"
                        />
                        <div>
                          <div class="font-weight-bold">
                            {{ formatPartitionLabel(partition) }}
                          </div>
                          <div class="text-caption muted">
                            {{ formatPartitionSubtypeLabel(partition.type, partition.subtype) }}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>{{ formatPartitionTypeLabel(partition.type) }}</td>
                    <td class="metadata-mono">
                      {{ partition.offsetHex }}
                      <span class="muted">to</span>
                      {{ formatPartitionEndHex(partition) }}
                    </td>
                    <td>{{ formatBytes(partition.sizeBytes) }}</td>
                    <td>{{ formatPartitionFilesystem(partition) }}</td>
                    <td class="metadata-mono">{{ formatPartitionFlags(partition) }}</td>
                  </tr>
                </tbody>
              </v-table>
            </template>

            <div v-else class="partition-empty">
              <v-icon icon="mdi-table-search" size="34" color="primary" />
              <div>
                <div class="text-subtitle-2 font-weight-bold">
                  No partition table recorded
                </div>
                <div class="text-body-2 muted">
                  Scan this board to read and save the ESP32 flash partition table.
                </div>
              </div>
            </div>
          </div>

          <div class="board-info-grid mt-5">
            <div class="board-info-panel">
              <div class="section-title">Hardware</div>
              <div class="board-detail-row">
                <span>PSRAM</span>
                <strong>{{ formatPsramSize(selectedBoard.psramSizeBytes, selectedBoard.psramDetected) }}</strong>
              </div>
              <div class="board-detail-row">
                <span>Location</span>
                <strong>{{ selectedBoard.physicalLocation || "Not set" }}</strong>
              </div>
            </div>

            <div class="board-info-panel">
              <div class="section-title">Scan metadata</div>
              <div class="board-detail-row">
                <span>Chip revision</span>
                <strong>{{ selectedBoard.chipRevision ?? "Not set" }}</strong>
              </div>
              <div class="board-detail-row">
                <span>Variant</span>
                <strong>{{ selectedBoard.chipVariant || "Not set" }}</strong>
              </div>
              <div class="board-detail-row">
                <span>Crystal</span>
                <strong>{{ selectedBoard.crystalFrequency || "Not set" }}</strong>
              </div>
              <div class="board-detail-row">
                <span>Flash chip</span>
                <strong>{{ selectedBoard.flashManufacturerName || selectedBoard.flashChipIdHex || "Not set" }}</strong>
              </div>
            </div>

            <div class="board-info-panel">
              <div class="section-title">Security</div>
              <div class="board-detail-row">
                <span>Secure boot</span>
                <strong>{{ formatEnabledState(selectedBoard.secureBootEnabled) }}</strong>
              </div>
              <div class="board-detail-row">
                <span>Flash encryption</span>
                <strong>{{ formatEnabledState(selectedBoard.flashEncryptionEnabled) }}</strong>
              </div>
              <div class="board-detail-row">
                <span>Security flags</span>
                <strong>{{ selectedBoard.securityFlagsHex || "Not set" }}</strong>
              </div>
              <div class="board-detail-row">
                <span>Bootloader offset</span>
                <strong>{{ selectedBoard.bootloaderOffsetHex || "Not set" }}</strong>
              </div>
            </div>

            <div class="board-info-panel">
              <div class="section-title">Record</div>
              <div class="board-detail-row">
                <span>Last connected</span>
                <strong>{{ formatDate(selectedBoard.lastConnectedAt) }}</strong>
              </div>
              <div class="board-detail-row">
                <span>Last scan update</span>
                <strong>{{ formatDate(selectedBoard.lastScannedAt) }}</strong>
              </div>
              <div class="board-detail-row">
                <span>Updated</span>
                <strong>{{ formatDate(selectedBoard.updatedAt) }}</strong>
              </div>
              <div class="board-detail-row">
                <span>Created</span>
                <strong>{{ formatDate(selectedBoard.createdAt) }}</strong>
              </div>
              <div class="board-detail-row">
                <span>Board ID</span>
                <strong class="metadata-mono">{{ selectedBoard.id }}</strong>
              </div>
            </div>

            <div class="board-info-panel board-notes-panel">
              <div class="section-title">Notes</div>
              <p class="board-notes-text">
                {{ selectedBoard.notes || "No notes yet" }}
              </p>
            </div>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <BoardEditorDialog
      v-model="editorOpen"
      :board="editingBoard"
      :cover-image-busy="Boolean(editingBoard && boardCoverBusyId === editingBoard.id)"
      :cover-image-error="boardCoverError"
      :location-options="locationOptions"
      @choose-cover="chooseBoardCover"
      @remove-cover="removeBoardCover"
      @drop-cover="dropBoardCover"
      @save="saveBoard"
    />

    <v-dialog v-model="boardCoverViewerOpen" max-width="96vw">
      <v-card class="cover-viewer-card">
        <v-card-title class="cover-viewer-title">
          <span class="text-subtitle-1 font-weight-bold">
            {{ selectedBoard?.coverImageFilename || "Board photo" }}
          </span>
          <v-btn
            icon="mdi-close"
            variant="text"
            aria-label="Close board photo"
            @click="boardCoverViewerOpen = false"
          />
        </v-card-title>
        <v-divider />
        <v-card-text class="cover-viewer-body">
          <img
            v-if="selectedBoard && boardThumbnailUrls[selectedBoard.id]"
            class="cover-viewer-image"
            :src="boardThumbnailUrls[selectedBoard.id] ?? ''"
            :alt="selectedBoard.coverImageFilename || 'Board photo'"
          >
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="Boolean(deletingBoard)" max-width="460" persistent>
      <v-card>
        <v-card-title>Delete board?</v-card-title>
        <v-card-text>
          This removes
          <strong>{{ deletingBoard?.name }}</strong>
          from the local inventory.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deletingBoard = null">Cancel</v-btn>
          <v-btn color="error" prepend-icon="mdi-delete-outline" @click="confirmDelete">
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.metadata-mono {
  font-family: "Cascadia Mono", "Segoe UI Mono", monospace;
  font-size: 0.8125rem;
  white-space: nowrap;
}

.board-toolbar.toolbar-band {
  margin-bottom: 10px;
}

.boards-layout {
  display: grid;
  grid-template-columns: minmax(360px, 0.85fr) minmax(560px, 1.4fr);
  gap: 16px;
  align-items: start;
}

.board-row {
  cursor: pointer;
}

.board-row--selected {
  background: rgba(var(--v-theme-primary), 0.1);
  box-shadow: inset 4px 0 0 rgb(var(--v-theme-primary));
}

.board-list-identity {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.board-list-cover {
  display: grid;
  width: 52px;
  height: 52px;
  overflow: hidden;
  place-items: center;
  border: 1px solid var(--vault-border);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(var(--v-theme-primary), 0.1), rgba(var(--v-theme-accent), 0.08)),
    var(--vault-cover-bg);
}

.board-list-cover-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.board-list-copy {
  min-width: 0;
}

.board-list-copy .text-caption {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.boards-table :deep(td),
.boards-table :deep(th) {
  padding: 12px 14px;
  vertical-align: middle;
}

.boards-table :deep(th) {
  white-space: nowrap;
}

.boards-table :deep(td:first-child) {
  min-width: 260px;
}

.board-detail-title {
  display: grid;
  gap: 8px;
  padding: 18px 20px;
}

.board-detail-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.board-detail-copy {
  min-width: 0;
  flex: 1 1 auto;
}

.board-detail-copy .text-h6 {
  overflow-wrap: anywhere;
}

.detail-description {
  max-width: 100%;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.board-detail-actions {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
}

.board-detail-timestamps {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  margin-top: 8px;
  color: var(--vault-muted);
  font-size: 0.8rem;
}

.board-detail-timestamps span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.board-cover-panel {
  position: relative;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
  margin-bottom: 18px;
  border-radius: 8px;
}

.cover-drop-target {
  outline: 1px dashed transparent;
  outline-offset: 4px;
  transition:
    background-color 140ms ease,
    outline-color 140ms ease;
}

.cover-drop-target--active {
  background: rgba(var(--v-theme-primary), 0.08);
  outline-color: rgba(var(--v-theme-primary), 0.72);
}

.board-cover-preview {
  position: relative;
  display: grid;
  min-height: 180px;
  overflow: hidden;
  border: 1px solid var(--vault-border);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(var(--v-theme-primary), 0.1), rgba(var(--v-theme-accent), 0.08)),
    var(--vault-cover-bg);
}

.board-cover-viewer-trigger {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 180px;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}

.board-cover-viewer-trigger:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary));
  outline-offset: -3px;
}

.board-cover-viewer-trigger :deep(.v-img) {
  width: 100%;
  height: 100% !important;
}

.board-cover-viewer-trigger :deep(.v-img__img) {
  object-fit: contain;
  object-position: center center;
}

.board-cover-placeholder {
  display: grid;
  min-height: 180px;
  place-items: center;
  align-content: center;
}

.cover-rotate-button {
  position: absolute;
  z-index: 3;
  top: 10px;
  right: 10px;
  box-shadow: var(--vault-card-shadow);
}

.board-cover-body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.board-cover-meta {
  width: fit-content;
  max-width: 100%;
  margin-top: 12px;
  border: 1px solid var(--vault-soft-border);
  border-radius: 8px;
  padding: 9px 12px;
  background: rgba(var(--v-theme-primary), 0.08);
}

.board-cover-meta strong {
  display: block;
  margin-top: 3px;
  overflow-wrap: anywhere;
}

.board-cover-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.cover-viewer-card {
  display: flex;
  width: min(96vw, 1200px);
  max-height: 92vh;
  flex-direction: column;
}

.cover-viewer-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  flex: 0 0 auto;
  min-width: 0;
}

.cover-viewer-body {
  display: grid;
  min-height: 0;
  flex: 1 1 auto;
  place-items: center;
  overflow: hidden;
  padding: 12px;
}

.cover-viewer-image {
  display: block;
  width: auto;
  height: auto;
  max-width: 100%;
  max-height: calc(92vh - 72px);
  object-fit: contain;
}

.board-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.board-facts > div,
.board-info-panel {
  border: 1px solid var(--vault-soft-border);
  border-radius: 8px;
  padding: 14px;
  background: rgba(var(--v-theme-surface-variant), 0.34);
}

.board-fact-value {
  margin-top: 4px;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.board-project-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  margin-top: 4px;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  text-align: left;
}

.board-project-link span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.board-project-link:hover span {
  text-decoration: underline;
}

.board-project-link:focus-visible {
  border-radius: 4px;
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 3px;
}

.board-info-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}

.board-notes-panel {
  grid-column: 1 / -1;
}

.board-notes-text {
  margin: 10px 0 0;
  color: var(--vault-text);
  line-height: 1.5;
  white-space: pre-wrap;
}

.partitions-panel {
  margin-top: 18px;
  padding: 16px;
  border: 1px solid var(--vault-soft-border);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(var(--v-theme-primary), 0.08), transparent 44%),
    rgba(var(--v-theme-surface-variant), 0.28);
}

.partitions-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.partitions-actions {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.partition-map {
  display: flex;
  width: 100%;
  min-height: 104px;
  margin-top: 16px;
  overflow: hidden;
  border: 1px solid var(--vault-border);
  border-radius: 8px;
  background: rgba(var(--v-theme-surface), 0.6);
}

.partition-map-segment {
  display: flex;
  flex: 0 0 auto;
  min-width: 8px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 8px;
  border-left: 1px solid rgba(255, 255, 255, 0.24);
  color: rgba(255, 255, 255, 0.96);
  text-align: center;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.38);
}

.partition-map-segment:first-child {
  border-left: 0;
}

.partition-map-segment--unused {
  color: rgba(255, 255, 255, 0.78);
  background-repeat: repeat;
  background-size: 24px 24px;
}

.partition-map-segment--reserved {
  color: rgba(255, 255, 255, 0.86);
}

.partition-segment-label {
  max-width: 100%;
  overflow: hidden;
  font-size: 0.78rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.partition-segment-meta {
  max-width: 100%;
  overflow: hidden;
  font-size: 0.7rem;
  opacity: 0.86;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.partition-tooltip {
  display: flex;
  min-width: 180px;
  flex-direction: column;
  gap: 4px;
  color: inherit;
}

.partition-tooltip strong {
  font-weight: 800;
}

.partition-table {
  border: 1px solid var(--vault-soft-border);
  border-radius: 8px;
  overflow: hidden;
}

.partition-table :deep(td),
.partition-table :deep(th) {
  padding: 10px 12px;
  vertical-align: middle;
}

.partition-name-cell {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.partition-color-dot {
  width: 12px;
  height: 12px;
  flex: 0 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.5);
  border-radius: 999px;
  box-shadow: 0 0 0 3px rgba(var(--v-theme-primary), 0.08);
}

.partition-empty {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding: 18px;
  border: 1px dashed var(--vault-border);
  border-radius: 8px;
  background: rgba(var(--v-theme-surface), 0.42);
}

.board-detail-row {
  display: flex;
  justify-content: space-between;
  gap: 14px;
  padding-top: 10px;
}

.board-detail-row span {
  color: var(--vault-muted);
}

.board-detail-row strong {
  min-width: 0;
  text-align: right;
  overflow-wrap: anywhere;
}

.section-title {
  color: var(--vault-muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

@media (max-width: 1200px) {
  .boards-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 760px) {
  .board-cover-panel,
  .board-facts,
  .board-info-grid {
    grid-template-columns: 1fr;
  }

  .partitions-header,
  .partition-empty {
    align-items: flex-start;
    flex-direction: column;
  }

  .partitions-actions {
    justify-content: flex-start;
  }

  .partition-map {
    min-height: 90px;
  }

  .partition-table {
    overflow-x: auto;
  }

  .board-detail-heading {
    flex-direction: column;
  }

  .board-detail-row {
    flex-direction: column;
    gap: 2px;
  }

  .board-detail-row strong {
    text-align: left;
  }
}
</style>
