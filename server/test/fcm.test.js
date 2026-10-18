// Expéditeur FCM (API HTTP v1) : jeton d'accès Google signé avec le compte de service, envoi, erreurs. Sans base de données.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { decodeJwt, decodeProtectedHeader } from 'jose';
import { makeFcmSender } from '../src/fcm.js';

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const sa = {
  type: 'service_account', project_id: 'projet-test', private_key_id: 'kid1',
  private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  client_email: 'svc@projet-test.iam.gserviceaccount.com', token_uri: 'https://oauth2.googleapis.com/token',
};
const json = (status, body) => ({ ok: status < 300, status, json: async () => body });

test('sans compte de service : pas d’expéditeur', () => {
  assert.equal(makeFcmSender({ fcm: { serviceAccountFile: '' } }), null);
});

test('envoi : jeton d’accès demandé une fois, message v1 correct, jeton périmé signalé', async () => {
  const calls = [];
  let next = json(200, { name: 'projects/projet-test/messages/1' });
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    if (url === sa.token_uri) return json(200, { access_token: 'ya29.test', expires_in: 3599 });
    return next;
  };
  const send = makeFcmSender({ fcm: {} }, { fetchImpl, serviceAccount: sa });
  await send('TOKEN1', { title: 'T', body: 'B', data: { kind: 'certificate' } });
  await send('TOKEN2', { title: 'T', body: 'B' });

  const auth = calls.filter((c) => c.url === sa.token_uri);
  assert.equal(auth.length, 1, 'jeton d’accès mis en cache');
  const assertion = new URLSearchParams(auth[0].init.body).get('assertion');
  const claims = decodeJwt(assertion);
  assert.equal(decodeProtectedHeader(assertion).alg, 'RS256');
  assert.equal(claims.iss, sa.client_email);
  assert.equal(claims.aud, sa.token_uri);
  assert.match(claims.scope, /firebase\.messaging/);

  const msg = calls.find((c) => c.url.includes('messages:send'));
  assert.equal(msg.url, 'https://fcm.googleapis.com/v1/projects/projet-test/messages:send');
  assert.equal(msg.init.headers.authorization, 'Bearer ya29.test');
  const body = JSON.parse(msg.init.body).message;
  assert.equal(body.token, 'TOKEN1');
  assert.deepEqual(body.notification, { title: 'T', body: 'B' });
  assert.deepEqual(body.data, { kind: 'certificate' });
  assert.equal(body.android.notification.channel_id, 'alertes');

  next = json(404, { error: { message: 'Requested entity was not found.', details: [{ errorCode: 'UNREGISTERED' }] } });
  await assert.rejects(send('TOKEN3', { title: 'T', body: 'B' }), (e) => e.unregistered === true && e.statusCode === 404);
  next = json(503, { error: { message: 'indisponible' } });
  await assert.rejects(send('TOKEN4', { title: 'T', body: 'B' }), (e) => e.unregistered === false);
});
