const text = (value: unknown) => String(value ?? '').trim();
const delivered = (item: any) => /received|delivered|in.?stock/i.test(text(item?.orderStatus || item?.partStatus));
const ordered = (item: any) => item?.requiresOrder === true && !!text(item?.orderDate || item?.orderedAt || item?.ordered_at) && /ordered|in.?transit|awaiting.?delivery/i.test(text(item?.orderStatus || item?.partStatus));
const laborOrFee = (item: any) => item?.labor === true || !!text(item?.feeType) || /diagnostic|labor|service fee|additional fee/i.test(text(item?.itemType || item?.type || item?.category));

export function orderedUndeliveredItemIndexes(record: any): number[] {
  return (Array.isArray(record?.items) ? record.items : []).flatMap((item: any, index: number) => ordered(item) && !delivered(item) && !laborOrFee(item) ? [index] : []);
}

export function productDeliveryFor(record: any) {
  const items = Array.isArray(record?.items) ? record.items : [];
  const itemIndexes = orderedUndeliveredItemIndexes(record);
  const selected = itemIndexes.map(index => items[index]);
  const eta = selected.map(item => text(item?.estimatedDelivery || item?.estimatedDeliveryDate || item?.expectedDeliveryDate || item?.eta || record?.expectedDeliveryDate || record?.eta)).filter(Boolean).sort()[0] || '';
  return {
    itemIndexes,
    itemCount: itemIndexes.length,
    itemNames: selected.map(item => text(item?.description || item?.itemDescription || item?.name || item?.title) || 'Ordered product'),
    items: itemIndexes.map((index, offset) => ({ index, name: text(selected[offset]?.description || selected[offset]?.itemDescription || selected[offset]?.name || selected[offset]?.title) || 'Ordered product', eta: text(selected[offset]?.estimatedDelivery || selected[offset]?.estimatedDeliveryDate || selected[offset]?.expectedDeliveryDate || selected[offset]?.eta || record?.expectedDeliveryDate || record?.eta), orderDate: text(selected[offset]?.orderDate || selected[offset]?.orderedAt || selected[offset]?.ordered_at), orderUrl: text(selected[offset]?.productUrl || selected[offset]?.orderSourceUrl || selected[offset]?.orderUrl) })),
    eta,
  };
}
