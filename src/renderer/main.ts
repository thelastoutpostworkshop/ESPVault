import { createApp } from "vue";
import { createPinia } from "pinia";
import { parseVaultBackup } from "../shared/types/backup";
import App from "./App.vue";
import { vuetify } from "./plugins/vuetify";
import { repositories } from "./repositories";
import "./styles.css";

async function restorePendingDatabaseMove(): Promise<void> {
  const pendingMove = await window.api.database.getPendingMove();
  if (!pendingMove) {
    return;
  }

  const restoredBackup = await window.api.backup.restoreFiles(pendingMove);
  const backup = parseVaultBackup(JSON.parse(restoredBackup.content) as unknown);
  await repositories.backups.importBackup(backup);
  await window.api.database.clearPendingMove();
}

async function bootstrap(): Promise<void> {
  try {
    await restorePendingDatabaseMove();
  } catch (caughtError) {
    console.error("Pending database move could not be restored.", caughtError);
  }

  createApp(App).use(createPinia()).use(vuetify).mount("#app");
}

void bootstrap();
