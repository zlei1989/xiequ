'use client';

import { unstableSetRender } from 'antd-mobile';
import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';

/**
 * React 19 兼容层：antd-mobile v5 的命令式 API（Dialog.show/confirm 等）
 * 使用 react-dom 的 render/unmountComponentAtNode，这些在 React 19 中已移除。
 * 通过注入 unstableSetRender 使用 createRoot 替代。
 *
 * 注意：仅在客户端执行（"use client"），useEffect 确保在浏览器挂载后才注册。
 *
 * @see https://mobile.ant.design/guide/v5-for-19
 */

/**
 * 注册 createRoot 渲染器到 antd-mobile，使其命令式 API 在 React 19 中正常工作。
 * 将节点渲染到指定容器，返回卸载清理函数供 antd-mobile 内部调用。
 */
export function AntdMobileCompat() {
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- React 19 兼容层：antd-mobile 官方推荐方案
    unstableSetRender((node, container) => {
      // 用 React 18+ 的 createRoot API 替代已移除的 render()
      const root = createRoot(container);
      root.render(node);
      // 返回异步清理函数：antd-mobile 关闭弹窗时会调用此函数卸载组件
      // eslint-disable-next-line @typescript-eslint/require-await -- antd-mobile UnmountType 要求返回 Promise<void>
      return async () => { root.unmount(); };
    });
  }, []);

  return null;
}
