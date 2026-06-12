# Code Rule Validation — 严格规则验证设计

## 概述

为项目引入增强严格级别的代码规则验证体系，覆盖 TypeScript、TSX、CSS/SCSS 以及代码格式化。
采用"渐进收敛"策略：新规则以 warn 级别引入，模块修复后升级为 error，确保不阻断日常开发。

## 目标

- ESLint 9 flat config 统一管理 TS/TSX 规则与格式化
- Stylelint 统一管理 CSS / CSS Modules 规则与属性排序
- TypeScript 编译器选项收紧，追加实用检查
- 统一命令行入口：`lint`、`format`、`typecheck`

## 架构总览

```
                  ┌─────────────────────────────┐
                  │       npm run / 手动         │
                  └─────────────┬───────────────┘
                                │
         ┌──────────────────────┼──────────────────────┐
         ▼                      ▼                      ▼
  ┌──────────────┐     ┌──────────────┐     ┌──────────────────┐
  │ eslint       │     │ stylelint    │     │ tsc --noEmit     │
  │ (flat config)│     │              │     │ (类型检查)         │
  ├──────────────┤     ├──────────────┤     └──────────────────┘
  │ • next/core  │     │ • standard   │
  │ • ts strict  │     │ • CSS        │
  │   typed      │     │   Modules    │
  │ • stylistic  │     │ • order      │
  │ • import     │     │              │
  │   order      │     │              │
  └──────────────┘     └──────────────┘
```

## 新增文件

```
项目根目录
├── eslint.config.mjs          ← 新建
├── stylelint.config.mjs       ← 新建
├── tsconfig.json              ← 修改（追加 3 个选项）
└── package.json               ← 修改（新增 devDependencies + scripts）
```

---

## 一、ESLint 配置 (`eslint.config.mjs`)

### 插件组合

| 插件 | 作用 | 级别 |
|------|------|------|
| `eslint-config-next` (core-web-vitals + typescript) | Next.js 官方规则 | 继承 |
| `typescript-eslint` (strict-type-checked) | TS 严格类型检查预设 | 继承 |
| `@stylistic/eslint-plugin` | 格式化规则 | warn → error |
| `eslint-plugin-import-x` | import 排序 + 禁止循环引用 | warn → error |

### @stylistic 格式化规则

| 规则 | 值 | 说明 |
|------|-----|------|
| `indent` | 2 空格 | 缩进 |
| `quotes` | single，允许转义 | 字符串单引号 |
| `jsx-quotes` | prefer-double | JSX 属性双引号 |
| `semi` | always | 必须分号 |
| `comma-dangle` | always-multiline | 多行尾逗号 |
| `object-curly-spacing` | always | 花括号内部空格 |
| `max-len` | 100，忽略字符串/模板 | 行宽限制 |
| `eol-last` | always | 文件末尾空行 |

### import-x 规则

| 规则 | 值 | 说明 |
|------|-----|------|
| `import-x/order` | builtin → external → internal(@/) → parent → sibling → type | 分组排序 |
| `import-x/order.alphabetize` | asc | 组内字母排序 |
| `import-x/order.newlines-between` | always | 组间空行分隔 |
| `import-x/no-cycle` | warn | 禁止循环引用 |

### TypeScript 专项规则

| 规则 | 值 | 说明 |
|------|-----|------|
| `no-explicit-any` | warn | 禁止 any |
| `consistent-type-imports` | error，type-imports | 强制 type import |
| `no-unused-vars` | error，`_` 前缀豁免 | 禁止未使用变量 |

### ignore 目录

`.next/`、`node_modules/`、`scripts/`

---

## 二、Stylelint 配置 (`stylelint.config.mjs`)

### 继承

- `stylelint-config-standard` — CSS 标准规则
- `stylelint-config-css-modules` — CSS Modules 专项（`*-module.css`）

### 插件

- `stylelint-order` — 属性按类型排序

### 属性排序分组（order/properties-order）

1. **定位** — `position`、`top`、`right`、`bottom`、`left`、`z-index`
2. **盒模型** — `display`、`flex`、`flex-direction`、`justify-content`、`align-items`、`width`、`height`、`margin`、`padding`、`border`、`border-radius`、`box-sizing`
3. **排版** — `font-size`、`font-weight`、`line-height`、`text-align`、`color`
4. **视觉** — `background`、`opacity`、`box-shadow`、`transform`
5. **其他** — `transition`、`animation`、`cursor`、`overflow`

### CSS Modules 专项规则

| 规则 | 值 |
|------|-----|
| `css-modules/no-undef-class` | true |
| `css-modules/no-unused-class` | warn |

### 忽略

`node_modules/**`、`.next/**`

---

## 三、TypeScript 编译选项 (`tsconfig.json` 追加)

在现有 `strict: true` 基础上追加：

| 选项 | 值 | 说明 |
|------|-----|------|
| `noUncheckedIndexedAccess` | true | 数组/对象索引访问加 `| undefined` |
| `noUnusedLocals` | true | 禁止未使用的局部变量 |
| `noUnusedParameters` | true | 禁止未使用的参数（`_` 前缀豁免） |

`exactOptionalPropertyTypes` 暂缓，因 antd-mobile 等第三方类型可能不兼容。

---

## 四、package.json 变更

### 新增 devDependencies

```json
"@eslint/eslintrc": "^3",
"@stylistic/eslint-plugin": "^4",
"eslint-plugin-import-x": "^4",
"stylelint": "^16",
"stylelint-config-css-modules": "^4",
"stylelint-config-standard": "^37",
"stylelint-order": "^6"
```

### 新增/修改 scripts

| 命令 | 作用 |
|------|------|
| `lint` | ESLint + Stylelint 联合检查 |
| `lint:ts` | 仅 ESLint 检查 |
| `lint:css` | 仅 Stylelint 检查 |
| `typecheck` | TypeScript 类型检查（不输出文件） |
| `format` | ESLint + Stylelint 自动修复 |
| `format:ts` | 仅 ESLint 自动修复 |
| `format:css` | 仅 Stylelint 自动修复 |
| `check` | typecheck + lint 全量检查 |

---

## 五、实施步骤

| # | 步骤 | 产出 |
|---|------|------|
| 1 | 安装依赖 | 新增 7 个 dev 包 |
| 2 | 创建 `eslint.config.mjs` | 完整 lint 规则 |
| 3 | 创建 `stylelint.config.mjs` | 完整 CSS 规则 |
| 4 | 修改 `tsconfig.json` | 追加 3 个编译选项 |
| 5 | 修改 `package.json` | 新增 scripts + devDependencies |
| 6 | 首次运行建立基线 | 统计 warn/error 数量 |
| 7 | 批量 autofix | 自动修复格式化类问题 |
| 8 | 手工修复残留 | 逐文件处理无法 autofix 的 warn |
| 9 | 收紧规则 | 核心规则 warn → error，lint 加 `--max-warnings 0` |

## 六、注意事项

- **渐进收敛**：stylistic 和 import 类规则初始为 warn，格式化类问题可 autofix 不影响手写代码
- **CSS Modules 规则**仅对 `*.module.css` 文件生效，全局样式文件不受 camelCase 命名限制
- **Stylelint 配置**排除 `node_modules` 和 `.next`，避免扫描构建产物
- **`@eslint/eslintrc`** 用于 FlatCompat 桥接 Next.js 传统配置，ESLint 9 必需
- **`eslint-plugin-import-x`** 替代旧版 `eslint-plugin-import`，原生支持 flat config
- **可选增强**：`.vscode/settings.json` 配置保存时自动 eslint fix + stylelint fix
