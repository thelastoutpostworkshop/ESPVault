<script setup lang="ts">
import { onMounted } from "vue";
import { storeToRefs } from "pinia";
import { useBoardStore } from "../stores/boardStore";
import { useProjectStore } from "../stores/projectStore";
import {
  BOARD_STATUS_COLORS,
  BOARD_STATUS_LABELS,
  formatDate
} from "../utils/boardDisplay";

const boardStore = useBoardStore();
const projectStore = useProjectStore();
const { dashboardStats, error, loading } = storeToRefs(boardStore);
const { projects, loading: projectsLoading } = storeToRefs(projectStore);
const emit = defineEmits<{
  "open-boards": [];
  "scan-boards": [];
}>();

onMounted(() => {
  void refreshDashboard();
});

async function refreshDashboard(): Promise<void> {
  await Promise.all([boardStore.refresh(), projectStore.loadProjects()]);
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

      <v-col cols="12" lg="5">
        <v-card flat border>
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
</style>
