import type { AppSetting } from "../../../shared/types/inventory";
import type { AppSettingsRepository } from "../../repositories/AppSettingsRepository";
import { vaultDatabase, type VaultDatabase } from "./vaultDatabase";

export class DexieAppSettingsRepository implements AppSettingsRepository {
  constructor(private readonly database: VaultDatabase = vaultDatabase) {}

  async get(key: string): Promise<AppSetting | null> {
    return (await this.database.appSettings.get(key)) ?? null;
  }

  async set(key: string, value: unknown): Promise<AppSetting> {
    const setting: AppSetting = {
      key,
      value,
      updatedAt: new Date().toISOString()
    };

    await this.database.appSettings.put(setting);
    return setting;
  }

  async delete(key: string): Promise<boolean> {
    const existing = await this.database.appSettings.get(key);

    if (!existing) {
      return false;
    }

    await this.database.appSettings.delete(key);
    return true;
  }
}
