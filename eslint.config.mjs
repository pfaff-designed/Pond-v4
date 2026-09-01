// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Nested build output + local-only worktree/session dirs (never source):
    "**/.next/**",
    "storybook-static/**",
    ".claude/**",
    ".claude-worktrees/**",
  ]),
  {
    // The promoted Bklit chart library and throwaway visual prototypes use
    // intentional imperative patterns — measuring rendered SVG through refs and
    // syncing layout via setState-in-effect — that the React-Compiler hooks
    // rules flag but that are correct in this animation code. Scope those two
    // rules off for these dirs rather than restructure vendored chart internals;
    // both rules stay enforced across the rest of the app.
    files: ["src/components/charts/**/*.{ts,tsx}", "src/app/proto/**/*.{ts,tsx}"],
    rules: {
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  ...storybook.configs["flat/recommended"]
]);

export default eslintConfig;
