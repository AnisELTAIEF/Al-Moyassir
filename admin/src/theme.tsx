import { useEffect, useState } from 'react';

type Mode = 'light' | 'dark';
const KEY = 'hifidh-theme';

function initial(): Mode {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch { /* stockage indisponible */ }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

/** Bouton clair / sombre (mémorisé dans le navigateur). */
export function ThemeToggle() {
  const [mode, setMode] = useState<Mode>(initial);
  useEffect(() => {
    document.documentElement.dataset.theme = mode;
    try { localStorage.setItem(KEY, mode); } catch { /* */ }
  }, [mode]);
  const next = mode === 'dark' ? 'light' : 'dark';
  return (
    <button className="theme-btn" onClick={() => setMode(next)} aria-label={next === 'dark' ? 'Passer en mode sombre' : 'Passer en mode clair'} title={next === 'dark' ? 'Mode sombre' : 'Mode clair'}>
      {mode === 'dark' ? '☀' : '☾'}
    </button>
  );
}
