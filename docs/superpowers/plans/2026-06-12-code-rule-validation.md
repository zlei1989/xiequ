# Code Rule Validation 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 引入增强严格级别的代码规则验证体系，覆盖 TypeScript/TSX/CSS 规则与格式化

**Architecture:** ESLint 9 flat config 统一管理 TS/TSX 规则与格式化（`@stylistic/eslint-plugin`），Stylelint 统一管理 CSS/CSS Modules 规则与属性排序，TypeScript 编译器追加 3 项严格检查。手动触发，渐进收敛（新规则先 warn 后 error）。

**Tech Stack:** ESLint 9 flat config、typescript-eslint、@stylistic/eslint-plugin、eslint-plugin-import-x、Stylelint 16、stylelint-config-standard、stylelint-config-css-modules、stylelint-order

**项目现状：**
- ESLint 9 和 eslint-config-next 已在 devDependencies 但无配置文件
- 无 Prettier、无 Stylelint
- tsconfig.json 已启用 `strict: true`
- CSS 文件仅 `app/globals.css`，无 `.module.css` 文件（暂）

---

### Task 1: 安装新增 devDependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 安装 7 个新包**

```bash
npm install --save-dev \
  @eslint/eslintrc@^3 \
  @stylistic/eslint-plugin@^4 \
  eslint-plugin-import-x@^4 \
  stylelint@^16 \
  stylelint-config-css-modules@^4 \
  stylelint-config-standard@^37 \
  stylelint-order@^6
```

**预期：** 7 个包安装成功，`package.json` 和 `node_modules/` 更新

- [ ] **Step 2: 验证安装**

```bash
node -e "
const mods = [
  '@eslint/eslintrc',
  '@stylistic/eslint-plugin',
  'eslint-plugin-import-x',
  'stylelint',
  'stylelint-config-css-modules',
  'stylelint-config-standard',
  'stylelint-order'
];
mods.forEach(m => { try { require.resolve(m); console.log('✓', m); } catch { console.log('✗', m); } });
"
```

**预期：** 7 个包全部 `✓`

- [ ] **Step 3: 检查 package.json devDependencies 已更新**

```bash
node -e "const p = require('./package.json'); console.log(JSON.stringify(p.devDependencies, null, 2))" | grep -E "eslintrc|stylistic|import-x|stylelint"
```

**预期：** 输出 7 个新增包的版本信息

---

### Task 2: 创建 `eslint.config.mjs`

**Files:**
- Create: `eslint.config.mjs`

- [ ] **Step 1: 创建配置文件**

在项目根目录创建 `eslint.config.mjs`，内容如下：

```js
/**
 * ESLint 9 flat config — 统一管理 TS/TSX 规则与格式化。
 * 采用渐进收敛策略：stylistic/import 规则初始为 warn，模块修复后升级 error。
 */
import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import stylistic from "@stylistic/eslint-plugin";
import importX from "eslint-plugin-import-x";
import tseslint from "typescript-eslint";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = tseslint.config(
  // Next.js 官方规则 (core-web-vitals + typescript)
  ...compat.extends("next/core-web-vitals"),
  ...compat.extends("next/typescript"),
  // TypeScript 严格类型检查
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
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
    },
  },
  // import-x 排序规则 — 初始 warn
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
  // TypeScript 专项规则
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
  // 忽略目录
  {
    ignores: [".next/", "node_modules/", "scripts/", "*.config.*"],
  },
);

export default eslintConfig;
```

- [ ] **Step 2: 验证 eslint 能加载配置**

```bash
npx eslint --help 2>&1 | head -1
```

**预期：** 正常输出 eslint 帮助信息（无配置加载报错）

- [ ] **Step 3: 首次 lint 运行，建立基线**

```bash
npx eslint . 2>&1 | tail -5
```

**预期：** 有 warn/error 输出（具体数量取决于当前代码状态），但不崩溃

---

### Task 3: 创建 `stylelint.config.mjs`

**Files:**
- Create: `stylelint.config.mjs`

- [ ] **Step 1: 创建配置文件**

在项目根目录创建 `stylelint.config.mjs`，内容如下：

```js
/**
 * Stylelint 配置 — 统一管理 CSS / CSS Modules 规则与属性排序。
 */
/** @type {import('stylelint').Config} */
export default {
  extends: [
    "stylelint-config-standard",
    "stylelint-config-css-modules",
  ],
  plugins: ["stylelint-order"],
  rules: {
    // 属性排序：定位 → 盒模型 → 排版 → 视觉 → 其他
    "order/properties-order": [
      [
        // 定位
        { properties: ["position", "top", "right", "bottom", "left", "z-index"] },
        // 盒模型
        {
          properties: [
            "display", "flex", "flex-direction", "flex-wrap",
            "justify-content", "justify-items", "align-items", "align-content", "gap",
            "width", "max-width", "min-width",
            "height", "max-height", "min-height",
            "margin", "margin-top", "margin-right", "margin-bottom", "margin-left",
            "padding", "padding-top", "padding-right", "padding-bottom", "padding-left",
            "border", "border-radius", "box-sizing",
          ],
        },
        // 排版
        {
          properties: [
            "font-size", "font-weight", "font-family",
            "line-height", "text-align", "color",
            "white-space", "word-break", "text-overflow",
          ],
        },
        // 视觉
        {
          properties: [
            "background", "background-color", "background-image",
            "opacity", "box-shadow", "transform",
          ],
        },
        // 其他
        {
          properties: [
            "transition", "animation", "cursor", "overflow",
            "overflow-x", "overflow-y", "pointer-events",
          ],
        },
      ],
    ],
    // CSS Modules 专项
    "css-modules/no-undef-class": true,
    "css-modules/no-unused-class": [
      true,
      { severity: "warning" },
    ],
  },
  ignoreFiles: [
    "node_modules/**",
    ".next/**",
    "public/**",
  ],
};
```

- [ ] **Step 2: 验证 stylelint 能加载配置**

```bash
npx stylelint --help 2>&1 | head -1
```

**预期：** 正常输出 stylelint 帮助信息

- [ ] **Step 3: 对项目 CSS 文件运行首次检查**

```bash
npx stylelint "app/**/*.css" 2>&1
```

**预期：** 输出规则检查结果（warn/error），不崩溃

---

### Task 4: 修改 `tsconfig.json` — 追加严格选项

**Files:**
- Modify: `tsconfig.json`

- [ ] **Step 1: 在 compilerOptions 中追加 3 个选项**

当前 `tsconfig.json` 的 `compilerOptions` 中已包含：

```json
"strict": true,
"noEmit": true,
```

在其后追加以下三行（与其他 compilerOptions 并列）：

```json
"noUncheckedIndexedAccess": true,
"noUnusedLocals": true,
"noUnusedParameters": true
```

**具体修改位置：** 在 `"noEmit": true,` 之后、`"esModuleInterop": true` 之前插入。

修改后的相关片段：

```json
{
  "compilerOptions": {
    "target": "ES2017",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "noUncheckedIndexedAccess": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "esModuleInterop": true,
    ...
  }
}
```

- [ ] **Step 2: 运行类型检查验证**

```bash
npx tsc --noEmit 2>&1 | tail -20
```

**预期：** 可能报出新类型错误（如 `noUncheckedIndexedAccess` 导致的索引访问 `| undefined` 错误），记录数量

- [ ] **Step 3: 如果 tsc 有报错，暂不修复**

类型错误修复属于后续步骤，当前仅记录。如果报错数 > 0 且无法继续后续 `lint:ts`（typescript-eslint 依赖类型检查），临时注释掉 tsconfig 新增选项待后续修复。

**验证方式：**
```bash
npx tsc --noEmit 2>&1 | grep -c "error TS"
```
记录数字，留待手工修复阶段处理。

---

### Task 5: 修改 `package.json` — scripts

**Files:**
- Modify: `package.json`

- [ ] **Step 1: 更新 scripts 字段**

当前 scripts：

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint",
  "test": "vitest run",
  "test:watch": "vitest",
  "deploy": "npx tsx scripts/deploy.ts"
}
```

替换为：

```json
"scripts": {
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "eslint . && stylelint \"app/**/*.css\"",
  "lint:ts": "eslint .",
  "lint:css": "stylelint \"app/**/*.css\"",
  "typecheck": "tsc --noEmit",
  "format": "eslint . --fix && stylelint \"app/**/*.css\" --fix",
  "format:ts": "eslint . --fix",
  "format:css": "stylelint \"app/**/*.css\" --fix",
  "check": "npm run typecheck && npm run lint",
  "test": "vitest run",
  "test:watch": "vitest",
  "deploy": "npx tsx scripts/deploy.ts"
}
```

- [ ] **Step 2: 验证新 scripts 可用**

```bash
npm run lint:css 2>&1 | head -5
npm run format:ts -- --help 2>&1 | head -1
```

**预期：** `lint:css` 输出样式检查结果，`format:ts` 帮助信息正常

---

### Task 6: 运行首次 lint + format 建立基线

此 Task 不产生代码变更，仅收集基线数据后续对比。

- [ ] **Step 1: 记录 ESLint 基线**

```bash
npx eslint . 2>&1 | tee /tmp/eslint-baseline.txt | tail -20
echo "---"
echo "Error count: $(grep -c 'error' /tmp/eslint-baseline.txt 2>/dev/null || echo 0)"
echo "Warning count: $(grep -c 'warning' /tmp/eslint-baseline.txt 2>/dev/null || echo 0)"
```

记录 error 和 warning 数量。

- [ ] **Step 2: 记录 Stylelint 基线**

```bash
npx stylelint "app/**/*.css" 2>&1 | tee /tmp/stylelint-baseline.txt | tail -20
echo "---"
echo "Problem count: $(grep -c '✖' /tmp/stylelint-baseline.txt 2>/dev/null || echo 0)"
```

记录问题数量。

- [ ] **Step 3: 记录 tsc 基线**

```bash
npx tsc --noEmit 2>&1 | tee /tmp/tsc-baseline.txt | tail -20
echo "---"
echo "Error count: $(grep -c 'error TS' /tmp/tsc-baseline.txt 2>/dev/null || echo 0)"
```

记录类型错误数量。

---

### Task 7: 批量 autofix — 格式化类问题

- [ ] **Step 1: ESLint autofix**

```bash
npx eslint . --fix 2>&1 | tail -10
echo "---"
echo "Remaining problems: $(npx eslint . 2>&1 | grep -c 'problem\|warning\|error' || echo 0)"
```

**说明：** `--fix` 自动修复 stylistic（缩进、引号、分号等）和 import-x（排序）类 warn。

- [ ] **Step 2: Stylelint autofix**

```bash
npx stylelint "app/**/*.css" --fix 2>&1
echo "---"
echo "Remaining problems: $(npx stylelint 'app/**/*.css' 2>&1 | grep -c '✖' || echo 0)"
```

**说明：** `--fix` 自动修复属性排序等格式化类问题。

- [ ] **Step 3: 再次运行 lint 对比基线**

```bash
echo "=== ESLint after autofix ==="
npx eslint . 2>&1 | tail -5
echo ""
echo "=== Stylelint after autofix ==="
npx stylelint "app/**/*.css" 2>&1 | tail -5
```

**预期：** warn/error 数少于基线（步骤 6），主要为不可 autofix 的问题（`any` 类型、未使用变量等）。

- [ ] **Step 4: 提交 autofix 变更**

```bash
git add -A
git commit -m "chore: apply auto-fix formatting (ESLint stylistic + Stylelint order)"
```

---

### Task 8: 手工修复 — 禁用 any + 未使用变量 + 循环引用

- [ ] **Step 1: 查看剩余 ESLint 问题清单**

```bash
npx eslint . 2>&1
```

按问题类型分类记录（`no-explicit-any`、`no-unused-vars`、`import-x/no-cycle`、`noUncheckedIndexedAccess` 等）。

- [ ] **Step 2: 修复 `@typescript-eslint/no-explicit-any` (warn)**

逐个文件将 `any` 替换为具体类型或 `unknown`。每修复一个文件即提交。

**常见修复模式：**

```typescript
// 修复前
function handle(data: any) { ... }
// 修复后 — 如果类型明确
function handle(data: Record<string, unknown>) { ... }
// 修复后 — 如果确实无法确定类型
function handle(data: unknown) { ... }
```

```bash
# 每修复一批后验证
npx eslint . --fix 2>&1 | grep "no-explicit-any"
```

- [ ] **Step 3: 修复 `@typescript-eslint/no-unused-vars` (error)**

移除未使用的变量/导入，或添加 `_` 前缀（函数参数）。

```bash
# 列出所有未使用变量
npx eslint . 2>&1 | grep "no-unused-vars"
```

**注意：** `tsconfig.json` 中新增的 `noUnusedLocals`/`noUnusedParameters` 会在 IDE 中同时报错，双重提示辅助定位。

- [ ] **Step 4: 修复 `import-x/no-cycle` (warn)**

```bash
# 列出循环引用
npx eslint . 2>&1 | grep "no-cycle"
```

**常见修复：** 提取共享类型到单独文件、使用 `type` 导入打破运行时循环。

- [ ] **Step 5: 修复 tsc 类型错误（如有）**

```bash
npx tsc --noEmit 2>&1
```

逐文件修复 `noUncheckedIndexedAccess` 导致的 `| undefined` 类型错误。

- [ ] **Step 6: 提交手工修复**

```bash
git add -A
git commit -m "fix: resolve lint warnings — no-explicit-any, no-unused-vars, no-cycle"
```

---

### Task 9: 验证全量检查通过

- [ ] **Step 1: 运行全量检查**

```bash
npm run check
```

**预期：** 0 error，0 warning（或仅剩少量可接受的 warn）

- [ ] **Step 2: 验证 format 命令**

```bash
npm run format
npm run check
```

**预期：** format 后 check 仍然通过（format 不产生新问题）

- [ ] **Step 3: 验证 build 不受影响**

```bash
npm run build 2>&1 | tail -5
```

**预期：** 构建成功，lint 规则不影响运行时行为

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "chore: verify all lint/typecheck checks pass"
```

---

### Task 10: 后续收紧（暂不执行，记录为后续步骤）

以下步骤在当前阶段**不执行**，待手工修复全部完成后再进行：

- [ ] 将 `@stylistic/*` 规则从 `warn` 升级为 `error`
- [ ] 将 `import-x/order` 从 `warn` 升级为 `error`
- [ ] 将 `no-explicit-any` 从 `warn` 升级为 `error`
- [ ] lint scripts 添加 `--max-warnings 0` 参数
- [ ] 可选：配置 `.vscode/settings.json` 保存时自动修复
