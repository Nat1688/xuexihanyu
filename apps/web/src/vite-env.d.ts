/// <reference types="vite/client" />

/**
 * Public SPA environment (CLP-00-03).
 *
 * ONLY `VITE_`-prefixed, non-secret public values may be declared here. Server
 * secrets (database/session/CSRF) are deliberately absent: they must never be
 * bundled into the browser.
 */
interface ImportMetaEnv {
  /** Base URL of the CLP API (public, non-secret). Optional in the skeleton. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
