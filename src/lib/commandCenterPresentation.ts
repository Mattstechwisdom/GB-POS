export type RepairPresentation = {
  deviceLabel: string;
  deviceCategory: string;
  model: string;
  serial: string;
  problem: string;
};

const clean = (value: unknown) => String(value ?? '').trim();

export function repairPresentationFor(record: any): RepairPresentation {
  const deviceCategory = clean(record?.productCategory || record?.deviceCategory || record?.category);
  const description = clean(record?.productDescription || record?.deviceName || record?.device);
  const model = clean(record?.model || record?.deviceModel);
  const serial = clean(record?.serial || record?.serialNumber);
  const base = description || model || deviceCategory || 'Device not entered';
  const deviceLabel = model && model.toLowerCase() !== base.toLowerCase() ? `${base} - ${model}` : base;
  return {
    deviceLabel,
    deviceCategory,
    model,
    serial,
    problem: clean(record?.problemInfo || record?.problem) || 'Problem not entered',
  };
}

export function shouldOpenAttentionPanel(previousRequest: number, currentRequest: number) {
  return currentRequest > 0 && currentRequest !== previousRequest;
}
