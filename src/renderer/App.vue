<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from "vue";
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
import { useVaultTheme } from "./composables/useVaultTheme";
import {
  getBackupReminder,
  getBackupStatus
} from "./services/backupStatus";
import type { StartupIntegrityIssue } from "./services/startupIntegrity";
import { useBoardStore } from "./stores/boardStore";
import { PROJECT_STATUS_LABELS, useProjectStore } from "./stores/projectStore";

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

const props = defineProps<{
  startupIntegrityIssue?: StartupIntegrityIssue | null;
}>();
const currentView = ref<ViewKey>("dashboard");
const boardToOpenId = ref<string | null>(null);
const projectToOpenId = ref<string | null>(null);
const scanRequestId = ref(0);
const searchSelection = ref<SearchItem | null>(null);
const searchQuery = ref("");
const startupBackupReminderMessage = ref("");
const startupBackupReminderSnackbar = ref(false);
const appVersion = ref<string | null>(null);
const viewportWidth = ref(typeof window === "undefined" ? 1280 : window.innerWidth);
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
const isTemporaryNavigation = computed(() => viewportWidth.value < 960);
const isRailNavigation = computed(
  () => viewportWidth.value >= 960 && viewportWidth.value < 1280
);
const drawerOpen = ref(!isTemporaryNavigation.value);
const appBarBusy = computed(() => boardsLoading.value || projectsLoading.value);
const startupIntegrityIssue = computed(() => props.startupIntegrityIssue ?? null);
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
  void loadStartupBackupReminder();
  window.addEventListener("resize", updateViewportWidth);
});

onBeforeUnmount(() => {
  window.removeEventListener("resize", updateViewportWidth);
});

watch(
  isTemporaryNavigation,
  (isTemporary) => {
    drawerOpen.value = !isTemporary;
  },
  { immediate: true }
);

function updateViewportWidth(): void {
  viewportWidth.value = window.innerWidth;
}

function navigateToView(view: ViewKey): void {
  currentView.value = view;
  closeTemporaryNavigation();
}

function openBoards(): void {
  boardToOpenId.value = null;
  projectToOpenId.value = null;
  currentView.value = "boards";
  closeTemporaryNavigation();
}

function openScan(): void {
  boardToOpenId.value = null;
  projectToOpenId.value = null;
  currentView.value = "scan";
  closeTemporaryNavigation();
}

function scanBoards(): void {
  boardToOpenId.value = null;
  projectToOpenId.value = null;
  scanRequestId.value += 1;
  currentView.value = "scan";
  closeTemporaryNavigation();
}

function openBoard(id: string): void {
  boardToOpenId.value = id;
  projectToOpenId.value = null;
  currentView.value = "boards";
  closeTemporaryNavigation();
}

function openProject(id: string): void {
  boardToOpenId.value = null;
  projectToOpenId.value = id;
  currentView.value = "projects";
  closeTemporaryNavigation();
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

async function loadStartupBackupReminder(): Promise<void> {
  try {
    const backupStatus = await getBackupStatus();
    let currentAppVersion = appVersion.value;

    if (!currentAppVersion) {
      try {
        currentAppVersion = await window.api.app.getVersion();
      } catch {
        currentAppVersion = null;
      }
    }

    const reminder = getBackupReminder(backupStatus.lastBackupAt, undefined, {
      currentAppVersion,
      lastBackupAppVersion: backupStatus.lastBackupAppVersion
    });

    if (reminder.shouldWarn && reminder.message) {
      startupBackupReminderMessage.value = reminder.message;
      startupBackupReminderSnackbar.value = true;
    }
  } catch {
    startupBackupReminderMessage.value = "";
    startupBackupReminderSnackbar.value = false;
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
  return ["Project", PROJECT_STATUS_LABELS[project.status]]
    .filter(Boolean)
    .join(" / ");
}

function openResource(item: ResourceItem): void {
  if (!item.url) {
    return;
  }

  closeTemporaryNavigation();
  void window.api.shell.openExternal(item.url).catch((caughtError: unknown) => {
    console.error("Resource link could not be opened.", caughtError);
  });
}

function openRecoveryTools(): void {
  currentView.value = "backup";
  closeTemporaryNavigation();
}

function openBackupRestoreFromReminder(): void {
  startupBackupReminderSnackbar.value = false;
  openRecoveryTools();
}

function closeTemporaryNavigation(): void {
  if (isTemporaryNavigation.value) {
    drawerOpen.value = false;
  }
}
</script>

<template>
  <v-app>
    <v-navigation-drawer
      v-model="drawerOpen"
      class="vault-drawer"
      :class="{
        'vault-drawer--rail': isRailNavigation,
        'vault-drawer--temporary': isTemporaryNavigation
      }"
      :permanent="!isTemporaryNavigation"
      :temporary="isTemporaryNavigation"
      :rail="isRailNavigation"
      :rail-width="78"
      width="264"
    >
      <div class="brand-block px-4 py-4">
        <div class="brand-lockup" aria-label="ESP Board Vault">
          <div class="brand-mark" aria-hidden="true">
            <v-icon class="brand-mark-board" icon="mdi-developer-board" size="30" />
            <span class="brand-mark-lock">
              <v-icon icon="mdi-lock-outline" size="15" />
            </span>
          </div>
          <div class="brand-copy">
            <span>ESP Board</span>
            <strong>Vault</strong>
          </div>
        </div>
      </div>

      <v-divider />

      <v-list nav density="compact" class="nav-list px-3 py-4">
        <v-tooltip
          v-for="item in navItems"
          :key="item.key"
          :disabled="!isRailNavigation"
          :text="item.title"
          location="end"
        >
          <template #activator="{ props: tooltipProps }">
            <v-list-item
              v-bind="tooltipProps"
              :active="currentView === item.key"
              :prepend-icon="item.icon"
              :title="item.title"
              rounded="lg"
              @click="navigateToView(item.key)"
            />
          </template>
        </v-tooltip>
      </v-list>

      <v-divider class="mx-3" />

      <v-list nav density="compact" class="nav-list px-3 py-4">
        <v-list-subheader class="px-2">Resources</v-list-subheader>
        <v-tooltip
          v-for="item in resourceNavItems"
          :key="item.key"
          :disabled="!isRailNavigation"
          :text="item.title"
          location="end"
        >
          <template #activator="{ props: tooltipProps }">
            <v-list-item
              v-bind="tooltipProps"
              :active="currentView === item.key"
              :prepend-icon="item.icon"
              :title="item.title"
              rounded="lg"
              @click="navigateToView(item.key)"
            />
          </template>
        </v-tooltip>
        <v-tooltip
          v-for="item in resourceItems"
          :key="item.key"
          :disabled="!isRailNavigation"
          :text="item.subtitle ? `${item.title} - ${item.subtitle}` : item.title"
          location="end"
        >
          <template #activator="{ props: tooltipProps }">
            <v-list-item
              v-bind="tooltipProps"
              :disabled="!item.url"
              :prepend-icon="item.icon"
              :append-icon="item.url ? 'mdi-open-in-new' : undefined"
              :title="item.title"
              :subtitle="item.subtitle"
              rounded="lg"
              @click="openResource(item)"
            />
          </template>
        </v-tooltip>
      </v-list>

      <div class="nav-version-block">
        <span>ESP Board Vault</span>
        <strong>Version {{ appVersion ?? "unknown" }}</strong>
      </div>
    </v-navigation-drawer>

    <v-app-bar class="vault-app-bar" flat color="surface">
      <v-btn
        v-if="isTemporaryNavigation"
        icon="mdi-menu"
        variant="text"
        aria-label="Open navigation"
        @click="drawerOpen = true"
      />
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
      <div v-if="startupIntegrityIssue" class="startup-integrity-banner">
        <v-alert
          border="start"
          type="error"
          variant="tonal"
        >
          <template #title>
            {{ startupIntegrityIssue.title }}
          </template>
          <div>{{ startupIntegrityIssue.message }}</div>
          <div
            v-if="startupIntegrityIssue.detail"
            class="startup-integrity-detail mono mt-2"
          >
            {{ startupIntegrityIssue.detail }}
          </div>
          <div class="startup-integrity-actions mt-3">
            <v-btn
              color="error"
              prepend-icon="mdi-database-sync-outline"
              variant="tonal"
              @click="openRecoveryTools"
            >
              Open Backup & Restore
            </v-btn>
          </div>
        </v-alert>
      </div>
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

    <v-snackbar
      v-model="startupBackupReminderSnackbar"
      color="warning"
      location="bottom right"
      timeout="10000"
    >
      {{ startupBackupReminderMessage }}
      <template #actions>
        <v-btn
          variant="text"
          @click="openBackupRestoreFromReminder"
        >
          Open Backup & Restore
        </v-btn>
        <v-btn
          variant="text"
          @click="startupBackupReminderSnackbar = false"
        >
          Dismiss
        </v-btn>
      </template>
    </v-snackbar>
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
  min-height: 82px;
  align-items: center;
}

.brand-lockup {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.brand-mark {
  position: relative;
  display: grid;
  flex: 0 0 48px;
  width: 48px;
  height: 48px;
  place-items: center;
  border: 1px solid rgba(var(--v-theme-primary), 0.34);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(var(--v-theme-primary), 0.16), rgba(var(--v-theme-accent), 0.1)),
    rgba(var(--v-theme-surface), 0.58);
  box-shadow: 0 10px 22px rgba(var(--v-theme-primary), 0.12);
  color: rgb(var(--v-theme-primary));
}

.brand-mark::before,
.brand-mark::after {
  position: absolute;
  left: 8px;
  right: 8px;
  height: 1px;
  background: rgba(var(--v-theme-primary), 0.34);
  content: "";
}

.brand-mark::before {
  top: 9px;
}

.brand-mark::after {
  bottom: 9px;
}

.brand-mark-board {
  filter: drop-shadow(0 5px 12px rgba(var(--v-theme-primary), 0.2));
}

.brand-mark-lock {
  position: absolute;
  right: 5px;
  bottom: 5px;
  display: grid;
  width: 20px;
  height: 20px;
  place-items: center;
  border: 1px solid rgba(var(--v-theme-primary), 0.32);
  border-radius: 8px;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-primary));
}

.brand-copy {
  display: grid;
  min-width: 0;
  line-height: 1;
}

.brand-copy span {
  color: var(--vault-text);
  font-size: 1rem;
  font-weight: 800;
}

.brand-copy strong {
  width: max-content;
  max-width: 100%;
  overflow: hidden;
  background: linear-gradient(135deg, rgb(var(--v-theme-primary)), rgb(var(--v-theme-accent)));
  background-clip: text;
  color: rgb(var(--v-theme-primary));
  font-size: 1.55rem;
  font-weight: 900;
  line-height: 1.04;
  text-overflow: ellipsis;
  text-transform: uppercase;
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
}

.vault-drawer--rail .brand-block {
  min-height: 74px;
  padding-inline: 10px !important;
}

.vault-drawer--rail .brand-lockup {
  justify-content: center;
}

.vault-drawer--rail .brand-copy {
  display: none;
}

.vault-drawer--rail .brand-mark {
  flex-basis: 44px;
  width: 44px;
  height: 44px;
}

.vault-drawer--rail .nav-list {
  padding-inline: 10px !important;
}

.vault-drawer--rail :deep(.v-list-subheader),
.vault-drawer--rail :deep(.v-list-item__append),
.vault-drawer--rail .nav-version-block {
  display: none;
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

.startup-integrity-banner {
  padding: 18px 24px 0;
}

.startup-integrity-detail {
  overflow-wrap: anywhere;
  font-size: 0.84rem;
}

.startup-integrity-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
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
