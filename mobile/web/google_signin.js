// Connexion Google de la version web : flux « id_token » dans une fenêtre (popup), sans bibliothèque externe.
// La fenêtre revient sur google-callback.html, qui renvoie le jeton ici ; le serveur vérifie sa signature et son audience.
(function () {
  window.hifidhGoogle = {
    // Ouvre la fenêtre de connexion ; renvoie l'id_token, ou null si l'utilisateur ferme la fenêtre.
    signIn: function (clientId) {
      return new Promise(function (resolve, reject) {
        var state = Math.random().toString(36).slice(2) + Date.now().toString(36);
        var nonce = Math.random().toString(36).slice(2) + Date.now().toString(36);
        var redirect = location.origin + location.pathname.replace(/[^/]*$/, '') + 'google-callback.html';
        var url = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
          client_id: clientId, redirect_uri: redirect, response_type: 'id_token', scope: 'openid email profile',
          nonce: nonce, state: state, prompt: 'select_account',
        });
        var w = 480, h = 640;
        var popup = window.open(url, 'hifidh-google', 'width=' + w + ',height=' + h + ',left=' + Math.max(0, (screen.width - w) / 2) + ',top=' + Math.max(0, (screen.height - h) / 2));
        if (!popup) { reject(new Error('popup_blocked')); return; }
        var timer = setInterval(function () { if (popup.closed) { cleanup(); resolve(null); } }, 500);
        function cleanup() { clearInterval(timer); window.removeEventListener('message', onMessage); }
        function onMessage(ev) {
          if (ev.origin !== location.origin || !ev.data || ev.data.hifidhGoogle !== true) return;
          if (ev.data.state !== state) return; // réponse d'une autre tentative : ignorée
          cleanup();
          try { popup.close(); } catch (e) { /* déjà fermée */ }
          ev.data.idToken ? resolve(ev.data.idToken) : reject(new Error(ev.data.error || 'google_failed'));
        }
        window.addEventListener('message', onMessage);
      });
    },
  };
})();
