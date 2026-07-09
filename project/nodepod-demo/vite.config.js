import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import nodepod from "@scelar/nodepod/vite";

const nodepodServiceWorkerPath = fileURLToPath(
  new URL("./node_modules/@scelar/nodepod/dist/__sw__.js", import.meta.url),
);

function patchNodepodServiceWorker(source) {
  return source.replace(
    "rememberPreviewPath(strippedPath, pod);",
    'if (strippedPath !== "/") rememberPreviewPath(strippedPath, pod);',
  );
}

async function readPatchedNodepodServiceWorker() {
  const source = await readFile(nodepodServiceWorkerPath, "utf8");

  return patchNodepodServiceWorker(source);
}

function nodepodServiceWorkerDevRootPathPatch() {
  return {
    name: "nodepod-service-worker-dev-root-path-patch",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/__sw__.js")) {
          next();
          return;
        }

        res.statusCode = 200;
        res.setHeader("Content-Type", "application/javascript; charset=utf-8");
        res.setHeader("Service-Worker-Allowed", "/");
        res.setHeader("Cache-Control", "no-cache");
        res.end(await readPatchedNodepodServiceWorker());
      });
    },
  };
}

function nodepodServiceWorkerBuildRootPathPatch() {
  return {
    name: "nodepod-service-worker-build-root-path-patch",
    enforce: "post",
    generateBundle(_options, bundle) {
      const serviceWorker = bundle["__sw__.js"];
      if (serviceWorker?.type !== "asset") return;

      const source = serviceWorker.source.toString();
      serviceWorker.source = patchNodepodServiceWorker(source);
    },
  };
}

export default defineConfig({
  plugins: [
    nodepodServiceWorkerDevRootPathPatch(),
    react(),
    nodepod(),
    nodepodServiceWorkerBuildRootPathPatch(),
  ],
  define: {
    "process.env.DRAGGABLE_DEBUG": "false",
  },
  optimizeDeps: {
    exclude: ["@scelar/nodepod"],
    esbuildOptions: {
      define: {
        "process.env.DRAGGABLE_DEBUG": "false",
      },
    },
  },
  server: {
    headers: {
      "Cross-Origin-Embedder-Policy": "credentialless",
      "Cross-Origin-Opener-Policy": "same-origin",
    },
  },
});
