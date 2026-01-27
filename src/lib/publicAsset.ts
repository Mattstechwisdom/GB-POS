export function publicAsset(path: string): string {
  const base = (import.meta as any).env?.BASE_URL ?? '/';
  const clean = String(path || '').replace(/^\/+/, '');
  // Vite guarantees BASE_URL ends with '/', except when base is './' which may be exactly './'.
  if (base.endsWith('/')) return `${base}${clean}`;
  if (base === './') return `./${clean}`;
  return `${base}/${clean}`;
}

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
