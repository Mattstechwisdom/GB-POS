export function publicAsset(path: string): string {
  const base = (import.meta as any).env?.BASE_URL ?? '/';
  const clean = String(path || '').replace(/^\/+/, '');
  // Vite guarantees BASE_URL ends with '/', except when base is './' which may be exactly './'.
  if (base.endsWith('/')) return `${base}${clean}`;
  if (base === './') return `./${clean}`;
  return `${base}/${clean}`;
}

const dataUrlCache = new Map<string, Promise<string | null>>();

export async function fetchPublicAssetAsDataUrl(path: string): Promise<string | null> {
  try {
    const res = await fetch(publicAsset(path));
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('FileReader failed'));
      reader.onload = () => resolve(String(reader.result || ''));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export function fetchPublicAssetAsDataUrlCached(path: string): Promise<string | null> {
  const key = String(path || '').trim();
  if (!key) return Promise.resolve(null);
  let pending = dataUrlCache.get(key);
  if (!pending) {
    pending = fetchPublicAssetAsDataUrl(key).catch(() => null);
    dataUrlCache.set(key, pending);
  }
  return pending;
}
