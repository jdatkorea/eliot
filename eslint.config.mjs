import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["lib/**/*.ts", "app/**/*.ts", "app/**/*.tsx"],
    ignores: ["app/api/**", "lib/supabase/**", "app/feedback/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        { name: "fetch", message: "TRIP-PREP 단계 외부 API 호출 금지 (§0, §7)." },
      ],
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@googlemaps/google-maps-services-js",
              message: "Runtime geocoding 금지 — SEED 전용 (§7).",
            },
            {
              name: "@supabase/supabase-js",
              message: "TRIP-PREP 단계 DB/API 연결 금지 — fixtures 사용 (§0).",
            },
          ],
          patterns: [
            {
              group: ["@google-cloud/*", "openai", "@anthropic-ai/*"],
              message: "TRIP-PREP 단계 외부 API 호출 금지 (§0).",
            },
          ],
        },
      ],
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
