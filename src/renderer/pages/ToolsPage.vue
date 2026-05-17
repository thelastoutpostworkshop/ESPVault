<script setup lang="ts">
import { ref } from "vue";

interface ToolItem {
  key: string;
  title: string;
  icon: string;
  url: string;
  description: string;
  sourceUrl?: string;
  sourceLabel?: string;
}

const error = ref<string | null>(null);

const toolItems: ToolItem[] = [
  {
    key: "espconnect",
    title: "ESPConnect",
    icon: "mdi-connection",
    url: "https://thelastoutpostworkshop.github.io/ESPConnect/",
    description: "Connect to ESP devices from the browser for serial workflows and maker diagnostics.",
    sourceUrl: "https://github.com/thelastoutpostworkshop/ESPConnect",
    sourceLabel: "thelastoutpostworkshop/ESPConnect"
  },
  {
    key: "partition-builder",
    title: "ESP32 Partition Builder",
    icon: "mdi-table-cog",
    url: "https://thelastoutpostworkshop.github.io/ESP32PartitionBuilder/",
    description: "Build and inspect ESP32 partition tables for firmware projects.",
    sourceUrl: "https://github.com/thelastoutpostworkshop/ESP32PartitionBuilder",
    sourceLabel: "thelastoutpostworkshop/ESP32PartitionBuilder"
  },
  {
    key: "video-conversion",
    title: "Video Conversion Studio",
    icon: "mdi-video-sync-outline",
    url: "https://thelastoutpostworkshop.github.io/video_conversion/",
    description: "Convert video assets for embedded displays, maker projects, and web workflows.",
    sourceUrl: "https://github.com/thelastoutpostworkshop/video_conversion",
    sourceLabel: "thelastoutpostworkshop/video_conversion"
  },
  {
    key: "arduino-maker-workshop",
    title: "Arduino Maker Workshop",
    icon: "mdi-microsoft-visual-studio-code",
    url: "https://marketplace.visualstudio.com/items?itemName=TheLastOutpostWorkshop.arduino-maker-workshop",
    description: "VS Code extension for Arduino maker workflows from The Last Outpost Workshop.",
    sourceLabel: "VS Code Marketplace extension"
  }
];

async function openExternal(url: string): Promise<void> {
  error.value = null;

  try {
    await window.api.shell.openExternal(url);
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : "The external link could not be opened.";
  }
}
</script>

<template>
  <section class="page-shell">
    <div class="page-header">
      <div>
        <h1 class="page-title">Tools</h1>
        <p class="page-subtitle">
          Maker utilities from The Last Outpost Workshop for ESP32 and embedded projects.
        </p>
      </div>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error }}
    </v-alert>

    <div class="tools-grid">
      <v-card
        v-for="tool in toolItems"
        :key="tool.key"
        class="panel-card tool-card"
        flat
      >
        <v-card-text class="tool-card-body">
          <div class="tool-icon" aria-hidden="true">
            <v-icon :icon="tool.icon" size="28" />
          </div>
          <div class="tool-copy">
            <div class="tool-title">{{ tool.title }}</div>
            <p class="tool-description">{{ tool.description }}</p>
            <button
              v-if="tool.sourceUrl"
              class="tool-source"
              type="button"
              @click="openExternal(tool.sourceUrl)"
            >
              {{ tool.sourceLabel }}
            </button>
            <div v-else class="tool-source-label">
              {{ tool.sourceLabel }}
            </div>
          </div>
        </v-card-text>
        <v-divider />
        <v-card-actions>
          <v-spacer />
          <v-btn
            color="primary"
            prepend-icon="mdi-open-in-new"
            @click="openExternal(tool.url)"
          >
            Open tool
          </v-btn>
        </v-card-actions>
      </v-card>
    </div>
  </section>
</template>

<style scoped>
.tools-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.tool-card {
  display: flex;
  min-height: 240px;
  flex-direction: column;
}

.tool-card-body {
  display: grid;
  flex: 1 1 auto;
  grid-template-columns: 56px minmax(0, 1fr);
  gap: 16px;
}

.tool-icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border: 1px solid rgba(var(--v-theme-primary), 0.22);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(var(--v-theme-primary), 0.14), rgba(var(--v-theme-accent), 0.12)),
    rgba(var(--v-theme-surface), 0.76);
  color: rgb(var(--v-theme-primary));
}

.tool-copy {
  min-width: 0;
}

.tool-title {
  color: var(--vault-text);
  font-size: 1.05rem;
  font-weight: 750;
}

.tool-description {
  margin: 8px 0 12px;
  color: var(--vault-muted);
  line-height: 1.5;
}

.tool-source,
.tool-source-label {
  color: rgb(var(--v-theme-primary));
  font: inherit;
  font-size: 0.86rem;
}

.tool-source {
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
  font-weight: 700;
  text-align: left;
}

.tool-source:hover {
  text-decoration: underline;
}

@media (max-width: 980px) {
  .tools-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 560px) {
  .tool-card-body {
    grid-template-columns: 1fr;
  }
}
</style>
