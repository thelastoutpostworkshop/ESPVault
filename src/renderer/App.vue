<script setup lang="ts">
import { computed, onMounted, ref, type Component } from "vue";
import { storeToRefs } from "pinia";
import type { Board } from "../shared/types/board";
import type { Project } from "../shared/types/inventory";
import AboutPage from "./pages/AboutPage.vue";
import BackupRestorePage from "./pages/BackupRestorePage.vue";
import BoardsPage from "./pages/BoardsPage.vue";
import DashboardPage from "./pages/DashboardPage.vue";
import ProjectsPage from "./pages/ProjectsPage.vue";
import ScanBoardPage from "./pages/ScanBoardPage.vue";
import SettingsPage from "./pages/SettingsPage.vue";
import ToolsPage from "./pages/ToolsPage.vue";
import darkBrandLogo from "./assets/esp-board-vault-logo-dark.png";
import lightBrandLogo from "./assets/esp-board-vault-logo-light.png";
import { useVaultTheme } from "./composables/useVaultTheme";
import { useBoardStore } from "./stores/boardStore";
import { useProjectStore } from "./stores/projectStore";

type ViewKey =
  | "dashboard"
  | "boards"
  | "scan"
  | "projects"
  | "tools"
  | "backup"
  | "about"
  | "settings";

interface NavItem {
  key: ViewKey;
  title: string;
  icon: string;
}

interface ResourceItem {
  key: string;
  title: string;
  icon: string;
  url: string | null;
  subtitle?: string;
}

interface SearchItem {
  id: string;
  type: "board" | "project";
  title: string;
  subtitle: string;
  icon: string;
}

const currentView = ref<ViewKey>("dashboard");
const boardToOpenId = ref<string | null>(null);
const projectToOpenId = ref<string | null>(null);
const scanRequestId = ref(0);
const searchSelection = ref<SearchItem | null>(null);
const searchQuery = ref("");
const appVersion = ref<string | null>(null);
const { isDarkTheme, toggleTheme } = useVaultTheme();
const boardStore = useBoardStore();
const projectStore = useProjectStore();
const { boards, loading: boardsLoading } = storeToRefs(boardStore);
const { projects, loading: projectsLoading } = storeToRefs(projectStore);

const navItems: NavItem[] = [
  { key: "dashboard", title: "Dashboard", icon: "mdi-view-dashboard-outline" },
  { key: "boards", title: "Boards", icon: "mdi-developer-board" },
  { key: "projects", title: "Projects", icon: "mdi-folder-outline" },
  { key: "scan", title: "Scan board", icon: "mdi-usb-port" },
  { key: "backup", title: "Backup & Restore", icon: "mdi-database-sync-outline" },
  { key: "settings", title: "Settings", icon: "mdi-cog-outline" },
  { key: "about", title: "About", icon: "mdi-information-outline" }
];

const resourceNavItems: NavItem[] = [
  { key: "tools", title: "Tools", icon: "mdi-tools" }
];

const resourceItems: ResourceItem[] = [
  {
    key: "tutorial",
    title: "Tutorial",
    icon: "mdi-school-outline",
    url: null,
    subtitle: "Coming soon"
  },
  {
    key: "coffee",
    title: "Buy me a coffee",
    icon: "mdi-coffee-outline",
    url: "https://buymeacoffee.com/thelastoutpostworkshop"
  },
  {
    key: "help",
    title: "Get Help",
    icon: "mdi-help-circle-outline",
    url: "https://github.com/thelastoutpostworkshop/ESP-Board-Vault"
  }
];

const viewComponents: Record<ViewKey, Component> = {
  dashboard: DashboardPage,
  boards: BoardsPage,
  scan: ScanBoardPage,
  projects: ProjectsPage,
  tools: ToolsPage,
  backup: BackupRestorePage,
  about: AboutPage,
  settings: SettingsPage
};

const activeComponent = computed(() => viewComponents[currentView.value]);
const activeTitle = computed(
  () =>
    [...navItems, ...resourceNavItems].find((item) => item.key === currentView.value)
      ?.title
);
const themeToggleIcon = computed(() =>
  isDarkTheme.value ? "mdi-weather-sunny" : "mdi-weather-night"
);
const themeToggleLabel = computed(() =>
  isDarkTheme.value ? "Switch to light mode" : "Switch to dark mode"
);
const brandLogo = computed(() =>
  isDarkTheme.value ? darkBrandLogo : lightBrandLogo
);
const appBarBusy = computed(() => boardsLoading.value || projectsLoading.value);
const searchItems = computed<SearchItem[]>(() => [
  ...boards.value.map((board) => ({
    id: board.id,
    type: "board" as const,
    title: board.name,
    subtitle: formatBoardSearchSubtitle(board),
    icon: "mdi-developer-board"
  })),
  ...projects.value.map((project) => ({
    id: project.id,
    type: "project" as const,
    title: project.name,
    subtitle: formatProjectSearchSubtitle(project),
    icon: "mdi-folder-outline"
  }))
]);
const filteredSearchItems = computed(() => {
  const query = searchQuery.value.trim().toLowerCase();
  const matches = query
    ? searchItems.value.filter((item) =>
        [item.title, item.subtitle, item.type]
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
    : searchItems.value;

  return matches.slice(0, 8);
});
const activeComponentProps = computed(() => {
  if (currentView.value === "boards") {
    return { openBoardId: boardToOpenId.value };
  }

  if (currentView.value === "projects") {
    return { openProjectId: projectToOpenId.value };
  }

  if (currentView.value === "scan") {
    return { scanRequestId: scanRequestId.value };
  }

  return {};
});

onMounted(() => {
  void refreshAppData();
  void loadAppVersion();
});

function openBoards(): void {
  boardToOpenId.value = null;
  projectToOpenId.value = null;
  currentView.value = "boards";
}

function openScan(): void {
  boardToOpenId.value = null;
  projectToOpenId.value = null;
  currentView.value = "scan";
}

function scanBoards(): void {
  boardToOpenId.value = null;
  projectToOpenId.value = null;
  scanRequestId.value += 1;
  currentView.value = "scan";
}

function openBoard(id: string): void {
  boardToOpenId.value = id;
  projectToOpenId.value = null;
  currentView.value = "boards";
}

function openProject(id: string): void {
  boardToOpenId.value = null;
  projectToOpenId.value = id;
  currentView.value = "projects";
}

function selectSearchResult(item: SearchItem | null): void {
  if (!item) {
    return;
  }

  if (item.type === "board") {
    openBoard(item.id);
  } else {
    openProject(item.id);
  }

  searchSelection.value = null;
  searchQuery.value = "";
}

async function refreshAppData(): Promise<void> {
  await Promise.all([boardStore.refresh(), projectStore.loadProjects()]);
}

async function loadAppVersion(): Promise<void> {
  try {
    appVersion.value = await window.api.app.getVersion();
  } catch {
    appVersion.value = null;
  }
}

function formatBoardSearchSubtitle(board: Board): string {
  return [
    "Board",
    board.chipModel,
    board.physicalLocation,
    board.macAddress
  ]
    .filter((value): value is string => Boolean(value))
    .join(" / ");
}

function formatProjectSearchSubtitle(project: Project): string {
  return ["Project", project.status.replace("_", " ")]
    .filter(Boolean)
    .join(" / ");
}

function openResource(item: ResourceItem): void {
  if (!item.url) {
    return;
  }

  void window.api.shell.openExternal(item.url).catch((caughtError: unknown) => {
    console.error("Resource link could not be opened.", caughtError);
  });
}
</script>

<template>
  <v-app>
    <v-navigation-drawer class="vault-drawer" permanent width="264">
      <div class="brand-block px-5 py-5">
        <img
          class="brand-logo"
          :src="brandLogo"
          alt="ESP Board Vault"
        >
      </div>

      <v-divider />

      <v-list nav density="compact" class="nav-list px-3 py-4">
        <v-list-item
          v-for="item in navItems"
          :key="item.key"
          :active="currentView === item.key"
          :prepend-icon="item.icon"
          :title="item.title"
          rounded="lg"
          @click="currentView = item.key"
        />
      </v-list>

      <v-divider class="mx-3" />

      <v-list nav density="compact" class="nav-list px-3 py-4">
        <v-list-subheader class="px-2">Resources</v-list-subheader>
        <v-list-item
          v-for="item in resourceNavItems"
          :key="item.key"
          :active="currentView === item.key"
          :prepend-icon="item.icon"
          :title="item.title"
          rounded="lg"
          @click="currentView = item.key"
        />
        <v-list-item
          v-for="item in resourceItems"
          :key="item.key"
          :disabled="!item.url"
          :prepend-icon="item.icon"
          :append-icon="item.url ? 'mdi-open-in-new' : undefined"
          :title="item.title"
          :subtitle="item.subtitle"
          rounded="lg"
          @click="openResource(item)"
        />
      </v-list>

      <div class="nav-version-block">
        <span>ESP Board Vault</span>
        <strong>Version {{ appVersion ?? "unknown" }}</strong>
      </div>
    </v-navigation-drawer>

    <v-app-bar class="vault-app-bar" flat color="surface">
      <v-app-bar-title class="app-bar-title">{{ activeTitle }}</v-app-bar-title>
      <v-spacer />
      <v-autocomplete
        v-model="searchSelection"
        v-model:search="searchQuery"
        class="global-search"
        clearable
        density="compact"
        hide-details
        item-title="title"
        no-filter
        placeholder="Search boards or projects..."
        prepend-inner-icon="mdi-magnify"
        return-object
        :items="filteredSearchItems"
        variant="outlined"
        @update:model-value="selectSearchResult"
      >
        <template #item="{ props: itemProps, item }">
          <v-list-item
            v-bind="itemProps"
            :prepend-icon="item.icon"
            :subtitle="item.subtitle"
            :title="item.title"
          />
        </template>
        <template #no-data>
          <div class="px-4 py-3 text-body-2 muted">No matching boards or projects.</div>
        </template>
      </v-autocomplete>
      <div class="app-bar-actions">
        <v-btn
          color="primary"
          prepend-icon="mdi-plus"
          variant="tonal"
          @click="openBoards"
        >
          Add board
        </v-btn>
        <v-btn
          color="primary"
          prepend-icon="mdi-usb-port"
          variant="tonal"
          @click="scanBoards"
        >
          Scan boards
        </v-btn>
        <v-btn
          prepend-icon="mdi-refresh"
          variant="outlined"
          :loading="appBarBusy"
          @click="refreshAppData"
        >
          Refresh
        </v-btn>
      </div>
      <v-tooltip :text="themeToggleLabel">
        <template #activator="{ props: tooltipProps }">
          <v-btn
            v-bind="tooltipProps"
            :icon="themeToggleIcon"
            variant="tonal"
            color="primary"
            :aria-label="themeToggleLabel"
            @click="toggleTheme"
          />
        </template>
      </v-tooltip>
    </v-app-bar>

    <v-main>
      <component
        :is="activeComponent"
        v-bind="activeComponentProps"
        @open-boards="openBoards"
        @open-scan="openScan"
        @scan-boards="scanBoards"
        @open-board="openBoard"
        @open-project="openProject"
      />
    </v-main>
  </v-app>
</template>

<style scoped>
.vault-drawer {
  border-right: 1px solid var(--vault-border);
  background:
    linear-gradient(180deg, rgba(var(--v-theme-surface), 0.98), rgba(var(--v-theme-surface-variant), 0.42)),
    rgb(var(--v-theme-surface));
}

.vault-drawer :deep(.v-navigation-drawer__content) {
  display: flex;
  flex-direction: column;
}

.brand-block {
  display: grid;
  min-height: 86px;
  align-items: center;
}

.brand-logo {
  display: block;
  width: 100%;
  max-height: 70px;
  object-fit: contain;
  object-position: left center;
  filter: drop-shadow(0 10px 24px rgba(var(--v-theme-primary), 0.14));
}

.nav-list :deep(.v-list-item) {
  margin-bottom: 4px;
}

.nav-list :deep(.v-list-item--active) {
  border: 1px solid rgba(var(--v-theme-primary), 0.24);
  background: rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
}

.nav-version-block {
  display: grid;
  gap: 4px;
  margin: auto 16px 18px;
  border: 1px solid var(--vault-soft-border);
  border-radius: 8px;
  padding: 12px;
  background: rgba(var(--v-theme-surface-variant), 0.28);
}

.nav-version-block span {
  color: var(--vault-muted);
  font-size: 0.72rem;
  font-weight: 800;
  text-transform: uppercase;
}

.nav-version-block strong {
  color: var(--vault-text);
  font-size: 0.88rem;
  font-weight: 800;
}

.vault-app-bar {
  border-bottom: 1px solid var(--vault-border);
  background: rgba(var(--v-theme-surface), 0.9) !important;
  backdrop-filter: blur(14px);
}

.vault-app-bar :deep(.v-toolbar__content) {
  gap: 12px;
  padding-inline: 18px;
}

.app-bar-title {
  min-width: max-content;
}

.global-search {
  width: min(420px, 32vw);
  flex: 0 1 420px;
}

.global-search :deep(.v-field) {
  border-radius: 8px;
  background: rgba(var(--v-theme-background), 0.28);
}

.app-bar-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

@media (max-width: 1180px) {
  .app-bar-title {
    display: none;
  }

  .global-search {
    width: auto;
    flex: 1 1 260px;
  }
}

@media (max-width: 880px) {
  .app-bar-actions :deep(.v-btn__content) {
    display: none;
  }
}
</style>
