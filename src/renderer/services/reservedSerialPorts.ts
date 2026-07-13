import { repositories } from "../repositories";

export const RESERVED_SERIAL_PORT_NAMES_SETTING_KEY = "reservedSerialPortNames";

export async function loadReservedSerialPortNames(): Promise<string[]> {
  const setting = await repositories.appSettings.get(
    RESERVED_SERIAL_PORT_NAMES_SETTING_KEY
  );

  return normalizeReservedSerialPortNames(setting?.value);
}

export async function saveReservedSerialPortNames(value: unknown): Promise<string[]> {
  const portNames = normalizeReservedSerialPortNames(value);

  await repositories.appSettings.set(
    RESERVED_SERIAL_PORT_NAMES_SETTING_KEY,
    portNames
  );

  return portNames;
}

export function normalizeReservedSerialPortNames(value: unknown): string[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(/\r?\n/)
      : [];

  return Array.from(
    new Set(
      source
        .filter((name): name is string => typeof name === "string")
        .map((name) => name.trim())
        .filter(Boolean)
    )
  );
}
