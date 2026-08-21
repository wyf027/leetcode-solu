import eslint from "@eslint/js";
import globals from "globals";

export default [
  {
    ignores: ["node_modules/**", "public/styles.css", "outputs/**", "work/**"],
  },
  eslint.configs.recommended,
  {
    files: ["src/**/*.js", "test/**/*.js", "eslint.config.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["public/js/**/*.js"],
    languageOptions: { globals: globals.browser },
  },
];
