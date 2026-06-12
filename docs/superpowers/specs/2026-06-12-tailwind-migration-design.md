# Tailwind CSS 迁移设计

**日期**: 2026-06-12
**状态**: 待审查

## 目标

将项目从"100% inline style + antd/antd-mobile 组件内置样式"迁移到 Tailwind CSS v3，全面替换所有 `style={{}}` 为 Tailwind utility class。

**"全面替换"定义**：
- 所有**静态**样式值（如 `display: flex`、`fontSize: 18`、`color: '#333'`）→ 映射为 Tailwind utility class
- 所有**动态**样式值（如 `width: percent + '%'`、`left: x, top: y`）→ 映射为 Tailwind 任意值语法（`w-[${percent}%]`）
- 极少数**无法静态分析的动态值**（动画帧回调中计算的值、复杂数学函数结果）→ 保留 inline style 兜底

同时保持 antd/antd-mobile 组件样式不变。

## 核心决策

| 决策点 | 选择 | 理由 |
|--------|------|------|
| Tailwind 版本 | v3（PostCSS 插件） | 稳态、生态成熟、Next.js 文档以 v3 为主 |
| 替换程度 | 全面替换所有 inline style | 消除技术债，统一工具链 |
| antd 组件样式 | 不碰，Tailwind 只负责外层布局容器 | 避免与 antd 内置样式冲突 |
| 格式化工具 | ESLint `@stylistic` + `eslint-plugin-tailwindcss` | 不加 Prettier，ESLint 全家桶统一管理格式化和 class 排序 |
| PostCSS | 新增 `postcss.config.mjs` | Tailwind v3 必须通过 PostCSS 插件运行 |

## 新增依赖

```json
{
  "tailwindcss": "^3.4.0",
  "postcss": "^8.4.0",
  "autoprefixer": "^10.4.0",
  "eslint-plugin-tailwindcss": "^3.17.0",
  "clsx": "^2.1.0"
}
```

## 新增配置文件

### `tailwind.config.ts`

- `content` 扫描路径：`app/**/*.{ts,tsx}`、`components/**/*.{ts,tsx}`
- `theme.extend`：预留项目自定义 token（颜色、间距等），初始为空
- 无需 `plugins`，初始不引入额外插件

### `postcss.config.mjs`

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

## 修改现有文件

### `app/globals.css`

顶部追加 Tailwind 指令：

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

保留 `:root` 中的 CSS 变量（`--background`、`--foreground`），调整为 Tailwind 的 `@theme` 或继续用 CSS 变量供 Tailwind 引用。保留 `body` 基础规则，移除与 Tailwind base 重复的部分（如 `-webkit-font-smoothing`，Tailwind 已有）。

### `eslint.config.mjs`

- 添加 `eslint-plugin-tailwindcss` 的 `recommended` 扩展
- 移除 `eslint-plugin-css-modules` 及其规则（项目中 0 个 CSS Module 文件，闲置）
- 移除 `stylelint.config.mjs` 和 `stylelint` 依赖

### `package.json`

- 新增依赖（见上方列表）
- 移除依赖：`eslint-plugin-css-modules`、`stylelint`、`stylelint-config-standard`、`stylelint-config-css-modules`、`stylelint-order`
- 脚本 `lint:css` 可移除（无 CSS 文件可 lint），或改为 `tailwindcss` 相关检查

## 迁移计划

### 第一批：全局 + 首页（3 个文件，低密度）

迁移顺序：
1. `app/globals.css` — 加 Tailwind 指令，调整 CSS 变量
2. `app/layout.tsx` — 全局布局 inline style 转 Tailwind class
3. `app/page.tsx` — 首页 entry（图标 fontSize: 32 → `text-[32px]`）

**验收标准**：首页视觉效果与迁移前一致。

### 第二批：watering/ 浇花模块（16+ 个文件，~150 处 inline style）

迁移顺序（由外向内）：
1. `app/watering/layout.tsx` — Layout/Header/Content 容器
2. `app/watering/page.tsx` — 设备列表页
3. `app/watering/components/` 逐个组件：
   - `device-card.tsx`
   - `device-editor.tsx`
   - `log-viewer.tsx`
   - `process-editor.tsx`
   - `process-interrupt-editor.tsx`
   - `process-step-editor.tsx`
   - `schedule-editor.tsx`
   - `voltage-config-drawer.tsx`
4. `app/watering/devices/[chipId]/page.tsx`
5. `app/watering/logs/[chipId]/page.tsx`
6. `app/watering/debug/` 下所有文件

**验收标准**：浇花模块所有页面可正常访问、操作。

### 第三批：travel/ 旅行模块（5+ 个文件，~40 处 inline style）

迁移顺序（由外向内）：
1. `app/travel/layout.tsx`
2. `app/travel/page.tsx`
3. `app/travel/list/page.tsx`
4. `app/travel/components/` 逐个组件

**验收标准**：旅行模块所有页面可正常访问、操作。

### 每文件迁移步骤（以单个文件为例）

1. 读取文件，列出所有 `style={{}}` 的属性和值
2. 逐个映射：`display: flex` → `className="flex"`、`flexDirection: column` → `className="flex flex-col"`、`gap: 12` → `className="gap-3"`（映射表见附录）
3. 对动态值：`height: ${h}px` → `className={`h-[${h}px]`}`（任意值语法，由 Tailwind JIT 动态生成）
4. 对复杂条件样式：使用 `clsx` 或模板字面量组合
5. 验证：`npm run format`（自动修复 class 排序）→ `npm run check`（类型检查）→ 视觉回归对比

### 动态 inline style 的处理

全面替换意味着运行时计算值也要迁移。处理策略：

| 场景 | 迁移方式 | 示例 |
|------|---------|------|
| 计算尺寸 | Tailwind 任意值 `w-[${x}px]` | `style={{ width: percent + '%' }}` → `className={`w-[${percent}%]`}` |
| 条件样式 | `clsx` 组合 | `style={{ color: isActive ? 'red' : 'gray' }}` → `className={clsx(isActive ? 'text-red-500' : 'text-gray-500')}` |
| 坐标定位 | Tailwind 任意值 | `style={{ left: x, top: y }}` → `className={`left-[${x}px] top-[${y}px]`}` |
| 复杂计算 | 保留为 inline style（极少数） | 仅当值来自动画帧回调、数学函数结果等无法静态表达时 |

**注意**：Tailwind v3 的 JIT 引擎会在构建时扫描源码中的 class 字符串。动态拼接的任意值（如 `h-[${x}px]`）需要 class 名在构建时完整出现在源码中才能被生成。对于模板字面量中的任意值，Tailwind 要求 class 名在运行时之前可被静态分析到。必要时用 `safelist` 或 `style` 属性兜底。

## 移除项

| 项目 | 原因 |
|------|------|
| `eslint-plugin-css-modules` | 无 CSS Module 文件，闲置 |
| `stylelint` 全家桶 | 唯一有效目标 `globals.css` 被 Tailwind 接管后无独立 CSS 可 lint |
| `stylelint.config.mjs` | 同上 |
| `npm run lint:css` 脚本 | 无目标文件 |
| `eslint.json`（根目录大文件，~300K tokens） | ESLint 输出缓存，无功能性引用，安全删除 |

## 文件影响面

| 类别 | 新增 | 修改 | 删除 |
|------|------|------|------|
| 配置文件 | 2（tailwind + postcss） | 1（eslint） | 1（stylelint） |
| 依赖 | 5 个包 | 1（package.json） | 6 个包 |
| 业务代码 | 0 | 24 个 tsx 文件 | 0 |

## 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| Tailwind preflight 覆盖 antd-mobile 默认样式 | `tailwind.config.ts` 中设置 `corePlugins: { preflight: false }`，项目已有 `normalize.css` 做 CSS 重置，不需要 Tailwind 的 preflight |
| 动态任意值未被 JIT 生成 | safelist 模式或保留极少数 inline style 兜底 |
| 视觉回归 | 逐批迁移 + 每个文件改后手动检查关键页面 |
| ESLint class 自动排序与现有 @stylistic 规则冲突 | `tailwindcss/recommended` 的 `classnames-order` 只处理 class 属性，与 `@stylistic` 的 JSX 引号等规则不重叠 |

---

## 附录：CSS-in-JS → Tailwind 映射速查

| Inline Style | Tailwind Class |
|-------------|----------------|
| `display: flex` | `flex` |
| `flexDirection: 'column'` | `flex-col` |
| `alignItems: 'center'` | `items-center` |
| `justifyContent: 'space-between'` | `justify-between` |
| `gap: 8` | `gap-2`（4px 单位） |
| `gap: 12` | `gap-3` |
| `padding: 16` | `p-4` |
| `marginTop: 8` | `mt-2` |
| `width: '100%'` | `w-full` |
| `height: 200` | `h-[200px]` |
| `fontSize: 18` | `text-lg` |
| `fontWeight: 600` | `font-semibold` |
| `color: '#ff0000'` | `text-red-500` |
| `backgroundColor: '#f5f5f5'` | `bg-gray-100` |
| `borderRadius: 8` | `rounded-lg` |
| `textAlign: 'center'` | `text-center` |
| `overflow: 'auto'` | `overflow-auto` |
| `position: 'relative'` | `relative` |
| `position: 'absolute'` | `absolute` |
| `flex: 1` | `flex-1` |
| `flexShrink: 0` | `shrink-0` |
| `whiteSpace: 'nowrap'` | `whitespace-nowrap` |
| `opacity: 0.5` | `opacity-50` |
| `zIndex: 10` | `z-10` |
| `cursor: 'pointer'` | `cursor-pointer` |
