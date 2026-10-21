import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // 下划线前缀 = 「这个参数/变量是签名占位，刻意不参与计算」。
  // 典型用例：ensureUserSlug(userId, _name) —— 调用方按位置传名，
  // 函数体不再需要它，但删掉实参会改变对外签名。
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
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
    // Build scripts (Node.js, not part of app bundle):
    "scripts/**",
    // Auto-generated theme registry:
    "src/lib/theme-registry.gen.ts",
    "src/lib/theme-css.gen.ts",
  ]),
]);

export default eslintConfig;
