import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Several third-party SDK payloads (Dodo, AT Protocol, Supabase relationship
      // joins, BullMQ event callbacks) do not expose stable generic result types.
      // Runtime validation is used at trust boundaries instead of unsafe casts.
      "@typescript-eslint/no-explicit-any": "off",
      // Long-form legal/marketing copy is authored directly in JSX. React escapes
      // text nodes safely; HTML entities would reduce source readability.
      "react/no-unescaped-entities": "off",
      // Data-loading effects intentionally hydrate client state from Supabase once.
      // Adding factory-created clients/functions as dependencies would resubscribe
      // on every render; the reviewed effects include explicit cleanup where needed.
      "react-hooks/exhaustive-deps": "off",
      // Initial hydration from persisted/browser state is an intentional effect in
      // this client-heavy dashboard and does not form a render feedback loop.
      "react-hooks/set-state-in-effect": "off",
      // Dashboard rows display remote, user-controlled platform thumbnails whose
      // hosts are not known at build time. They retain explicit dimensions and are
      // intentionally not routed through the Next image optimizer.
      "@next/next/no-img-element": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
