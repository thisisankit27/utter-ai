import js from "@eslint/js";
import ts from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

const BROWSER_GLOBALS = {
  window: "readonly",
  document: "readonly",
  navigator: "readonly",
  location: "readonly",
  localStorage: "readonly",
  fetch: "readonly",
  setTimeout: "readonly",
  setInterval: "readonly",
  clearInterval: "readonly",
  requestAnimationFrame: "readonly",
  cancelAnimationFrame: "readonly",
  performance: "readonly",
  matchMedia: "readonly",
  IntersectionObserver: "readonly",
  addEventListener: "readonly",
  URLSearchParams: "readonly",
  history: "readonly",
};

export default [
  {
    ignores: [
      "dist",
      "site/dist",
      "site/fonts",
      "src-tauri",
      "node_modules",
      "target",
      "tests/wdio.conf.ts",
      "tests/screenshots.mjs",
      "playwright.config.ts",
    ],
  },
  js.configs.recommended,
  {
    files: ["site/**/*.js"],
    languageOptions: {
      sourceType: "module",
      globals: BROWSER_GLOBALS,
    },
    rules: { "no-empty": ["error", { allowEmptyCatch: true }] },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaFeatures: { jsx: true }, sourceType: "module" },
      globals: { window: "readonly", document: "readonly", navigator: "readonly", setTimeout: "readonly", clearInterval: "readonly", setInterval: "readonly", crypto: "readonly", fetch: "readonly", ResizeObserver: "readonly", AudioContext: "readonly", HTMLTextAreaElement: "readonly", HTMLVideoElement: "readonly", HTMLElement: "readonly", KeyboardEvent: "readonly", MouseEvent: "readonly", __APP_VERSION__: "readonly" },
    },
    plugins: { "@typescript-eslint": ts, "react-hooks": reactHooks },
    rules: {
      ...ts.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "off",
    },
  },
];
