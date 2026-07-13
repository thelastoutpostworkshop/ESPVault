export interface SelectableSerialPort {
  portId: string;
  portName?: string;
  deviceInstanceId?: string;
  displayName?: string;
  vendorId?: string;
  productId?: string;
  serialNumber?: string;
  usbDriverName?: string;
}

export function isLegacyLinuxTtyPort(
  port: SelectableSerialPort,
  platform: NodeJS.Platform = process.platform
): boolean {
  if (platform !== "linux") {
    return false;
  }

  return [port.portName, port.portId, port.displayName]
    .filter((value): value is string => Boolean(value))
    .some((value) => /(?:^|[/\\])ttyS\d+$/i.test(value));
}

export function shouldHideLegacyLinuxTtyPortsByDefault(
  ports: SelectableSerialPort[],
  platform: NodeJS.Platform = process.platform
): boolean {
  if (platform !== "linux") {
    return false;
  }

  const hasLegacyPort = ports.some((port) =>
    isLegacyLinuxTtyPort(port, platform)
  );
  const hasNonLegacyPort = ports.some(
    (port) => !isLegacyLinuxTtyPort(port, platform)
  );

  return hasLegacyPort && hasNonLegacyPort;
}

export function isPreferredSerialPort(port: SelectableSerialPort): boolean {
  const searchableText = [
    port.displayName,
    port.portName,
    port.vendorId,
    port.productId,
    port.usbDriverName
  ]
    .filter((value): value is string => Boolean(value))
    .join(" ")
    .toLowerCase();

  return (
    searchableText.includes("esp") ||
    searchableText.includes("usb") ||
    searchableText.includes("jtag") ||
    searchableText.includes("cp210") ||
    searchableText.includes("ch340") ||
    searchableText.includes("ch343") ||
    searchableText.includes("wch") ||
    searchableText.includes("silicon labs")
  );
}

export function isReservedSerialPort(
  port: SelectableSerialPort,
  reservedPortNames: readonly string[]
): boolean {
  const reservedNames = new Set(
    reservedPortNames.map(normalizePortName).filter((name) => Boolean(name))
  );

  return [port.portName, port.displayName, port.portId]
    .map(normalizePortName)
    .some((name) => Boolean(name) && reservedNames.has(name));
}

function normalizePortName(value: string | undefined): string {
  return value?.trim().toLocaleLowerCase() ?? "";
}
