// Alertes quand l'app est fermée (Web Push). Le service worker dédié est enregistré sur une portée à part
// (/app/push/) : il reçoit les alertes sans toucher au service worker de Flutter (cache hors ligne).
(function () {
  function supported() {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }
  function key(b64) {
    var pad = '='.repeat((4 - (b64.length % 4)) % 4);
    var raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
    return Uint8Array.from(raw, function (c) { return c.charCodeAt(0); });
  }
  async function registration() {
    return navigator.serviceWorker.register('push-sw.js', { scope: './push/' });
  }
  window.hifidhPush = {
    supported: supported,
    permission: function () { return supported() ? Notification.permission : 'unsupported'; },
    // Demande l'autorisation (geste de l'utilisateur requis), s'abonne et renvoie l'abonnement en JSON (ou null si refusé).
    subscribe: async function (vapidKey) {
      if (!supported()) return null;
      if ((await Notification.requestPermission()) !== 'granted') return null;
      var reg = await registration();
      await navigator.serviceWorker.ready;
      var sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key(vapidKey) });
      return JSON.stringify(sub.toJSON());
    },
    // Se désabonne et renvoie l'adresse de l'abonnement supprimé (pour le retirer aussi côté serveur).
    unsubscribe: async function () {
      if (!supported()) return null;
      var reg = await navigator.serviceWorker.getRegistration('./push/');
      var sub = reg && (await reg.pushManager.getSubscription());
      if (!sub) return null;
      var endpoint = sub.endpoint;
      await sub.unsubscribe();
      return endpoint;
    },
    // Messages du service worker : alerte reçue app ouverte, ou alerte touchée (JSON transmis à l'app).
    listen: function (cb) {
      if (!('serviceWorker' in navigator)) return;
      navigator.serviceWorker.addEventListener('message', function (e) {
        if (e.data && e.data.hifidhPush) cb(JSON.stringify(e.data));
      });
    },
    // L'appareil est-il déjà abonné ?
    subscribed: async function () {
      if (!supported()) return false;
      var reg = await navigator.serviceWorker.getRegistration('./push/');
      return !!(reg && (await reg.pushManager.getSubscription()));
    },
  };
})();
