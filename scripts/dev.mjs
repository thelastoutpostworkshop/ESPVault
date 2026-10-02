import electronPath from "electron";
import { spawn } from "node:child_process";
import { createServer } from "vite";
import { buildElectronBundles } from "./buildElectronBundles.mjs";

const rendererServer = await createServer({
  configFile: "vite.config.mjs",
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: false
  }
});

await rendererServer.listen();
const resolvedUrls = rendererServer.resolvedUrls;
const devServerUrl = resolvedUrls?.local[0] ?? "http://127.0.0.1:5173/";

await buildElectronBundles();

const { ELECTRON_RUN_AS_NODE, ...cleanEnv } = process.env;

const electronProcess = spawn(electronPath, ["."], {
  stdio: "inherit",
  env: {
    ...cleanEnv,
    VITE_DEV_SERVER_URL: devServerUrl
  }
});

electronProcess.on("exit", (code) => {
  const exitCode = code ?? 0;
  const forceExit = setTimeout(() => process.exit(exitCode), 2000);
  forceExit.unref();

  void rendererServer.close().finally(() => process.exit(exitCode));
});

process.on("SIGINT", () => {
  electronProcess.kill();
});
