import type { RepairItem } from './types';

export const REPAIR_CATALOG_PREVIEW_DEVICES = [
  { id: -9101, title: 'Game Console', name: 'PlayStation 5' },
  { id: -9102, title: 'Game Console', name: 'Xbox Series S' },
  { id: -9103, title: 'Game Console', name: 'Nintendo Switch' },
  { id: -9201, title: 'Phone', name: 'iPhone 15 Pro' },
];

export const REPAIR_CATALOG_PREVIEW_ITEMS: RepairItem[] = [
  { id: 'preview-diagnostic', category: 'Game Console', model: '', repairCategory: 'Diagnostic', title: 'Console Diagnostic', altDescription: 'Power and board-level diagnostic', partCost: 0, laborCost: 50, type: 'service' },
  { id: 'preview-hdmi', category: 'Game Console', model: '', repairCategory: 'Port Repair', title: 'HDMI Port Replacement', altDescription: 'Category-wide HDMI repair', partCost: 25, laborCost: 125, type: 'service' },
  { id: 'preview-ps5-power', category: 'Game Console', model: 'PlayStation 5', repairCategory: 'Power Repair', title: 'Power Supply Replacement', altDescription: 'PlayStation 5 power supply service', partCost: 89, laborCost: 100, type: 'service' },
  { id: 'preview-xbox-hdmi', category: 'Game Console', model: 'Xbox Series S', repairCategory: 'Port Repair', title: 'HDMI Retimer Repair', altDescription: 'Xbox Series S specific repair', partCost: 35, laborCost: 140, type: 'service' },
];

export function isRepairCatalogPreview(): boolean {
  try {
    return new URLSearchParams(window.location.search).get('catalogRework') === '1';
  } catch {
    return false;
  }
}

export function withRepairPreviewDevices(rows: any[]): any[] {
  if (!isRepairCatalogPreview()) return rows;
  const existing = new Set(rows.map(row => `${String(row?.title || '').trim().toLowerCase()}::${String(row?.name || '').trim().toLowerCase()}`));
  return [...rows, ...REPAIR_CATALOG_PREVIEW_DEVICES.filter(row => !existing.has(`${row.title.toLowerCase()}::${row.name.toLowerCase()}`))];
}
