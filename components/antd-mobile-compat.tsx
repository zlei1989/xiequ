"use client";

import { useEffect } from "react";
import { createRoot } from "react-dom/client";
import { unstableSetRender } from "antd-mobile";

/**
 * React 19 兼容层：antd-mobile v5 的命令式 API（Dialog.show/confirm 等）
 * 使用 react-dom 的 render/unmountComponentAtNode，这些在 React 19 中已移除。
 * 通过注入 unstableSetRender 使用 createRoot 替代。
 *
 * @see https://mobile.ant.design/guide/v5-for-19
 */
export function AntdMobileCompat() {
  useEffect(() => {
    unstableSetRender((node, container) => {
      const root = createRoot(container);
      root.render(node);
      return async () => { root.unmount(); };
    });
  }, []);

  return null;
}
