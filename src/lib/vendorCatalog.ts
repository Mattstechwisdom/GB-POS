export type VendorLike = { id?: any; name?: string; [key: string]: any };
export type ProductLike = { id?: any; distributor?: string; [key: string]: any };
export type RepairLike = { id?: any; inventoryProductId?: any; inventoryParentId?: any; parentProductId?: any; partSource?: string; [key: string]: any };

export function vendorKey(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
export function resolveCanonicalVendor(value: unknown, vendors: VendorLike[]): VendorLike | undefined {
  const key = vendorKey(value); return key ? vendors.find(vendor => vendorKey(vendor.name) === key) : undefined;
}
export function groupVendorLinks(vendor: VendorLike, products: ProductLike[], repairs: RepairLike[]) {
  const key = vendorKey(vendor.name);
  const parts = products.filter(product => vendorKey(product.distributor) === key);
  const ids = new Set(parts.flatMap(part => [part.id, part.parentProductId]).filter(value => value != null).map(String));
  const linkedRepairs = repairs.filter(repair => vendorKey(repair.partSource) === key
    || [repair.inventoryProductId, repair.inventoryParentId, repair.parentProductId].some(value => value != null && ids.has(String(value))));
  return { parts, repairs: linkedRepairs };
}
export function renameVendorLinks(from: string, to: string, products: ProductLike[], repairs: RepairLike[]) {
  const key = vendorKey(from);
  return {
    products: products.map(row => vendorKey(row.distributor) === key ? { ...row, distributor: to } : row),
    repairs: repairs.map(row => vendorKey(row.partSource) === key ? { ...row, partSource: to } : row),
  };
}
export function mergeVendorLinks(source: VendorLike, target: VendorLike, products: ProductLike[], repairs: RepairLike[]) {
  return renameVendorLinks(String(source.name || ''), String(target.name || ''), products, repairs);
}
