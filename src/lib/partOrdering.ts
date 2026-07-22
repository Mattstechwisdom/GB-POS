export type PartUrlMetadata = {
  ok: boolean;
  url?: string;
  title?: string;
  price?: number;
  currency?: string;
  vendor?: string;
  description?: string;
  images?: string[];
  specs?: Array<{ name: string; value: string }>;
  conditionOptions?: Array<{ condition: string; price?: number }>;
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
    .replace(/&#x([0-9a-f]+);/gi, (_match, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&#(\d+);/g, (_match, code) => String.fromCodePoint(Number.parseInt(code, 10)))
    .replace(/&nbsp;/gi, ' ')
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

export function normalizePartInventoryTitle(value: unknown): string {
  let title = cleanTitle(value)
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\s*\|\s*/g, ' - ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!title) return '';

  title = title
    .replace(/\biphone\b/gi, 'iPhone')
    .replace(/\bipad\b/gi, 'iPad')
    .replace(/\boled\b/gi, 'OLED')
    .replace(/\blcd\b/gi, 'LCD')
    .replace(/\bsku\b/gi, 'SKU')
    .replace(/\bic\b/gi, 'IC');

  const modelMatch = title.match(/\b(iPhone\s+(?:SE(?:\s+\d(?:st|nd|rd|th)\s+Gen)?|\d{1,2}(?:\s+(?:Pro\s+Max|Pro|Plus|Mini|Air|Max))?))\b/i)
    || title.match(/\b(iPad(?:\s+(?:Pro|Air|Mini))?\s*(?:\d+(?:st|nd|rd|th)?\s+Gen|\d+(?:\.\d+)?(?:-inch)?|\d{4})?)\b/i)
    || title.match(/\b((?:Samsung\s+)?Galaxy\s+[A-Z0-9]+(?:\s+(?:Ultra|Plus|FE))?)\b/i)
    || title.match(/\b(Google\s+Pixel\s+\d+[A-Za-z]?(?:\s+Pro)?)\b/i);
  if (!modelMatch) return title.replace(/\s*-\s*-+/g, ' - ').trim();

  const model = modelMatch[1]
    .replace(/^iphone/i, 'iPhone')
    .replace(/^ipad/i, 'iPad')
    .replace(/^google pixel/i, 'Google Pixel')
    .replace(/^samsung galaxy/i, 'Samsung Galaxy')
    .replace(/^galaxy/i, 'Galaxy');

  const partPatterns: Array<[RegExp, string]> = [
    [/\b(?:soft\s+)?OLED(?:\s+(?:display|screen))?\s+assembly\b/i, 'OLED Assembly'],
    [/\bLCD(?:\s*\/\s*digitizer|\s+digitizer)?(?:\s+(?:display|screen))?\s+assembly\b/i, 'LCD/Digitizer Assembly'],
    [/\bdigitizer(?:\s+(?:screen|glass))?\s+assembly\b/i, 'Digitizer Assembly'],
    [/\bcharging\s+port(?:\s+(?:assembly|flex))?\b/i, 'Charging Port Assembly'],
    [/\bbattery(?:\s+replacement)?\b/i, 'Battery'],
    [/\bback\s+glass(?:\s+replacement)?\b/i, 'Back Glass'],
    [/\bfront\s+camera(?:\s+assembly)?\b/i, 'Front Camera Assembly'],
    [/\brear\s+camera(?:\s+assembly)?\b/i, 'Rear Camera Assembly'],
    [/\bpower\s+supply(?:\s+unit)?\b/i, 'Power Supply'],
    [/\b(?:display|screen)\s+assembly\b/i, 'Screen Assembly'],
  ];
  const part = partPatterns.find(([pattern]) => pattern.test(title));
  if (!part) return title;

  const [, partName] = part;
  let details = title
    .replace(modelMatch[0], ' ')
    .replace(part[0], ' ')
    .replace(/\b(?:replacement|replacement part)\b/gi, ' ')
    .replace(/\bfor\b/gi, ' ')
    .replace(/^[\s,;:/|\-()]+|[\s,;:/|\-()]+$/g, '')
    .replace(/[\s,;:/|\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (details.toLowerCase() === partName.toLowerCase()) details = '';
  return `${model} ${partName}${details ? ` - ${details}` : ''}`.trim();
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

function absoluteHttpUrl(value: unknown, pageUrl: string): string {
  const raw = decodeHtml(String(value || '')).trim();
  if (!raw) return '';
  try {
    const resolved = new URL(raw, pageUrl);
    return /^https?:$/i.test(resolved.protocol) ? resolved.toString() : '';
  } catch {
    return '';
  }
}

function uniqueImages(values: unknown[], pageUrl: string): string[] {
  const output: string[] = [];
  for (const value of values.flat(Infinity)) {
    const url = absoluteHttpUrl(value, pageUrl);
    if (url && !output.includes(url)) output.push(url);
    if (output.length === 3) break;
  }
  return output;
}

function productImageCandidates(html: string): string[] {
  const output: string[] = [];
  const imagePattern = /<img\b[^>]*(?:data-zoom-image|data-large-image|data-src|src)=["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = imagePattern.exec(html)) && output.length < 24) {
    const tag = match[0];
    const value = match[1];
    if (/logo|icon|sprite|badge|payment|avatar|placeholder|spinner/i.test(`${tag} ${value}`)) continue;
    if (/product|catalog|media|gallery|image|cdn/i.test(`${tag} ${value}`)) output.push(value);
  }
  return output;
}

function stripHtml(value: unknown): string {
  return decodeHtml(String(value || '').replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));
}

function productSpecs(product: any, html: string): Array<{ name: string; value: string }> {
  const properties = Array.isArray(product?.additionalProperty) ? product.additionalProperty : [];
  const structured = properties
    .map((entry: any) => ({
      name: decodeHtml(String(entry?.name || entry?.propertyID || '')),
      value: decodeHtml(String(entry?.value || '')),
    }))
    .filter((entry: any) => entry.name && entry.value);
  const tableSpecs: Array<{ name: string; value: string }> = [];
  const rowPattern = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let row: RegExpExecArray | null;
  while ((row = rowPattern.exec(html)) && tableSpecs.length < 20) {
    const cells = [...row[1].matchAll(/<t[hd]\b[^>]*>([\s\S]*?)<\/t[hd]>/gi)].map((cell) => stripHtml(cell[1]));
    if (cells.length >= 2 && cells[0] && cells[1] && cells[0].length <= 80 && cells[1].length <= 240) {
      tableSpecs.push({ name: cells[0], value: cells[1] });
    }
  }
  const combined = [...structured, ...tableSpecs];
  return combined
    .filter((entry, index) => combined.findIndex((candidate) => candidate.name.toLowerCase() === entry.name.toLowerCase()) === index)
    .slice(0, 20);
}

export function extractPartMetadataFromHtml(html: string, url: string): PartUrlMetadata {
  const jsonLd = collectJsonLd(html).flatMap(flattenJsonLd);
  const product = jsonLd.find((entry) => {
    const type = entry?.['@type'];
    return String(Array.isArray(type) ? type.join(' ') : type || '').toLowerCase().includes('product');
  });

  const title = normalizePartInventoryTitle(
    cleanTitle(product?.name) ||
    cleanTitle(findMetaContent(html, ['og:title', 'twitter:title'])) ||
    cleanTitle(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1])
  );

  const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
  const price =
    parseMoney(offer?.price) ||
    parseMoney(findMetaContent(html, ['product:price:amount', 'og:price:amount', 'twitter:data1'])) ||
    parseMoney(html.match(/(?:price|salePrice|regularPrice)["']?\s*[:=]\s*["']?\$?(\d+(?:\.\d{1,2})?)/i)?.[1]);

  const description = decodeHtml(
    product?.description || findMetaContent(html, ['og:description', 'twitter:description', 'description'])
  );
  const images = uniqueImages([
    product?.image,
    findMetaContent(html, ['og:image', 'twitter:image']),
    productImageCandidates(html),
  ], url);
  const specs = productSpecs(product, html);

  return {
    ok: Boolean(title || price || description || images.length),
    url: normalizePartOrderUrl(url),
    title,
    price,
    currency: offer?.priceCurrency || findMetaContent(html, ['product:price:currency']) || 'USD',
    vendor: derivePartVendorFromUrl(url),
    description: description || undefined,
    images,
    specs,
  };
}

function cleanReaderTitle(value: unknown): string {
  return decodeHtml(String(value || ''))
    .replace(/\s*\|\s*[^|]+$/g, '')
    .replace(/\s+Refurbished$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function extractPartMetadataFromReader(markdown: string, url: string): PartUrlMetadata {
  const lines = String(markdown || '').split(/\r?\n/).slice(0, 12_000);
  let title = '';
  let price: number | undefined;
  let currency = 'USD';
  let titleLine = -1;
  const imageValues: string[] = [];
  const imageCandidates: Array<{ url: string; alt: string }> = [];
  const conditionPrices: Array<{ condition: string; price?: number }> = [];
  const storagePrices: Array<{ value: string; price?: number }> = [];
  const colorPrices: Array<{ value: string; price?: number }> = [];
  const batteryPrices: Array<{ value: string; price?: number }> = [];
  const processorPrices: Array<{ value: string; price?: number }> = [];
  const memoryPrices: Array<{ value: string; price?: number }> = [];
  const pageSpecs = new Map<string, string>();
  const imageAltText: string[] = [];
  let optionSection: 'condition' | 'battery' | 'storage' | 'color' | 'processor' | 'memory' | '' = '';
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex];
    const trimmed = line.trim();
    if (!title && /^Title:\s*/i.test(trimmed)) { title = cleanReaderTitle(trimmed.replace(/^Title:\s*/i, '')); titleLine = lineIndex; }
    if (!title && /^#\s+/.test(trimmed)) { title = cleanReaderTitle(trimmed.replace(/^#\s+/, '')); titleLine = lineIndex; }
    if (price === undefined) {
      const priceMatch = trimmed.match(/\$([\d,]+(?:\.\d{1,2})?)\s+before trade-in/i)
        || trimmed.match(/(?:Refurbished price|Current price|Sale price|Our price|Price|Now)\s*:?\s*([$€£]\s*[\d,]+(?:\.\d{1,2})?)/i)
        || (titleLine >= 0 && lineIndex - titleLine <= 220 && !/~~|\b(?:new|list|retail|was|save|shipping|delivery|trade-in|per month)\b|\/mo\b/i.test(trimmed)
          ? trimmed.match(/^\s*(?:[-*]\s*)?([$€£]\s*[\d,]+(?:\.\d{1,2})?)\s*$/i)
          : null);
      if (priceMatch?.[1]) {
        price = parseMoney(priceMatch[1]);
        const symbol = priceMatch[1].trim()[0];
        if (symbol === '€') currency = 'EUR';
        else if (symbol === '£') currency = 'GBP';
      }
    }
    if (imageValues.length < 240 && trimmed.includes('![')) {
      const open = trimmed.indexOf('](');
      const close = open >= 0 ? trimmed.indexOf(')', open + 2) : -1;
      const candidate = close > open ? decodeHtml(trimmed.slice(open + 2, close)) : '';
      const altClose = trimmed.indexOf(']');
      const alt = altClose > 2 ? cleanReaderTitle(trimmed.slice(trimmed.indexOf('![') + 2, altClose)) : '';
      if (alt) imageAltText.push(alt);
      if (/^https?:\/\//i.test(candidate)
        && !/\.svg(?:\?|$)/i.test(candidate)
        && !/logo|icon|flag|payment|review-attachment|trade-in|picker|placeholder|used-vs-verified/i.test(`${candidate} ${alt}`)) {
        imageValues.push(candidate);
        imageCandidates.push({ url: candidate, alt });
      }
    }
    if (/Compare conditions/i.test(trimmed)) optionSection = 'condition';
    else if (/Select a battery option/i.test(trimmed)) optionSection = 'battery';
    else if (/Select (?:the )?processor/i.test(trimmed)) optionSection = 'processor';
    else if (/Select storage/i.test(trimmed)) optionSection = 'storage';
    else if (/Select memory/i.test(trimmed)) optionSection = 'memory';
    else if (/Select (?:the )?color/i.test(trimmed)) optionSection = 'color';
    const pricedOption = trimmed.match(/^\*\s+([^$!][^$]*?)\s+\$([\d,]+(?:\.\d{1,2})?)/);
    if (pricedOption) {
      const value = cleanReaderTitle(pricedOption[1]);
      const optionPrice = parseMoney(pricedOption[2]);
      if (optionSection === 'storage') storagePrices.push({ value, price: optionPrice });
      else if (optionSection === 'color') colorPrices.push({ value, price: optionPrice });
      else if (optionSection === 'battery') batteryPrices.push({ value, price: optionPrice });
      else if (optionSection === 'processor') processorPrices.push({ value, price: optionPrice });
      else if (optionSection === 'memory') memoryPrices.push({ value, price: optionPrice });
    }
    if (optionSection === 'condition') {
      const conditionMatch = trimmed.match(/\b(Fair|Good|Excellent|Premium|Like New|New)\s+\$([\d,]+(?:\.\d{1,2})?)/i);
      if (conditionMatch) conditionPrices.push({ condition: cleanReaderTitle(conditionMatch[1]), price: parseMoney(conditionMatch[2]) });
    }
    const specPatterns: Array<[RegExp, string]> = [
      [/^Processor\s+(?!Core\s+\d+\s*$)(.+)$/i, 'Processor'],
      [/^Processor generation\s+(.+)$/i, 'Processor Generation'],
      [/^Memory \(GB\)\s*(.+)$/i, 'Memory'],
      [/^(?:SSD )?Storage (?:Capacity )?\(GB\)\s*(.+)$/i, 'Storage'],
      [/^Storage \(GB\)\s*(.+)$/i, 'Storage'],
      [/^Screen size\s+(.+)$/i, 'Screen Size'],
      [/^Display size\s+(.+)$/i, 'Display Size'],
      [/^Resolution\s+(.+)$/i, 'Resolution'],
      [/^Refresh rate\s+(.+)$/i, 'Refresh Rate'],
      [/^(?:Display|Panel|Screen) (?:technology|type)\s+(.+)$/i, 'Display Technology'],
      [/^(?:HDR|High Dynamic Range)\s+(.+)$/i, 'HDR'],
      [/^OS\s+(.+)$/i, 'Operating System'],
      [/^Operating system\s+(.+)$/i, 'Operating System'],
      [/^Graphic(?:s| card)(?: Card Type)?\s+(.+)$/i, 'Graphics'],
      [/^Color\s+(.+)$/i, 'Color'],
      [/^Carrier\s+(.+)$/i, 'Carrier'],
      [/^(?:Network|Connectivity|Wireless)\s+(.+)$/i, 'Connectivity'],
      [/^(?:Ports|Inputs|Ports \/ Inputs)\s+(.+)$/i, 'Ports'],
      [/^(?:Included accessories|Accessories included|Accessories)\s+(.+)$/i, 'Accessories'],
      [/^Camera type\s+(.+)$/i, 'Camera Type'],
      [/^(?:Sensor|Sensor type)\s+(.+)$/i, 'Sensor'],
      [/^(?:Lens mount|Mount type)\s+(.+)$/i, 'Lens Mount'],
      [/^(?:Video|Video recording|Video resolution)\s+(.+)$/i, 'Video'],
      [/^Flight time\s+(.+)$/i, 'Flight Time'],
      [/^(?:Maximum range|Max range)\s+(.+)$/i, 'Maximum Range'],
      [/^(?:Maximum speed|Max speed)\s+(.+)$/i, 'Maximum Speed'],
      [/^Weight\s+(.+)$/i, 'Weight'],
      [/^Battery capacity\s+(.+)$/i, 'Battery Capacity'],
      [/^Battery cycles?\s+(.+)$/i, 'Battery Cycles'],
      [/^(?:Controller|Remote control)\s+(.+)$/i, 'Controller'],
      [/^Obstacle avoidance\s+(.+)$/i, 'Obstacle Avoidance'],
      [/^GPS\s+(.+)$/i, 'GPS'],
    ];
    for (const [pattern, name] of specPatterns) {
      const match = trimmed.match(pattern);
      if (match?.[1] && !pageSpecs.has(name)) pageSpecs.set(name, cleanReaderTitle(match[1]));
    }
    const markdownTableSpec = trimmed.match(/^\|\s*([^|]{1,60}?)\s*\|\s*([^|]{1,240}?)\s*\|?$/);
    const markdownLabelSpec = trimmed.match(/^(?:[-*]\s*)?(?:\*\*)?([A-Za-z][A-Za-z0-9 /()+&.-]{1,58}?)(?:\*\*)?\s*:\s*(.{1,240})$/);
    const genericSpec = markdownTableSpec || markdownLabelSpec;
    if (genericSpec?.[1] && genericSpec?.[2]) {
      const name = cleanReaderTitle(genericSpec[1]);
      const value = cleanReaderTitle(genericSpec[2].replace(/\*\*/g, ''));
      if (!/^[-:]+$/.test(value) && !/^(?:price|sale price|our price|quantity)$/i.test(name) && !pageSpecs.has(name)) {
        pageSpecs.set(name, value);
      }
    }
  }
  const titleTokens = title.toLowerCase().match(/[a-z]+\d+[a-z]*|[a-z]{4,}|\d{1,3}/g)?.filter((token) => !['refurbished', 'backmarket', 'market'].includes(token)) || [];
  const distinctiveTitleTokens = titleTokens.filter((token) => token.length >= 5 && !['series', 'edition', 'unlocked'].includes(token));
  const relevantImages = imageCandidates
    .map((candidate) => ({ ...candidate, score: titleTokens.filter((token) => candidate.alt.toLowerCase().includes(token)).length }))
    .filter((candidate) => candidate.score >= 2 || (candidate.score >= 1 && (
      titleTokens.some((token) => /\d/.test(token) && candidate.alt.toLowerCase().includes(token))
      || distinctiveTitleTokens.some((token) => candidate.alt.toLowerCase().includes(token))
    )))
    .sort((a, b) => b.score - a.score)
    .map((candidate) => candidate.url);
  const images = uniqueImages(relevantImages.length ? relevantImages : imageValues, url);
  let configValues: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const amount = parseMoney(lines[index].match(/\$([\d,]+(?:\.\d{1,2})?)\s+before trade-in/i)?.[1]);
    if (amount === undefined || (price !== undefined && Math.abs(amount - price) >= 0.005)) continue;
    const values: string[] = [];
    let blankLines = 0;
    for (let cursor = index - 1; cursor >= 0 && cursor >= index - 12; cursor -= 1) {
      const previous = lines[cursor].trim();
      if (!previous) { blankLines += 1; if (blankLines > 2 && values.length) break; continue; }
      if (!/^\*\s+/.test(previous)) { if (values.length) break; continue; }
      values.unshift(cleanReaderTitle(previous.replace(/^\*\s+/, '')));
    }
    if (values.length >= 2) { configValues = values; break; }
  }
  const pricedCondition = typeof price === 'number'
    ? conditionPrices.find((option) => typeof option.price === 'number' && Math.abs(option.price - price) < 0.005)?.condition
    : '';
  const condition = pricedCondition || configValues.find((value) => /^(?:Fair|Good|Excellent|Premium|Like New|New)$/i.test(value)) || '';
  const samePrice = (option: { price?: number }) => typeof price === 'number' && typeof option.price === 'number' && Math.abs(option.price - price) < 0.005;
  const storageFromPrice = storagePrices.find(samePrice)?.value || '';
  const processor = processorPrices.find(samePrice)?.value || configValues.find((value) => /\b(?:Core|Ryzen|Celeron|Pentium|Apple M\d)\b/i.test(value)) || pageSpecs.get('Processor') || '';
  const memory = memoryPrices.find(samePrice)?.value || [...configValues].reverse().find((value) => /^\d+(?:\.\d+)?\s*(?:GB|TB)$/i.test(value) && value !== storageFromPrice) || pageSpecs.get('Memory') || '';
  const matchingColors = colorPrices.filter(samePrice);
  const imageText = imageAltText.slice(0, 12).join(' ');
  const colorFromPrice = matchingColors.find((option) => imageText.toLowerCase().includes(option.value.toLowerCase()))?.value
    || matchingColors[0]?.value || '';
  const storage = configValues.find((value) => /^\d+(?:\.\d+)?\s*(?:GB|TB)$/i.test(value)) || storageFromPrice;
  const color = configValues.find((value) => /\b(?:Black|Blue|Natural|White|Gold|Silver|Gray|Grey|Green|Red|Purple|Pink|Titanium)\b/i.test(value)) || colorFromPrice;
  const carrier = /\bunlocked\b/i.test(`${title} ${lines.slice(0, 600).join(' ')}`) ? 'Unlocked' : '';
  const connectivity = configValues.find((value) => /wi[-\u2010-\u2015 ]?fi|\b5g\b|\blte\b/i.test(value))
    || pageSpecs.get('Connectivity') || '';
  const battery = configValues.find((value) => /battery/i.test(value)) || batteryPrices.find(samePrice)?.value || '';
  const specs = [
    processor && { name: 'Processor', value: processor },
    memory && { name: 'Memory', value: memory },
    storage && { name: 'Storage', value: storage },
    color && { name: 'Color', value: color },
    carrier && { name: 'Carrier', value: carrier },
    connectivity && { name: 'Connectivity', value: connectivity },
    condition && { name: 'Condition', value: condition },
    battery && { name: 'Battery', value: battery },
    ...[...pageSpecs.entries()].filter(([name]) => !['Processor', 'Memory', 'Storage', 'Color'].includes(name)).map(([name, value]) => ({ name, value })),
  ].filter(Boolean) as Array<{ name: string; value: string }>;
  const descriptionParts = [
    title,
    condition && `${condition} refurbished condition`,
    storage,
    color,
    carrier,
    battery,
  ].filter(Boolean);
  return {
    ok: Boolean(title || price || images.length || specs.length),
    url: normalizePartOrderUrl(url),
    title,
    price,
    currency,
    vendor: derivePartVendorFromUrl(url),
    description: descriptionParts.length ? `${descriptionParts.join(', ')}. Product-page values can change by selected configuration; review all editable quote fields before saving.` : undefined,
    images,
    specs,
    conditionOptions: conditionPrices,
  };
}

async function fetchProductSourceFallback(url: string): Promise<PartUrlMetadata | null> {
  if (typeof window === 'undefined' || !/^https?:$/i.test(window.location.protocol)) return null;
  try {
    const { supabase } = await import('./supabase');
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    const response = await fetch('/api/product-source', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(25_000),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body?.ok || !body?.source) return null;
    return extractPartMetadataFromReader(String(body.source), url);
  } catch {
    return null;
  }
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
    const res = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(6_000) });
    if (res.ok) {
      const metadata = extractPartMetadataFromHtml(await res.text(), url);
      if (metadata.ok) return metadata;
    }
  } catch (error: any) {
    // Cross-origin and bot-protected pages continue through the authenticated fallback.
  }
  const fallback = await fetchProductSourceFallback(url);
  if (fallback?.ok) return fallback;
  return { ok: false, url, vendor: derivePartVendorFromUrl(url), error: 'This product page blocked both the direct reader and fallback reader.' };
}
