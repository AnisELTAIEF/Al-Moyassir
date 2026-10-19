// Connexion Google de la version web : passerelle vers web/google_signin.js.
import 'dart:js_interop';

@JS('hifidhGoogle')
external _Google? get _google;

extension type _Google._(JSObject _) implements JSObject {
  external JSPromise<JSString?> signIn(String clientId);
}

/// Ouvre la fenêtre Google ; renvoie l'id_token, ou null si l'utilisateur ferme la fenêtre.
Future<String?> googleWebSignIn(String clientId) async => (await _google?.signIn(clientId).toDart)?.toDart;
