import { defineConfig, loadEnv } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const requiredFrontendVars = [
  "VITE_AUTH_API_URL",
  "VITE_SOBRACORTE_API_URL",
  "VITE_PORTAL_UNIX_URL",
  "VITE_DASS_IDENTITIES_URL",
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

  const gatewayTarget = env.VITE_GATEWAY_URL || "http://127.0.0.1:2399";
  const backendTarget = env.VITE_BACKEND_URL || `http://127.0.0.1:${env.VITE_BACKEND_PORT || "3333"}`;

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
      proxy: {
        "/api": {
          target: gatewayTarget,
          changeOrigin: true,
          secure: false,
        },
        "/unix": {
          target: "http://10.100.1.43",
          changeOrigin: true,
          secure: false,
        },
        // Proxy para o serviço de Login Oficial da Dass (Portal Unix)
        "/auth-proxy": {
          target: "http://10.100.1.43:2399",
          changeOrigin: true,
          secure: false,
          cookieDomainRewrite: "localhost",
          rewrite: (path) => path.replace(/^\/auth-proxy/, ""),
        },
        // Proxy para o Backend local do SobraCorte (Porta 3000)
        "/sobracorte-api": {
          target: backendTarget,
          changeOrigin: true,
          secure: false,
          rewrite: (path) => path.replace(/^\/sobracorte-api/, ""),
        },
      },
    },
    build: {
      target: "esnext",
      outDir: "sobra_corte",
    },
  };
});
