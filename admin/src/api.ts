import { createDemoApi } from './demoApi';
import { createRestApi } from './restApi';
import type { Api } from './types';

const url = import.meta.env.VITE_API_URL as string | undefined;
const google = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || null;

export const configured = Boolean(url && !url.includes('exemple'));
export const api: Api | null =
  import.meta.env.VITE_DEMO === '1' ? createDemoApi() : configured ? createRestApi(url!, google) : null;
