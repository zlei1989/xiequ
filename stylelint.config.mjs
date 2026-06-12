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
    // CSS Modules 类名校验由 ESLint 的 eslint-plugin-css-modules 负责，
    // 此处不再重复配置（该规则仅为 ESLint 规则，Stylelint 不提供）。
  },
  ignoreFiles: [
    "node_modules/**",
    ".next/**",
    "public/**",
  ],
};
