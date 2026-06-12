# Tailwind CSS 迁移实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将项目从"100% inline style"迁移到 Tailwind CSS v3，新增 `eslint-plugin-tailwindcss` 实现 class 自动排序，同时移除闲置的 CSS Modules/Stylelint 依赖。

**Architecture:** Tailwind v3 通过 PostCSS 插件接入 Next.js 构建管道。`globals.css` 顶部注入 `@tailwind` 指令。`corePlugins: { preflight: false }` 避免与 antd-mobile 的 CSS 重置冲突。ESLint 统一管理格式化和 class 排序，不加 Prettier。

**Tech Stack:** Tailwind CSS v3, PostCSS, autoprefixer, eslint-plugin-tailwindcss, clsx

---

### Task 1: 安装依赖

**Files:** Modify: `package.json`

- [ ] **Step 1: 安装 5 个新包**

```bash
npm install tailwindcss@^3.4.0 postcss@^8.4.0 autoprefixer@^10.4.0 clsx@^2.1.0
npm install -D eslint-plugin-tailwindcss@^3.17.0
```

- [ ] **Step 2: 验证安装**

```bash
npx tailwindcss --help
```

Expected: 显示 Tailwind CSS CLI 帮助信息。

---

### Task 2: 创建 Tailwind + PostCSS 配置文件

**Files:** Create: `tailwind.config.ts` + `postcss.config.mjs`

- [ ] **Step 1: 创建 `tailwind.config.ts`**

```typescript
/**
 * Tailwind CSS v3 配置
 *
 * - preflight 禁用：项目已有 normalize.css，避免与 antd-mobile 全局样式冲突
 * - content 扫描 app/ 和 components/ 下的 TSX 文件
 */
import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
  ],
  corePlugins: {
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
};

export default config;
```

- [ ] **Step 2: 创建 `postcss.config.mjs`**

```javascript
/** PostCSS 配置 — 加载 tailwindcss 和 autoprefixer 插件 */
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

---

### Task 3: 更新 globals.css 注入 Tailwind 指令

**Files:** Modify: `app/globals.css`

- [ ] **Step 1: 重写 `app/globals.css`**

在文件顶部追加 `@tailwind` 三层指令，移除 Tailwind 已覆盖的 `-webkit-font-smoothing` 和 `-moz-osx-font-smoothing`（Tailwind 的 antialiased 类已提供）。

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: #fff;
  --foreground: #171717;
}

@media (prefers-color-scheme: dark) {
  :root {
    --background: #0a0a0a;
    --foreground: #ededed;
  }
}

html {
  height: 100%;
}

body {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  font-family: var(--font-geist-sans), Arial, Helvetica, sans-serif;
  color: var(--foreground);
  background: var(--background);
}
```

---

### Task 4: 更新 ESLint 配置

**Files:** Modify: `eslint.config.mjs`

- [ ] **Step 1: 重写 `eslint.config.mjs`**

移除 `css-modules` import 和规则块，新增 `tailwindcss` 导入和 `recommended` 配置。

```javascript
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
import tailwindcss from "eslint-plugin-tailwindcss";
import tseslint from "typescript-eslint";

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
  // Tailwind CSS — class 排序 + 冲突检测 + 简写建议
  ...tailwindcss.configs.recommended,
  // TypeScript 专项规则
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/consistent-type-imports": ["error", { prefer: "type-imports" }],
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "@typescript-eslint/restrict-template-expressions": ["error", { allowNumber: true }],
    },
  },
  // 忽略目录（与 nextTs 中已有的 ignores 合并）
  {
    ignores: [".next/", "node_modules/", "scripts/", "public/", "*.config.*"],
  },
);

export default eslintConfig;
```

---

### Task 5: 清理闲置依赖和文件

**Files:** Modify: `package.json`, Delete: `stylelint.config.mjs`, Delete: `eslint.json`

- [ ] **Step 1: 卸载闲置的 devDependencies**

```bash
npm uninstall -D eslint-plugin-css-modules stylelint stylelint-config-standard stylelint-config-css-modules stylelint-order
```

- [ ] **Step 2: 更新 `package.json` 的 scripts**

简化 `lint` 和 `format`，移除 `lint:css`、`lint:ts`、`format:ts`、`format:css` 分拆脚本（ESLint 现在统一管理）。

把 scripts 块替换为：

```jsonc
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint .",
    "typecheck": "tsc --noEmit",
    "format": "eslint . --fix",
    "check": "npm run typecheck && npm run lint",
    "test": "vitest run",
    "test:watch": "vitest",
    "deploy": "npx tsx scripts/deploy.ts"
  }
}
```

- [ ] **Step 3: 删除文件**

```bash
rm stylelint.config.mjs
rm eslint.json
```

- [ ] **Step 4: 验证 scripts 正常工作**

```bash
npm run format
npm run check
```

Expected: 格式化通过，类型检查通过。允许 warn。

---

### Task 6: 迁移 app/page.tsx（首页）

**Files:** Modify: `app/page.tsx`

- [ ] **Step 1: 替换 iconStyle**

删除 `const iconStyle = { fontSize: 32 };`
每个 icon 从 `icon={<XxxOutline style={iconStyle} />}` 改为 `icon={<XxxOutline className="text-[32px]" />}`。

```typescript
// DELETE: const iconStyle = { fontSize: 32 };

const apps = [
  {
    // ...
    icon: <EnvironmentOutline className="text-[32px]" />,
  },
  {
    // ...
    icon: <TravelOutline className="text-[32px]" />,
  },
  {
    // ...
    icon: <CompassOutline className="text-[32px]" />,
  },
];
```

---

### Task 7: 迁移 app/watering/layout.tsx（浇花布局）

**Files:** Modify: `app/watering/layout.tsx`

- [ ] **Step 1: 替换 Header style**

```diff
- <Layout style={{ minHeight: '100vh' }}>
+ <Layout className="min-h-screen">

- <Header style={{ background: '#fff', padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8, borderBottom: '1px solid #f0f0f0', position: 'sticky', top: 0, zIndex: 100 }}>
+ <Header className="bg-white px-3 flex items-center gap-2 border-0 border-b border-gray-100 border-solid sticky top-0 z-[100]">

- <span style={{ fontSize: 16, fontWeight: 500, flex: 1 }}>浇花帮手</span>
+ <span className="text-base font-medium flex-1">浇花帮手</span>

- <Content style={{ background: '#f5f5f5', minHeight: 'calc(100vh - 48px)' }}>
+ <Content className="bg-gray-100" style={{ minHeight: 'calc(100vh - 48px)' }}>
```

> `minHeight: calc(...)` 是动态值，保留 style 属性。

---

### Task 8: 迁移 app/watering/page.tsx（设备列表页）

**Files:** Modify: `app/watering/page.tsx`

- [ ] **Step 1: 替换容器、操作栏、加载状态**

```diff
- <div style={{ padding: '12px 16px' }}>
+ <div className="py-3 px-4">

- <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
+ <div className="flex justify-between items-center mb-3">

- <h2 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>设备列表</h2>
+ <h2 className="m-0 text-lg font-semibold">设备列表</h2>

- <div style={{ textAlign: 'center', padding: 48 }}>
+ <div className="text-center py-12">
```

---

### Task 9: 迁移 app/watering/components/device-card.tsx

**Files:** Modify: `app/watering/components/device-card.tsx`

- [ ] **Step 1: 替换 extra 栏、信息网格、流程按钮区**

```diff
- <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
+ <div className="flex items-center gap-1">

- style={{ marginBottom: 12 }}
+ className="mb-3"

- <Row gutter={[8, 4]} style={{ marginBottom: 8 }}>
+ <Row gutter={[8, 4]} className="mb-2">

- <span style={{ color: '#999', fontSize: 12 }}>芯片: </span>
+ <span className="text-gray-400 text-xs">芯片: </span>

- <span style={{ fontSize: 13 }}>{device.chipId}</span>
+ <span className="text-[13px]">{device.chipId}</span>

- <span style={{ fontSize: 13, fontWeight: 500 }}>
+ <span className="text-[13px] font-medium">

- <span style={{ fontSize: 10, color: '#bbb', marginLeft: 2 }}>
+ <span className="text-[10px] text-gray-300 ml-0.5">

- <span style={{ fontSize: 12 }}>{device.macAddress}</span>
+ <span className="text-xs">{device.macAddress}</span>

- <Tag color="green" style={{ margin: 0 }}>
+ <Tag color="green" className="m-0">

- <Tag color="default" style={{ margin: 0 }}>
+ <Tag color="default" className="m-0">

- <div style={{ marginTop: 8 }}>
+ <div className="mt-2">

- <Row gutter={8} key={rowIdx} style={{ marginBottom: 4 }}>
+ <Row gutter={8} key={rowIdx} className="mb-1">
```

---

### Task 10: 迁移 app/watering/components/device-editor.tsx

**Files:** Modify: `app/watering/components/device-editor.tsx`

- [ ] **Step 1: 替换外层容器、表单区、电压面板、表格区**

这个文件 inline style 集中在三个区域：

**外层容器：**
```diff
- <div style={{ padding: '0 16px' }}>
+ <div className="px-4">
```

**基本设置表单区 (line 321)：**
```diff
- <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
+ <div className="flex flex-col gap-3 mb-4">

- <label style={{ fontSize: 13, color: '#666', marginBottom: 4, display: 'block' }}>
+ <label className="text-[13px] text-gray-500 mb-1 block">

- <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
+ <div className="flex items-center gap-2">

- <span style={{ fontSize: 12, color: '#999' }}>
+ <span className="text-xs text-gray-400">

- style={{ width: '100%' }}
+ className="w-full"
```
注意：antd 的 `InputNumber` 使用 `style={{ width: '100%' }}`，改为 `className="w-full"`。

**select 下拉框 (line 372)：**
```diff
- style={{ width: '100%', padding: '4px 8px', fontSize: 14, borderRadius: 6, border: '1px solid #d9d9d9' }}
+ className="w-full py-1 px-2 text-sm rounded-md border border-gray-300 border-solid"
```

**电压检测配置面板 (line 399-410)：**
```diff
- <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, padding: '8px 12px', background: '#fafafa', borderRadius: 6, border: '1px solid #f0f0f0' }}>
+ <div className="flex justify-between items-center mb-4 py-2 px-3 bg-gray-50 rounded-md border border-gray-100 border-solid">

- <span style={{ fontSize: 13, fontWeight: 500 }}>电压检测配置</span>
+ <span className="text-[13px] font-medium">电压检测配置</span>

- <span style={{ fontSize: 12, color: '#999', marginLeft: 8 }}>
+ <span className="text-xs text-gray-400 ml-2">

- <span style={{ fontSize: 12, color: '#ccc', marginLeft: 8 }}>
+ <span className="text-xs text-gray-300 ml-2">
```

**流程/定时表格区 (line 434, 456)：**
```diff
- <div style={{ marginBottom: 16 }}>
+ <div className="mb-4">

- <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>功能</h4>
+ <h4 className="m-0 mb-2 text-sm">功能</h4>

- <h4 style={{ margin: '0 0 8px', fontSize: 14 }}>计划任务</h4>
+ <h4 className="m-0 mb-2 text-sm">计划任务</h4>

- style={{ marginTop: 8 }}
+ className="mt-2"
```

---

### Task 11: 迁移 app/watering/components/log-viewer.tsx

**Files:** Modify: `app/watering/components/log-viewer.tsx`

- [ ] **Step 1: 替换空状态、日志条目、时间标签、用时提示**

```diff
- <div style={{ color: '#999', textAlign: 'center', padding: 32 }}>
+ <div className="text-gray-400 text-center py-8">

- <Divider style={{ margin: '12px 0' }} />
+ <Divider className="my-3" />

- <div style={{ fontSize: 14 }}>
+ <div className="text-sm">

- <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
+ <div className="flex items-center gap-1.5 mb-0.5">

- <span style={{ color: '#999', fontSize: 12 }}>
+ <span className="text-gray-400 text-xs">

- <div style={{ fontSize: 13, color: '#333' }}>
+ <div className="text-[13px] text-gray-800">

- <div style={{ color: '#999', fontSize: 12, marginTop: 4, marginLeft: 24 }}>
+ <div className="text-gray-400 text-xs mt-1 ml-6">
```

---

### Task 12: 迁移 process-editor + process-interrupt-editor + process-step-editor + schedule-editor（4 个编辑器）

**Files:** Modify 4 files (see below)

这四个文件共享完全相同的 patterns。每文件的变更：

- [ ] **Step 1: 每个编辑器的最外层容器**

```diff
- <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
+ <div className="flex flex-col gap-3">
```

- [ ] **Step 2: 每个编辑器的表单标签**

```diff
- <label style={{ fontSize: 13, color: '#666', marginBottom: 4, display: 'block' }}>
+ <label className="text-[13px] text-gray-500 mb-1 block">
```

- [ ] **Step 3: antd 组件的 `style={{ width: '100%' }}`**

```diff
- <InputNumber ... style={{ width: '100%' }} />
+ <InputNumber ... className="w-full" />

- <Select ... style={{ width: '100%' }} />
+ <Select ... className="w-full" />

- <TimePicker ... style={{ width: '100%' }} />
+ <TimePicker ... className="w-full" />
```

- [ ] **Step 4: 特殊样式**

`process-interrupt-editor.tsx` (line 144) — 阈值说明文字：
```diff
- <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
+ <div className="text-[11px] text-gray-400 mt-1">
```

`schedule-editor.tsx` — `Space.Compact` 内 `InputNumber` 的 `style={{ flex: 1 }}`：
```diff
- <InputNumber ... style={{ flex: 1 }} />
+ <InputNumber ... className="flex-1" />
```

`process-editor.tsx` (line 87) — Empty 组件：
```diff
- <Empty ... style={{ margin: '8px 0' }} />
+ <Empty ... className="my-2" />
```

`process-step-editor.tsx` (line 88) — 同：
```diff
- <Empty ... style={{ margin: '8px 0' }} />
+ <Empty ... className="my-2" />
```

- [ ] **Step 5: 添加按钮（4 个文件共享 pattern）**

```diff
- <Button ... style={{ marginTop: 8 }}>
+ <Button ... className="mt-2">
```

---

### Task 13: 迁移 app/watering/components/voltage-config-drawer.tsx

**Files:** Modify: `app/watering/components/voltage-config-drawer.tsx`

- [ ] **Step 1: 替换抽屉内容区样式**

```diff
- <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
+ <div className="flex flex-col gap-4">
```

- [ ] **Step 2: 表单标签（该文件使用多行对象写法）**

```diff
- <label style={{ fontSize: 13, color: '#666', marginBottom: 4, display: 'block' }}>
+ <label className="text-[13px] text-gray-500 mb-1 block">
```

- [ ] **Step 3: 说明文字（3 处，line 92-94, 120-122, 148-150）**

```diff
- <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
+ <div className="text-[11px] text-gray-400 mt-1">
```

- [ ] **Step 4: InputNumber 宽和 Space.Compact 内 flex**

```diff
- style={{ width: '100%' }}
+ className="w-full"

- <InputNumber ... style={{ flex: 1 }} />
+ <InputNumber ... className="flex-1" />
```

- [ ] **Step 5: 计算公式说明面板 (line 154-174)**

```diff
- <div style={{ background: '#f6f8fa', border: '1px solid #e8e8e8', borderRadius: 6, padding: '12px 16px', fontSize: 12, color: '#666' }}>
+ <div className="bg-gray-50 border border-gray-200 border-solid rounded-md p-3 text-xs text-gray-500">

- <div style={{ fontWeight: 600, marginBottom: 4 }}>计算公式</div>
+ <div className="font-semibold mb-1">计算公式</div>

- <div style={{ marginTop: 4 }}>
+ <div className="mt-1">
```

---

### Task 14: 迁移 watering 路由页面

**Files:** Modify: `app/watering/devices/[chipId]/page.tsx` + `app/watering/logs/[chipId]/page.tsx`

- [ ] **Step 1: `devices/[chipId]/page.tsx` — 加载状态 + 顶栏**

```diff
- <div style={{ textAlign: 'center', padding: 48 }}>
+ <div className="text-center py-12">

- <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #f0f0f0' }}>
+ <div className="flex justify-between items-center py-3 px-4 bg-white border-0 border-b border-gray-100 border-solid">

- <h3 style={{ margin: 0, fontSize: 16 }}>{config.name || '设备配置'}</h3>
+ <h3 className="m-0 text-base">{config.name || '设备配置'}</h3>

- <div style={{ display: 'flex', gap: 8 }}>
+ <div className="flex gap-2">
```

- [ ] **Step 2: `logs/[chipId]/page.tsx` — 顶栏 + 设备名 + 加载状态**

```diff
- <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#fff', borderBottom: '1px solid #f0f0f0', marginBottom: 16 }}>
+ <div className="flex justify-between items-center py-3 px-4 bg-white border-0 border-b border-gray-100 border-solid mb-4">

- <div style={{ display: 'flex', gap: 8 }}>
+ <div className="flex gap-2">

- <div style={{ padding: '0 16px', marginBottom: 16 }}>
+ <div className="px-4 mb-4">

- <h3 style={{ margin: 0, fontSize: 16 }}>设备: {chipId}</h3>
+ <h3 className="m-0 text-base">设备: {chipId}</h3>

- <div style={{ padding: '0 16px' }}>
+ <div className="px-4">

- <div style={{ textAlign: 'center', padding: 48 }}>
+ <div className="text-center py-12">
```

---

### Task 15: 迁移 watering/debug/ 下全部文件

**Files:** Modify: `app/watering/debug/layout.tsx` + `app/watering/debug/page.tsx` + `app/watering/debug/components/device-form.tsx` + `app/watering/debug/components/event-buttons.tsx` + `app/watering/debug/components/response-log.tsx`

- [ ] **Step 1: `debug/layout.tsx`**

```diff
- <div style={{ padding: 48, textAlign: 'center', color: '#999' }}>
+ <div className="py-12 text-center text-gray-400">
```

- [ ] **Step 2: `debug/page.tsx`**

```diff
- <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
+ <div className="flex flex-col gap-4">

- <Title level={4} style={{ margin: 0 }}>
+ <Title level={4} className="m-0">

- <Paragraph type="secondary" style={{ margin: '4px 0 0' }}>
+ <Paragraph type="secondary" className="mt-1 mb-0">
```

- [ ] **Step 3: `debug/components/device-form.tsx`**

```diff
- <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
+ <div className="flex flex-col gap-4">

# 所有 Space.Compact 内的 InputNumber:
- <InputNumber ... style={{ flex: 1 }} />
+ <InputNumber ... className="flex-1" />
```

- [ ] **Step 4: `debug/components/event-buttons.tsx`**

```diff
# Space 组件的 style prop:
- <Space wrap orientation="vertical" style={{ width: '100%' }}>
+ <Space wrap orientation="vertical" className="w-full">

# Select 组件:
- <Select ... style={{ width: 160 }} />
+ <Select ... className="w-40" />

- <Select ... style={{ width: 220 }} />
+ <Select ... className="w-[220px]" />

- <Input ... style={{ width: 200 }} />
+ <Input ... className="w-[200px]" />
```

- [ ] **Step 5: `debug/components/response-log.tsx`**

```diff
- <div style={{ maxHeight: 400, overflowY: 'auto', fontFamily: 'monospace', fontSize: 12, background: '#fafafa', padding: 8, borderRadius: 4 }}>
+ <div className="max-h-[400px] overflow-y-auto font-mono text-xs bg-gray-50 p-2 rounded">

- <div style={{ color: '#999' }}>暂无请求</div>
+ <div className="text-gray-400">暂无请求</div>

- <div style={{ marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
+ <div className="mb-2 pb-2 border-0 border-b border-gray-100 border-solid">

- <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
+ <div className="flex items-center gap-1.5">

- <Tag color={tag.color} style={{ margin: 0 }}>
+ <Tag color={tag.color} className="m-0">

- <span style={{ color: '#999' }}>{log.timestamp}</span>
+ <span className="text-gray-400">{log.timestamp}</span>

- <div style={{ color: '#666', wordBreak: 'break-all', marginTop: 2 }}>
+ <div className="text-gray-500 break-all mt-0.5">

- <pre style={{ margin: '4px 0 0', color: '#333', fontSize: 11 }}>
+ <pre className="mt-1 mb-0 text-gray-800 text-[11px]">

- <div style={{ color: '#ff4d4f', marginTop: 2 }}>{log.error}</div>
+ <div className="text-red-500 mt-0.5">{log.error}</div>
```

---

### Task 16: 迁移 app/travel/layout.tsx

**Files:** Modify: `app/travel/layout.tsx`

- [ ] **Step 1: LoadingScreen**

```diff
- <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
+ <div className="flex items-center justify-center h-screen">
```

---

### Task 17: 迁移 app/travel/components/shell.tsx

**Files:** Modify: `app/travel/components/shell.tsx`

- [ ] **Step 1: Flex 全屏布局 + NavBar right**

```diff
- <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
+ <div className="flex flex-col h-screen">

- <span style={{ fontSize: 24, display: 'flex', justifyContent: 'flex-end' }}>
+ <span className="text-2xl flex justify-end">

- <div style={{ flex: 1, overflow: 'auto' }}>{children}</div>
+ <div className="flex-1 overflow-auto">{children}</div>
```

---

### Task 18: 迁移 app/travel/page.tsx

**Files:** Modify: `app/travel/page.tsx`

- [ ] **Step 1: 地图页容器**

```diff
- <div style={{ position: 'relative', height: '100%', display: 'flex', flexDirection: 'column' }}>
+ <div className="relative h-full flex flex-col">

- <TripMap ... style={{ flex: 1 }} />
+ <TripMap ... className="flex-1" />
```

> **注意**：TripMap 组件接收 `style` prop，需要同时支持 `className`。见 Task 22。

---

### Task 19: 迁移 app/travel/list/page.tsx

**Files:** Modify: `app/travel/list/page.tsx`

- [ ] **Step 1: 此文件无 inline style**

旅行列表页完全使用 antd-mobile 组件（SearchBar、List、PullToRefresh、ErrorBlock 等），无任何 `style={{}}`。无需迁移。

---

### Task 20: 迁移 app/travel/components/trip-map.tsx

**Files:** Modify: `app/travel/components/trip-map.tsx`

- [x] **Step 1: 容器 div 改用 Tailwind + 错误 UI 改用 antd-mobile** ✅

> **实际实施超出计划范围：**
> - 容器 style（width/height/backgroundColor）→ 全部迁移到 Tailwind：`className="h-[calc(100vh-64px)] w-full bg-[var(--background)]"`
> - 错误 UI（两个）→ 从手写 HTML + 内联样式改为 antd-mobile `ErrorBlock` + `Button`（遵循"能用 antd-mobile 就不自己定义"）
> - Map 构造时传入 `mapStyle: STYLE_MAP[readTheme()]`（防闪烁，非 Tailwind 迁移但同一批改动）
> - props 新增 `className?: string`

---

### Task 21: 迁移 travel Popup 相关组件

**Files:** Modify: `location-edit-popup.tsx` + `location-view-popup.tsx` + `moment-edit-popup.tsx` + `search-popup.tsx`

- [x] **Step 1: Popup `bodyStyle` → `bodyClassName`（Tailwind）** ✅

> **实际实施超出计划范围：** antd-mobile Popup 的 `bodyStyle` prop 也迁移到了 Tailwind（用 `bodyClassName`）
> - `location-edit-popup.tsx` → `bodyClassName="rounded-t-2xl min-h-[50vh] max-h-[75vh] overflow-auto"`
> - `location-view-popup.tsx` → `bodyClassName="rounded-t-2xl max-h-[75vh] overflow-auto"`
> - `moment-edit-popup.tsx` → `bodyClassName="rounded-t-2xl min-h-[40vh] max-h-[75vh] overflow-auto"`
> - `search-popup.tsx` → `bodyClassName="rounded-t-2xl min-h-[60vh] max-h-[75vh] overflow-auto"`

- [x] **Step 2: `location-edit-popup.tsx` — Form 的 style** ✅

```diff
- <Form layout="vertical" style={{ padding: '0 16px' }}>
+ <Form layout="vertical" className="px-4">
```

- [x] **Step 3: `location-view-popup.tsx` — 绝对定位覆盖层 + Space** ✅

```diff
- <div style={{ position: 'relative' }}>
+ <div className="relative">

- <div style={{ position: 'absolute', right: 8, bottom: 8 }}>
+ <div className="absolute right-2 bottom-2">

- <Space direction="vertical" style={{ width: '100%' }}>
+ <Space direction="vertical" className="w-full">
```

- [x] **Step 4: `moment-edit-popup.tsx` — Form 的 style** ✅

```diff
- <Form layout="vertical" style={{ padding: '0 16px' }}>
+ <Form layout="vertical" className="px-4">
```

---

### Task 22: 迁移 cover-image、stats、status-tag、upload-image、section、moment-form

**Files:** Modify 6 files (see below)

- [x] **Step 1: `cover-image.tsx` — borderRadius 条件样式** ✅

```diff
- const style: CSSProperties = {
-   borderRadius: shape === 'circle' ? '50%' : undefined,
- };
...
- <Image ... style={style} />
+ <Image ... className={shape === 'circle' ? 'rounded-full' : ''} />
```
同时移除 `CSSProperties` 导入（若不再使用）。

- [x] **Step 2: `stats.tsx` — Card headerStyle / bodyStyle → headerClassName / bodyClassName** ✅

> **实际实施超出计划范围：** antd-mobile Card 的 `headerStyle`/`bodyStyle` 也迁移到 Tailwind：
> ```diff
> - <Card title="已去" headerStyle={{ justifyContent: 'center' }} bodyStyle={{ textAlign: 'center' }}>
> + <Card title="已去" headerClassName="justify-center" bodyClassName="text-center">
> ```

- [ ] **Step 3: `status-tag.tsx` — 无 inline style**，无需变更。

- [x] **Step 4: `upload-image.tsx` — input display:none** ✅

```diff
- <input ... style={{ display: 'none' }} />
+ <input ... className="hidden" />
```

- [ ] **Step 5: `section.tsx` — 无 inline style**，无需变更。

- [ ] **Step 6: `moment-form.tsx` — 无 inline style**（纯 antd-mobile Form），无需变更。

---

### Task 23: 格式化 + 类型检查 + 修复

**Files:** All migrated files

- [ ] **Step 1: 执行格式化（含 class 自动排序）**

```bash
npm run format
```

Expected: ESLint 自动修复所有格式问题（含 class 顺序）。若有未自动修复的 error，手动修正。

- [ ] **Step 2: 执行类型检查**

```bash
npm run typecheck
```

Expected: 无类型错误。

- [ ] **Step 3: 执行 lint 检查**

```bash
npm run lint
```

Expected: 0 errors（允许 warn）。

- [ ] **Step 4: 执行测试**

```bash
npm run test
```

Expected: 全部通过。

---

### Task 24: 构建验证

**Files:** All

- [ ] **Step 1: 生产构建**

```bash
npm run build
```

Expected: 构建成功，无错误。

- [ ] **Step 2: 检查构建产物 CSS**

```bash
ls -la .next/static/css/
```

Expected: 存在 Tailwind 生成的 CSS 文件。

- [ ] **Step 3: 提交**

```bash
git add .
git commit -m "feat: migrate from inline styles to Tailwind CSS v3

- Add tailwindcss, postcss, autoprefixer, clsx, eslint-plugin-tailwindcss
- Create tailwind.config.ts (preflight disabled for antd-mobile compat)
- Create postcss.config.mjs
- Inject @tailwind directives in globals.css
- Add tailwindcss/recommended to ESLint config
- Remove stylelint and eslint-plugin-css-modules (unused)
- Migrate 24+ files from inline style={{}} to Tailwind utility classes"
```

---

## 附录：CSS-in-JS → Tailwind 映射速查

| Inline Style | Tailwind Class |
|-------------|----------------|
| `display: 'flex'` | `flex` |
| `flexDirection: 'column'` | `flex-col` |
| `alignItems: 'center'` | `items-center` |
| `justifyContent: 'space-between'` | `justify-between` |
| `justifyContent: 'center'` | `justify-center` |
| `justifyContent: 'flex-end'` | `justify-end` |
| `gap: 4` | `gap-1` |
| `gap: 8` | `gap-2` |
| `gap: 12` | `gap-3` |
| `gap: 16` | `gap-4` |
| `padding: '12px 16px'` | `py-3 px-4` |
| `padding: '0 12px'` | `px-3` |
| `padding: '0 16px'` | `px-4` |
| `padding: 8` | `p-2` |
| `padding: 32` | `p-8` |
| `padding: 48` | `p-12` |
| `marginBottom: 2` | `mb-0.5` |
| `marginBottom: 4` | `mb-1` |
| `marginBottom: 8` | `mb-2` |
| `marginBottom: 12` | `mb-3` |
| `marginBottom: 16` | `mb-4` |
| `marginTop: 2` | `mt-0.5` |
| `marginTop: 4` | `mt-1` |
| `marginTop: 8` | `mt-2` |
| `marginLeft: 2` | `ml-0.5` |
| `marginLeft: 8` | `ml-2` |
| `marginLeft: 24` | `ml-6` |
| `margin: 0` | `m-0` |
| `width: '100%'` | `w-full` |
| `height: '100vh'` | `h-screen` |
| `height: '100%'` | `h-full` |
| `minHeight: '100vh'` | `min-h-screen` |
| `fontSize: 10` | `text-[10px]` |
| `fontSize: 11` | `text-[11px]` |
| `fontSize: 12` | `text-xs` |
| `fontSize: 13` | `text-[13px]` |
| `fontSize: 14` | `text-sm` |
| `fontSize: 16` | `text-base` |
| `fontSize: 18` | `text-lg` |
| `fontSize: 24` | `text-2xl` |
| `fontSize: 32` | `text-[32px]` |
| `fontWeight: 500` | `font-medium` |
| `fontWeight: 600` | `font-semibold` |
| `color: '#333'` | `text-gray-800` |
| `color: '#666'` | `text-gray-500` |
| `color: '#999'` | `text-gray-400` |
| `color: '#bbb'` | `text-gray-300` |
| `color: '#ccc'` | `text-gray-300` |
| `color: '#ff4d4f'` | `text-red-500` |
| `background: '#fff'` | `bg-white` |
| `background: '#f5f5f5'` | `bg-gray-100` |
| `background: '#f6f8fa'` | `bg-gray-50` |
| `background: '#fafafa'` | `bg-gray-50` |
| `textAlign: 'center'` | `text-center` |
| `overflow: 'auto'` | `overflow-auto` |
| `overflow: 'hidden'` | `overflow-hidden` |
| `overflowY: 'auto'` | `overflow-y-auto` |
| `borderBottom: '1px solid #f0f0f0'` | `border-0 border-b border-gray-100 border-solid` |
| `border: '1px solid #d9d9d9'` | `border border-gray-300 border-solid` |
| `border: '1px solid #e8e8e8'` | `border border-gray-200 border-solid` |
| `border: '1px solid #f0f0f0'` | `border border-gray-100 border-solid` |
| `borderRadius: 4` | `rounded` |
| `borderRadius: 6` | `rounded-md` |
| `borderRadius: '50%'` | `rounded-full` |
| `position: 'sticky'` | `sticky` |
| `position: 'absolute'` | `absolute` |
| `position: 'relative'` | `relative` |
| `top: 0` | `top-0` |
| `right: 8` | `right-2` |
| `bottom: 8` | `bottom-2` |
| `zIndex: 100` | `z-[100]` |
| `flex: 1` | `flex-1` |
| `flexShrink: 0` | `shrink-0` |
| `whiteSpace: 'nowrap'` | `whitespace-nowrap` |
| `wordBreak: 'break-all'` | `break-all` |
| `fontFamily: 'monospace'` | `font-mono` |
| `cursor: 'pointer'` | `cursor-pointer` |
| `display: 'none'` | `hidden` |
| `maxHeight: 400` | `max-h-[400px]` |
