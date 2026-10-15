import { ImportPanel } from '../components';
import type { Api } from '../types';

const EXAMPLE = `Groupe;Nom complet;E-mail;Rôle
Halaqa Al Fajr;Ahmed Ben Ali;ahmed.benali@exemple.tn;admin
Halaqa Al Fajr;Sara Trabelsi;sara.trabelsi@exemple.tn;membre
Halaqa Nour;Youssef Gharbi;youssef.gharbi@exemple.tn;
`;

/** Import général (admins globaux) : plusieurs groupes, admins de groupe, création des groupes absents. */
export default function Import({ api, onDone }: { api: Api; onDone?: () => void }) {
  return (
    <>
      <h1>Importer des utilisateurs</h1>
      <p className="muted lead">Ajoutez d’un coup une liste de personnes, réparties dans des groupes. Les groupes qui n’existent pas
        sont créés ; les personnes qui ont déjà un compte sont ajoutées au groupe ; les autres reçoivent une invitation.
        Pour une liste destinée à un seul groupe, ouvrez plutôt le groupe (Groupes → le groupe → « Importer une liste »).</p>
      <ImportPanel
        run={(text, dryRun) => api.importUsers(text, dryRun)}
        onDone={onDone}
        example={EXAMPLE}
        templateName="modele-import-general"
        format={<>
          <p><strong>Format :</strong> un fichier texte (.txt) ou CSV, une personne par ligne :{' '}
            <code>Groupe ; Nom complet ; E-mail ; Rôle</code></p>
          <ul className="small">
            <li><strong>Rôle</strong> : <code>membre</code> (par défaut si vide) ou <code>admin</code> (admin du groupe).</li>
            <li>Séparateur : point-virgule (Excel en français), tabulation ou virgule. Une ligne d’en-tête est acceptée.</li>
            <li>Groupe vide (<code>;Nom;e-mail</code>) : la personne est invitée sans groupe.</li>
            <li>Une même personne peut figurer dans plusieurs groupes : elle ne reçoit qu’une invitation et rejoint tous ses groupes en créant son compte.</li>
            <li>Cliquez d’abord sur <strong>Vérifier</strong> : rien n’est modifié tant que vous n’avez pas cliqué sur <strong>Importer</strong>.</li>
          </ul>
        </>}
      />
    </>
  );
}
