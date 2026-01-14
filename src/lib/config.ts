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
