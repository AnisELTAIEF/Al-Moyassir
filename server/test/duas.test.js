import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOURLY_DUAS, duaOfHour, sendHourlyDuas } from '../src/duas.js';

test('invocation de l’heure : toutes différentes d’une heure à l’autre, en arabe avec traduction', () => {
  assert.ok(HOURLY_DUAS.length >= 14, 'au moins une par heure de la journée sans répétition');
  assert.equal(new Set(HOURLY_DUAS.map((d) => d[0])).size, HOURLY_DUAS.length, 'pas de doublon');
  for (const [ar, fr] of HOURLY_DUAS) { assert.match(ar, /[؀-ۿ]/); assert.ok(fr.length > 10); }
  assert.notDeepEqual(duaOfHour(100), duaOfHour(101));
});

test('envoi : seulement entre 8 h et 21 h à l’heure de l’appareil, seulement pour ceux qui l’ont activé', async () => {
  const sent = [];
  const rows = [
    { user_id: 'tunis', utc_offset_min: 60 },   // UTC+1
    { user_id: 'montreal', utc_offset_min: -240 }, // UTC-4
  ];
  const app = { db: { query: async () => [rows] } };
  const push = async (_app, userId, msg) => { sent.push([userId, msg.kind, msg.text[0]]); };
  // 10:00 UTC → Tunis 11 h (envoi), Montréal 6 h (pas d'envoi)
  assert.equal(await sendHourlyDuas(app, new Date('2026-10-19T10:00:00Z'), push), 1);
  assert.deepEqual(sent.map((s) => s[0]), ['tunis']);
  assert.equal(sent[0][1], 'dua');
  // 21:00 UTC → Tunis 22 h (pas d'envoi), Montréal 17 h (envoi)
  sent.length = 0;
  assert.equal(await sendHourlyDuas(app, new Date('2026-10-19T21:00:00Z'), push), 1);
  assert.deepEqual(sent.map((s) => s[0]), ['montreal']);
});
