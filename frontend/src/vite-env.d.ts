/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AUTH_API_URL: string
  readonly VITE_SOBRACORTE_API_URL: string
  readonly VITE_PORTAL_UNIX_URL: string
  readonly VITE_DEV_PORT: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
