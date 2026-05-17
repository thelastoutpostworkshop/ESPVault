<script setup lang="ts">
import { computed, ref, type Component } from "vue";
import AboutPage from "./pages/AboutPage.vue";
import BackupRestorePage from "./pages/BackupRestorePage.vue";
import BoardsPage from "./pages/BoardsPage.vue";
import DashboardPage from "./pages/DashboardPage.vue";
import ProjectsPage from "./pages/ProjectsPage.vue";
import ScanBoardPage from "./pages/ScanBoardPage.vue";
import SettingsPage from "./pages/SettingsPage.vue";

type ViewKey =
  | "dashboard"
  | "boards"
  | "scan"
  | "projects"
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

const currentView = ref<ViewKey>("dashboard");
const boardToOpenId = ref<string | null>(null);
const scanRequestId = ref(0);

const navItems: NavItem[] = [
  { key: "dashboard", title: "Dashboard", icon: "mdi-view-dashboard-outline" },
  { key: "boards", title: "Boards", icon: "mdi-developer-board" },
  { key: "scan", title: "Scan board", icon: "mdi-usb-port" },
  { key: "projects", title: "Projects", icon: "mdi-folder-outline" },
  { key: "backup", title: "Backup & Restore", icon: "mdi-database-sync-outline" },
  { key: "settings", title: "Settings", icon: "mdi-cog-outline" },
  { key: "about", title: "About", icon: "mdi-information-outline" }
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
  backup: BackupRestorePage,
  about: AboutPage,
  settings: SettingsPage
};

const activeComponent = computed(() => viewComponents[currentView.value]);
const activeComponentProps = computed(() => {
  if (currentView.value === "boards") {
    return { openBoardId: boardToOpenId.value };
  }

  if (currentView.value === "scan") {
    return { scanRequestId: scanRequestId.value };
  }

  return {};
});

function openBoards(): void {
  boardToOpenId.value = null;
  currentView.value = "boards";
}

function openScan(): void {
  boardToOpenId.value = null;
  currentView.value = "scan";
}

function scanBoards(): void {
  boardToOpenId.value = null;
  scanRequestId.value += 1;
  currentView.value = "scan";
}

function openBoard(id: string): void {
  boardToOpenId.value = id;
  currentView.value = "boards";
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
    <v-navigation-drawer permanent width="248">
      <div class="px-5 py-5">
        <div class="text-h6 font-weight-bold">ESP Board Vault</div>
        <div class="text-body-2 muted mt-1">Local ESP32 inventory</div>
      </div>

      <v-divider />

      <v-list nav density="compact" class="px-3 py-4">
        <v-list-item
          v-for="item in navItems"
          :key="item.key"
          :active="currentView === item.key"
          :prepend-icon="item.icon"
          :title="item.title"
          rounded="sm"
          @click="currentView = item.key"
        />
      </v-list>

      <v-divider class="mx-3" />

      <v-list nav density="compact" class="px-3 py-4">
        <v-list-subheader class="px-2">Resources</v-list-subheader>
        <v-list-item
          v-for="item in resourceItems"
          :key="item.key"
          :disabled="!item.url"
          :prepend-icon="item.icon"
          :append-icon="item.url ? 'mdi-open-in-new' : undefined"
          :title="item.title"
          :subtitle="item.subtitle"
          rounded="sm"
          @click="openResource(item)"
        />
      </v-list>
    </v-navigation-drawer>

    <v-app-bar flat border color="surface">
      <v-app-bar-title>{{ navItems.find((item) => item.key === currentView)?.title }}</v-app-bar-title>
    </v-app-bar>

    <v-main>
      <component
        :is="activeComponent"
        v-bind="activeComponentProps"
        @open-boards="openBoards"
        @open-scan="openScan"
        @scan-boards="scanBoards"
        @open-board="openBoard"
      />
    </v-main>
  </v-app>
</template>
