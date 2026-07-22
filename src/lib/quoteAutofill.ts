import type { PartUrlMetadata } from './partOrdering';
import { deviceTypes } from './deviceTypes';

export type QuoteAutofillDraft = {
  deviceType: string;
  brand?: string;
  model?: string;
  condition?: string;
  dynamic: Record<string, any>;
  description: string;
};

function clean(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sourceText(metadata: PartUrlMetadata): string {
  return [
    metadata.title,
    metadata.description,
    ...(metadata.specs || []).flatMap((spec) => [spec.name, spec.value]),
  ].map(clean).filter(Boolean).join(' | ');
}

function firstMatch(text: string, patterns: RegExp[]): string {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return clean(match[1]);
  }
  return '';
}

function detectBrand(text: string): string {
  const brands: Array<[RegExp, string]> = [
    [/\bapple\b|\biphone\b|\bipad\b|\bmacbook\b|\bimac\b|\bairpods?\b|\bhomepod\b/i, 'Apple'],
    [/\bsamsung\b|\bgalaxy\b/i, 'Samsung'], [/\bgoogle\b|\bpixel\b/i, 'Google'],
    [/\bmotorola\b|\bmoto\b/i, 'Motorola'], [/\boneplus\b/i, 'OnePlus'],
    [/\bsony\b|\bplaystation\b|\bps[345]\b/i, 'Sony'], [/\bmicrosoft\b|\bxbox\b|\bsurface\b/i, 'Microsoft'],
    [/\bnintendo\b|\bswitch\b/i, 'Nintendo'], [/\bdell\b|\balienware\b/i, 'Dell'],
    [/\bhp\b|\bhewlett[ -]packard\b|\bomen\b/i, 'HP'], [/\blenovo\b|\bthinkpad\b|\blegion\b/i, 'Lenovo'],
    [/\basus\b|\brog\b/i, 'ASUS'], [/\bacer\b|\bpredator\b/i, 'Acer'], [/\bmsi\b/i, 'MSI'],
    [/\blg\b/i, 'LG'], [/\btcl\b/i, 'TCL'], [/\bhisense\b/i, 'Hisense'], [/\bvizio\b/i, 'Vizio'],
    [/\bcanon\b/i, 'Canon'], [/\bnikon\b/i, 'Nikon'], [/\bfujifilm\b/i, 'Fujifilm'],
    [/\bgopro\b/i, 'GoPro'], [/\bdji\b/i, 'DJI'],
  ];
  return brands.find(([pattern]) => pattern.test(text))?.[1] || '';
}

function detectAppleFamily(text: string): string {
  const families: Array<[RegExp, string]> = [
    [/\biphone\b/i, 'iPhone'], [/\bipad\s+pro\b/i, 'iPad Pro'], [/\bipad\s+air\b/i, 'iPad Air'],
    [/\bipad\s+mini\b/i, 'iPad mini'], [/\bipad\b/i, 'iPad'], [/\bmacbook\s+pro\b/i, 'MacBook Pro'],
    [/\bmacbook\s+air\b/i, 'MacBook Air'], [/\bmacbook\b/i, 'MacBook'], [/\bmac\s+studio\b/i, 'Mac Studio'],
    [/\bmac\s+mini\b/i, 'Mac mini'], [/\bmac\s+pro\b/i, 'Mac Pro'], [/\bimac\b/i, 'iMac'],
    [/\bapple\s+watch\b/i, 'Apple Watch'], [/\bairpods\s+max\b/i, 'AirPods Max'],
    [/\bairpods\s+pro\b/i, 'AirPods Pro'], [/\bairpods?\b/i, 'AirPods'], [/\bapple\s+tv\b/i, 'Apple TV'],
    [/\bhomepod\b/i, 'HomePod'],
  ];
  return families.find(([pattern]) => pattern.test(text))?.[1] || '';
}

function detectDeviceType(text: string, title: string): { deviceType: string; appleFamily?: string } {
  const appleFamily = detectAppleFamily(text);
  if (appleFamily) return { deviceType: 'Apple Devices', appleFamily };
  if (/^switch(?:\s+(?:oled|lite))?\b/i.test(clean(title))) return { deviceType: 'Console' };
  if (/\b(drone|quadcopter|dji\s+(?:mavic|mini|air|avata|phantom|inspire))\b/i.test(text)) return { deviceType: 'Drone' };
  if (/\b(dslr|mirrorless|digital camera|action camera|camera body|gopro|insta360)\b/i.test(text)) return { deviceType: 'Camera' };
  if (/\b(playstation|ps[345]|xbox|nintendo switch|game console|steam deck|rog ally|legion go)\b/i.test(text)) return { deviceType: 'Console' };
  if (/\b(oled tv|qled tv|smart tv|television|\d{2,3}[ -]?inch tv)\b/i.test(text)) return { deviceType: 'TV' };
  if (/\b(gaming laptop|gaming notebook|notebook).*\b(rtx|gtx|radeon|geforce)\b|\b(rtx|gtx|radeon|geforce).*\b(laptop|notebook)\b/i.test(text)) return { deviceType: 'Gaming Laptop' };
  if (/\b(laptop|notebook|chromebook|ultrabook|thinkpad|ideapad|latitude|elitebook|probook|vivobook|zenbook|surface laptop)\b/i.test(text)) return { deviceType: 'Laptop' };
  if (/\b(desktop computer|desktop pc|gaming desktop|workstation|mini pc|all[ -]in[ -]one|computer tower|optiplex|thinkcentre|prodesk|precision tower)\b/i.test(text)) return { deviceType: 'Desktop Computer' };
  if (/\b(tablet|galaxy tab|surface pro|fire hd|kindle fire)\b/i.test(text)) return { deviceType: 'Tablet' };
  if (/\b(smartphone|cell phone|mobile phone|galaxy (?:[as]\d+|z\d*\s*(?:fold|flip)?|note\s*\d+)|pixel \d+|moto g|oneplus|xiaomi|redmi|huawei|nokia)\b/i.test(text)) return { deviceType: 'Phone' };
  if (/\b(headphones?|headset|earbuds?|speaker|soundbar|microphone)\b/i.test(text)) return { deviceType: 'Audio' };
  return { deviceType: 'Other' };
}

function detectCondition(text: string): string {
  if (/\bcertified refurbished\b|\bmanufacturer refurbished\b/i.test(text)) return 'Excellent';
  if (/\bopen[ -]box\b|\blike new\b/i.test(text)) return 'Like New';
  if (/\bfor parts\b|\bparts only\b|\bnon[ -]working\b/i.test(text)) return 'For Parts';
  if (/\bpre[ -]owned\b|\bused\b/i.test(text)) return 'Good';
  if (/\bbrand new\b|\bnew condition\b|\bcondition:\s*new\b/i.test(text)) return 'New';
  return '';
}

function canonicalSpecKey(name: string): string {
  const value = clean(name).toLowerCase();
  if (/^(ram|memory|system memory)/.test(value)) return 'ram';
  if (/processor generation|cpu generation/.test(value)) return 'cpuGen';
  if (/processor|^cpu$/.test(value)) return 'cpu';
  if (/graphics.*brand|gpu.*brand/.test(value)) return 'gpuBrand';
  if (/vram|video memory|graphics memory/.test(value)) return 'gpuVram';
  if (/graphics|^gpu$|video card/.test(value)) return 'gpuModel';
  if (/storage|capacity|hard drive|ssd/.test(value)) return 'storage';
  if (/screen size|display size|diagonal/.test(value)) return 'screenSize';
  if (/resolution/.test(value)) return 'resolution';
  if (/display technology|display type|panel technology/.test(value)) return 'displayTech';
  if (/refresh rate/.test(value)) return 'refreshRate';
  if (/\bhdr\b|high dynamic range/.test(value)) return 'hdr';
  if (/operating system|^os$/.test(value)) return 'os';
  if (/color|colour/.test(value)) return 'color';
  if (/carrier|network/.test(value)) return 'carrier';
  if (/battery capacity/.test(value)) return 'batteryCapacity';
  if (/battery cycles?/.test(value)) return 'batteryCycles';
  if (/batteries included|included batteries/.test(value)) return 'batteriesIncluded';
  if (/battery/.test(value)) return 'battery';
  if (/connectivity|wireless/.test(value)) return 'connectivity';
  if (/ports?|inputs?/.test(value)) return 'ports';
  if (/accessories|included/.test(value)) return 'accessories';
  if (/edition/.test(value)) return 'edition';
  if (/camera type/.test(value)) return 'cameraType';
  if (/sensor/.test(value)) return 'sensor';
  if (/lens mount|mount type/.test(value)) return 'mount';
  if (/video(?: resolution| recording| quality)?/.test(value)) return 'video';
  if (/camera/.test(value)) return 'camera';
  if (/flight time/.test(value)) return 'flightTime';
  if (/maximum range|max range/.test(value)) return 'range';
  if (/maximum speed|max speed/.test(value)) return 'maxSpeed';
  if (/weight/.test(value)) return 'weight';
  if (/controller|remote control/.test(value)) return 'controller';
  if (/obstacle avoidance/.test(value)) return 'obstacleAvoidance';
  if (/\bgps\b/.test(value)) return 'gps';
  if (/cooling/.test(value)) return 'cooling';
  if (/keyboard/.test(value)) return 'keyboard';
  if (/features?/.test(value)) return 'features';
  if (/year|model year|release year/.test(value)) return 'yearModel';
  return '';
}

const APPLE_SCHEMA_TYPES: Record<string, string> = {
  iPhone: 'Phone', iPad: 'Tablet', 'iPad Air': 'Tablet', 'iPad Pro': 'Tablet', 'iPad mini': 'Tablet',
  MacBook: 'Laptop', 'MacBook Air': 'Laptop', 'MacBook Pro': 'Laptop', iMac: 'Laptop',
  'Mac mini': 'Desktop Computer', 'Mac Studio': 'Desktop Computer', 'Mac Pro': 'Desktop Computer',
  'Apple Watch': 'Audio', AirPods: 'Audio', 'AirPods Pro': 'Audio', 'AirPods Max': 'Audio', HomePod: 'Audio',
};

function schemaType(deviceType: string, appleFamily?: string): string {
  return deviceType === 'Apple Devices' && appleFamily ? APPLE_SCHEMA_TYPES[appleFamily] || 'Apple Devices' : deviceType;
}

function keepSchemaFields(dynamic: Record<string, any>, deviceType: string, appleFamily?: string) {
  if (deviceType === 'Other') return dynamic;
  const definition = deviceTypes.find((entry) => entry.type === schemaType(deviceType, appleFamily));
  if (!definition) return dynamic;
  const allowed = new Set(definition.fields.map((field) => field.key));
  if (deviceType === 'Apple Devices') allowed.add('device');
  for (const key of Object.keys(dynamic)) {
    if (!key.startsWith('_') && !allowed.has(key)) delete dynamic[key];
  }
  return dynamic;
}

function normalizeStorage(value: unknown): string {
  const normalized = clean(value);
  const match = normalized.match(/\b(\d+(?:\.\d+)?)\s*(GB|TB)\b/i);
  return match ? `${match[1]} ${match[2].toUpperCase()}` : normalized;
}

function normalizeScreenSize(value: unknown): string {
  const normalized = clean(value)
    .replace(/^\(?\s*inches?\s*\)?\s*/i, '')
    .replace(/\s*(?:-?inches?|\")\s*$/i, '');
  const match = normalized.match(/^(\d{1,3}(?:\.\d+)?)$/);
  return match ? `${match[1]}"` : clean(value);
}

function normalizeCarrier(value: unknown): string {
  const carrier = clean(value);
  const known: Array<[RegExp, string]> = [
    [/^unlocked$/i, 'Unlocked'], [/^at&t$/i, 'AT&T'], [/^t-mobile$/i, 'T-Mobile'],
    [/^verizon$/i, 'Verizon'], [/^sprint$/i, 'Sprint'], [/^boost(?: mobile)?$/i, 'Boost'],
    [/^metro(?: by t-mobile)?$/i, 'Metro'], [/^xfinity(?: mobile)?$/i, 'Xfinity'],
  ];
  return known.find(([pattern]) => pattern.test(carrier))?.[1] || carrier;
}

function cleanModelTitle(value: unknown): string {
  return clean(value)
    .replace(/\s*[•|]\s*(?:Unlocked|Locked\b.*|AT&T|T-Mobile|Verizon).*$/i, '')
    .replace(/\s+\d+(?:\.\d+)?\s*(?:GB|TB)\b.*$/i, '')
    .replace(/\s+Refurbished$/i, '')
    .trim();
}

function detectModel(text: string, title: unknown, deviceType: string, appleFamily?: string): string {
  if (deviceType === 'Apple Devices' && appleFamily === 'iPhone') {
    return firstMatch(text, [
      /\b(iPhone\s+(?:SE(?:\s*\(?\d(?:st|nd|rd|th)\s+Gen\)?)?|\d{1,2}(?:\s+(?:Pro\s+Max|Pro|Plus|mini|Air|Max))?))\b/i,
    ]).replace(/\bmini\b/i, 'mini');
  }
  if (deviceType === 'Phone') return cleanModelTitle(title);
  return '';
}

function inferredSpecs(metadata: PartUrlMetadata, text: string): Record<string, any> {
  const dynamic: Record<string, any> = {};
  for (const spec of metadata.specs || []) {
    const key = canonicalSpecKey(spec.name);
    const value = clean(spec.value);
    if (key && value && !dynamic[key]) dynamic[key] = value;
  }
  dynamic.storage ||= firstMatch(text, [/\b(\d+(?:\.\d+)?\s*(?:GB|TB))\s+(?:SSD|storage|capacity)\b/i, /\b(\d+(?:\.\d+)?\s*(?:GB|TB))\b/i]);
  if (dynamic.storage) dynamic.storage = normalizeStorage(dynamic.storage);
  dynamic.ram ||= firstMatch(text, [/\b(\d+\s*GB)\s+(?:DDR\d\s+)?(?:RAM|memory)\b/i, /\bRAM\s*[:\-]?\s*(\d+\s*GB)\b/i]);
  dynamic.refreshRate ||= firstMatch(text, [/\b(\d{2,3}\s*Hz)\b/i]);
  dynamic.screenSize ||= firstMatch(text, [/\b(\d{1,3}(?:\.\d+)?[ -]?(?:inch|\"))\s+(?:display|screen|TV)\b/i]);
  if (dynamic.screenSize) dynamic.screenSize = normalizeScreenSize(dynamic.screenSize);
  dynamic.color ||= firstMatch(text, [/\b(?:color|colour)\s*[:\-]\s*([A-Za-z][A-Za-z ]{1,30})/i]);
  dynamic.carrier ||= firstMatch(text, [/\b(Unlocked|AT&T|T-Mobile|Verizon|Sprint|Boost(?: Mobile)?|Metro(?: by T-Mobile)?|Xfinity(?: Mobile)?)\b/i]);
  if (dynamic.carrier) dynamic.carrier = normalizeCarrier(dynamic.carrier);
  dynamic.battery ||= firstMatch(text, [/\b(Standard battery|New battery)\b/i]);
  dynamic.os ||= firstMatch(text, [/\b(Windows\s+(?:10|11)(?:\s+(?:Home|Pro))?|macOS\s+[A-Za-z0-9. ]+|iPadOS\s*[0-9.]*|Android\s*[0-9.]*)\b/i]);
  if (dynamic.ram) dynamic.ram = normalizeStorage(dynamic.ram);
  if (dynamic.cpu) {
    const cpu = clean(dynamic.cpu);
    const generation = firstMatch(cpu, [/\bGen\s*(\d+)(?:\s*\(([^)]+)\))?/i])
      || firstMatch(clean(dynamic.cpuGen), [/\b(\d+)(?:st|nd|rd|th)?\s+Gen\b/i]);
    if (generation) dynamic.cpuGen = `Gen ${generation}${/\(U\)/i.test(cpu) ? ' (U)' : ''}`;
    const intelTier = firstMatch(cpu, [/\bCore\s+(i[3579])\b/i]);
    if (intelTier) dynamic.cpu = `Intel ${intelTier.toLowerCase()}`;
  }
  const gpuText = clean(dynamic.gpuModel);
  if (gpuText && !dynamic.gpuBrand) {
    if (/\b(?:RTX|GTX|GeForce|NVIDIA)\b/i.test(gpuText)) dynamic.gpuBrand = 'NVIDIA';
    else if (/\b(?:Radeon|RX\s*\d|AMD)\b/i.test(gpuText)) dynamic.gpuBrand = 'AMD';
    else if (/\b(?:Intel|Iris|Arc)\b/i.test(gpuText)) dynamic.gpuBrand = 'Intel';
  }
  dynamic.otherSpecs = (metadata.specs || []).map((spec) => ({ desc: clean(spec.name), value: clean(spec.value) })).filter((spec) => spec.desc && spec.value);
  return dynamic;
}

export function buildQuoteAutofillDraft(metadata: PartUrlMetadata, confirmed?: { condition?: string }): QuoteAutofillDraft {
  const text = sourceText(metadata);
  const brand = detectBrand(text);
  const detected = detectDeviceType(text, clean(metadata.title));
  const dynamic = inferredSpecs(metadata, text);
  if (metadata.conditionOptions?.length) dynamic._conditionOptions = metadata.conditionOptions;
  if (detected.appleFamily) dynamic.device = detected.appleFamily;
  const detectedModel = detectModel(text, metadata.title, detected.deviceType, detected.appleFamily);
  if (detected.deviceType === 'Gaming Laptop' && dynamic.screenSize) {
    dynamic.displaySize = dynamic.screenSize;
    delete dynamic.screenSize;
  }
  if (detected.deviceType === 'Gaming Laptop') {
    if (dynamic.storage) {
      dynamic.bootDriveStorage ||= dynamic.storage;
      delete dynamic.storage;
    }
    if (dynamic.resolution) {
      dynamic.displayResolution ||= dynamic.resolution;
      delete dynamic.resolution;
    }
    const storageText = text.toLowerCase();
    if (!dynamic.bootDriveType) {
      if (/\bnvme\b/.test(storageText)) dynamic.bootDriveType = 'M.2 NVMe';
      else if (/\bssd\b/.test(storageText)) dynamic.bootDriveType = 'SATA SSD';
      else if (/\bhdd\b|hard drive/.test(storageText)) dynamic.bootDriveType = 'HDD';
    }
  }
  if (detected.deviceType === 'Laptop') {
    delete dynamic.resolution;
    delete dynamic.gpuModel;
    delete dynamic.otherSpecs;
  }
  if (detected.deviceType === 'Tablet' && dynamic.screenSize) {
    dynamic.size = dynamic.screenSize;
    delete dynamic.screenSize;
  }
  if (detected.deviceType === 'Apple Devices' && /^iPad/i.test(detected.appleFamily || '') && dynamic.screenSize) {
    dynamic.size = dynamic.screenSize;
    delete dynamic.screenSize;
  }
  if (detected.deviceType === 'TV' && brand) dynamic.brand ||= brand;
  if (detected.deviceType === 'TV') {
    dynamic.displayTech ||= firstMatch(text, [/\b(OLED|QLED|Neo QLED|Mini-LED|AMOLED|NanoCell|ULED|LED)\b/i]);
    dynamic.hdr ||= firstMatch(text, [/\b(Dolby Vision|HDR10\+?|HLG)\b/i]);
  }
  if (detected.deviceType === 'Audio') {
    if (/\bearbuds?\b|\bairpods?\b/i.test(text)) dynamic.audioType ||= 'Earbuds';
    else if (/\bheadphones?\b|\bheadset\b/i.test(text)) dynamic.audioType ||= 'Headphones';
    else if (/\bspeaker\b|\bsoundbar\b/i.test(text)) dynamic.audioType ||= 'Speaker';
  }
  if (detected.deviceType === 'Console') {
    const consoleTitle = clean(metadata.title);
    const consoleModel = firstMatch(text, [
      /\b((?:PlayStation\s+[45]|PS[45])(?:\s+(?:Slim|Pro))?|Xbox\s+Series\s+[XS]|Xbox\s+One(?:\s+[XS])?|Nintendo\s+Switch(?:\s+(?:OLED|Lite))?)\b/i,
    ]).replace(/^PlayStation\s+5/i, 'PS5').replace(/^PlayStation\s+4/i, 'PS4');
    dynamic.model ||= consoleModel
      || (/^Switch\s+OLED\b/i.test(consoleTitle) ? 'Switch OLED'
        : /^Switch\s+Lite\b/i.test(consoleTitle) ? 'Switch Lite'
          : /^Switch\b/i.test(consoleTitle) ? 'Nintendo Switch' : '');
    dynamic.edition ||= firstMatch(text, [/\b(Digital|Standard|Limited)\s+Edition\b/i]);
  }
  if (detected.deviceType === 'Camera') {
    if (/\bmirrorless\b/i.test(text)) dynamic.cameraType ||= 'Mirrorless';
    else if (/\bdslr\b/i.test(text)) dynamic.cameraType ||= 'DSLR';
    else if (/\baction camera\b|\bgopro\b/i.test(text)) dynamic.cameraType ||= 'Action';
    else if (/point[ -]and[ -]shoot/i.test(text)) dynamic.cameraType ||= 'Point-and-shoot';
    dynamic.video ||= firstMatch(text, [/\b(8K|5\.4K|4K|1080p)\s+(?:video|recording)\b/i]);
  }
  const suppliedCondition = clean((metadata.specs || []).find((spec) => /condition/i.test(spec.name))?.value);
  const confirmedCondition = clean(confirmed?.condition);
  const condition = confirmedCondition || (metadata.conditionOptions && metadata.conditionOptions.length > 1
    ? ''
    : suppliedCondition || detectCondition(text));
  if (detected.deviceType === 'Phone' && (/\bandroid\b/i.test(text)
    || ['Samsung', 'Google', 'Motorola', 'OnePlus'].includes(brand)
    || /\b(?:xiaomi|redmi|huawei|nokia)\b/i.test(text))) dynamic.os ||= 'Android';
  if (detected.deviceType === 'Tablet') {
    if (/\bandroid\b/i.test(text)) dynamic.os ||= 'Android';
    else if (/\bwindows\b/i.test(text)) dynamic.os ||= 'Windows';
    if (/wi[-\u2010-\u2015 ]?fi\s*\+\s*cellular|\b5g\b|\blte\b/i.test(text)) dynamic.connectivity = 'Wi‑Fi + Cellular';
    else if (/wi[-\u2010-\u2015 ]?fi/i.test(text)) dynamic.connectivity = 'Wi‑Fi';
  }
  if (detected.deviceType === 'Apple Devices' && /^iPad/i.test(detected.appleFamily || '')) {
    dynamic.os ||= 'iPadOS';
    if (/wi[-\u2010-\u2015 ]?fi\s*\+\s*(?:cellular|5g)|\b5g\b|\blte\b/i.test(text)) dynamic.connectivity = 'Wi‑Fi + Cellular';
    else if (/wi[-\u2010-\u2015 ]?fi/i.test(text)) dynamic.connectivity = 'Wi‑Fi';
  }
  if (detected.deviceType === 'Apple Devices' && detected.appleFamily === 'iPhone') {
    dynamic.os ||= 'iOS';
    // The iPhone quote form intentionally has no display-size or arbitrary-spec
    // controls. Keep scraped page metadata from creating fields outside its schema.
    delete dynamic.screenSize;
    delete dynamic.otherSpecs;
  }
  keepSchemaFields(dynamic, detected.deviceType, detected.appleFamily);
  return {
    deviceType: detected.deviceType,
    brand: brand || undefined,
    model: detectedModel || clean(metadata.title) || undefined,
    condition: condition || undefined,
    dynamic,
    description: buildQuoteFallbackSummary(metadata, {
      deviceType: detected.deviceType,
      appleFamily: detected.appleFamily,
      model: detectedModel || clean(metadata.title),
      condition,
      dynamic,
    }),
  };
}

export function buildQuoteFallbackSummary(metadata: PartUrlMetadata, context?: {
  deviceType?: string;
  appleFamily?: string;
  model?: string;
  condition?: string;
  dynamic?: Record<string, any>;
}): string {
  const title = clean(metadata.title) || 'This item';
  const dynamic = context?.dynamic || {};
  if (context?.deviceType === 'Apple Devices' && context.appleFamily === 'iPhone') {
    const model = clean(context.model) || title;
    const storage = clean(dynamic.storage);
    const color = clean(dynamic.color);
    const cellular = clean(dynamic.carrier);
    const condition = clean(context.condition);
    const battery = clean(dynamic.battery);
    const configuration = [storage, color].filter(Boolean).join(' configuration in ');
    const sentences = [
      `${model} delivers the polished Apple smartphone experience in a capable, easy-to-use package.`,
      configuration ? `This quote features the ${configuration}.` : '',
      cellular ? `${cellular === 'Unlocked' ? 'Unlocked cellular support provides flexibility when choosing a compatible carrier.' : `${cellular} cellular service is the confirmed network configuration for this device.`}` : '',
      condition ? `The device is listed in ${condition} condition, so the quoted configuration matches the selected cosmetic grade.` : '',
      battery ? `${battery} is the confirmed battery option for this listing.` : '',
      'The included iOS experience keeps everyday communication, apps, photos, and device management working together in one familiar interface.',
      `All configuration details remain editable so the final quote can match the exact ${model} being offered.`,
    ].filter(Boolean);
    return sentences.slice(0, 7).join(' ');
  }
  if (context?.deviceType === 'Laptop') {
    const model = clean(context.model) || title;
    const cpu = clean(dynamic.cpu);
    const ram = clean(dynamic.ram);
    const storage = clean(dynamic.storage);
    const screen = clean(dynamic.screenSize);
    const os = clean(dynamic.os);
    const condition = clean(context.condition);
    return [
      `${model} is a portable computer configured for dependable everyday productivity.`,
      cpu || ram ? `Its ${[cpu && `${cpu} processor`, ram && `${ram} of memory`].filter(Boolean).join(' and ')} provide a responsive foundation for office work, web browsing, communication, and multitasking.` : '',
      storage ? `The ${storage} storage configuration provides practical room for applications, documents, and daily files.` : '',
      screen ? `A ${screen} display keeps the system comfortable for mobile work without giving up useful screen space.` : '',
      os ? `${os} is the confirmed operating system for this configuration.` : '',
      condition ? `This unit is listed in ${condition} condition, matching the cosmetic grade selected for the quote.` : '',
      `Together, these confirmed specifications make the ${model} a well-rounded option for work, school, and general use.`,
    ].filter(Boolean).slice(0, 7).join(' ');
  }
  if (context?.deviceType && context.deviceType !== 'Other') {
    const model = clean(context.model) || title;
    const condition = clean(context.condition);
    const type = context.deviceType;
    const intro: Record<string, string> = {
      Phone: `${model} is a mobile device configured to keep communication, apps, media, and everyday tasks close at hand.`,
      Tablet: `${model} combines portable touch-screen convenience with useful room for entertainment, communication, and everyday productivity.`,
      'Desktop Computer': `${model} is a desktop system configured to provide a steady foundation for everyday computing and productivity.`,
      'Gaming Laptop': `${model} brings gaming-focused performance and portable computing together in one configurable system.`,
      Audio: `${model} is an audio product configured for convenient everyday listening and media use.`,
      Console: `${model} is a game system configured for an accessible, streamlined entertainment experience.`,
      Camera: `${model} is an imaging device configured to make capturing photos and video straightforward and flexible.`,
      TV: `${model} is a display built to make movies, shows, games, and everyday viewing clear and engaging.`,
      Drone: `${model} is an aerial platform configured for portable flight, creative imaging, and controlled operation.`,
      'Apple Devices': `${model} delivers an integrated Apple experience with a configuration tailored to the selected product.`,
    };
    const labels: Record<string, string> = {
      cpu: 'processor', cpuGen: 'processor generation', ram: 'memory', storage: 'storage', bootDriveStorage: 'primary storage',
      gpuModel: 'graphics', gpuVram: 'graphics memory', screenSize: 'screen', displaySize: 'display', displayResolution: 'display resolution',
      resolution: 'resolution', refreshRate: 'refresh rate', color: 'finish', carrier: 'carrier', connectivity: 'connectivity', os: 'operating system',
      audioType: 'audio style', features: 'features', edition: 'edition', cameraType: 'camera type', sensor: 'sensor', mount: 'lens mount',
      video: 'video capability', displayTech: 'display technology', hdr: 'HDR format', camera: 'camera', flightTime: 'flight time', range: 'range',
      maxSpeed: 'maximum speed', weight: 'weight', controller: 'controller', obstacleAvoidance: 'obstacle avoidance', gps: 'GPS',
    };
    const formatFact = (key: string, value: unknown) => {
      const v = clean(value);
      if (key === 'cpu') return `${v} processor`;
      if (key === 'ram') return `${v} of memory`;
      if (key === 'storage' || key === 'bootDriveStorage') return `${v} of ${labels[key]}`;
      if (key === 'screenSize' || key === 'displaySize') return `${v} ${labels[key]}`;
      return `${v} ${labels[key]}`;
    };
    const facts = Object.entries(dynamic)
      .filter(([key, value]) => !key.startsWith('_') && key !== 'device' && labels[key] && clean(value))
      .map(([key, value]) => formatFact(key, value));
    const sentences = [intro[type] || `${model} is configured using the confirmed details supplied by the product page.`];
    if (facts.length) sentences.push(`The confirmed configuration includes ${facts.slice(0, 3).join(', ').replace(/, ([^,]+)$/, ', and $1')}.`);
    if (facts.length > 3) sentences.push(`It also includes ${facts.slice(3, 6).join(', ').replace(/, ([^,]+)$/, ', and $1')}, rounding out the selected setup.`);
    if (condition) sentences.push(`This unit is listed in ${condition} condition, matching the cosmetic grade confirmed for the quote.`);
    sentences.push(`These details are drawn from the linked listing and remain editable so the final quote accurately reflects the exact ${model} being offered.`);
    return sentences.slice(0, 6).join(' ');
  }
  const sourceDescription = clean(metadata.description).replace(/\s*(?:read more|learn more)\s*$/i, '');
  if (sourceDescription.length >= 120 && !/Product-page values can change/i.test(sourceDescription)) return sourceDescription.slice(0, 1200);
  const specs = (metadata.specs || []).slice(0, 5).map((spec) => `${clean(spec.name)}: ${clean(spec.value)}`).filter((value) => !value.endsWith(': '));
  const details = specs.length ? ` Its confirmed configuration includes ${specs.join(', ')}.` : '';
  return `${title} is presented using the confirmed information supplied by the product page.${details} The selected details are organized into the matching quote fields for a clear customer-facing overview. Every imported value remains editable before the quote is finalized.`;
}
