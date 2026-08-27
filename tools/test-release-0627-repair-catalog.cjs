const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const expect = (condition, message) => {
  if (!condition) throw new Error(message);
};

const windowSource = read('src/repairs/RepairCategoriesWindow.tsx');
const formSource = read('src/repairs/RepairItemForm.tsx');
const listSource = read('src/repairs/RepairItemList.tsx');
const deviceSource = read('src/repairs/DeviceForm.tsx');
const typeSource = read('src/repairs/RepairTypeManager.tsx');
const releasePrintSource = read('src/workorders/releasePrint.ts');
const releaseWindowSource = read('src/workorders/ReleaseFormWindow.tsx');
const appSource = read('src/App.tsx');
const mobileAppSource = read('src/mobile/MobileApp.tsx');

expect(windowSource.includes('gb-repair-catalog-form-pane') && windowSource.includes('overflow-hidden'), 'The right repair editor pane must remain fixed while the catalog list scrolls.');
expect(formSource.includes('Exact Device') && formSource.includes('deviceModelsForCategory'), 'Specific repairs must expose an exact device-model selector filtered by category.');
expect(formSource.includes("model: ''") && formSource.includes('Update Repair') && formSource.includes('Add New Repair'), 'Repair actions must support explicit update and create behavior.');
expect(!formSource.includes("{formData.id && typeof onDelete === 'function'"), 'The admin repair editor must not show a Delete button.');
expect(listSource.includes('onPointerDown') && listSource.includes('mobileContextTimerRef'), 'Repair rows must support touch-and-hold context actions.');
expect(deviceSource.includes('expandedCategories') && deviceSource.includes('Delete device…'), 'Device categories must expand and retain context actions.');
expect(!deviceSource.match(/>\s*Delete Device\s*<\/button>/) && !deviceSource.match(/>\s*Delete Category\s*<\/button>/) && !deviceSource.match(/>\s*Cancel\s*<\/button>/), 'Device editor must keep destructive/reset actions out of the visible footer.');
expect(typeSource.includes('expandedTypeIds') && typeSource.includes('Assigned repairs'), 'Repair types must expand to show assigned repairs.');
expect(typeSource.includes('repair-type-item-ctx'), 'Assigned repair rows must expose edit/delete context actions.');
expect(releasePrintSource.includes("qrGetStatusUrl?.('repair'") && !releasePrintSource.includes('http://${lanIp}:7777/status/'), 'Printed work-order QR codes must use the shared Supabase-backed status URL.');
expect(releaseWindowSource.includes('qrGetStatusUrl?.(type') && !releaseWindowSource.includes('http://${lanIp}:7777/status/'), 'Work-order release windows must use the shared Supabase-backed status URL.');
expect(appSource.includes("document.title = 'GB Update Interface'") && mobileAppSource.includes("document.title = 'GB Update Interface'"), 'QR update pages must use the GB Update Interface title on desktop and mobile.');

console.log('v0.6.27 Devices/Repairs catalog regression checks passed.');
