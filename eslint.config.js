import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/dist-types/**",
      "**/coverage/**",
      "**/node_modules/**",
      "docs/**",
      "packages/tools/reports/**",
      "packages/sim-data/src/generated/**"
    ]
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        console: "readonly"
      }
    }
  },
  {
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser
      }
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }
      ]
    }
  },
  {
    files: ["packages/sim-core/src/**/*.ts"],
    languageOptions: {
      globals: {
        console: "readonly"
      }
    },
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "ImportDeclaration[source.value=/^(?!\\.\\.?\\/)/]",
          message:
            "sim-core may only import relative modules; pass data and adapters in from the outside."
        },
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: "sim-core must use an explicitly passed seeded Rng, never Math.random()."
        },
        {
          selector: "MemberExpression[object.name='Date'][property.name='now']",
          message: "sim-core time is the tick counter, never Date.now()."
        },
        {
          selector: "MemberExpression[object.name='performance'][property.name='now']",
          message: "Timing must be injected from outside sim-core state."
        }
      ]
    }
  }
);
