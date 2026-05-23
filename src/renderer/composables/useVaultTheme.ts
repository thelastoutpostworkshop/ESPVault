import { computed, ref, watch } from "vue";
import { useTheme } from "vuetify";
import { repositories } from "../repositories";

export type VaultThemeName = "vaultLight" | "vaultDark";

const THEME_SETTING_KEY = "theme";
const THEME_STORAGE_KEY = "esp-board-vault.theme";
const currentTheme = ref<VaultThemeName>(getInitialTheme());
let themeWatchRegistered = false;
let settingsHydrationStarted = false;
let settingsHydrated = false;
let themeChangedBeforeHydration = false;

export function useVaultTheme() {
  const theme = useTheme();

  if (!themeWatchRegistered) {
    watch(
      currentTheme,
      (themeName) => {
        applyThemePreference(theme, themeName);
        persistThemePreferenceToLocalStorage(themeName);

        if (settingsHydrated) {
          void persistThemePreferenceBestEffort(themeName);
        }
      },
      { immediate: true }
    );

    themeWatchRegistered = true;
    hydrateThemePreferenceFromSettings();
  } else {
    applyThemePreference(theme, currentTheme.value);
  }

  const isDarkTheme = computed(() => currentTheme.value === "vaultDark");
  const themeLabel = computed(() =>
    isDarkTheme.value ? "Dark mode" : "Light mode"
  );

  function setTheme(themeName: VaultThemeName): void {
    markThemeChangedBeforeHydration();
    currentTheme.value = themeName;
  }

  function toggleTheme(): void {
    markThemeChangedBeforeHydration();
    currentTheme.value = isDarkTheme.value ? "vaultLight" : "vaultDark";
  }

  async function persistCurrentTheme(): Promise<void> {
    persistThemePreferenceToLocalStorage(currentTheme.value);
    await persistThemePreference(currentTheme.value);
  }

  return {
    currentTheme,
    isDarkTheme,
    persistCurrentTheme,
    themeLabel,
    setTheme,
    toggleTheme
  };
}

function applyThemePreference(
  theme: ReturnType<typeof useTheme>,
  themeName: VaultThemeName
): void {
  theme.global.name.value = themeName;
  document.documentElement.dataset.vaultTheme =
    themeName === "vaultDark" ? "dark" : "light";
}

function hydrateThemePreferenceFromSettings(): void {
  if (settingsHydrationStarted) {
    return;
  }

  settingsHydrationStarted = true;

  void (async () => {
    try {
      const storedTheme = normalizeThemeName(
        (await repositories.appSettings.get(THEME_SETTING_KEY))?.value
      );

      if (storedTheme && !themeChangedBeforeHydration) {
        currentTheme.value = storedTheme;
      }
    } catch {
      // Dexie-backed settings are best effort; localStorage/system fallback still applies.
    } finally {
      settingsHydrated = true;
      void persistThemePreferenceBestEffort(currentTheme.value);
    }
  })();
}

function markThemeChangedBeforeHydration(): void {
  if (!settingsHydrated) {
    themeChangedBeforeHydration = true;
  }
}

async function persistThemePreferenceBestEffort(
  themeName: VaultThemeName
): Promise<void> {
  try {
    await persistThemePreference(themeName);
  } catch {
    // The selected theme still applies even if persistence fails.
  }
}

async function persistThemePreference(themeName: VaultThemeName): Promise<void> {
  await repositories.appSettings.set(THEME_SETTING_KEY, themeName);
}

function persistThemePreferenceToLocalStorage(themeName: VaultThemeName): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, themeName);
  } catch {
    // Theme persistence is best effort. The selected theme still applies.
  }
}

function getInitialTheme(): VaultThemeName {
  try {
    const storedTheme = normalizeThemeName(
      window.localStorage.getItem(THEME_STORAGE_KEY)
    );

    if (storedTheme) {
      return storedTheme;
    }
  } catch {
    // Fall through to the system preference.
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "vaultDark"
    : "vaultLight";
}

function normalizeThemeName(value: unknown): VaultThemeName | null {
  if (value === "vaultLight" || value === "light") {
    return "vaultLight";
  }

  if (value === "vaultDark" || value === "dark") {
    return "vaultDark";
  }

  return null;
}
