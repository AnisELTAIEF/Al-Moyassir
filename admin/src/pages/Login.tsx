import { FormEvent, useEffect, useRef, useState } from 'react';
import { renderGoogleButton } from '../google';
import { ThemeToggle } from '../theme';
import type { Api, User } from '../types';

export default function Login({ api, onSignedIn, notice }: { api: Api; onSignedIn: (u: User) => void; notice: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(notice);
  const gRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!api.googleClientId || !gRef.current) return;
    renderGoogleButton(gRef.current, api.googleClientId, async (token) => {
      setBusy(true);
      setMsg(null);
      try { onSignedIn(await api.signInWithGoogle(token)); } catch (e) { setMsg((e as Error).message); } finally { setBusy(false); }
    }).catch(() => setMsg('Le bouton Google n’a pas pu se charger.'));
  }, [api, onSignedIn]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try { onSignedIn(await api.signIn(email.trim(), password)); } catch (err) { setMsg((err as Error).message); } finally { setBusy(false); }
  }

  return (
    <main className="center login">
      <ThemeToggle />
      <form className="card narrow" onSubmit={submit}>
        <div className="login-mark ar" aria-hidden>الميسّر</div>
        <h1>Espace d’administration</h1>
        <p className="muted">Almoyassir (الميسّر) — pour les administrateurs et les responsables de groupe.</p>
        {api.demo && <p className="badge">Mode démo : n’importe quelles valeurs fonctionnent</p>}
        {api.googleClientId && <><div ref={gRef} className="gbtn" /><div className="or"><span>ou</span></div></>}
        <label>E-mail<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required={!api.demo} autoComplete="email" /></label>
        <label>Mot de passe<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required={!api.demo} autoComplete="current-password" /></label>
        {msg && <p className="error" role="alert">{msg}</p>}
        <button className="btn" disabled={busy}>Se connecter</button>
        <p className="muted small">Pas encore de compte ? Ouvrez l’application mobile avec votre code d’invitation.</p>
      </form>
    </main>
  );
}
