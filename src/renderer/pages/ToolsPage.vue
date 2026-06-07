<script setup lang="ts">
import { ref } from "vue";

interface ToolItem {
  key: string;
  title: string;
  icon: string;
  url: string;
  description: string;
  actionIcon?: string;
  actionLabel?: string;
  sourceUrl?: string;
  sourceLabel?: string;
  tutorialUrl?: string;
}

const error = ref<string | null>(null);
const coffeeUrl = "https://buymeacoffee.com/thelastoutpostworkshop";

const toolItems: ToolItem[] = [
  {
    key: "espconnect",
    title: "ESPConnect",
    icon: "mdi-connection",
    url: "https://thelastoutpostworkshop.github.io/ESPConnect/",
    description:
      "ESPConnect is a browser-based utility for working with ESP devices over a serial connection. It is useful when you need a quick way to connect, inspect, and interact with a board without setting up a full local toolchain first. Keep it nearby for maker bench workflows where fast device access matters.",
    sourceUrl: "https://github.com/thelastoutpostworkshop/ESPConnect",
    sourceLabel: "thelastoutpostworkshop/ESPConnect",
    tutorialUrl: "https://www.youtube.com/watch?v=-nhDKzBxHiI"
  },
  {
    key: "partition-builder",
    title: "ESP32 Partition Builder",
    icon: "mdi-table-cog",
    url: "https://thelastoutpostworkshop.github.io/ESP32PartitionBuilder/",
    description:
      "ESP32 Partition Builder helps plan and review ESP32 flash partition layouts for firmware projects. Use it when a project needs a clear split between app slots, storage, OTA space, SPIFFS, LittleFS, or other data regions. It is a practical companion when documenting how a board is configured and how firmware should be reproduced later.",
    sourceUrl: "https://github.com/thelastoutpostworkshop/ESP32PartitionBuilder",
    sourceLabel: "thelastoutpostworkshop/ESP32PartitionBuilder",
    tutorialUrl: "https://www.youtube.com/watch?v=EuHxodrye6E"
  },
  {
    key: "video-conversion",
    title: "Video Conversion Studio",
    icon: "mdi-movie-cog-outline",
    url: "https://thelastoutpostworkshop.github.io/video_conversion/",
    description:
      "Video Conversion Studio converts video assets for embedded displays, maker interfaces, and web-friendly output formats. It is useful when preparing media for ESP32 display projects, dashboard demos, or device UI experiments where resolution, format, and file size need to be controlled. Use it as a focused workspace for turning source video into project-ready assets.",
    sourceUrl: "https://github.com/thelastoutpostworkshop/video_conversion",
    sourceLabel: "thelastoutpostworkshop/video_conversion",
    tutorialUrl: "https://www.youtube.com/watch?v=bFq05qXqin0"
  },
  {
    key: "gpio-viewer",
    title: "GPIOViewer",
    icon: "mdi-chip",
    url: "https://www.youtube.com/watch?v=JJzRXcQrl3I",
    actionIcon: "mdi-youtube",
    actionLabel: "Watch tutorial",
    description:
      "GPIOViewer is a visual GPIO state viewer for embedded projects. Use it when you need to inspect pins, confirm board behavior, or make wiring and signal states easier to understand while documenting an ESP32 build.",
    sourceUrl: "https://github.com/thelastoutpostworkshop/gpio_viewer",
    sourceLabel: "thelastoutpostworkshop/gpio_viewer"
  },
  {
    key: "arduino-maker-workshop",
    title: "Arduino Maker Workshop",
    icon: "mdi-microsoft-visual-studio-code",
    url: "https://marketplace.visualstudio.com/items?itemName=TheLastOutpostWorkshop.arduino-maker-workshop",
    description:
      "Arduino Maker Workshop is a VS Code extension for Arduino-centered maker development. It gives makers a more focused editor workflow for sketch-driven projects, board-oriented iteration, and workshop-style development. It belongs here as a companion tool for moving from inventory notes into hands-on firmware work.",
    sourceLabel: "VS Code Marketplace extension",
    tutorialUrl: "https://www.youtube.com/watch?v=rduTUUVkzqM"
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

    <v-card class="panel-card tools-support-card" flat>
      <v-card-text class="tools-support-body">
        <div class="tools-support-icon" aria-hidden="true">
          <v-icon icon="mdi-coffee-outline" size="28" />
        </div>
        <div class="tools-support-copy">
          <div class="tools-support-title">Support the project</div>
          <p>
            These maker utilities and ESP Board Vault are free to use. If they
            help at your bench, a coffee supports ongoing development.
          </p>
        </div>
        <v-btn
          color="primary"
          prepend-icon="mdi-coffee-outline"
          @click="openExternal(coffeeUrl)"
        >
          Buy me a coffee
        </v-btn>
      </v-card-text>
    </v-card>

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
          <v-btn
            v-if="tool.tutorialUrl"
            color="primary"
            prepend-icon="mdi-youtube"
            variant="text"
            @click="openExternal(tool.tutorialUrl)"
          >
            Watch tutorial
          </v-btn>
          <v-spacer />
          <v-btn
            color="primary"
            :prepend-icon="tool.actionIcon ?? 'mdi-open-in-new'"
            @click="openExternal(tool.url)"
          >
            {{ tool.actionLabel ?? "Open tool" }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </div>
  </section>
</template>

<style scoped>
.tools-support-card {
  margin-bottom: 16px;
}

.tools-support-body {
  display: grid;
  grid-template-columns: 52px minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
}

.tools-support-icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  border: 1px solid rgba(var(--v-theme-accent), 0.28);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(var(--v-theme-accent), 0.18), rgba(var(--v-theme-primary), 0.1)),
    rgba(var(--v-theme-surface), 0.76);
  color: rgb(var(--v-theme-accent));
}

.tools-support-copy {
  min-width: 0;
}

.tools-support-title {
  color: var(--vault-text);
  font-weight: 800;
}

.tools-support-copy p {
  margin: 6px 0 0;
  color: var(--vault-muted);
  line-height: 1.5;
}

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
  .tools-support-body {
    grid-template-columns: 1fr;
  }

  .tool-card-body {
    grid-template-columns: 1fr;
  }
}
</style>
