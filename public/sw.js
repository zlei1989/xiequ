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

/**
 * Web Push — 接收推送并在设备上展示通知
 *
 * 服务端发送的 payload 需包含 title、body 和可选的 data.url。
 * requireInteraction: true 防止通知自动消失。
 */
self.addEventListener('push', (event) => {
  let payload = { title: '谐趣', body: '' };
  if (event.data) {
    try {
      payload = event.data.json();
    } catch {
      // payload 非 JSON 时使用默认标题
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: payload.data,
      requireInteraction: true,
    })
  );
});

/**
 * 通知点击 — 打开或聚焦目标页面
 *
 * 优先查找已打开的窗口并聚焦，无匹配窗口则新开标签。
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/watering';
  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(url) && 'focus' in client) {
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});
