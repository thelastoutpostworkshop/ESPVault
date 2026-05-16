<script setup lang="ts">
import { computed, onMounted } from "vue";
import { storeToRefs } from "pinia";
import type { Board } from "../../shared/types/board";
import { useBoardStore } from "../stores/boardStore";
import { useProjectStore } from "../stores/projectStore";
import {
  BOARD_STATUS_COLORS,
  BOARD_STATUS_LABELS,
  formatBytes,
  formatDate
} from "../utils/boardDisplay";

const boardStore = useBoardStore();
const projectStore = useProjectStore();
const { boards, dashboardStats, error, loading } = storeToRefs(boardStore);
const { projects, loading: projectsLoading } = storeToRefs(projectStore);
const emit = defineEmits<{
  "open-boards": [];
  "scan-boards": [];
}>();
const totalFlashBytes = computed(() =>
  boards.value.reduce((total, board) => total + (board.flashSizeBytes ?? 0), 0)
);
const totalPsramBytes = computed(() =>
  boards.value.reduce((total, board) => total + (board.psramSizeBytes ?? 0), 0)
);
const boardsWithKnownFlash = computed(
  () => boards.value.filter((board) => board.flashSizeBytes !== null).length
);
const boardsWithKnownPsram = computed(
  () => boards.value.filter((board) => board.psramSizeBytes !== null).length
);
const boardsNeedingAttention = computed(
  () =>
    boards.value.filter((board) =>
      ["broken", "needs_flashing", "unknown"].includes(board.status)
    ).length
);
const unassignedBoards = computed(
  () => boards.value.filter((board) => !board.projectId).length
);
const chipFamilyMetrics = computed(() => {
  const counts = new Map<string, number>();

  for (const board of boards.value) {
    const chipFamily = formatChipFamily(board);
    counts.set(chipFamily, (counts.get(chipFamily) ?? 0) + 1);
  }

  return Array.from(counts, ([label, count]) => ({ label, count })).sort(
    (left, right) => right.count - left.count || left.label.localeCompare(right.label)
  );
});
const largestChipFamilyCount = computed(
  () => chipFamilyMetrics.value[0]?.count ?? 0
);

onMounted(() => {
  void refreshDashboard();
});

async function refreshDashboard(): Promise<void> {
  await Promise.all([boardStore.refresh(), projectStore.loadProjects()]);
}

function formatKnownCount(count: number): string {
  const total = boards.value.length;
  return total === 0 ? "No boards" : `Known on ${count} of ${total}`;
}

function formatChipFamily(board: Board): string {
  return board.chipModel?.trim() || board.chipFamilyHex || "Unknown";
}

function chipFamilyPercent(count: number): number {
  return largestChipFamilyCount.value > 0
    ? Math.round((count / largestChipFamilyCount.value) * 100)
    : 0;
}
</script>

<template>
  <section class="page-shell">
    <div class="page-header">
      <div>
        <h1 class="page-title">Dashboard</h1>
        <p class="page-subtitle">
          A quick read on the boards currently recorded in this local vault.
        </p>
      </div>
      <div class="dashboard-actions">
        <v-btn
          color="primary"
          prepend-icon="mdi-usb-port"
          @click="emit('scan-boards')"
        >
          Scan boards
        </v-btn>
        <v-btn
          variant="outlined"
          prepend-icon="mdi-refresh"
          :loading="loading || projectsLoading"
          @click="refreshDashboard"
        >
          Refresh
        </v-btn>
      </div>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error }}
    </v-alert>

    <v-row>
      <v-col cols="12" sm="6" lg>
        <v-card class="metric-card" flat>
          <v-card-text>
            <div class="metric-label">Total boards</div>
            <div class="metric-value">{{ dashboardStats?.totalBoards ?? 0 }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" lg>
        <v-card class="metric-card" flat>
          <v-card-text>
            <div class="metric-label">Projects</div>
            <div class="metric-value">{{ projects.length }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" lg>
        <v-card class="metric-card" flat>
          <v-card-text>
            <div class="metric-label">Available</div>
            <div class="metric-value">{{ dashboardStats?.availableBoards ?? 0 }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" lg>
        <v-card class="metric-card" flat>
          <v-card-text>
            <div class="metric-label">In use</div>
            <div class="metric-value">{{ dashboardStats?.inUseBoards ?? 0 }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" lg>
        <v-card class="metric-card" flat>
          <v-card-text>
            <div class="metric-label">Broken</div>
            <div class="metric-value">{{ dashboardStats?.brokenBoards ?? 0 }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row class="mt-2">
      <v-col cols="12" sm="6" lg="3">
        <v-card class="metric-card" flat>
          <v-card-text>
            <div class="metric-label">Total flash</div>
            <div class="metric-value">{{ formatBytes(totalFlashBytes) }}</div>
            <div class="metric-note">{{ formatKnownCount(boardsWithKnownFlash) }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" lg="3">
        <v-card class="metric-card" flat>
          <v-card-text>
            <div class="metric-label">Total PSRAM</div>
            <div class="metric-value">{{ formatBytes(totalPsramBytes) }}</div>
            <div class="metric-note">{{ formatKnownCount(boardsWithKnownPsram) }}</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" lg="3">
        <v-card class="metric-card" flat>
          <v-card-text>
            <div class="metric-label">Needs attention</div>
            <div class="metric-value">{{ boardsNeedingAttention }}</div>
            <div class="metric-note">Broken, needs flashing, or unknown</div>
          </v-card-text>
        </v-card>
      </v-col>
      <v-col cols="12" sm="6" lg="3">
        <v-card class="metric-card" flat>
          <v-card-text>
            <div class="metric-label">Unassigned boards</div>
            <div class="metric-value">{{ unassignedBoards }}</div>
            <div class="metric-note">Not linked to a project</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-row class="mt-2">
      <v-col cols="12" lg="5">
        <v-card flat border>
          <v-card-title class="text-subtitle-1 font-weight-bold">
            Boards by chip family
          </v-card-title>
          <v-divider />
          <v-list v-if="chipFamilyMetrics.length" density="compact">
            <v-list-item
              v-for="chipFamily in chipFamilyMetrics"
              :key="chipFamily.label"
            >
              <div class="chip-family-row">
                <div>
                  <div class="font-weight-medium">{{ chipFamily.label }}</div>
                  <div class="text-caption muted">
                    {{ chipFamily.count }} board{{ chipFamily.count === 1 ? "" : "s" }}
                  </div>
                </div>
                <v-progress-linear
                  class="chip-family-bar"
                  color="primary"
                  height="8"
                  rounded
                  :model-value="chipFamilyPercent(chipFamily.count)"
                />
              </div>
            </v-list-item>
          </v-list>
          <div v-else class="empty-state ma-4">
            <div class="text-subtitle-1 font-weight-bold">No chip data yet.</div>
            <div class="text-body-2 muted mt-1">
              Scan boards to populate chip family counts.
            </div>
          </div>
        </v-card>

        <v-card class="mt-4" flat border>
          <v-card-title class="text-subtitle-1 font-weight-bold">
            Recently connected
          </v-card-title>
          <v-divider />
          <v-list v-if="dashboardStats?.recentlyConnectedBoards.length" lines="two">
            <v-list-item
              v-for="board in dashboardStats.recentlyConnectedBoards"
              :key="board.id"
              :title="board.name"
              :subtitle="formatDate(board.lastConnectedAt)"
            />
          </v-list>
          <div v-else class="empty-state ma-4">
            <div class="text-subtitle-1 font-weight-bold">No connections recorded.</div>
            <div class="text-body-2 muted mt-1">
              Serial detection is represented by a mock scan in this slice.
            </div>
          </div>
        </v-card>
      </v-col>

      <v-col cols="12" lg="7">
        <v-card flat border>
          <v-card-title class="text-subtitle-1 font-weight-bold">
            Recently updated boards
          </v-card-title>
          <v-divider />
          <v-list v-if="dashboardStats?.recentlyUpdatedBoards.length" lines="two">
            <v-list-item
              v-for="board in dashboardStats.recentlyUpdatedBoards"
              :key="board.id"
              :title="board.name"
              :subtitle="formatDate(board.updatedAt)"
            >
              <template #append>
                <v-chip
                  class="status-chip"
                  :color="BOARD_STATUS_COLORS[board.status]"
                  size="small"
                  variant="tonal"
                >
                  {{ BOARD_STATUS_LABELS[board.status] }}
                </v-chip>
              </template>
            </v-list-item>
          </v-list>
          <div v-else class="empty-state ma-4">
            <div class="text-subtitle-1 font-weight-bold">No boards yet.</div>
            <div class="text-body-2 muted mt-1">
              Add a board manually to start building your inventory.
            </div>
            <v-btn
              class="mt-4"
              color="primary"
              prepend-icon="mdi-plus"
              @click="emit('open-boards')"
            >
              Add board
            </v-btn>
          </div>
        </v-card>
      </v-col>
    </v-row>
  </section>
</template>

<style scoped>
.dashboard-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 10px;
}

.metric-note {
  color: rgb(var(--v-theme-secondary));
  font-size: 0.78rem;
  margin-top: 4px;
}

.chip-family-row {
  display: grid;
  grid-template-columns: minmax(140px, 1fr) minmax(120px, 42%);
  gap: 12px;
  align-items: center;
  width: 100%;
}

.chip-family-bar {
  min-width: 0;
}

@media (max-width: 720px) {
  .chip-family-row {
    grid-template-columns: 1fr;
  }
}
</style>
