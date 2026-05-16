<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { storeToRefs } from "pinia";
import type { Board } from "../../shared/types/board";
import {
  PROJECT_STATUSES,
  type CreateProjectInput,
  type Project,
  type ProjectStatus
} from "../../shared/types/inventory";
import {
  BOARD_STATUS_COLORS,
  BOARD_STATUS_LABELS,
  formatBytes,
  formatDate,
  formatFlashSize,
  formatPsramSize
} from "../utils/boardDisplay";
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
const selectedAssignableBoardId = ref<string | null>(null);
const coverImageDataUrl = ref<string | null>(null);
const coverImageError = ref<string | null>(null);
const coverImageLoading = ref(false);
const coverImageViewerOpen = ref(false);
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
      [project.name, project.description]
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
    status: project.status
  });
  editorOpen.value = true;
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

  coverImageError.value = null;
  coverImageLoading.value = true;

  const previousPath = project.coverImagePath;
  let copiedPath: string | null = null;

  try {
    const result = await window.api.projectImages.chooseCover(project.id);

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

function getProjectImageError(
  caughtError: unknown,
  fallbackMessage: string
): string {
  return caughtError instanceof Error ? caughtError.message : fallbackMessage;
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
        <v-card class="metric-card" flat>
          <v-card-text>
            <div class="metric-label">Projects</div>
            <div class="metric-value">{{ projects.length }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card class="metric-card" flat>
          <v-card-text>
            <div class="metric-label">Assigned boards</div>
            <div class="metric-value">{{ assignedBoardCount }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" md="4">
        <v-card class="metric-card" flat>
          <v-card-text>
            <div class="metric-label">Unassigned boards</div>
            <div class="metric-value">{{ unassignedBoardCount }}</div>
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
      <v-icon icon="mdi-folder-outline" size="40" color="secondary" />
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
      <v-card flat border>
        <v-card-title class="text-subtitle-1 font-weight-bold">
          Project list
        </v-card-title>
        <v-divider />
        <v-table class="projects-table">
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
                    <div class="board-name">{{ row.project.name }}</div>
                    <div class="text-caption muted">
                      {{ row.project.description || "No notes yet" }}
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <v-chip
                  :color="PROJECT_STATUS_COLORS[row.project.status]"
                  size="small"
                  variant="tonal"
                >
                  {{ PROJECT_STATUS_LABELS[row.project.status] }}
                </v-chip>
              </td>
              <td>{{ row.assignedBoards.length }}</td>
              <td>
                <v-chip :color="projectHealthColor(row)" size="small" variant="tonal">
                  {{ formatProjectHealth(row) }}
                </v-chip>
              </td>
            </tr>
          </tbody>
        </v-table>
      </v-card>

      <v-card v-if="selectedRow" flat border>
        <v-card-title class="project-detail-title">
          <div>
            <div class="text-h6">{{ selectedRow.project.name }}</div>
            <div class="text-body-2 muted">
              {{ selectedRow.project.description || "No notes yet" }}
            </div>
          </div>
          <div class="project-detail-actions">
            <v-chip
              :color="PROJECT_STATUS_COLORS[selectedRow.project.status]"
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

          <div class="project-cover-panel">
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
                  cover
                  height="160"
                />
              </button>
              <div v-else class="project-cover-placeholder">
                <v-icon icon="mdi-image-plus-outline" size="34" color="secondary" />
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
          <v-table v-if="selectedRow.assignedBoards.length" class="assigned-board-table">
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
                    :color="BOARD_STATUS_COLORS[board.status]"
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
            <v-icon icon="mdi-developer-board" size="32" color="secondary" />
            <div class="text-subtitle-2 font-weight-bold mt-2">No boards assigned</div>
          </div>
        </v-card-text>
      </v-card>
    </div>

    <v-dialog v-model="editorOpen" max-width="640" persistent>
      <v-card>
        <v-card-title class="d-flex align-center justify-space-between">
          <span>{{ editingProject ? "Edit project" : "Add project" }}</span>
          <v-btn icon="mdi-close" variant="text" aria-label="Close" @click="closeEditor" />
        </v-card-title>
        <v-divider />
        <v-card-text>
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

.project-row {
  cursor: pointer;
}

.project-row--selected {
  background: #eef4ed;
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
  border: 1px solid #dcded8;
  border-radius: 8px;
  background: #f4f6f1;
}

.project-list-cover-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.project-list-copy {
  min-width: 0;
}

.project-detail-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}

.project-detail-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.project-cover-panel {
  display: grid;
  grid-template-columns: 220px minmax(0, 1fr);
  gap: 16px;
  align-items: stretch;
  margin-bottom: 18px;
}

.project-cover-preview {
  min-height: 160px;
  overflow: hidden;
  border: 1px solid #dcded8;
  border-radius: 8px;
  background: #f4f6f1;
}

.project-cover-viewer-trigger {
  display: block;
  width: 100%;
  min-height: 160px;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: zoom-in;
}

.project-cover-viewer-trigger:focus-visible {
  outline: 3px solid rgb(var(--v-theme-primary));
  outline-offset: -3px;
}

.project-cover-placeholder {
  display: grid;
  min-height: 160px;
  place-items: center;
  align-content: center;
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
  width: min-content;
  max-width: 96vw;
  max-height: 92vh;
}

.cover-viewer-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-width: min(520px, 90vw);
}

.cover-viewer-body {
  max-width: 96vw;
  max-height: 82vh;
  overflow: auto;
  padding: 12px;
}

.cover-viewer-image {
  display: block;
  width: auto;
  height: auto;
  max-width: none;
  max-height: none;
}

.project-facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
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
  color: rgb(var(--v-theme-secondary));
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

@media (max-width: 760px) {
  .project-toolbar,
  .project-cover-panel,
  .project-facts,
  .assign-board-row {
    grid-template-columns: 1fr;
  }

  .project-detail-title {
    flex-direction: column;
  }
}
</style>
