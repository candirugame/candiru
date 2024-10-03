import globals from "globals";
import pluginJs from "@eslint/js";
import tseslint from "typescript-eslint";

export default [
  { files: ["**/*.{js,mjs,cjs,ts}"] },
  { languageOptions: { globals: { ...globals.browser, ...globals.node } } },
  pluginJs.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "node_modules/", // Ignore node_modules directory
      "dist/",        // Ignore dist directory
      "*.min.js",     // Ignore all minified JavaScript files
      "public/",
    ],

  },
  {
    rules: {
      "no-undef": "error",
      "semi": "error",
      "no-unused-vars": "warn",
    },
  }
];
