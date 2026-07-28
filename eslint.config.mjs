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
    // MongoDB playground files (not React code):
    "*.mongodb.js",
    // Agent worktree checkouts — they hold parallel branches plus built
    // .next bundles that aren't part of this branch's source tree.
    ".claude/worktrees/**",
  ]),
  {
    rules: {
      // Migration-time guidance rule from react@19 / eslint-plugin-react-hooks@7.1+.
      // Pre-existing call sites (data-fetching, media-query, prompts) are correct
      // patterns that just trip the new heuristic; cleaning them up is tracked separately.
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
