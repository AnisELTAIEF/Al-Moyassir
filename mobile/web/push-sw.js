// Service worker des alertes (Web Push) : affiche la notification reçue et ouvre l'app au toucher.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* texte brut ignoré */ }
  event.waitUntil(self.registration.showNotification(data.title || 'الميسّر · Almoyassir', {
    body: data.body || '',
    icon: '../icons/Icon-192.png',
    badge: '../icons/Icon-192.png',
    data: { url: data.url || '/app/' },
    dir: 'auto',
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var target = new URL((event.notification.data && event.notification.data.url) || '/app/', self.location.origin).href;
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf('/app/') !== -1 && 'focus' in list[i]) return list[i].focus();
    }
    return self.clients.openWindow(target);
  }));
});
