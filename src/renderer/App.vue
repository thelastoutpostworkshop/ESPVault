<script setup lang="ts">
import { computed, ref, type Component } from "vue";
import BoardsPage from "./pages/BoardsPage.vue";
import DashboardPage from "./pages/DashboardPage.vue";
import PlaceholderPage from "./pages/PlaceholderPage.vue";
import ScanBoardPage from "./pages/ScanBoardPage.vue";
import SettingsPage from "./pages/SettingsPage.vue";

type ViewKey =
  | "dashboard"
  | "boards"
  | "scan"
  | "projects"
  | "firmware"
  | "settings";

interface NavItem {
  key: ViewKey;
  title: string;
  icon: string;
}

const currentView = ref<ViewKey>("dashboard");
const boardToOpenId = ref<string | null>(null);
const scanRequestId = ref(0);

const navItems: NavItem[] = [
  { key: "dashboard", title: "Dashboard", icon: "mdi-view-dashboard-outline" },
  { key: "boards", title: "Boards", icon: "mdi-developer-board" },
  { key: "scan", title: "Scan board", icon: "mdi-usb-port" },
  { key: "projects", title: "Projects", icon: "mdi-folder-outline" },
  { key: "firmware", title: "Firmware", icon: "mdi-chip" },
  { key: "settings", title: "Settings", icon: "mdi-cog-outline" }
];

const viewComponents: Record<ViewKey, Component> = {
  dashboard: DashboardPage,
  boards: BoardsPage,
  scan: ScanBoardPage,
  projects: PlaceholderPage,
  firmware: PlaceholderPage,
  settings: SettingsPage
};

const placeholderCopy: Record<
  Exclude<ViewKey, "dashboard" | "boards" | "scan" | "settings">,
  { title: string; description: string }
> = {
  projects: {
    title: "Projects",
    description: "Project creation and board assignment belong to the next slice."
  },
  firmware: {
    title: "Firmware",
    description: "Firmware history will be added after board CRUD is stable."
  }
};

const activeComponent = computed(() => viewComponents[currentView.value]);
const activeComponentProps = computed(() => {
  if (currentView.value === "boards") {
    return { openBoardId: boardToOpenId.value };
  }

  if (currentView.value === "scan") {
    return { scanRequestId: scanRequestId.value };
  }

  if (currentView.value in placeholderCopy) {
    return placeholderCopy[currentView.value as keyof typeof placeholderCopy];
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
