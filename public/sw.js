/**
 * Service Worker — 基础离线兜底
 *
 * 策略：Network First（仅导航请求），失败时返回离线兜底页。
 * 静态资源（JS/CSS/图片）不拦截，走浏览器默认缓存。
 */

const OFFLINE_URL = '/offline';

self.addEventListener('install', (event) => {
  // 预缓存离线兜底页
  event.waitUntil(
    caches.open('offline-v1').then((cache) => {
      return cache.add(OFFLINE_URL);
    })
  );
  // 安装完成后立即激活，不等待旧 SW 关闭
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  // 接管所有页面
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  // 仅处理导航请求（页面跳转）
  if (event.request.mode === 'navigate') {
    event.respondWith(
      fetch(event.request).catch(() => {
        // 网络失败时返回缓存的离线兜底页
        return caches.match(OFFLINE_URL);
      })
    );
  }
});
