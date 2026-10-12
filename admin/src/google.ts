// Bouton « Se connecter avec Google » (Google Identity Services).
interface GoogleId {
  accounts: { id: {
    initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string }): void;
    renderButton(el: HTMLElement, o: Record<string, unknown>): void;
  } };
}
declare global { interface Window { google?: GoogleId } }

let loading: Promise<void> | null = null;
function load(): Promise<void> {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google indisponible'));
    document.head.appendChild(s);
  });
  return loading;
}

export async function renderGoogleButton(el: HTMLElement, clientId: string, onToken: (idToken: string) => void) {
  await load();
  window.google!.accounts.id.initialize({ client_id: clientId, callback: (r) => onToken(r.credential) });
  window.google!.accounts.id.renderButton(el, { theme: 'outline', size: 'large', text: 'continue_with', locale: 'fr', width: 320 });
}
