import type { AppSetting } from "../../shared/types/inventory";

export interface AppSettingsRepository {
  get(key: string): Promise<AppSetting | null>;
  set(key: string, value: unknown): Promise<AppSetting>;
  delete(key: string): Promise<boolean>;
}
