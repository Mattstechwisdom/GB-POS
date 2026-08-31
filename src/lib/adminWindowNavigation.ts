export type AdminToolKey = 'repairCategories' | 'inventory' | 'vendors' | 'reporting' | 'technicians' | 'dataTools' | 'devMenu';

const nativeMethodByTool: Record<AdminToolKey, string> = {
  repairCategories: 'openRepairCategories', inventory: 'openInventory', vendors: 'openVendors',
  reporting: 'openReporting', technicians: 'openTechnicians', dataTools: 'openDataTools', devMenu: 'openDevMenu',
};

export async function openAdminTool(tool: AdminToolKey, api: Record<string, any> | undefined, fallback: (tool: AdminToolKey) => void): Promise<void> {
  const nativeOpen = api?.[nativeMethodByTool[tool]];
  if (typeof nativeOpen === 'function') { await nativeOpen(); return; }
  fallback(tool);
}
