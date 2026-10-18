// Service worker des alertes (Web Push) : affiche la notification reçue et ouvre l'app au toucher.
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });

function appWindows() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
    return list.filter(function (c) { return c.url.indexOf('/app/') !== -1; });
  });
}

self.addEventListener('push', function (event) {
  var data = {};
  try { data = event.data ? event.data.json() : {}; } catch (e) { /* texte brut ignoré */ }
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title || 'الميسّر · Almoyassir', {
      body: data.body || '',
      icon: '../icons/Icon-192.png',
      badge: '../icons/Icon-192.png',
      data: { url: data.url || '/app/', id: data.id || null, kind: data.kind || null },
      dir: 'auto',
    }),
    // App ouverte : elle se met à jour tout de suite (validations, notifications).
    appWindows().then(function (list) {
      list.forEach(function (c) { c.postMessage({ hifidhPush: 'received', id: data.id || null, kind: data.kind || null, title: data.title || '', body: data.body || '' }); });
    }),
  ]));
});

// Toucher l'alerte : l'app ouverte affiche la notification ; sinon on l'ouvre directement dessus (?notif=id).
self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var d = event.notification.data || {};
  var target = new URL(d.url || '/app/', self.location.origin).href;
  event.waitUntil(appWindows().then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if ('focus' in list[i]) {
        list[i].postMessage({ hifidhPush: 'opened', id: d.id || null, kind: d.kind || null });
        return list[i].focus();
      }
    }
    return self.clients.openWindow(target);
  }));
});
