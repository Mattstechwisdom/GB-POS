export type PartUrlMetadata = {
  ok: boolean;
  url?: string;
  title?: string;
  price?: number;
  currency?: string;
  vendor?: string;
  error?: string;
};

export const DEFAULT_PART_MARKUP_PCT = 10;

export const PART_MARKUP_PRESETS = [5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

export function splitTaxIncludedCost(cost: unknown, taxExempt: boolean, taxRate = 8) {
  const total = Math.max(0, Number(cost) || 0);
  if (taxExempt || !(taxRate > 0)) return { total: Math.round(total * 100) / 100, preTax: Math.round(total * 100) / 100, tax: 0 };
  const preTax = total / (1 + taxRate / 100);
  return {
    total: Math.round(total * 100) / 100,
    preTax: Math.round(preTax * 100) / 100,
    tax: Math.round((total - preTax) * 100) / 100,
  };
}

export function normalizePartOrderUrl(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return /^(https?:)?\/\//i.test(raw) ? raw.replace(/^\/\//, 'https://') : `https://${raw}`;
}

export function derivePartVendorFromUrl(value: unknown): string {
  const url = normalizePartOrderUrl(value);
  if (!url) return '';
  try {
    const host = new URL(url).hostname.replace(/^www\./i, '');
    const base = host.split('.')[0] || '';
    const cleaned = base.replace(/[^a-z0-9]+/gi, ' ').trim();
    if (!cleaned) return '';
    return cleaned
      .split(/\s+/)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ');
  } catch {
    return '';
  }
}

export function markedUpPartPrice(cost: unknown, pct: unknown = DEFAULT_PART_MARKUP_PCT): number | undefined {
  const c = Number(cost);
  const p = Number(pct);
  if (!Number.isFinite(c) || c < 0 || !Number.isFinite(p) || p < 0) return undefined;
  return Math.round(c * (1 + p / 100) * 100) / 100;
}

function decodeHtml(value: string): string {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function cleanTitle(value: unknown): string {
  const raw = decodeHtml(String(value || ''));
  if (!raw) return '';
  return raw
    .replace(/\s+[|-]\s+Phone LCD Parts.*$/i, '')
    .replace(/\s+[|-]\s+Wholesale.*$/i, '')
    .replace(/\s+[|-]\s+Parts.*$/i, '')
    .trim();
}

function parseMoney(value: unknown): number | undefined {
  const raw = String(value || '').replace(/,/g, '').trim();
  const match = raw.match(/(?:[$\u20ac\u00a3]\s*)?(\d+(?:\.\d{1,2})?)/);
  if (!match) return undefined;
  const n = Number(match[1]);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : undefined;
}

function findMetaContent(html: string, names: string[]): string {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`<meta\\s+[^>]*(?:property|name)=["']${escaped}["'][^>]*content=["']([^"']+)["'][^>]*>`, 'i');
    const alt = new RegExp(`<meta\\s+[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${escaped}["'][^>]*>`, 'i');
    const match = html.match(re) || html.match(alt);
    if (match?.[1]) return decodeHtml(match[1]);
  }
  return '';
}

function collectJsonLd(html: string): any[] {
  const list: any[] = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html))) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) list.push(...parsed);
      else if (parsed) list.push(parsed);
    } catch {
      // ignore malformed embedded data
    }
  }
  return list;
}

function flattenJsonLd(input: any): any[] {
  if (!input || typeof input !== 'object') return [];
  const out = [input];
  if (Array.isArray(input['@graph'])) {
    for (const child of input['@graph']) out.push(...flattenJsonLd(child));
  }
  return out;
}

export function extractPartMetadataFromHtml(html: string, url: string): PartUrlMetadata {
  const jsonLd = collectJsonLd(html).flatMap(flattenJsonLd);
  const product = jsonLd.find((entry) => {
    const type = entry?.['@type'];
    return String(Array.isArray(type) ? type.join(' ') : type || '').toLowerCase().includes('product');
  });

  const title =
    cleanTitle(product?.name) ||
    cleanTitle(findMetaContent(html, ['og:title', 'twitter:title'])) ||
    cleanTitle(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]);

  const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  const price =
    parseMoney(offer?.price) ||
    parseMoney(findMetaContent(html, ['product:price:amount', 'og:price:amount', 'twitter:data1'])) ||
    parseMoney(html.match(/(?:price|salePrice|regularPrice)["']?\s*[:=]\s*["']?\$?(\d+(?:\.\d{1,2})?)/i)?.[1]);

  return {
    ok: Boolean(title || price),
    url: normalizePartOrderUrl(url),
    title,
    price,
    currency: offer?.priceCurrency || findMetaContent(html, ['product:price:currency']) || 'USD',
    vendor: derivePartVendorFromUrl(url),
  };
}

export async function scrapePartUrl(urlInput: string): Promise<PartUrlMetadata> {
  const url = normalizePartOrderUrl(urlInput);
  if (!url) return { ok: false, error: 'Missing URL.' };
  const api = (window as any).api;
  if (typeof api?.scrapePartUrl === 'function') {
    const result = await api.scrapePartUrl(url);
    if (result?.ok || result?.title || result?.price) return result;
  }
  try {
    const res = await fetch(url, { credentials: 'omit' });
    if (!res.ok) return { ok: false, url, vendor: derivePartVendorFromUrl(url), error: `HTTP ${res.status}` };
    const html = await res.text();
    return extractPartMetadataFromHtml(html, url);
  } catch (error: any) {
    return { ok: false, url, vendor: derivePartVendorFromUrl(url), error: error?.message || 'Could not scrape URL.' };
  }
}
