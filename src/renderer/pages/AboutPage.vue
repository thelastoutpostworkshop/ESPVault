<script setup lang="ts">
import { onMounted, ref } from "vue";

const channelUrl =
  "https://www.youtube.com/channel/UCnnU_HGvTr8ewpqvHe2llDw";
const repositoryUrl =
  "https://github.com/thelastoutpostworkshop/ESP-Board-Vault";
const coffeeUrl = "https://buymeacoffee.com/thelastoutpostworkshop";
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
  await openExternalLink(channelUrl, "The channel link could not be opened.");
}

async function openRepository(): Promise<void> {
  await openExternalLink(
    repositoryUrl,
    "The project repository could not be opened."
  );
}

async function openCoffeeLink(): Promise<void> {
  await openExternalLink(coffeeUrl, "The support link could not be opened.");
}

async function openExternalLink(url: string, fallbackMessage: string): Promise<void> {
  error.value = null;

  try {
    await window.api.shell.openExternal(url);
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : fallbackMessage;
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
            <span>Provided by TheLastOutpostWorkshop</span>
          </div>
          <p class="about-copy">
            ESP Board Vault helps makers remember their boards, scan ESP
            hardware details, group boards into projects, and keep local backup
            and recovery notes close at hand.
          </p>
          <div class="about-actions">
            <v-btn
              color="primary"
              prepend-icon="mdi-youtube"
              @click="openChannel"
            >
              YouTube
            </v-btn>
            <v-btn
              prepend-icon="mdi-github"
              variant="outlined"
              @click="openRepository"
            >
              GitHub
            </v-btn>
            <v-btn
              prepend-icon="mdi-coffee-outline"
              variant="outlined"
              @click="openCoffeeLink"
            >
              Support
            </v-btn>
          </div>
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
          <v-list-item
            prepend-icon="mdi-cloud-off-outline"
            title="No hosted account"
            subtitle="There is no cloud sync, payment system, telemetry, or hosted backend in this app."
          />
        </v-list>
      </v-card>
    </div>

    <div class="about-detail-grid mt-4">
      <v-card class="panel-card" flat>
        <v-card-title class="text-subtitle-1 font-weight-bold">
          <v-icon class="mr-2" color="primary" icon="mdi-developer-board" />
          What you can track
        </v-card-title>
        <v-divider />
        <v-list density="compact" lines="two">
          <v-list-item
            prepend-icon="mdi-memory"
            title="Board inventory"
            subtitle="Names, chip family, MAC address, flash and PSRAM capacity, state, notes, and physical location."
          />
          <v-list-item
            prepend-icon="mdi-folder-check-outline"
            title="Projects"
            subtitle="Board assignments, project status, checklist tasks, repair work, and build context."
          />
          <v-list-item
            prepend-icon="mdi-chip"
            title="Hardware details"
            subtitle="Firmware history, pin assignments, attachments, partition maps, and scan metadata when available."
          />
          <v-list-item
            prepend-icon="mdi-chart-donut"
            title="Dashboard insights"
            subtitle="Chip family mix, partition coverage, board health, open project tasks, and repair pressure."
          />
        </v-list>
      </v-card>

      <v-card class="panel-card" flat>
        <v-card-title class="text-subtitle-1 font-weight-bold">
          <v-icon class="mr-2" color="primary" icon="mdi-database-sync-outline" />
          Data and recovery
        </v-card-title>
        <v-divider />
        <v-list density="compact" lines="two">
          <v-list-item
            prepend-icon="mdi-folder-cog-outline"
            title="App data location"
            subtitle="The Settings page shows where the vault database and Electron profile files are stored."
          />
          <v-list-item
            prepend-icon="mdi-archive-arrow-down-outline"
            title="Portable backup exports"
            subtitle="Backup & Restore creates a ZIP file with structured vault data and copied images."
          />
          <v-list-item
            prepend-icon="mdi-shield-sync-outline"
            title="Upgrade safety snapshots"
            subtitle="Release upgrades create local safety snapshots before the new version opens the vault."
          />
          <v-list-item
            prepend-icon="mdi-alert-outline"
            title="Restore behavior"
            subtitle="Importing a backup replaces the current local vault only after confirmation."
          />
        </v-list>
      </v-card>

      <v-card class="panel-card support-card" flat>
        <v-card-text class="support-card-body">
          <div class="support-icon" aria-hidden="true">
            <v-icon icon="mdi-coffee-outline" size="30" />
          </div>
          <div class="support-copy">
            <div class="support-title">Support the project</div>
            <p>
              ESP Board Vault is free, local-first, and built for maker bench
              workflows. If it saves time in your ESP32 projects, a coffee helps
              keep development moving.
            </p>
          </div>
          <v-btn
            color="primary"
            prepend-icon="mdi-coffee-outline"
            @click="openCoffeeLink"
          >
            Buy me a coffee
          </v-btn>
        </v-card-text>
      </v-card>

      <v-card class="panel-card about-wide-card" flat>
        <v-card-title class="text-subtitle-1 font-weight-bold">
          <v-icon class="mr-2" color="primary" icon="mdi-usb-port" />
          Scanning notes
        </v-card-title>
        <v-divider />
        <v-card-text class="about-note-grid">
          <div>
            <div class="font-weight-medium">What scanning reads</div>
            <p class="text-body-2 muted mb-0">
              The scan flow tries to identify chip model, revision, MAC address,
              flash size, PSRAM details, and partition layout when the connected
              board exposes that information.
            </p>
          </div>
          <div>
            <div class="font-weight-medium">What scanning avoids</div>
            <p class="text-body-2 muted mb-0">
              ESP Board Vault does not flash firmware, erase devices, or write
              board memory from the scan workflow.
            </p>
          </div>
          <div>
            <div class="font-weight-medium">When data is unavailable</div>
            <p class="text-body-2 muted mb-0">
              Some boards, adapters, firmware states, or external PSRAM setups
              may not expose every hardware detail. You can still edit records
              manually.
            </p>
          </div>
        </v-card-text>
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

.about-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.about-detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.about-wide-card {
  grid-column: 1 / -1;
}

.support-card-body {
  display: grid;
  grid-template-columns: 56px minmax(0, 1fr) auto;
  gap: 16px;
  align-items: center;
}

.support-icon {
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

.support-copy {
  min-width: 0;
}

.support-title {
  color: var(--vault-text);
  font-weight: 800;
}

.support-copy p {
  margin: 6px 0 0;
  color: var(--vault-muted);
  line-height: 1.5;
}

.about-note-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

@media (max-width: 980px) {
  .about-layout {
    grid-template-columns: 1fr;
  }

  .about-detail-grid {
    grid-template-columns: 1fr;
  }

  .about-note-grid {
    grid-template-columns: 1fr;
  }

  .support-card-body {
    grid-template-columns: 1fr;
  }
}
</style>
