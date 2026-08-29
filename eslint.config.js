import js from "@eslint/js";
import ts from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import reactHooks from "eslint-plugin-react-hooks";

export default [
  { ignores: ["dist", "site/dist", "src-tauri", "node_modules", "target", "tests/wdio.conf.ts"] },
  js.configs.recommended,
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
