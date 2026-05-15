import { app, BrowserWindow, dialog } from "electron";
import path from "node:path";

const isDevelopment = Boolean(process.env.VITE_DEV_SERVER_URL);

interface SelectableSerialPort {
  portId: string;
  portName?: string;
  displayName?: string;
  vendorId?: string;
  productId?: string;
  serialNumber?: string;
}

app.setName("ESP Board Vault");

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 680,
    title: "ESP Board Vault",
    backgroundColor: "#f7f8f5",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  configureWebSerial(window);

  if (isDevelopment && process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }

  return window;
}

function configureWebSerial(window: BrowserWindow): void {
  const session = window.webContents.session;

  session.setPermissionCheckHandler((_webContents, permission, origin) => {
    if ((permission as string) === "serial") {
      return isTrustedAppOrigin(origin);
    }

    return false;
  });

  session.setPermissionRequestHandler((_webContents, permission, callback, details) => {
    if ((permission as string) === "serial") {
      callback(isTrustedAppOrigin(details.requestingUrl));
      return;
    }

    callback(false);
  });

  session.on("select-serial-port", async (event, portList, _webContents, callback) => {
    event.preventDefault();

    if (portList.length <= 1) {
      callback(portList[0]?.portId ?? "");
      return;
    }

    const selectedPort = await showSerialPortPicker(window, portList);
    callback(selectedPort?.portId ?? "");
  });
}

function isTrustedAppOrigin(origin: string | undefined): boolean {
  if (!origin) {
    return false;
  }

  return (
    origin.startsWith("file://") ||
    origin.startsWith("http://localhost") ||
    origin.startsWith("http://127.0.0.1")
  );
}

async function showSerialPortPicker<TPort extends SelectableSerialPort>(
  window: BrowserWindow,
  ports: TPort[]
): Promise<TPort | null> {
  const cancelId = ports.length;
  const defaultId = getPreferredSerialPortIndex(ports);
  const { response } = await dialog.showMessageBox(window, {
    type: "question",
    title: "Select ESP Board",
    message: "Select the serial port to scan.",
    detail: ports
      .map((port, index) => `${index + 1}. ${formatSerialPortDetail(port)}`)
      .join("\n"),
    buttons: [...ports.map(formatSerialPortButton), "Cancel"],
    defaultId,
    cancelId,
    noLink: true
  });

  return response === cancelId ? null : ports[response] ?? null;
}

function getPreferredSerialPortIndex<TPort extends SelectableSerialPort>(
  ports: TPort[]
): number {
  const preferredIndex = ports.findIndex(isPreferredSerialPort);
  return preferredIndex === -1 ? 0 : preferredIndex;
}

function isPreferredSerialPort(port: SelectableSerialPort): boolean {
  const searchableText = [
    port.displayName,
    port.portName,
    port.vendorId,
    port.productId
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

function formatSerialPortButton(port: SelectableSerialPort): string {
  return port.displayName || port.portName || port.portId;
}

function formatSerialPortDetail(port: SelectableSerialPort): string {
  const identifiers = [
    port.displayName,
    port.portName,
    formatVendorProduct(port),
    port.serialNumber ? `Serial: ${port.serialNumber}` : null
  ].filter((value): value is string => Boolean(value));

  return identifiers.join(" - ") || port.portId;
}

function formatVendorProduct(port: SelectableSerialPort): string | null {
  if (!port.vendorId && !port.productId) {
    return null;
  }

  return `VID: ${port.vendorId ?? "unknown"}, PID: ${port.productId ?? "unknown"}`;
}

app.whenReady().then(() => {
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
