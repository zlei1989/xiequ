/**
 * ESLint 9 flat config — 统一管理 TS/TSX 规则与格式化。
 * 采用渐进收敛策略：stylistic/import 规则初始为 warn，模块修复后升级 error。
 *
 * 不使用 @eslint/eslintrc 的 FlatCompat（ESLint 9 下插件循环引用会导致崩溃），
 * 而是直接使用 eslint-config-next 提供的原生 flat config。
 */
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import stylistic from "@stylistic/eslint-plugin";
import importX from "eslint-plugin-import-x";
import unusedImports from "eslint-plugin-unused-imports";
import tseslint from "typescript-eslint";
import tailwindcss from "eslint-plugin-tailwindcss";

const eslintConfig = tseslint.config(
  // Next.js 官方规则 (core-web-vitals + typescript)
  ...nextVitals,
  ...nextTs,
  // TypeScript 严格类型检查（在 recommended 之上启用类型检查规则）
  ...tseslint.configs.strictTypeChecked,
  // 启用 projectService 以支持类型检查（strictTypeChecked 不包含此项）
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
      },
    },
  },
  // @stylistic 格式化规则 — 初始 warn
  {
    plugins: { "@stylistic": stylistic },
    rules: {
      "@stylistic/indent": ["warn", 2],
      "@stylistic/quotes": ["warn", "single", { avoidEscape: true }],
      "@stylistic/semi": ["warn", "always"],
      "@stylistic/comma-dangle": ["warn", "always-multiline"],
      "@stylistic/object-curly-spacing": ["warn", "always"],
      "@stylistic/jsx-quotes": ["warn", "prefer-double"],
      "@stylistic/max-len": ["warn", { code: 100, ignoreStrings: true, ignoreTemplateLiterals: true }],
      "@stylistic/eol-last": ["warn", "always"],
      "@stylistic/jsx-sort-props": ["warn", {
        callbacksLast: true,
        shorthandFirst: true,
        ignoreCase: true,
      }],
    },
  },
  // import-x 排序规则 — 初始 warn，--fix 自动调整顺序
  {
    plugins: { "import-x": importX },
    rules: {
      "import-x/order": [
        "warn",
        {
          groups: ["builtin", "external", "internal", "parent", "sibling", "type"],
          pathGroups: [{ pattern: "@/**", group: "internal" }],
          alphabetize: { order: "asc" },
          "newlines-between": "always",
        },
      ],
      "import-x/no-cycle": "warn",
    },
  },
  // unused-imports — --fix 自动删除未使用的导入和变量
  {
    plugins: { "unused-imports": unusedImports },
    rules: {
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "warn",
        {
          vars: "all",
          varsIgnorePattern: "^_",
          args: "after-used",
          argsIgnorePattern: "^_",
        },
      ],
    },
  },
  // Tailwind CSS — class 排序 + 冲突检测 + 简写建议
  ...tailwindcss.configs["flat/recommended"],
  // TypeScript 专项规则
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      // 未使用变量由 unused-imports 插件处理（可 --fix 自动删除）
      "@typescript-eslint/no-unused-vars": "off",
      // allowNumber: 日志中常嵌入数值型 ID、坐标等，强制 String() 包裹反而降低可读性
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  // 忽略目录（与 nextTs 中已有的 ignores 合并）
  {
    ignores: [".next/", "node_modules/", "scripts/", "public/", "*.config.*"],
  },
);

export default eslintConfig;
