export function getDefaultModel(): string {
  // Allow override via global env replacement at build time, or localStorage fallback
  try {
    // @ts-ignore global replacement if provided
    const envModel = process?.env?.DEFAULT_MODEL;
    if (envModel) return envModel;
  } catch (e) {
    // ignore in browser
  }
  return 'gpt-4';
}

export function getServerBaseUrl(): string {
  // Configure at build time via Vite env, e.g. VITE_GBPOS_SERVER_URL=https://pos.example.com
  // Falls back to localhost for development.
  try {
    const envUrl = (import.meta as any)?.env?.VITE_GBPOS_SERVER_URL;
    if (envUrl && typeof envUrl === 'string') return envUrl;
  } catch {
    // ignore
  }
  return 'http://localhost:3000';
}
