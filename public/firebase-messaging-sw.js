/* RoutePulse Web Push Service Worker (FCM HTTP v1 compatible, zero embedded secrets) */

self.addEventListener('push', (event) => {
  if (!event.data) return;

  let payload = {};
  try {
    payload = event.data.json();
  } catch {
    payload = { notification: { title: 'RoutePulse Alert', body: event.data.text() } };
  }

  const notification = payload.notification || {};
  const data = payload.data || {};
  const title = notification.title || data.title || 'RoutePulse Transit Update';
  const body = notification.body || data.body || 'Check live route status in RoutePulse.';

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data,
      tag: data.routeId ? `routepulse_${data.routeId}` : 'routepulse_alert',
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ('focus' in client) {
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow('/');
      }
      return undefined;
    })
  );
});
