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

export function isExpeditedWorkOrder(record: any) {
  const items = Array.isArray(record?.items) ? record.items : [];
  return items.some((item: any) => /\b(expedit(?:e|ed|ing)?|rush)\b/i.test([
    item?.repairCategory,
    item?.repair,
    item?.description,
    item?.title,
    item?.name,
  ].filter(Boolean).join(' ')));
}

export function compareRepairQueuePriority(a: { expedited?: boolean; promisedAt?: string; activityAt?: string }, b: { expedited?: boolean; promisedAt?: string; activityAt?: string }) {
  if (!!a.expedited !== !!b.expedited) return a.expedited ? -1 : 1;
  const aPromise = new Date(a.promisedAt || 0).getTime();
  const bPromise = new Date(b.promisedAt || 0).getTime();
  if (!!aPromise !== !!bPromise) return aPromise ? -1 : 1;
  if (aPromise && bPromise && aPromise !== bPromise) return aPromise - bPromise;
  return new Date(a.activityAt || 0).getTime() - new Date(b.activityAt || 0).getTime();
}

export function partEtaFor(record: any) {
  const explicit = clean(record?.partsEstDelivery || record?.partsEstimatedDelivery || record?.partEta || record?.part_eta || record?.expectedDeliveryDate);
  if (explicit) return explicit;
  return /part.*(ordered|delivery)|waiting.*part/i.test(clean(record?.repairStatus || record?.workflowStatus || record?.statusUpdate))
    ? clean(record?.estimatedDate)
    : '';
}
