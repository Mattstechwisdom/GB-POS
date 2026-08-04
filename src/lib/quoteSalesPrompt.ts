import { deviceTypes } from './deviceTypes';

function isImageLike(value: unknown) {
  const text = String(value ?? '').trim();
  if (!text) return false;
  return /^data:image\//i.test(text)
    || text.length > 2000
    || /\.(jpe?g|png|gif|bmp|webp)(?:\?|$)/i.test(text);
}

function cleanValue(value: unknown) {
  return isImageLike(value) ? '' : String(value ?? '').trim();
}

function friendlyDynamicLabel(key: string) {
  for (const definition of deviceTypes) {
    const field = definition.fields.find((candidate) => candidate.key === key);
    if (field?.label) return field.label;
  }
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function displayTitle(brand: unknown, model: unknown, fallback: unknown) {
  const cleanBrand = String(brand || '').trim();
  const cleanModel = String(model || '').trim();
  if (!cleanModel) return cleanBrand || String(fallback || 'Device').trim();
  if (!cleanBrand || cleanModel.toLowerCase().startsWith(`${cleanBrand.toLowerCase()} `)) return cleanModel;
  return `${cleanBrand} ${cleanModel}`;
}

function storageSummary(dynamic: any) {
  const formatDrive = (typeValue: unknown, sizeValue: unknown, specsValue?: unknown) => {
    const type = String(typeValue || '').trim();
    const size = String(sizeValue || '').trim();
    const specs = String(specsValue || '').trim();
    if (!size && !specs) return '';
    const base = [type, size].filter(Boolean).join(' ').trim();
    return base ? (specs ? `${base} (${specs})` : base) : specs;
  };
  const parts: string[] = [];
  const primary = formatDrive(dynamic.storageType || dynamic.bootDriveType, dynamic.storageSize || dynamic.bootDriveStorage, dynamic.storageSpecs || dynamic.bootDriveSpecs);
  if (primary) parts.push(primary);
  const secondary = Array.isArray(dynamic.pcSecondaryStorage)
    ? dynamic.pcSecondaryStorage.map((drive: any) => formatDrive(drive?.type, drive?.size, drive?.specs)).filter(Boolean)
    : [];
  if (secondary.length) parts.push(...secondary);
  else {
    const legacy = formatDrive(dynamic.secondaryStorage1Type, dynamic.secondaryStorage1Storage, dynamic.secondaryStorage1Specs);
    if (legacy) parts.push(legacy);
  }
  return parts.join(' + ');
}

export function buildQuoteSalesPrompt(item: any) {
  const lines: string[] = [];
  if (item.deviceType === 'Custom Build') {
    lines.push('Produce a concise, professional single paragraph (5-7 sentences) that summarizes the provided Custom PC components and explains how they work together as a balanced system.');
    lines.push('Use only the exact specifications supplied; do not infer or invent additional numbers, model details, or availability.');
    lines.push('Address real-world performance implications and state whether the build favors gaming, content creation, or general productivity.');
    lines.push('Keep language factual and to the point; avoid pricing or calls to action.');
    const dynamic = item.dynamic || {};
    const add = (label: string, values: unknown[]) => {
      const entered = values.map(cleanValue).filter(Boolean);
      if (entered.length) lines.push(`${label}: ${entered.join(', ')}`);
    };
    add('Case', [dynamic.case, dynamic.caseFormFactor, dynamic.caseInfo]);
    add('Motherboard', [dynamic.motherboard || dynamic.mobo, dynamic.moboChipset, dynamic.formFactor]);
    add('CPU', [dynamic.cpu, dynamic.cpuGen && `Gen ${dynamic.cpuGen}`, dynamic.cpuCores && `${dynamic.cpuCores} cores`, dynamic.cpuClock]);
    add('RAM', [dynamic.ram, dynamic.ramSize, dynamic.ramSpeed, dynamic.ramType]);
    add('GPU', [dynamic.gpuModel || dynamic.gpu || dynamic.gpuBrand, dynamic.gpuVram]);
    add('Storage', [storageSummary(dynamic)]);
    add('PSU', [dynamic.psu, dynamic.psuWatt && `${dynamic.psuWatt}W`]);
    add('Cooling', [dynamic.cooling || dynamic.coolingType]);
    add('OS', [dynamic.os]);
    lines.push('Output: exactly one paragraph (5-7 sentences), no bullets or lists.');
    return lines.join('\n');
  }

  const title = displayTitle(item.brand, item.model, item.deviceType);
  const rawAppleFamily = String(item.dynamic?.device || '').trim();
  const appleFamily = rawAppleFamily ? (/^apple\b/i.test(rawAppleFamily) ? rawAppleFamily : `Apple ${rawAppleFamily}`) : '';
  const deviceLabel = appleFamily || item.deviceType || 'Device';
  const specs: Array<[string, string]> = [];
  const addSpec = (label: string, value: unknown) => {
    const entered = cleanValue(value);
    if (entered) specs.push([label, entered]);
  };
  addSpec('Device Type', deviceLabel);
  addSpec('Brand', item.brand);
  addSpec('Model', item.model);
  addSpec('Condition', item.condition);
  Object.entries(item.dynamic || {}).forEach(([key, value]) => {
    if (key === 'device' || key.startsWith('_') || key === 'otherSpecs' || key === 'sourceVendor') return;
    if (/image|price|cost|markup/i.test(key) || isImageLike(value)) return;
    addSpec(friendlyDynamicLabel(key), value);
  });
  if (Array.isArray(item.dynamic?.otherSpecs)) {
    item.dynamic.otherSpecs.forEach((spec: any) => addSpec(spec?.desc || spec?.name, spec?.value));
  }
  addSpec('Accessories', item.accessories);
  const modelLine = title !== (item.deviceType || 'Device') ? `"${title}"` : `a ${deviceLabel}`;

  lines.push(`You are writing an enthusiastic sales description for ${modelLine} that we are selling to a customer.`);
  lines.push('', '== CONFIRMED SPECS (treat these as absolute truth) ==');
  lines.push(specs.map(([label, value]) => `  - ${label}: ${value}`).join('\n'));
  lines.push('', '== YOUR TASK ==');
  lines.push(`1. Use your training knowledge to research the real-world highlights of the ${title}. Pull in genuine fun facts, standout features, awards, build quality, display quality, performance reputation, battery life, target audience, or anything that makes this specific model noteworthy and exciting.`);
  lines.push('2. CRITICAL - spec consistency: ONLY mention facts from your research that are COMPATIBLE with the confirmed specs above. If a confirmed spec differs from a common variant, do NOT mention the conflicting variant. Every researched claim must align with or be silent about any confirmed spec.');
  lines.push('3. Blend the confirmed specs naturally into the paragraph - do not just list them.');
  lines.push('4. Write with energy, genuine excitement, and upsell appeal. Highlight what makes this device special and why the customer should be excited to own it.');
  lines.push('5. Do NOT mention pricing, store names, warranties, or direct calls to action.');
  lines.push('', '== OUTPUT FORMAT ==', 'Exactly one paragraph, 5-7 sentences, no heading/title, no bullet points, no emojis.');
  return lines.join('\n');
}
