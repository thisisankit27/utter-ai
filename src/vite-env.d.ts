/// <reference types="vite/client" />

declare const __APP_VERSION__: string;

interface ImportMetaEnv {
  readonly VITE_UTTERAI_MOCK?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
