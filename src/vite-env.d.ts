/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the NeuroVoice backend. Defaults to http://localhost:5050. */
  readonly VITE_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
