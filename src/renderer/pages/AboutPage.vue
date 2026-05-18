<script setup lang="ts">
import { onMounted, ref } from "vue";

const channelUrl =
  "https://www.youtube.com/channel/UCnnU_HGvTr8ewpqvHe2llDw";
const error = ref<string | null>(null);
const appVersion = ref<string | null>(null);

onMounted(() => {
  void loadAppVersion();
});

async function loadAppVersion(): Promise<void> {
  try {
    appVersion.value = await window.api.app.getVersion();
  } catch {
    appVersion.value = null;
  }
}

async function openChannel(): Promise<void> {
  error.value = null;

  try {
    await window.api.shell.openExternal(channelUrl);
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : "The channel link could not be opened.";
  }
}
</script>

<template>
  <section class="page-shell">
    <div class="page-header">
      <div>
        <h1 class="page-title">About ESP Board Vault</h1>
        <p class="page-subtitle">
          A local-first desktop notebook for ESP32 makers.
        </p>
      </div>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error }}
    </v-alert>

    <div class="about-layout">
      <v-card class="panel-card" flat>
        <v-card-text class="about-intro">
          <div class="about-label">Application</div>
          <div class="about-title-row">
            <h2 class="about-provider">ESP Board Vault</h2>
            <v-chip
              class="about-version-chip"
              color="primary"
              prepend-icon="mdi-tag-outline"
              size="default"
              variant="tonal"
            >
              Version {{ appVersion ?? "unknown" }}
            </v-chip>
          </div>
          <div class="about-version-row">
            <span>Provided by thelastoutpostworkshop</span>
          </div>
          <p class="about-copy">
            ESP Board Vault helps makers remember their boards, scan ESP
            hardware details, group boards into projects, and keep local backup
            and recovery notes close at hand.
          </p>
          <v-btn
            color="primary"
            prepend-icon="mdi-youtube"
            @click="openChannel"
          >
            Open YouTube channel
          </v-btn>
        </v-card-text>
      </v-card>

      <v-card class="panel-card" flat>
        <v-card-title class="text-subtitle-1 font-weight-bold">
          <v-icon class="mr-2" color="primary" icon="mdi-shield-home-outline" />
          Local-first by design
        </v-card-title>
        <v-divider />
        <v-list density="compact" lines="two">
          <v-list-item
            prepend-icon="mdi-database-lock-outline"
            title="Local inventory"
            subtitle="Boards, projects, scan metadata, and settings stay on this computer."
          />
          <v-list-item
            prepend-icon="mdi-usb-port"
            title="Read-only scanning"
            subtitle="Board scans read metadata through Web Serial without flashing or erasing devices."
          />
          <v-list-item
            prepend-icon="mdi-folder-outline"
            title="Project workspace"
            subtitle="Projects connect boards, locations, hardware details, and recovery context."
          />
        </v-list>
      </v-card>
    </div>
  </section>
</template>

<style scoped>
.about-layout {
  display: grid;
  grid-template-columns: minmax(360px, 0.9fr) minmax(420px, 1.1fr);
  gap: 16px;
  align-items: start;
}

.about-intro {
  padding: 28px;
}

.about-label {
  color: var(--vault-muted);
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0;
  text-transform: uppercase;
}

.about-provider {
  margin: 0;
  color: var(--vault-text);
  font-size: 1.65rem;
  line-height: 1.2;
}

.about-title-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  margin: 6px 0 10px;
}

.about-version-chip {
  font-weight: 800;
}

.about-version-row {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  margin-bottom: 16px;
  color: var(--vault-muted);
  font-size: 0.9rem;
}

.about-copy {
  max-width: 620px;
  margin: 0 0 20px;
  color: var(--vault-muted);
  line-height: 1.55;
}

@media (max-width: 980px) {
  .about-layout {
    grid-template-columns: 1fr;
  }
}
</style>
