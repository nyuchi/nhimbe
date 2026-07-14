import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * nhimbe-admin lint config. Only lints the admin app's own sources — the
 * shared `../src` layer is linted by the root app's config.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    rules: {
      // Same migration-time carve-out as the root app (react-hooks 7.1+).
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);

export default eslintConfig;
