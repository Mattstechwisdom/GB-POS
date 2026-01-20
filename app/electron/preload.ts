const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getAppInfo: (): Promise<{ version: string; platform: string; arch: string }> => ipcRenderer.invoke('app:getInfo'),
  pickRepairItem: (): Promise<any> => ipcRenderer.invoke('pick-repair-item'),
  getCustomers: (): Promise<any[]> => ipcRenderer.invoke('db-get', 'customers'),
  addCustomer: (c: any): Promise<any> => ipcRenderer.invoke('db-add', 'customers', c),
  findCustomers: (q: any): Promise<any[]> => ipcRenderer.invoke('db-find', 'customers', q),
  getWorkOrders: (): Promise<any[]> => ipcRenderer.invoke('db-get', 'workOrders'),
  addWorkOrder: (w: any): Promise<any> => ipcRenderer.invoke('db-add', 'workOrders', w),
  findWorkOrders: (q: any): Promise<any[]> => ipcRenderer.invoke('db-find', 'workOrders', q),
  update: (key: string, item: any): Promise<any> => ipcRenderer.invoke('db-update', key, item),
  openNewWorkOrder: (payload: any): Promise<any> => ipcRenderer.invoke('open-new-workorder', payload),
  openDeviceCategories: (): Promise<any> => ipcRenderer.invoke('open-device-categories'),
  openRepairCategories: (): Promise<any> => ipcRenderer.invoke('open-repair-categories'),
  openCalendar: (): Promise<any> => ipcRenderer.invoke('open-calendar'),
  openClockIn: (): Promise<any> => ipcRenderer.invoke('open-clock-in'),
  openQuoteGenerator: (): Promise<any> => ipcRenderer.invoke('open-quote-generator'),
  openProducts: (): Promise<any> => ipcRenderer.invoke('open-products'),
  openWorkOrderRepairPicker: (): Promise<any> => ipcRenderer.invoke('open-workorder-repair-picker'),
  openCustomerOverview: (customerId: number): Promise<any> => ipcRenderer.invoke('open-customer-overview', customerId),
  openNewSale: (payload: any): Promise<any> => ipcRenderer.invoke('open-new-sale', payload),
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
  backupExport: (): Promise<any> => ipcRenderer.invoke('backup:export'),
  backupImport: (): Promise<any> => ipcRenderer.invoke('backup:import'),
  exportHtml: (html: string, filenameBase?: string): Promise<any> => ipcRenderer.invoke('export-html', html, filenameBase),
  exportPdf: (html: string, filenameBase?: string): Promise<any> => ipcRenderer.invoke('export-pdf', html, filenameBase),
  openInteractiveHtml: (html: string, title?: string): Promise<any> => ipcRenderer.invoke('open-interactive-html', html, title),
  // OS helpers
  openFile: (filePath: string): Promise<any> => ipcRenderer.invoke('os:openFile', filePath),
  openUrl: (url: string): Promise<any> => ipcRenderer.invoke('os:openUrl', url),
  openReporting: (): Promise<any> => ipcRenderer.invoke('open-reporting'),
  openCharts: (): Promise<any> => ipcRenderer.invoke('open-charts'),
  openReleaseForm: (payload: any): Promise<any> => ipcRenderer.invoke('open-release-form', payload),
  openCustomerReceipt: (payload: any): Promise<any> => ipcRenderer.invoke('open-customer-receipt', payload),
  openProductForm: (payload: any): Promise<any> => ipcRenderer.invoke('open-product-form', payload),
  pickSaleProduct: (): Promise<any> => ipcRenderer.invoke('pick-sale-product'),
  getDeviceCategories: (): Promise<any[]> => ipcRenderer.invoke('db-get', 'deviceCategories'),
  addDeviceCategory: (c: any): Promise<any> => ipcRenderer.invoke('db-add', 'deviceCategories', c),
  getProductCategories: (): Promise<any[]> => ipcRenderer.invoke('db-get', 'productCategories'),
  addProductCategory: (c: any): Promise<any> => ipcRenderer.invoke('db-add', 'productCategories', c),
  deleteFromCollection: (key: string, id: number): Promise<boolean> => ipcRenderer.invoke('db-delete', key, id),
  dbGet: (key: string): Promise<any[]> => ipcRenderer.invoke('db-get', key),
  dbAdd: (key: string, item: any): Promise<any> => ipcRenderer.invoke('db-add', key, item),
  dbUpdate: (key: string, id: any, item: any): Promise<any> => ipcRenderer.invoke('db-update', key, id, item),
  dbDelete: (key: string, id: any): Promise<boolean> => ipcRenderer.invoke('db-delete', key, id),
  sendRepairSelected: (repair: any) => ipcRenderer.send('repair-selected', repair),
  _emitCheckoutSave: (result: any) => ipcRenderer.send('workorder:checkout:save', result),
  _emitCheckoutCancel: () => ipcRenderer.send('workorder:checkout:cancel'),
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
  
  // backup & restore
  openBackup: (): Promise<any> => ipcRenderer.invoke('open-backup'),
  createEncryptedBackup: (backupData: any, password: string): Promise<any> => ipcRenderer.invoke('create-encrypted-backup', backupData, password),
  restoreEncryptedBackup: (password: string): Promise<any> => ipcRenderer.invoke('restore-encrypted-backup', password),
  getLastBackupPath: (): Promise<string> => ipcRenderer.invoke('get-last-backup-path'),
});
