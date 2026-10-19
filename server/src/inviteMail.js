// Contenu des e-mails d'invitation, selon le rôle de la personne invitée :
//   - membre (utilisateur simple) ;
//   - admin de groupe ;
//   - admin général.
// Structure : liens utiles en tête, puis « En bref », puis « En détail » (plus détaillé pour les
// admins), et enfin le lien vers le guide détaillé (/guide/). Version texte (copier / partager) et
// version HTML (envoi automatique par e-mail).

import { androidApkLink } from './routes/download.js';

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** Profil de l'invitation. */
export function invitationKind({ role, groupId, groupRole }) {
  if (role === 'admin') return 'admin';
  if (groupId && groupRole === 'admin') return 'groupAdmin';
  return 'member';
}

/** Liens utiles (absents si l'adresse publique du serveur n'est pas configurée). */
function links(cfg, code, kind) {
  const base = cfg.publicUrl;
  const anchor = kind === 'admin' ? '#admin-general' : kind === 'groupAdmin' ? '#admin-groupe' : '#membre';
  return {
    android: androidApkLink(cfg),
    web: base ? `${base}/app/` : null,
    admin: base && kind !== 'member' ? `${base}/` : null,
    invite: base ? `${base}/invite/${code}` : null,
    guide: base ? `${base}/guide/${anchor}` : null,
  };
}

/**
 * Construit l'e-mail d'invitation.
 * @returns {{ subject: string, text: string, html: string }}
 */
export function buildInvitationMail(cfg, { email, code, role, groupId, groupRole, groupName, displayName = null, inviterName, expiresAt }) {
  const kind = invitationKind({ role, groupId, groupRole });
  const L = links(cfg, code, kind);
  const until = new Date(expiresAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const hello = displayName ? `Assalamou alaykoum ${displayName}` : 'Assalamou alaykoum';
  const who = inviterName ? `${inviterName} vous invite` : 'Vous êtes invité(e)';
  const inGroup = groupName ? ` dans le groupe « ${groupName} »` : '';
  const as = kind === 'admin' ? ' en tant qu’administrateur général' : kind === 'groupAdmin' ? ' en tant qu’admin de ce groupe' : '';

  const subject = kind === 'admin'
    ? 'Invitation : administrateur d’Almoyassir (الميسّر)'
    : kind === 'groupAdmin'
      ? `Vous êtes admin du groupe « ${groupName} » sur Almoyassir (الميسّر)`
      : `Invitation à rejoindre Almoyassir (الميسّر)${groupName ? ` — groupe « ${groupName} »` : ''}`;

  // ---- Contenu commun aux deux versions (texte et HTML) ----
  const linkRows = [
    ['Android (application)', L.android ?? 'le lien d’installation vous est donné par votre administrateur'],
    ['iPhone, iPad ou ordinateur (version web)', L.web],
    ...(L.admin ? [['Admin web — gestion, sur ordinateur', L.admin]] : []),
    ['Votre invitation', L.invite],
    ['Guide détaillé', L.guide],
  ].filter(([, v]) => v);

  const brief = [
    'Almoyassir (الميسّر) aide à lire le Coran (riwaya Qalun), à le mémoriser et à le réviser. '
      + 'Votre progression est enregistrée dans votre compte, sur tous vos appareils'
      + (groupName ? `, et suivie par les responsables du groupe « ${groupName} ».` : '.'),
    ...(kind === 'groupAdmin'
      ? [`En tant qu’admin du groupe « ${groupName} », vous suivez la progression des membres, vous repérez ceux qui sont inactifs et vous faites entrer de nouveaux membres.`]
      : []),
    ...(kind === 'admin'
      ? ['En tant qu’administrateur général, vous gérez l’ensemble : utilisateurs, groupes, invitations et rôles, depuis l’admin web.']
      : []),
  ];

  const steps = [
    {
      title: 'Installer l’application',
      items: [
        L.android ? 'Android : installez l’application avec le lien ci-dessus (autorisez l’installation si le téléphone le demande).'
          : 'Android : installez l’application avec le fichier que vous donne votre administrateur.',
        'iPhone / iPad : ouvrez la version web dans Safari, puis Partager → « Sur l’écran d’accueil » : elle s’ouvre ensuite comme une application.',
        'Ordinateur : ouvrez simplement la version web dans votre navigateur.',
      ],
    },
    {
      title: 'Créer votre compte',
      items: [
        `Touchez « Créer un compte avec un code » et saisissez ${code} : votre e-mail${groupName ? ' et votre groupe' : ''} s’affichent tout seuls.`,
        'Choisissez le nom affiché et un mot de passe (8 caractères au moins), ou touchez « Continuer avec Google » si votre adresse est une adresse Google.',
        `Le code est personnel, valable jusqu’au ${until}, pour l’adresse ${email}.`,
      ],
    },
    {
      title: 'Commencer',
      items: [
        'Qira’a : lisez les pages du mushaf ; touchez un ayah pour indiquer où vous en êtes (en cours, acquis…).',
        'Tahfidh : écoutez et répétez ayah par ayah pour mémoriser.',
        'Révision (المراجعة) : l’app vous rappelle ce qu’il faut réviser, au bon moment, pour ne pas oublier.',
        'Alertes : activez-les (Notifications) pour être prévenu dans la barre de notifications du téléphone quand votre enseignant valide votre mémorisation, et recevoir si vous le souhaitez une invocation par heure. Sur iPhone, ajoutez d’abord l’app à l’écran d’accueil.',
        'Déjà un compte ? Ne créez rien : connectez-vous avec votre compte habituel, votre nouveau rôle s’applique tout seul.',
      ],
    },
    ...(kind === 'groupAdmin' ? [{
      title: 'Gérer votre groupe',
      items: [
        'Dans l’app : onglet « Suivi » → votre groupe. Vous y voyez la progression de chaque membre, les inactifs, le code du groupe et les invitations.',
        'Sur ordinateur : l’admin web (lien ci-dessus) offre les mêmes outils sur grand écran, avec l’export CSV.',
        'Faire entrer quelqu’un : donnez-lui le code du groupe (6 caractères), ou invitez-le par e-mail (il reçoit un code personnel).',
        'Rôles : vous pouvez nommer d’autres admins du groupe ou retirer un membre. Le groupe garde toujours au moins un admin.',
      ],
    }] : []),
    ...(kind === 'admin' ? [{
      title: 'Administrer Almoyassir (admin web, sur ordinateur)',
      items: [
        'Aperçu : activité des 30 derniers jours, progression moyenne, personnes inactives.',
        'Utilisateurs : rôle (utilisateur / admin général), désactivation, réinitialisation du mot de passe, ajout à un groupe.',
        'Groupes : créer, renommer, désigner les admins de groupe, gérer le code du groupe.',
        'Invitations : inviter un utilisateur, un admin de groupe ou un admin général ; suivre et révoquer les invitations.',
      ],
    }] : []),
  ];

  const versions = [
    'App mobile (Android) : l’expérience complète, avec l’écoute hors ligne.',
    'Version web : la même application dans le navigateur, pour iPhone, iPad et ordinateur — rien à installer (pas d’écoute hors ligne).',
    ...(kind !== 'member' ? ['Admin web : l’espace de gestion, sur ordinateur, réservé aux admins.'] : []),
    'Votre compte et votre progression sont les mêmes partout.',
  ];

  // ---- Version texte ----
  const line = '────────────────────────';
  const text = [
    `${hello} — السلام عليكم ورحمة الله`,
    '',
    `${who} à rejoindre Almoyassir (الميسّر)${inGroup}${as}.`,
    '',
    `Votre code d’invitation : ${code}`,
    `(valable jusqu’au ${until}, pour l’adresse ${email})`,
    '',
    line, 'LIENS UTILES', line,
    ...linkRows.map(([k, v]) => `• ${k} : ${v}`),
    '',
    line, 'EN BREF', line,
    ...brief,
    '',
    line, 'EN DÉTAIL', line,
    ...steps.flatMap((s, i) => [`${i + 1}. ${s.title}`, ...s.items.map((x) => `   – ${x}`), '']),
    'App mobile, version web, admin web : quelle différence ?',
    ...versions.map((v) => `• ${v}`),
    '',
    ...(L.guide ? [`Pour plus d’informations : guide détaillé → ${L.guide}`, ''] : []),
    'Qu’Allah vous facilite.',
    ...(inviterName ? [inviterName] : []),
  ].join('\n');

  // ---- Version HTML (styles en ligne : compatibles avec les messageries) ----
  const btn = (href, label) => `<a href="${esc(href)}" style="display:inline-block;background:#0D5C4B;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:10px;font-weight:600;margin:4px 6px 4px 0">${esc(label)}</a>`;
  const h2 = (t) => `<h2 style="font-size:16px;color:#0D5C4B;margin:26px 0 8px;border-bottom:1px solid #E3E8E5;padding-bottom:6px">${esc(t)}</h2>`;
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#F5F6F2;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#1E2A26">
<div style="max-width:620px;margin:0 auto;padding:24px 16px">
<div style="background:#0D5C4B;color:#ffffff;border-radius:16px 16px 0 0;padding:22px 24px">
  <div style="font-size:30px;font-family:'Traditional Arabic',serif;direction:rtl;text-align:right">الميسّر</div>
  <div style="font-size:14px;opacity:.85">Almoyassir — lecture, mémorisation et révision du Coran</div>
</div>
<div style="background:#ffffff;border-radius:0 0 16px 16px;padding:22px 24px;line-height:1.55">
  <p style="margin:0 0 4px">${esc(hello)} — <span dir="rtl">السلام عليكم ورحمة الله</span></p>
  <p style="margin:0 0 16px"><strong>${esc(who)}</strong> à rejoindre Almoyassir (الميسّر)${esc(inGroup)}${esc(as)}.</p>
  <div style="background:#F5F6F2;border:1px dashed #C9A227;border-radius:12px;padding:14px;text-align:center">
    <div style="font-size:13px;color:#5B6B66">Votre code d’invitation</div>
    <div style="font-size:28px;font-weight:700;letter-spacing:4px;font-family:Consolas,monospace">${esc(code)}</div>
    <div style="font-size:12px;color:#5B6B66">valable jusqu’au ${esc(until)}, pour ${esc(email)}</div>
  </div>
  ${h2('Liens utiles')}
  <div>${[
    L.android ? btn(L.android, 'Android : installer l’app') : '',
    L.web ? btn(L.web, 'iPhone / ordinateur : version web') : '',
    L.admin ? btn(L.admin, 'Admin web') : '',
  ].join('')}</div>
  <ul style="padding-left:18px;margin:8px 0 0;font-size:13px;color:#5B6B66">${linkRows.map(([k, v]) => `<li>${esc(k)} : ${/^https?:/.test(v) ? `<a href="${esc(v)}" style="color:#0D5C4B">${esc(v)}</a>` : esc(v)}</li>`).join('')}</ul>
  ${h2('En bref')}
  ${brief.map((b) => `<p style="margin:0 0 8px">${esc(b)}</p>`).join('')}
  ${h2('En détail')}
  ${steps.map((s, i) => `<p style="margin:12px 0 4px"><strong>${i + 1}. ${esc(s.title)}</strong></p><ul style="margin:0;padding-left:20px">${s.items.map((x) => `<li style="margin:3px 0">${esc(x)}</li>`).join('')}</ul>`).join('')}
  ${h2('App mobile, version web, admin web : quelle différence ?')}
  <ul style="margin:0;padding-left:20px">${versions.map((v) => `<li style="margin:3px 0">${esc(v)}</li>`).join('')}</ul>
  ${L.guide ? `<p style="margin:22px 0 0;padding:12px 14px;background:#FBF6E6;border-radius:10px">Pour plus d’informations : <a href="${esc(L.guide)}" style="color:#0D5C4B;font-weight:600">guide détaillé →</a></p>` : ''}
  <p style="margin:22px 0 0">Qu’Allah vous facilite.${inviterName ? `<br>${esc(inviterName)}` : ''}</p>
</div>
<p style="font-size:11px;color:#8A9893;text-align:center;margin:14px 0 0">Vous recevez ce message parce qu’une invitation a été créée pour ${esc(email)}. Si vous ne la connaissez pas, ignorez-le.</p>
</div></body></html>`;

  return { subject, text, html };
}

/**
 * E-mail adressé à quelqu'un qui a DÉJÀ un compte et dont le rôle change (ajout à un groupe, admin du
 * groupe, admin général). Rien n'est à recréer : même compte, même mot de passe, même progression.
 * @returns {{ subject: string, text: string, html: string }}
 */
export function buildAccessMail(cfg, { displayName = null, globalRole = null, groupName = null, groupRole = null, inviterName = null }) {
  const base = cfg.publicUrl;
  const android = androidApkLink(cfg);
  const isAdmin = globalRole === 'admin';
  const isGroupAdmin = Boolean(groupName) && groupRole === 'admin';
  const hello = displayName ? `Assalamou alaykoum ${displayName}` : 'Assalamou alaykoum';
  const by = inviterName ? ` par ${inviterName}` : '';
  const change = isAdmin
    ? `Vous êtes maintenant administrateur général d’Almoyassir (الميسّر)${by}.`
    : isGroupAdmin
      ? `Vous êtes maintenant admin du groupe « ${groupName} » sur Almoyassir (الميسّر)${by}.`
      : `Vous avez été ajouté(e) au groupe « ${groupName} » sur Almoyassir (الميسّر)${by}.`;
  const subject = isAdmin
    ? 'Almoyassir (الميسّر) : vous êtes administrateur général'
    : isGroupAdmin
      ? `Almoyassir (الميسّر) : vous êtes admin du groupe « ${groupName} »`
      : `Almoyassir (الميسّر) : vous avez rejoint le groupe « ${groupName} »`;
  const what = isAdmin
    ? 'Depuis l’admin web (sur ordinateur) vous gérez les utilisateurs, les groupes, les invitations et les rôles.'
    : isGroupAdmin
      ? 'Dans l’app (onglet « Suivi ») ou dans l’admin web, vous suivez la progression des membres et vous faites entrer de nouveaux membres.'
      : 'Votre progression est désormais aussi suivie par les responsables de ce groupe.';
  const rows = [
    ['Application', base ? `${base}/app/` : null],
    ['Android', android],
    ...(isAdmin || isGroupAdmin ? [['Admin web (ordinateur)', base ? `${base}/` : null]] : []),
    ['Guide détaillé', base ? `${base}/guide/${isAdmin ? '#admin-general' : isGroupAdmin ? '#admin-groupe' : '#membre'}` : null],
  ].filter(([, v]) => v);
  const keep = 'Rien à refaire : connectez-vous comme d’habitude avec votre compte et votre mot de passe actuels. Votre progression et vos réglages sont conservés.';
  const text = [hello + ' — السلام عليكم ورحمة الله', '', change, what, '', keep, '', ...rows.map(([k, v]) => `• ${k} : ${v}`), '', 'Qu’Allah vous facilite.', ...(inviterName ? [inviterName] : [])].join('\n');
  const html = `<!doctype html><html lang="fr"><body style="margin:0;background:#F5F6F2;font-family:Segoe UI,Roboto,Arial,sans-serif;color:#1E2A26">
<div style="max-width:620px;margin:0 auto;padding:24px 16px">
<div style="background:#0D5C4B;color:#ffffff;border-radius:16px 16px 0 0;padding:22px 24px"><div style="font-size:30px;font-family:'Traditional Arabic',serif;direction:rtl;text-align:right">الميسّر</div><div style="font-size:14px;opacity:.85">Almoyassir</div></div>
<div style="background:#ffffff;border-radius:0 0 16px 16px;padding:22px 24px;line-height:1.55">
<p style="margin:0 0 4px">${esc(hello)} — <span dir="rtl">السلام عليكم ورحمة الله</span></p>
<p style="margin:0 0 12px"><strong>${esc(change)}</strong></p>
<p style="margin:0 0 12px">${esc(what)}</p>
<p style="margin:0 0 12px;padding:12px 14px;background:#FBF6E6;border-radius:10px">${esc(keep)}</p>
<ul style="padding-left:18px;margin:8px 0 0">${rows.map(([k, v]) => `<li>${esc(k)} : <a href="${esc(v)}" style="color:#0D5C4B">${esc(v)}</a></li>`).join('')}</ul>
<p style="margin:22px 0 0">Qu’Allah vous facilite.${inviterName ? `<br>${esc(inviterName)}` : ''}</p>
</div></div></body></html>`;
  return { subject, text, html };
}
