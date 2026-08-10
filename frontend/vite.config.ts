import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requiredFrontendVars = [
  "VITE_AUTH_API_URL",
  "VITE_SOBRACORTE_API_URL",
  "VITE_PORTAL_UNIX_URL",
  "VITE_DEV_PORT",
] as const;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const missing = requiredFrontendVars.filter((key) => !env[key]?.trim());
  if (missing.length > 0) {
    throw new Error(`Variáveis obrigatórias ausentes no .env: ${missing.join(", ")}`);
  }

  const devPort = Number(env.VITE_DEV_PORT);
  if (!Number.isInteger(devPort) || devPort < 1 || devPort > 65_535) {
    throw new Error("VITE_DEV_PORT deve ser um número inteiro entre 1 e 65535.");
  }

  return {
    plugins: [vue()],
    base: "./",
    resolve: {
      extensions: [".js", ".jsx", ".ts", ".tsx", ".json"],
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      port: devPort,
      host: true,
      open: true,
    },
    build: {
      target: "esnext",
      outDir: "sobra_corte",
    },
  };
});
