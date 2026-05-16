<script setup lang="ts">
import { ref } from "vue";

const resettingWindowSize = ref(false);
const error = ref<string | null>(null);
const notice = ref<string | null>(null);

async function resetWindowSize(): Promise<void> {
  resettingWindowSize.value = true;
  error.value = null;
  notice.value = null;

  try {
    await window.api.window.resetSize();
    notice.value = "Window size reset.";
  } catch (caughtError) {
    error.value =
      caughtError instanceof Error
        ? caughtError.message
        : "The window size could not be reset.";
  } finally {
    resettingWindowSize.value = false;
  }
}
</script>

<template>
  <section class="page-shell">
    <div class="page-header">
      <div>
        <h1 class="page-title">Settings</h1>
        <p class="page-subtitle">Local preferences for this app.</p>
      </div>
    </div>

    <v-alert v-if="error" type="error" variant="tonal" class="mb-4">
      {{ error }}
    </v-alert>

    <v-alert v-if="notice" type="success" variant="tonal" class="mb-4">
      {{ notice }}
    </v-alert>

    <v-card flat border>
      <v-card-title class="text-subtitle-1 font-weight-bold">
        Window
      </v-card-title>
      <v-divider />
      <v-card-text class="settings-row">
        <div>
          <div class="font-weight-medium">Window size</div>
          <div class="text-body-2 muted mt-1">
            Restores the default app window size.
          </div>
        </div>
        <v-btn
          color="primary"
          variant="outlined"
          prepend-icon="mdi-window-restore"
          :loading="resettingWindowSize"
          @click="resetWindowSize"
        >
          Reset window size
        </v-btn>
      </v-card-text>
    </v-card>
  </section>
</template>

<style scoped>
.settings-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}

@media (max-width: 720px) {
  .settings-row {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
