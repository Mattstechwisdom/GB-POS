const { contextBridge, ipcRenderer } = require('electron');

// Renderer-side caching (per-window) to avoid repeatedly transferring large collections
// across IPC during autosave bursts.
let customersCache: any[] | null = null;
let customersInFlight: Promise<any[]> | null = null;

function getCustomersCached(): Promise<any[]> {
  try {
    if (customersCache) return Promise.resolve(customersCache);
    if (customersInFlight) return customersInFlight;
    const p = ipcRenderer.invoke('db-get', 'customers')
      .then((list: any) => {
        customersCache = Array.isArray(list) ? list : [];
        customersInFlight = null;
        return customersCache;
      })
      .catch((e: any) => {
        customersInFlight = null;
        throw e;
      });
    customersInFlight = p;
    return p;
  } catch (e: any) {
    customersInFlight = null;
    return Promise.reject(e);
  }
}

// Invalidate cache whenever customers collection changes.
try {
  ipcRenderer.on('customers:changed', () => {
    customersCache = null;
    customersInFlight = null;
  });
} catch {}

contextBridge.exposeInMainWorld('api', {
  getAppInfo: (): Promise<{ version: string; platform: string; arch: string }> => ipcRenderer.invoke('app:getInfo'),
  gidgetLocalStatus: (): Promise<any> => ipcRenderer.invoke('gidget:localStatus'),
  gidgetLocalSetup: (): Promise<any> => ipcRenderer.invoke('gidget:localSetup'),
  gidgetLocalGenerate: (payload: any): Promise<any> => ipcRenderer.invoke('gidget:localGenerate', payload),
  gidgetLocalCancel: (): Promise<any> => ipcRenderer.invoke('gidget:localCancel'),
  onGidgetModelProgress: (cb: (progress: any) => void) => {
    const handler = (_event: any, progress: any) => cb(progress);
    ipcRenderer.on('gidget:model-progress', handler);
    return () => ipcRenderer.removeListener('gidget:model-progress', handler);
  },
  openExternal: (url: string): Promise<void> => ipcRenderer.invoke('os:openUrl', url),
  // Storage / diagnostics
  storageGetInfo: (): Promise<any> => ipcRenderer.invoke('storage:getInfo'),
  storageEnsure: (): Promise<any> => ipcRenderer.invoke('storage:ensure'),
  runDiagnostics: (): Promise<any> => ipcRenderer.invoke('diagnostics:run'),
  pickRepairItem: (): Promise<any> => ipcRenderer.invoke('pick-repair-item'),
  getCustomers: (opts?: { limit?: number; sortBy?: string; sortDir?: 'asc' | 'desc' }): Promise<any[]> => {
    if (opts) return ipcRenderer.invoke('db-get', 'customers', opts);
    return getCustomersCached();
  },
  addCustomer: (c: any): Promise<any> => ipcRenderer.invoke('db-add', 'customers', c),
  findCustomers: (q: any): Promise<any[]> => ipcRenderer.invoke('db-find', 'customers', q),
  getWorkOrders: (opts?: { limit?: number; sortBy?: string; sortDir?: 'asc' | 'desc' }): Promise<any[]> => ipcRenderer.invoke('db-get', 'workOrders', opts),
  addWorkOrder: (w: any): Promise<any> => ipcRenderer.invoke('db-add', 'workOrders', w),
  findWorkOrders: (q: any): Promise<any[]> => ipcRenderer.invoke('db-find', 'workOrders', q),
  update: (key: string, item: any): Promise<any> => ipcRenderer.invoke('db-update', key, item),
  openNewWorkOrder: (payload: any): Promise<any> => ipcRenderer.invoke('open-new-workorder', payload),
  openDeviceCategories: (): Promise<any> => ipcRenderer.invoke('open-device-categories'),
  openRepairCategories: (): Promise<any> => ipcRenderer.invoke('open-repair-categories'),
  openCalendar: (): Promise<any> => ipcRenderer.invoke('open-calendar'),
  openClockIn: (): Promise<any> => ipcRenderer.invoke('open-clock-in'),
  openQuoteGenerator: (): Promise<any> => ipcRenderer.invoke('open-quote-generator'),
  openEod: (): Promise<any> => ipcRenderer.invoke('open-eod'),
  openProducts: (): Promise<any> => ipcRenderer.invoke('open-products'),
  openInventory: (): Promise<any> => ipcRenderer.invoke('open-inventory'),
  openWorkOrderRepairPicker: (): Promise<any> => ipcRenderer.invoke('open-workorder-repair-picker'),
  openCustomerOverview: (customerId: number): Promise<any> => ipcRenderer.invoke('open-customer-overview', customerId),
  openNewSale: (payload: any): Promise<any> => ipcRenderer.invoke('open-new-sale', payload),
  openQuickSale: (): Promise<any> => ipcRenderer.invoke('open-quick-sale'),
  openConsultation: (): Promise<any> => ipcRenderer.invoke('open-consultation'),
  openCheckout: (payload: { amountDue: number }): Promise<any> => ipcRenderer.invoke('workorder:openCheckout', payload),
  openDevMenu: (): Promise<any> => ipcRenderer.invoke('open-dev-menu'),
  devOpenUserDataFolder: (): Promise<any> => ipcRenderer.invoke('dev:openUserDataFolder'),
  devBackupDatabase: (): Promise<any> => ipcRenderer.invoke('dev:backupDb'),
  devEnvironmentInfo: (): Promise<any> => ipcRenderer.invoke('dev:environmentInfo'),
  devOpenAllDevTools: (): Promise<any> => ipcRenderer.invoke('dev:openAllDevTools'),
  openDataTools: (): Promise<any> => ipcRenderer.invoke('open-data-tools'),
  openClearDatabase: (): Promise<any> => ipcRenderer.invoke('open-clear-database'),
  backupPickAndRead: (): Promise<any> => ipcRenderer.invoke('backup:pickAndRead'),
  backupExportPayload: (payload: any): Promise<any> => ipcRenderer.invoke('backup:exportPayload', payload),
  backupExportPayloadNamed: (payload: any, label?: string): Promise<any> => ipcRenderer.invoke('backup:exportPayloadNamed', payload, label),
  runBatchOut: (): Promise<any> => ipcRenderer.invoke('backup:runBatchOut'),
  getBatchOutInfo: (): Promise<any> => ipcRenderer.invoke('backup:getBatchOutInfo'),
  backupExport: (): Promise<any> => ipcRenderer.invoke('backup:export'),
  backupImport: (): Promise<any> => ipcRenderer.invoke('backup:import'),
  exportHtml: (html: string, filenameBase?: string): Promise<any> => ipcRenderer.invoke('export-html', html, filenameBase),
  exportPdf: (html: string, filenameBase?: string): Promise<any> => ipcRenderer.invoke('export-pdf', html, filenameBase),
  openInteractiveHtml: (html: string, title?: string): Promise<any> => ipcRenderer.invoke('open-interactive-html', html, title),
  // Email
  emailGetConfig: (): Promise<any> => ipcRenderer.invoke('email:getConfig'),
  emailSetGmailAppPassword: (appPassword: string, fromName?: string): Promise<any> => ipcRenderer.invoke('email:setGmailAppPassword', appPassword, fromName),
  emailSetFromName: (fromName: string): Promise<any> => ipcRenderer.invoke('email:setFromName', fromName),
  emailSetBodyTemplate: (bodyTemplate: string): Promise<any> => ipcRenderer.invoke('email:setBodyTemplate', bodyTemplate),
  emailClearGmailAppPassword: (): Promise<any> => ipcRenderer.invoke('email:clearGmailAppPassword'),
  emailSendQuoteHtml: (payload: any): Promise<any> => ipcRenderer.invoke('email:sendQuoteHtml', payload),
  emailSendQuotePdf: (payload: any): Promise<any> => ipcRenderer.invoke('email:sendQuotePdf', payload),
  emailSendReportCsv: (payload: any): Promise<any> => ipcRenderer.invoke('email:sendReportCsv', payload),
  emailSendReportHtml: (payload: any): Promise<any> => ipcRenderer.invoke('email:sendReportHtml', payload),
  // OS helpers
  openFile: (filePath: string): Promise<any> => ipcRenderer.invoke('os:openFile', filePath),
  openUrl: (url: string): Promise<any> => ipcRenderer.invoke('os:openUrl', url),
  scrapePartUrl: (url: string): Promise<any> => ipcRenderer.invoke('parts:scrapeUrl', url),
  openReporting: (): Promise<any> => ipcRenderer.invoke('open-reporting'),
  openReportEmail: (payload: any): Promise<any> => ipcRenderer.invoke('open-report-email', payload),
  openCustomBuildItem: (payload: any): Promise<any> => ipcRenderer.invoke('customBuild:openItem', payload),
  openCharts: (): Promise<any> => ipcRenderer.invoke('open-charts'),
  openNotifications: (): Promise<any> => ipcRenderer.invoke('open-notifications'),
  openNotificationSettings: (): Promise<any> => ipcRenderer.invoke('open-notification-settings'),
  openReleaseForm: (payload: any): Promise<any> => ipcRenderer.invoke('open-release-form', payload),
  openCustomerReceipt: (payload: any): Promise<any> => ipcRenderer.invoke('open-customer-receipt', payload),
  notifyCustomerReceiptReady: (): void => ipcRenderer.send('customer-receipt:ready'),
  openConsultSheet: (payload: any): Promise<any> => ipcRenderer.invoke('open-consult-sheet', payload),
  notifyConsultSheetReady: (): void => ipcRenderer.send('consult-sheet:ready'),
  openProductForm: (payload: any): Promise<any> => ipcRenderer.invoke('open-product-form', payload),
  pickSaleProduct: (): Promise<any> => ipcRenderer.invoke('pick-sale-product'),
  getDeviceCategories: (): Promise<any[]> => ipcRenderer.invoke('db-get', 'deviceCategories'),
  addDeviceCategory: (c: any): Promise<any> => ipcRenderer.invoke('db-add', 'deviceCategories', c),
  getProductCategories: (): Promise<any[]> => ipcRenderer.invoke('db-get', 'productCategories'),
  addProductCategory: (c: any): Promise<any> => ipcRenderer.invoke('db-add', 'productCategories', c),
  deleteFromCollection: (key: string, id: number): Promise<boolean> => ipcRenderer.invoke('db-delete', key, id),
  dbGet: (key: string, opts?: { limit?: number; sortBy?: string; sortDir?: 'asc' | 'desc' }): Promise<any[]> => {
    if (String(key) === 'customers' && !opts) return getCustomersCached();
    return ipcRenderer.invoke('db-get', key, opts);
  },
  dbCount: (key: string, q: any): Promise<number> => ipcRenderer.invoke('db-count', key, q),
  dbAdd: (key: string, item: any): Promise<any> => ipcRenderer.invoke('db-add', key, item),
  dbUpdate: (key: string, id: any, item: any): Promise<any> => ipcRenderer.invoke('db-update', key, id, item),
  dbDelete: (key: string, id: any): Promise<boolean> => ipcRenderer.invoke('db-delete', key, id),
  dbResetAll: (): Promise<any> => ipcRenderer.invoke('db-reset-all'),
  cloudSetSession: (payload: any): Promise<any> => ipcRenderer.invoke('cloud:setSession', payload),
  cloudClearSession: (): Promise<any> => ipcRenderer.invoke('cloud:clearSession'),
  sendRepairSelected: (repair: any) => ipcRenderer.send('repair-selected', repair),
  _emitCheckoutSave: (result: any) => ipcRenderer.send('workorder:checkout:save', result),
  _emitCheckoutCancel: () => ipcRenderer.send('workorder:checkout:cancel'),
  _emitCustomBuildItemSave: (result: any) => ipcRenderer.send('customBuild:item:save', result),
  _emitCustomBuildItemCancel: () => ipcRenderer.send('customBuild:item:cancel'),
  onWorkOrdersChanged: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('workorders:changed', handler);
    return () => ipcRenderer.removeListener('workorders:changed', handler);
  },
  onCustomersChanged: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('customers:changed', handler);
    return () => ipcRenderer.removeListener('customers:changed', handler);
  },
  onDeviceCategoriesChanged: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('deviceCategories:changed', handler);
    return () => ipcRenderer.removeListener('deviceCategories:changed', handler);
  },
  onTechniciansChanged: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('technicians:changed', handler);
    return () => ipcRenderer.removeListener('technicians:changed', handler);
  },
  onProductCategoriesChanged: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('productCategories:changed', handler);
    return () => ipcRenderer.removeListener('productCategories:changed', handler);
  },
  onProductsChanged: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('products:changed', handler);
    return () => ipcRenderer.removeListener('products:changed', handler);
  },
  onSalesChanged: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('sales:changed', handler);
    return () => ipcRenderer.removeListener('sales:changed', handler);
  },
  onQuotesChanged: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('quotes:changed', handler);
    return () => ipcRenderer.removeListener('quotes:changed', handler);
  },
  onPartSourcesChanged: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('partSources:changed', handler);
    return () => ipcRenderer.removeListener('partSources:changed', handler);
  },
  onCalendarEventsChanged: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('calendarEvents:changed', handler);
    return () => ipcRenderer.removeListener('calendarEvents:changed', handler);
  },
  onNotificationsChanged: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('notifications:changed', handler);
    return () => ipcRenderer.removeListener('notifications:changed', handler);
  },
  onNotificationSettingsChanged: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('notificationSettings:changed', handler);
    return () => ipcRenderer.removeListener('notificationSettings:changed', handler);
  },
  onTimeEntriesChanged: (cb: () => void) => {
    const handler = () => cb();
    ipcRenderer.on('timeEntries:changed', handler);
    return () => ipcRenderer.removeListener('timeEntries:changed', handler);
  },
  _emitSaleProductSelected: (payload: any) => ipcRenderer.send('sale-product-selected', payload),
  // window controls
  getFullScreen: (): Promise<boolean> => ipcRenderer.invoke('window:getFullScreen'),
  setFullScreen: (flag: boolean): Promise<any> => ipcRenderer.invoke('window:setFullScreen', flag),
  toggleFullScreen: (): Promise<any> => ipcRenderer.invoke('window:toggleFullScreen'),

  // Safe window helpers
  closeSelfWindow: (opts?: { focusMain?: boolean }): Promise<any> => ipcRenderer.invoke('window:closeSelf', opts),
  focusMainWindow: (): Promise<any> => ipcRenderer.invoke('window:focusMain'),
  
  // backup & restore
  openBackup: (): Promise<any> => ipcRenderer.invoke('open-backup'),
  // server/NAS sync (offline-first)
  serverSyncGetConfig: (): Promise<any> => ipcRenderer.invoke('server-sync-get-config'),
  serverSyncSetConfig: (patch: any): Promise<any> => ipcRenderer.invoke('server-sync-set-config', patch),
  serverSyncBrowse: (opts?: { basePath?: string }): Promise<any> => ipcRenderer.invoke('server-sync-browse', opts),
  serverSyncTest: (): Promise<any> => ipcRenderer.invoke('server-sync-test'),
  serverSyncNow: (direction?: 'auto' | 'push' | 'pull'): Promise<any> => ipcRenderer.invoke('server-sync-sync-now', direction),
  serverBackupNow: (label?: string): Promise<any> => ipcRenderer.invoke('server-sync-backup-now', label),
  serverSyncStatus: (): Promise<any> => ipcRenderer.invoke('server-sync-status'),
  createEncryptedBackup: (backupData: any, password: string): Promise<any> => ipcRenderer.invoke('create-encrypted-backup', backupData, password),
  restoreEncryptedBackup: (password: string): Promise<any> => ipcRenderer.invoke('restore-encrypted-backup', password),
  getLastBackupPath: (): Promise<string> => ipcRenderer.invoke('get-last-backup-path'),
  // QR Code status server
  qrGetStatusUrl: (type: 'repair' | 'sale' | 'consult', id: number): Promise<{ ok: boolean; url?: string; error?: string }> => ipcRenderer.invoke('qr:getStatusUrl', type, id),
  qrResolveStatusToken: (token: string): Promise<{ ok: boolean; token?: any; type?: 'repair' | 'sale' | 'consult'; record?: any; customer?: any; error?: string }> => ipcRenderer.invoke('qr:resolveStatusToken', token),
  qrGetDataUrl: (url: string): Promise<{ ok: boolean; dataUrl?: string; error?: string }> => ipcRenderer.invoke('qr:getDataUrl', url),
  qrGetServerInfo: (): Promise<{ ok: boolean; hostname?: string; ip?: string; port?: number; hostUrl?: string; ipUrl?: string; error?: string }> => ipcRenderer.invoke('qr:getServerInfo'),
});
