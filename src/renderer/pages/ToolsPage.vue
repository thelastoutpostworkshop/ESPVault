<script setup lang="ts">
import { ref } from "vue";
import arduinoMakerWorkshopThumbnail from "../assets/tool-thumbnails/arduino-maker-workshop.jpg";
import espConnectThumbnail from "../assets/tool-thumbnails/espconnect.jpg";
import gpioViewerThumbnail from "../assets/tool-thumbnails/gpio-viewer.jpg";
import partitionBuilderThumbnail from "../assets/tool-thumbnails/partition-builder.jpg";
import videoConversionThumbnail from "../assets/tool-thumbnails/video-conversion.jpg";

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

interface ToolCardItem extends ToolItem {
  tutorialActionUrl: string | null;
  tutorialThumbnailSrc: string | null;
}

const error = ref<string | null>(null);
const coffeeUrl = "https://buymeacoffee.com/thelastoutpostworkshop";
const tutorialThumbnailsByVideoId: Record<string, string> = {
  "-nhDKzBxHiI": espConnectThumbnail,
  EuHxodrye6E: partitionBuilderThumbnail,
  bFq05qXqin0: videoConversionThumbnail,
  JJzRXcQrl3I: gpioViewerThumbnail,
  rduTUUVkzqM: arduinoMakerWorkshopThumbnail
};

const toolItems: ToolItem[] = [
  {
    key: "espconnect",
    title: "ESPConnect",
    icon: "mdi-connection",
    url: "https://thelastoutpostworkshop.github.io/ESPConnect/",
    description:
      "ESPConnect is a browser-based utility for working with ESP devices.  It runs entirely inside a modern Chromium browser so you can inspect hardware details, manage SPIFFS, Fat, LittleFS files, back up flash, and deploy firmware.",
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
      "ESP32 Partition Builder helps plan and create custom partitions layout for ESP32 boards.",
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
      "Video Conversion Studio converts video assets for embedded displays.  You take regular video or audio files and turn them into output that fits ESP32 display projects.",
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
      "GPIO Viewer offers real-time visualization of GPIO pin activities, directly in any web browser, to inspect pin states, confirm board behavior, and make wiring or signal activity easier to understand and troobleshoot.",
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

const toolCards: ToolCardItem[] = toolItems.map((tool) => {
  const tutorialActionUrl = getTutorialActionUrl(tool);
  const videoId = getYoutubeVideoId(tutorialActionUrl);

  return {
    ...tool,
    tutorialActionUrl,
    tutorialThumbnailSrc: videoId
      ? tutorialThumbnailsByVideoId[videoId] ?? null
      : null
  };
});

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

function getTutorialActionUrl(tool: ToolItem): string | null {
  if (tool.tutorialUrl) {
    return tool.tutorialUrl;
  }

  return getYoutubeVideoId(tool.url) ? tool.url : null;
}

function getYoutubeVideoId(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  try {
    const parsedUrl = new URL(url);
    const hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, "");

    if (hostname === "youtu.be") {
      return normalizeYoutubeVideoId(
        parsedUrl.pathname.split("/").filter(Boolean)[0]
      );
    }

    if (hostname === "youtube.com" || hostname.endsWith(".youtube.com")) {
      if (parsedUrl.pathname === "/watch") {
        return normalizeYoutubeVideoId(parsedUrl.searchParams.get("v"));
      }

      const pathMatch = parsedUrl.pathname.match(
        /^\/(?:embed|shorts|live)\/([^/?#]+)/
      );
      return normalizeYoutubeVideoId(pathMatch?.[1]);
    }
  } catch {
    return null;
  }

  return null;
}

function normalizeYoutubeVideoId(value: string | null | undefined): string | null {
  const videoId = value?.trim();
  return videoId && /^[A-Za-z0-9_-]{11}$/.test(videoId) ? videoId : null;
}
</script>

<template>
  <section class="page-shell">
    <div class="page-header">
      <div>
        <h1 class="page-title">Maker Tools</h1>
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
        v-for="(tool, index) in toolCards"
        :key="tool.key"
        class="panel-card tool-card"
        flat
      >
        <v-card-text class="tool-card-body">
          <div class="tool-media">
            <button
              v-if="tool.tutorialThumbnailSrc && tool.tutorialActionUrl"
              class="tool-thumbnail-button"
              type="button"
              :aria-label="`Watch ${tool.title} tutorial`"
              :style="{ '--tool-thumbnail-delay': `${index * 70}ms` }"
              @click="openExternal(tool.tutorialActionUrl)"
            >
              <img
                :src="tool.tutorialThumbnailSrc"
                :alt="`${tool.title} tutorial thumbnail`"
                loading="lazy"
              />
              <span class="tool-thumbnail-icon" aria-hidden="true">
                <v-icon :icon="tool.icon" size="18" />
              </span>
              <span class="tool-play-badge" aria-hidden="true">
                <v-icon icon="mdi-play" size="24" />
              </span>
            </button>
            <div v-else class="tool-icon" aria-hidden="true">
              <v-icon :icon="tool.icon" size="28" />
            </div>
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
  grid-template-columns: minmax(150px, 190px) minmax(0, 1fr);
  gap: 16px;
  align-items: start;
}

.tool-media {
  min-width: 0;
}

.tool-thumbnail-button {
  position: relative;
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--vault-soft-border);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(var(--v-theme-primary), 0.16), rgba(var(--v-theme-accent), 0.12)),
    rgba(var(--v-theme-surface), 0.8);
  color: #ffffff;
  cursor: pointer;
  opacity: 0;
  transform: translateY(8px) scale(0.985);
  animation: tool-thumbnail-enter 460ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  animation-delay: var(--tool-thumbnail-delay, 0ms);
}

.tool-thumbnail-button img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  animation: tool-thumbnail-image-settle 680ms ease-out both;
  animation-delay: var(--tool-thumbnail-delay, 0ms);
  transition:
    filter 180ms ease,
    transform 180ms ease;
}

.tool-thumbnail-button::before {
  position: absolute;
  inset: 0;
  z-index: 2;
  pointer-events: none;
  content: "";
  background: linear-gradient(
    105deg,
    transparent 0%,
    rgba(255, 255, 255, 0.16) 42%,
    rgba(255, 255, 255, 0.34) 50%,
    rgba(255, 255, 255, 0.12) 58%,
    transparent 100%
  );
  transform: translateX(-115%);
  animation: tool-thumbnail-sweep 720ms ease-out both;
  animation-delay: calc(var(--tool-thumbnail-delay, 0ms) + 140ms);
}

.tool-thumbnail-button::after {
  position: absolute;
  inset: 0;
  z-index: 1;
  content: "";
  background:
    linear-gradient(180deg, rgba(5, 20, 18, 0.1), rgba(5, 20, 18, 0.34)),
    linear-gradient(90deg, rgba(var(--v-theme-primary), 0.16), transparent 44%);
}

.tool-thumbnail-button:hover img {
  filter: saturate(1.08) contrast(1.03);
  transform: scale(1.025);
}

.tool-thumbnail-button:focus-visible {
  outline: 2px solid rgb(var(--v-theme-primary));
  outline-offset: 3px;
}

.tool-thumbnail-icon,
.tool-play-badge {
  position: absolute;
  z-index: 3;
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.28);
  box-shadow: 0 10px 24px rgba(3, 13, 10, 0.22);
}

.tool-thumbnail-icon {
  top: 8px;
  left: 8px;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  background: rgba(5, 20, 18, 0.62);
  backdrop-filter: blur(6px);
}

.tool-play-badge {
  top: 50%;
  left: 50%;
  width: 44px;
  height: 44px;
  border-radius: 999px;
  background: rgba(var(--v-theme-primary), 0.92);
  transform: translate(-50%, -50%);
  animation: tool-play-badge-enter 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
  animation-delay: calc(var(--tool-thumbnail-delay, 0ms) + 190ms);
}

@keyframes tool-thumbnail-enter {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes tool-thumbnail-image-settle {
  from {
    transform: scale(1.035);
  }

  to {
    transform: scale(1);
  }
}

@keyframes tool-thumbnail-sweep {
  0% {
    opacity: 0;
    transform: translateX(-115%);
  }

  18% {
    opacity: 1;
  }

  100% {
    opacity: 0;
    transform: translateX(115%);
  }
}

@keyframes tool-play-badge-enter {
  from {
    opacity: 0;
    transform: translate(-50%, -50%) scale(0.82);
  }

  to {
    opacity: 1;
    transform: translate(-50%, -50%) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .tool-thumbnail-button,
  .tool-thumbnail-button img,
  .tool-thumbnail-button::before,
  .tool-play-badge {
    animation: none;
  }

  .tool-thumbnail-button {
    opacity: 1;
    transform: none;
  }

  .tool-thumbnail-button::before {
    content: none;
  }
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

  .tool-thumbnail-button {
    max-width: 420px;
  }
}
</style>
