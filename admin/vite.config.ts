import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE : chemin de publication si l'admin n'est pas à la racine du domaine (ex. /admin/).
export default defineConfig({ plugins: [react()], base: process.env.VITE_BASE ?? '/' });
