<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import type { Board } from "../../shared/types/board";
import type {
  CoverImageFileInput,
  CoverImageResult
} from "../../shared/types/api";
import {
  PROJECT_STATUSES,
  type CreateProjectInput,
  type Project,
  type ProjectStatus
} from "../../shared/types/inventory";
import {
  BOARD_STATUS_COLORS,
  BOARD_STATUS_ICONS,
  BOARD_STATUS_LABELS,
  formatBytes,
  formatDate,
  formatFlashSize,
  formatPsramSize
} from "../utils/boardDisplay";
import { rotateCoverImageDataUrl } from "../utils/imageRotation";
import { useBoardStore } from "../stores/boardStore";
import {
  PROJECT_STATUS_COLORS,
  PROJECT_STATUS_LABELS,
  useProjectStore
} from "../stores/projectStore";

interface ProjectFilters {
  search: string;
  status: ProjectStatus | "all";
}

interface ProjectForm {
  name: string;
  description: string;
  location: string;
  status: ProjectStatus;
}

interface ProjectRow {
  project: Project;
  assignedBoards: Board[];
  attentionCount: number;
}

const emit = defineEmits<{
  "open-board": [id: string];
}>();
const props = defineProps<{
  openProjectId?: string | null;
}>();

const boardStore = useBoardStore();
const projectStore = useProjectStore();
const {
  boards,
  loading: boardsLoading,
  error: boardError
} = storeToRefs(boardStore);
const {
  projects,
  loading: projectsLoading,
  error: projectError
} = storeToRefs(projectStore);

const filters = reactive<ProjectFilters>({
  search: "",
  status: "all"
});
const form = reactive<ProjectForm>(emptyForm());
const editorOpen = ref(false);
const editingProject = ref<Project | null>(null);
const deletingProject = ref<Project | null>(null);
const saving = ref(false);
const selectedProjectId = ref<string | null>(null);
const openedProjectId = ref<string | null>(null);
const selectedAssignableBoardId = ref<string | null>(null);
const coverImageDataUrl = ref<string | null>(null);
const coverImageError = ref<string | null>(null);
const coverImageLoading = ref(false);
const coverImageViewerOpen = ref(false);
const coverImageDragActive = ref(false);
const coverThumbnailUrls = ref<Record<string, string | null>>({});
let coverImageLoadToken = 0;
let coverThumbnailLoadToken = 0;

const loading = computed(() => boardsLoading.value || projectsLoading.value);
const error = computed(() => projectError.value ?? boardError.value);
const statusOptions = [
  { title: "All statuses", value: "all" },
  ...PROJECT_STATUSES.map((status) => ({
    title: PROJECT_STATUS_LABELS[status],
    value: status
  }))
];
const PROJECT_STATUS_ICONS: Record<ProjectStatus, string> = {
  active: "mdi-play-circle-outline",
  on_hold: "mdi-pause-circle-outline",
  completed: "mdi-check-circle-outline",
  archived: "mdi-archive-outline"
};

const projectRows = computed<ProjectRow[]>(() =>
  projects.value.map((project) => {
    const assignedBoards = boards.value.filter(
      (board) => board.projectId === project.id
    );

    return {
      project,
      assignedBoards,
      attentionCount: assignedBoards.filter((board) =>
        ["broken", "needs_flashing", "unknown"].includes(board.status)
      ).length
    };
  })
);

const filteredRows = computed(() => {
  const search = filters.search.trim().toLowerCase();

  return projectRows.value.filter(({ project }) => {
    const matchesSearch =
      !search ||
      [project.name, project.description, project.location]
        .filter((value): value is string => Boolean(value))
        .some((value) => value.toLowerCase().includes(search));
    const matchesStatus =
      filters.status === "all" || project.status === filters.status;

    return matchesSearch && matchesStatus;
  });
});

const selectedRow = computed(() => {
  if (!filteredRows.value.length) {
    return null;
  }

  return (
    filteredRows.value.find(
      (row) => row.project.id === selectedProjectId.value
    ) ?? filteredRows.value[0]
  );
});

const unassignedBoardCount = computed(
  () => boards.value.filter((board) => !board.projectId).length
);
const assignedBoardCount = computed(
  () => boards.value.filter((board) => Boolean(board.projectId)).length
);
const assignableBoardOptions = computed(() => {
  const currentProjectId = selectedRow.value?.project.id;
  if (!currentProjectId) {
    return [];
  }

  return boards.value
    .filter((board) => board.projectId !== currentProjectId)
    .map((board) => ({
      title: formatAssignableBoardLabel(board),
      value: board.id
    }));
});
const locationOptions = computed(() =>
  uniqueLocationOptions([
    ...projects.value.map((project) => project.location),
    ...boards.value.map((board) => board.physicalLocation)
  ])
);
const projectCoverPathKey = computed(() =>
  projects.value
    .map((project) => `${project.id}:${project.coverImagePath ?? ""}`)
    .join("|")
);

onMounted(() => {
  void refreshProjects();
});

watch(
  filteredRows,
  (rows) => {
    if (!rows.length) {
      selectedProjectId.value = null;
      return;
    }

    if (!rows.some((row) => row.project.id === selectedProjectId.value)) {
      selectedProjectId.value = rows[0].project.id;
    }
  },
  { immediate: true }
);

watch(
  () => props.openProjectId,
  () => {
    openedProjectId.value = null;
    openProjectFromProp();
  },
  { immediate: true }
);

watch(projects, () => {
  openProjectFromProp();
});

watch(selectedProjectId, () => {
  selectedAssignableBoardId.value = null;
});

watch(
  () => selectedRow.value?.project.coverImagePath ?? null,
  (coverImagePath) => {
    void loadSelectedCoverImage(coverImagePath);
  },
  { immediate: true }
);

watch(
  projectCoverPathKey,
  () => {
    void loadProjectCoverThumbnails(projects.value);
  },
  { immediate: true }
);

function emptyForm(): ProjectForm {
  return {
    name: "",
    description: "",
    location: "",
    status: "active"
  };
}

function openCreateDialog(): void {
  editingProject.value = null;
  Object.assign(form, emptyForm());
  editorOpen.value = true;
}

function openEditDialog(project: Project): void {
  editingProject.value = project;
  Object.assign(form, {
    name: project.name,
    description: project.description ?? "",
    location: project.location ?? "",
    status: project.status
  });
  editorOpen.value = true;
}

function openProjectFromProp(): void {
  if (!props.openProjectId || props.openProjectId === openedProjectId.value) {
    return;
  }

  const project = projects.value.find(
    (candidate) => candidate.id === props.openProjectId
  );
  if (!project) {
    return;
  }

  selectProject(project);
  openedProjectId.value = props.openProjectId;
}

function closeEditor(): void {
  editorOpen.value = false;
}

async function refreshProjects(): Promise<void> {
  await Promise.all([projectStore.loadProjects(), boardStore.loadBoards()]);
}

async function saveProject(): Promise<void> {
  saving.value = true;

  const input: CreateProjectInput = {
    name: form.name,
    description: form.description,
    location: form.location,
    status: form.status
  };

  try {
    const project = editingProject.value
      ? await projectStore.updateProject(editingProject.value.id, input)
      : await projectStore.createProject(input);
    selectedProjectId.value = project.id;
    editorOpen.value = false;
    editingProject.value = null;
  } finally {
    saving.value = false;
  }
}

async function confirmDelete(): Promise<void> {
  if (!deletingProject.value) {
    return;
  }

  const deletedProjectId = deletingProject.value.id;
  await projectStore.deleteProject(deletedProjectId);
  await boardStore.loadBoards();

  if (selectedProjectId.value === deletedProjectId) {
    selectedProjectId.value = filteredRows.value[0]?.project.id ?? null;
  }

  deletingProject.value = null;
}

async function assignBoardToSelectedProject(): Promise<void> {
  if (!selectedRow.value || !selectedAssignableBoardId.value) {
    return;
  }

  await boardStore.updateBoard(selectedAssignableBoardId.value, {
    projectId: selectedRow.value.project.id
  });
  selectedAssignableBoardId.value = null;
}

async function removeBoardFromProject(board: Board): Promise<void> {
  await boardStore.updateBoard(board.id, {
    projectId: null
  });
}

async function loadSelectedCoverImage(
  localPath: string | null
): Promise<void> {
  const token = ++coverImageLoadToken;
  coverImageError.value = null;
  coverImageDataUrl.value = null;
  coverImageViewerOpen.value = false;

  if (!localPath) {
    coverImageLoading.value = false;
    return;
  }

  coverImageLoading.value = true;

  try {
    const dataUrl = await window.api.projectImages.readCoverDataUrl(localPath);

    if (token === coverImageLoadToken) {
      coverImageDataUrl.value = dataUrl;
    }
  } catch (caughtError) {
    if (token === coverImageLoadToken) {
      coverImageError.value = getProjectImageError(
        caughtError,
        "The project photo could not be loaded."
      );
    }
  } finally {
    if (token === coverImageLoadToken) {
      coverImageLoading.value = false;
    }
  }
}

async function loadProjectCoverThumbnails(
  projectList: Project[]
): Promise<void> {
  const token = ++coverThumbnailLoadToken;
  const nextThumbnails: Record<string, string | null> = {};

  await Promise.all(
    projectList.map(async (project) => {
      if (!project.coverImagePath) {
        nextThumbnails[project.id] = null;
        return;
      }

      try {
        nextThumbnails[project.id] =
          await window.api.projectImages.readCoverDataUrl(project.coverImagePath);
      } catch {
        nextThumbnails[project.id] = null;
      }
    })
  );

  if (token === coverThumbnailLoadToken) {
    coverThumbnailUrls.value = nextThumbnails;
  }
}

async function chooseCoverImage(): Promise<void> {
  const project = selectedRow.value?.project;
  if (!project) {
    return;
  }

  await applyProjectCoverImage(project, () =>
    window.api.projectImages.chooseCover(project.id)
  );
}

async function dropCoverImage(file: File): Promise<void> {
  const project = selectedRow.value?.project;
  if (!project) {
    return;
  }

  await applyProjectCoverImage(project, () =>
    readCoverImageFile(file).then((coverFile) =>
      window.api.projectImages.copyCoverFromFile(project.id, coverFile)
    )
  );
}

async function rotateProjectCover(): Promise<void> {
  const project = selectedRow.value?.project;
  const coverImagePath = project?.coverImagePath;
  if (!project || !coverImagePath) {
    return;
  }

  await applyProjectCoverImage(project, async () => {
    const dataUrl =
      coverImageDataUrl.value ??
      (await window.api.projectImages.readCoverDataUrl(coverImagePath));

    if (!dataUrl) {
      throw new Error("The project photo could not be loaded.");
    }

    const rotatedFile = await rotateCoverImageDataUrl(
      dataUrl,
      project.coverImageFilename,
      project.coverImageMimeType
    );
    return window.api.projectImages.copyCoverFromFile(project.id, rotatedFile);
  });
}

async function applyProjectCoverImage(
  project: Project,
  copyCoverImage: () => Promise<CoverImageResult>
): Promise<void> {
  if (coverImageLoading.value) {
    return;
  }

  coverImageError.value = null;
  coverImageLoading.value = true;

  const previousPath = project.coverImagePath;
  let copiedPath: string | null = null;

  try {
    const result = await copyCoverImage();

    if (result.canceled || !result.localPath) {
      return;
    }

    copiedPath = result.localPath;
    await projectStore.updateProject(project.id, {
      coverImagePath: result.localPath,
      coverImageFilename: result.filename ?? null,
      coverImageMimeType: result.mimeType ?? null,
      coverImageSizeBytes: result.sizeBytes ?? null
    });
    coverImageDataUrl.value =
      result.dataUrl ??
      (await window.api.projectImages.readCoverDataUrl(result.localPath));

    if (previousPath && previousPath !== result.localPath) {
      await window.api.projectImages.deleteCover(previousPath).catch(() => {
        // The project now points at the new image. A stale old file is non-blocking.
      });
    }
  } catch (caughtError) {
    if (copiedPath) {
      await window.api.projectImages.deleteCover(copiedPath).catch(() => {
        // Cleanup failure should not hide the original save error.
      });
    }

    coverImageError.value = getProjectImageError(
      caughtError,
      "The project photo could not be saved."
    );
  } finally {
    coverImageLoading.value = false;
  }
}

function handleCoverDrag(event: DragEvent): void {
  if (!selectedRow.value || coverImageLoading.value) {
    return;
  }

  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }

  coverImageDragActive.value = true;
}

function clearCoverDrag(): void {
  coverImageDragActive.value = false;
}

async function dropCoverImageFromEvent(event: DragEvent): Promise<void> {
  coverImageDragActive.value = false;
  const file = getDroppedImageFile(event);

  if (!file) {
    coverImageError.value = "Drop a JPG, PNG, WebP, GIF, or BMP image.";
    return;
  }

  await dropCoverImage(file);
}

async function removeCoverImage(): Promise<void> {
  const project = selectedRow.value?.project;
  if (!project?.coverImagePath) {
    return;
  }

  const previousPath = project.coverImagePath;
  coverImageError.value = null;
  coverImageLoading.value = true;

  try {
    await projectStore.updateProject(project.id, {
      coverImagePath: null,
      coverImageFilename: null,
      coverImageMimeType: null,
      coverImageSizeBytes: null
    });
    coverImageDataUrl.value = null;
    coverImageViewerOpen.value = false;

    try {
      await window.api.projectImages.deleteCover(previousPath);
    } catch (caughtError) {
      coverImageError.value = getProjectImageError(
        caughtError,
        "The project photo was removed from the project, but the file could not be deleted."
      );
    }
  } catch (caughtError) {
    coverImageError.value = getProjectImageError(
      caughtError,
      "The project photo could not be removed."
    );
  } finally {
    coverImageLoading.value = false;
  }
}

function selectProject(project: Project): void {
  selectedProjectId.value = project.id;
}

function openCoverImageViewer(): void {
  if (coverImageDataUrl.value) {
    coverImageViewerOpen.value = true;
  }
}

function formatAssignableBoardLabel(board: Board): string {
  const parts = [
    board.name,
    board.macAddress,
    board.chipModel,
    board.projectId ? "assigned elsewhere" : null
  ].filter((value): value is string => Boolean(value));

  return parts.join(" / ");
}

function formatProjectHealth(row: ProjectRow): string {
  if (!row.assignedBoards.length) {
    return "No boards";
  }

  if (row.attentionCount > 0) {
    return `${row.attentionCount} need attention`;
  }

  return "Ready";
}

function projectHealthColor(row: ProjectRow): string {
  if (!row.assignedBoards.length) {
    return "secondary";
  }

  return row.attentionCount > 0 ? "warning" : "success";
}

function projectHealthIcon(row: ProjectRow): string {
  if (!row.assignedBoards.length) {
    return "mdi-progress-question";
  }

  return row.attentionCount > 0 ? "mdi-alert-outline" : "mdi-check-circle-outline";
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

function getProjectImageError(
  caughtError: unknown,
  fallbackMessage: string
): string {
  return caughtError instanceof Error ? caughtError.message : fallbackMessage;
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
</script>

<template>
  <section class="page-shell">
    <div class="page-header">
      <div>
        <h1 class="page-title">Projects</h1>
        <p class="page-subtitle">
          Track the boards, firmware notes, and recovery details that belong together.
        </p>
      </div>
      <v-btn color="primary" prepend-icon="mdi-folder-plus-outline" @click="openCreateDialog">
        Add project
      </v-btn>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error }}
    </v-alert>

    <v-row class="mb-4" dense>
      <v-col cols="12" md="4">
        <v-card class="metric-card metric-card--amber" flat>
          <v-card-text>
            <div class="metric-card-content">
              <div>
                <div class="metric-label">Projects</div>
                <div class="metric-value">{{ projects.length }}</div>
              </div>
              <div class="metric-icon">
                <v-icon icon="mdi-folder-multiple-outline" />
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card class="metric-card metric-card--green" flat>
          <v-card-text>
            <div class="metric-card-content">
              <div>
                <div class="metric-label">Assigned boards</div>
                <div class="metric-value">{{ assignedBoardCount }}</div>
              </div>
              <div class="metric-icon">
                <v-icon icon="mdi-link-variant" />
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card class="metric-card metric-card--blue" flat>
          <v-card-text>
            <div class="metric-card-content">
              <div>
                <div class="metric-label">Unassigned boards</div>
                <div class="metric-value">{{ unassignedBoardCount }}</div>
              </div>
              <div class="metric-icon">
                <v-icon icon="mdi-link-variant-off" />
              </div>
            </div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <div class="project-toolbar">
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
      <v-btn
        variant="outlined"
        prepend-icon="mdi-refresh"
        :loading="loading"
        @click="refreshProjects"
      >
        Refresh
      </v-btn>
    </div>

    <v-progress-linear v-if="loading" indeterminate color="primary" class="mb-3" />

    <div v-if="!filteredRows.length && !loading" class="empty-state">
      <v-icon icon="mdi-folder-outline" size="40" color="primary" />
      <div class="text-subtitle-1 font-weight-bold mt-3">No projects yet.</div>
      <div class="text-body-2 muted mt-1">
        Create a project to group boards, firmware notes, and recovery details.
      </div>
      <v-btn
        class="mt-4"
        color="primary"
        prepend-icon="mdi-folder-plus-outline"
        @click="openCreateDialog"
      >
        Add project
      </v-btn>
    </div>

    <div v-else class="projects-layout">
      <v-card class="vault-table-card" flat>
        <v-card-title class="text-subtitle-1 font-weight-bold">
          <v-icon class="mr-2" color="primary" icon="mdi-folder-table-outline" />
          Project list
        </v-card-title>
        <v-divider />
        <v-table class="vault-data-table projects-table">
          <thead>
            <tr>
              <th>Project</th>
              <th>Status</th>
              <th>Boards</th>
              <th>Health</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in filteredRows"
              :key="row.project.id"
              class="project-row"
              :class="{ 'project-row--selected': selectedRow?.project.id === row.project.id }"
              @click="selectProject(row.project)"
            >
              <td>
                <div class="project-list-identity">
                  <div class="project-list-cover" aria-hidden="true">
                    <img
                      v-if="coverThumbnailUrls[row.project.id]"
                      class="project-list-cover-image"
                      :src="coverThumbnailUrls[row.project.id] ?? ''"
                      alt=""
                    >
                    <v-icon
                      v-else
                      icon="mdi-image-outline"
                      size="24"
                      color="secondary"
                    />
                  </div>
                  <div class="project-list-copy">
                    <div class="board-name project-list-name">
                      {{ row.project.name }}
                    </div>
                    <div class="text-caption muted project-list-meta">
                      {{ row.project.location || row.project.description || "No location set" }}
                    </div>
                  </div>
                </div>
              </td>
              <td class="project-list-status-cell">
                <v-chip
                  class="status-chip"
                  :color="PROJECT_STATUS_COLORS[row.project.status]"
                  :prepend-icon="PROJECT_STATUS_ICONS[row.project.status]"
                  size="small"
                  variant="tonal"
                >
                  {{ PROJECT_STATUS_LABELS[row.project.status] }}
                </v-chip>
              </td>
              <td class="project-list-board-count">
                <span>{{ row.assignedBoards.length }}</span>
                <span class="project-list-board-count-label">
                  {{ row.assignedBoards.length === 1 ? " board" : " boards" }}
                </span>
              </td>
              <td class="project-list-health-cell">
                <v-chip
                  :color="projectHealthColor(row)"
                  :prepend-icon="projectHealthIcon(row)"
                  size="small"
                  variant="tonal"
                >
                  {{ formatProjectHealth(row) }}
                </v-chip>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <v-card v-if="selectedRow" class="panel-card project-detail-card" flat>
        <v-card-title class="project-detail-title">
          <div class="project-detail-heading">
            <div class="project-detail-copy">
              <div class="text-h6">{{ selectedRow.project.name }}</div>
            </div>
            <div class="project-detail-actions">
              <v-chip
                class="status-chip"
                :color="PROJECT_STATUS_COLORS[selectedRow.project.status]"
                :prepend-icon="PROJECT_STATUS_ICONS[selectedRow.project.status]"
                size="small"
                variant="tonal"
              >
                {{ PROJECT_STATUS_LABELS[selectedRow.project.status] }}
              </v-chip>
              <v-btn
                icon="mdi-pencil"
                size="small"
                variant="text"
                aria-label="Edit project"
                @click="openEditDialog(selectedRow.project)"
              />
              <v-btn
                icon="mdi-delete-outline"
                size="small"
                variant="text"
                color="error"
                aria-label="Delete project"
                @click="deletingProject = selectedRow.project"
              />
            </div>
          </div>
          <div class="text-body-2 muted detail-description">
            {{ selectedRow.project.description || "No notes yet" }}
          </div>
          <div
            v-if="selectedRow.project.location"
            class="project-location-line"
          >
            <v-icon icon="mdi-map-marker-outline" size="16" />
            <span>{{ selectedRow.project.location }}</span>
          </div>
        </v-card-title>
        <v-divider />
        <v-card-text>
          <v-alert
            v-if="coverImageError"
            type="error"
            variant="tonal"
            density="compact"
            class="mb-4"
          >
            {{ coverImageError }}
          </v-alert>

          <div
            class="project-cover-panel cover-drop-target"
            :class="{ 'cover-drop-target--active': coverImageDragActive }"
            @dragenter.prevent="handleCoverDrag"
            @dragover.prevent="handleCoverDrag"
            @dragleave.prevent="clearCoverDrag"
            @drop.prevent.stop="dropCoverImageFromEvent"
          >
            <div class="project-cover-preview">
              <button
                v-if="coverImageDataUrl"
                class="project-cover-viewer-trigger"
                type="button"
                :aria-label="`View ${selectedRow.project.coverImageFilename || 'project photo'}`"
                @click="openCoverImageViewer"
              >
                <v-img
                  :src="coverImageDataUrl"
                  alt=""
                  height="160"
                />
              </button>
              <v-tooltip text="Rotate photo">
                <template #activator="{ props: tooltipProps }">
                  <v-btn
                    v-if="selectedRow.project.coverImagePath"
                    v-bind="tooltipProps"
                    class="cover-rotate-button"
                    color="primary"
                    icon="mdi-rotate-right"
                    size="small"
                    variant="tonal"
                    :disabled="coverImageLoading"
                    :loading="coverImageLoading"
                    aria-label="Rotate project photo"
                    @click.stop="rotateProjectCover"
                  />
                </template>
              </v-tooltip>
              <div v-if="!coverImageDataUrl" class="project-cover-placeholder">
                <v-icon icon="mdi-image-plus-outline" size="34" color="primary" />
                <div class="text-caption muted mt-1">No project photo</div>
              </div>
            </div>
            <div class="project-cover-body">
              <div class="section-title">Project photo</div>
              <div class="text-body-2 mt-1">
                {{ selectedRow.project.coverImageFilename || "Add a photo of the build, enclosure, or wiring." }}
              </div>
              <div
                v-if="selectedRow.project.coverImageSizeBytes !== null"
                class="text-caption muted mt-1"
              >
                {{ formatBytes(selectedRow.project.coverImageSizeBytes) }}
              </div>
              <div class="project-cover-actions">
                <v-btn
                  color="primary"
                  variant="tonal"
                  prepend-icon="mdi-image-plus-outline"
                  :loading="coverImageLoading"
                  @click="chooseCoverImage"
                >
                  {{ selectedRow.project.coverImagePath ? "Change photo" : "Add photo" }}
                </v-btn>
                <v-btn
                  v-if="selectedRow.project.coverImagePath"
                  variant="text"
                  color="error"
                  prepend-icon="mdi-image-remove-outline"
                  :disabled="coverImageLoading"
                  @click="removeCoverImage"
                >
                  Remove
                </v-btn>
              </div>
              <div class="text-caption muted mt-2">
                Drag an image here to update the project photo.
              </div>
            </div>
          </div>

          <div class="project-facts">
            <div>
              <div class="metric-label">Boards</div>
              <div class="project-fact-value">{{ selectedRow.assignedBoards.length }}</div>
            </div>
            <div>
              <div class="metric-label">Health</div>
              <div class="project-fact-value">{{ formatProjectHealth(selectedRow) }}</div>
            </div>
            <div>
              <div class="metric-label">Location</div>
              <div class="project-fact-value">
                {{ selectedRow.project.location || "Not set" }}
              </div>
            </div>
            <div>
              <div class="metric-label">Updated</div>
              <div class="project-fact-value">{{ formatDate(selectedRow.project.updatedAt) }}</div>
            </div>
          </div>

          <div class="section-title mt-5 mb-2">Assign board</div>
          <div class="assign-board-row">
            <v-select
              v-model="selectedAssignableBoardId"
              :items="assignableBoardOptions"
              :disabled="!assignableBoardOptions.length"
              clearable
              hide-details
              label="Board"
            />
            <v-btn
              color="primary"
              prepend-icon="mdi-link-variant"
              :disabled="!selectedAssignableBoardId"
              @click="assignBoardToSelectedProject"
            >
              Assign
            </v-btn>
          </div>
          <div
            v-if="!assignableBoardOptions.length"
            class="text-caption muted mt-2"
          >
            Every board in the vault is already assigned to this project.
          </div>

          <div class="section-title mt-5 mb-2">Assigned boards</div>
          <v-table
            v-if="selectedRow.assignedBoards.length"
            class="vault-data-table assigned-board-table"
          >
            <thead>
              <tr>
                <th>Board</th>
                <th>Status</th>
                <th>MAC</th>
                <th>Chip</th>
                <th>Flash</th>
                <th>PSRAM</th>
                <th>Location</th>
                <th class="text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="board in selectedRow.assignedBoards" :key="board.id">
                <td>
                  <div class="board-name">{{ board.name }}</div>
                  <div class="text-caption muted">
                    {{ board.description || board.notes || "No notes yet" }}
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
                <td class="metadata-mono">{{ board.macAddress || "Not set" }}</td>
                <td>{{ board.chipModel || "Not set" }}</td>
                <td>{{ formatFlashSize(board.flashSizeBytes, board.flashSizeLabel) }}</td>
                <td>{{ formatPsramSize(board.psramSizeBytes, board.psramDetected) }}</td>
                <td>{{ board.physicalLocation || "Not set" }}</td>
                <td class="text-right">
                  <div class="board-actions">
                    <v-btn
                      size="small"
                      variant="tonal"
                      color="primary"
                      prepend-icon="mdi-open-in-new"
                      @click="emit('open-board', board.id)"
                    >
                      Open
                    </v-btn>
                    <v-btn
                      size="small"
                      variant="text"
                      prepend-icon="mdi-link-variant-off"
                      @click="removeBoardFromProject(board)"
                    >
                      Remove
                    </v-btn>
                  </div>
                </td>
              </tr>
            </tbody>
          </v-table>
          <div v-else class="empty-state project-empty-state">
            <v-icon icon="mdi-developer-board" size="32" color="primary" />
            <div class="text-subtitle-2 font-weight-bold mt-2">No boards assigned</div>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <v-dialog v-model="editorOpen" max-width="640" persistent>
      <v-card class="vault-edit-dialog-card">
        <v-card-title class="d-flex align-center justify-space-between">
          <span>{{ editingProject ? "Edit project" : "Add project" }}</span>
          <v-btn icon="mdi-close" variant="text" aria-label="Close" @click="closeEditor" />
        </v-card-title>
        <v-divider />
        <v-card-text class="vault-edit-dialog-body">
          <v-form @submit.prevent="saveProject">
            <v-row>
              <v-col cols="12" md="8">
                <v-text-field
                  v-model="form.name"
                  label="Project name"
                  required
                  autofocus
                />
              </v-col>
              <v-col cols="12" md="4">
                <v-select
                  v-model="form.status"
                  :items="PROJECT_STATUSES.map((status) => ({
                    title: PROJECT_STATUS_LABELS[status],
                    value: status
                  }))"
                  label="Status"
                />
              </v-col>
              <v-col cols="12">
                <v-combobox
                  v-model="form.location"
                  :items="locationOptions"
                  auto-select-first
                  clearable
                  label="Project location"
                  prepend-inner-icon="mdi-map-marker-outline"
                />
              </v-col>
              <v-col cols="12">
                <v-textarea
                  v-model="form.description"
                  label="Notes"
                  rows="4"
                  auto-grow
                />
              </v-col>
            </v-row>
          </v-form>
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="closeEditor">Cancel</v-btn>
          <v-btn
            color="primary"
            prepend-icon="mdi-content-save"
            :loading="saving"
            @click="saveProject"
          >
            Save project
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <v-dialog v-model="coverImageViewerOpen" max-width="96vw">
      <v-card class="cover-viewer-card">
        <v-card-title class="cover-viewer-title">
          <span class="text-subtitle-1 font-weight-bold">
            {{ selectedRow?.project.coverImageFilename || "Project photo" }}
          </span>
          <v-btn
            icon="mdi-close"
            variant="text"
            aria-label="Close photo viewer"
            @click="coverImageViewerOpen = false"
          />
        </v-card-title>
        <v-divider />
        <v-card-text class="cover-viewer-body">
          <img
            v-if="coverImageDataUrl"
            class="cover-viewer-image"
            :src="coverImageDataUrl"
            :alt="selectedRow?.project.coverImageFilename || 'Project photo'"
          />
        </v-card-text>
      </v-card>
    </v-dialog>

    <v-dialog :model-value="Boolean(deletingProject)" max-width="500" persistent>
      <v-card>
        <v-card-title>Delete project?</v-card-title>
        <v-card-text>
          This removes <strong>{{ deletingProject?.name }}</strong> and clears its
          board assignments. The boards stay in the vault.
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="deletingProject = null">Cancel</v-btn>
          <v-btn color="error" prepend-icon="mdi-delete-outline" @click="confirmDelete">
            Delete
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </section>
</template>

<style scoped>
.project-toolbar {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) 220px auto;
  gap: 12px;
  align-items: start;
  margin-bottom: 18px;
}

.projects-layout {
  display: grid;
  grid-template-columns: minmax(360px, 0.85fr) minmax(560px, 1.4fr);
  gap: 16px;
  align-items: start;
}

.projects-table :deep(td),
.projects-table :deep(th),
.assigned-board-table :deep(td),
.assigned-board-table :deep(th) {
  padding: 10px 12px;
  vertical-align: top;
}

.projects-table {
  table-layout: fixed;
  width: 100%;
}

.projects-table :deep(th:nth-child(1)),
.projects-table :deep(td:nth-child(1)) {
  width: 46%;
}

.projects-table :deep(th:nth-child(2)),
.projects-table :deep(td:nth-child(2)) {
  width: 24%;
}

.projects-table :deep(th:nth-child(3)),
.projects-table :deep(td:nth-child(3)) {
  width: 12%;
}

.projects-table :deep(th:nth-child(4)),
.projects-table :deep(td:nth-child(4)) {
  width: 18%;
}

.project-row {
  cursor: pointer;
}

.project-row--selected {
  background: rgba(var(--v-theme-primary), 0.1);
  box-shadow: inset 4px 0 0 rgb(var(--v-theme-primary));
}

.project-list-identity {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  min-width: 0;
}

.project-list-cover {
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

.project-list-cover-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.project-list-copy {
  min-width: 0;
}

.project-list-name,
.project-list-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-list-board-count {
  font-weight: 700;
}

.project-list-board-count-label {
  display: none;
}

.project-detail-title {
  display: grid;
  gap: 8px;
  padding: 18px 20px;
}

.project-detail-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.project-detail-copy {
  min-width: 0;
  flex: 1 1 auto;
}

.project-detail-copy .text-h6 {
  overflow-wrap: anywhere;
}

.detail-description {
  max-width: 100%;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
}

.project-detail-actions {
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 6px;
}

.project-location-line {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  max-width: 100%;
  margin-top: 8px;
  color: var(--vault-muted);
  font-size: 0.88rem;
}

.project-location-line span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.project-cover-panel {
  position: relative;
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
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

.project-cover-preview {
  position: relative;
  display: grid;
  min-height: 160px;
  overflow: hidden;
  border: 1px solid var(--vault-border);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(var(--v-theme-primary), 0.1), rgba(var(--v-theme-accent), 0.08)),
    var(--vault-cover-bg);
}

.project-cover-viewer-trigger {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 160px;
  place-items: center;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}

.project-cover-viewer-trigger:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary));
  outline-offset: -3px;
}

.project-cover-viewer-trigger :deep(.v-img) {
  width: 100%;
  height: 100% !important;
}

.project-cover-viewer-trigger :deep(.v-img__img) {
  object-fit: contain;
  object-position: center center;
}

.project-cover-placeholder {
  display: grid;
  min-height: 160px;
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

.project-cover-body {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 0;
}

.project-cover-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 14px;
}

.cover-viewer-card {
  display: flex;
  width: min(96vw, 1200px);
  max-width: 96vw;
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

.project-facts {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 16px;
}

.project-facts > div {
  border: 1px solid var(--vault-soft-border);
  border-radius: 8px;
  padding: 14px;
  background: rgba(var(--v-theme-surface-variant), 0.34);
}

.assign-board-row {
  display: grid;
  grid-template-columns: minmax(260px, 1fr) auto;
  gap: 10px;
  align-items: start;
}

.board-actions {
  display: inline-flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.project-fact-value {
  margin-top: 4px;
  font-weight: 700;
}

.section-title {
  color: var(--vault-muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.metadata-mono {
  font-family: "Cascadia Mono", "Segoe UI Mono", monospace;
  font-size: 0.8125rem;
  white-space: nowrap;
}

.project-empty-state {
  padding: 22px;
}

@media (max-width: 1200px) {
  .projects-layout {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 1500px) {
  .projects-table :deep(thead) {
    display: none;
  }

  .projects-table :deep(tbody) {
    display: block;
  }

  .projects-table :deep(tr) {
    display: grid;
    grid-template-columns: max-content max-content max-content;
    gap: 10px 12px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--vault-soft-border);
  }

  .projects-table :deep(td),
  .projects-table :deep(th),
  .projects-table :deep(td:nth-child(1)),
  .projects-table :deep(td:nth-child(2)),
  .projects-table :deep(td:nth-child(3)),
  .projects-table :deep(td:nth-child(4)) {
    width: auto;
    padding: 0;
    border-bottom: 0 !important;
  }

  .projects-table :deep(td:first-child) {
    grid-column: 1 / -1;
  }

  .project-list-identity {
    grid-template-columns: 64px minmax(0, 1fr);
    align-items: center;
  }

  .project-list-cover {
    width: 64px;
    height: 64px;
  }

  .project-list-name {
    display: -webkit-box;
    overflow: hidden;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-height: 1.2;
  }

  .project-list-meta {
    margin-top: 4px;
  }

  .project-list-board-count {
    display: inline-flex;
    align-items: center;
    min-height: 24px;
    border: 1px solid var(--vault-soft-border);
    border-radius: 999px;
    padding: 0 10px;
    background: rgba(var(--v-theme-surface-variant), 0.34);
    color: var(--vault-muted);
    font-size: 0.82rem;
    font-weight: 700;
  }

  .project-list-board-count-label {
    display: inline;
  }

  .project-row--selected {
    box-shadow: inset 4px 0 0 rgb(var(--v-theme-primary));
  }
}

@media (max-width: 760px) {
  .project-toolbar,
  .project-cover-panel,
  .project-facts,
  .assign-board-row {
    grid-template-columns: 1fr;
  }

  .project-detail-heading {
    flex-direction: column;
  }
}
</style>
