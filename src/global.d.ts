export {};

declare global {
  // Temporary: QuoteGeneratorWindow has a legacy reference to itemsPage()
  // in the print pipeline; at runtime it is guarded by try/catch.
  // This keeps TypeScript from failing if the helper is out of scope.
  function itemsPage(): string;

  interface Window {
    api: {
    getAppInfo: () => Promise<{ version: string; platform: string; arch: string; error?: string }>;
    storageGetInfo: () => Promise<{ ok: boolean; configured?: boolean; dataRoot?: string | null; recommended?: string; userData?: string; error?: string }>;
    storageEnsure: () => Promise<{ ok: boolean; configured?: boolean; dataRoot?: string; isFirstRun?: boolean; migration?: any; error?: string }>;
    runDiagnostics: () => Promise<{ ok: boolean; dataRoot?: string; results?: any[]; error?: string }>;
    updateCheck: () => Promise<any>;
    updateDownload: () => Promise<any>;
    updateQuitAndInstall: () => Promise<any>;
    updateSkip: (version: string) => Promise<any>;
    updateOpenReleases: () => Promise<any>;
    updatePickInstallerAndRun: () => Promise<any>;
    updateRunInstaller: (installerPath: string, opts?: { silent?: boolean }) => Promise<any>;
    onUpdateEvent: (cb: (ev: any) => void) => () => void;
    getCustomers: () => Promise<any[]>;
    addCustomer: (c: any) => Promise<any>;
    findCustomers: (q: any) => Promise<any[]>;
    getWorkOrders: () => Promise<any[]>;
    addWorkOrder: (w: any) => Promise<any>;
    findWorkOrders: (q: any) => Promise<any[]>;
    update: (key: string, item: any) => Promise<any>;
  openNewWorkOrder: (payload: any) => Promise<any>;
  openDeviceCategories: () => Promise<any>;
  openRepairCategories: () => Promise<any>;
  openCalendar: () => Promise<any>;
  openClockIn: () => Promise<any>;
  openProducts: () => Promise<any>;
  openWorkOrderRepairPicker: () => Promise<any>;
  openCustomerOverview: (customerId: number) => Promise<any>;
  openNewSale: (payload: any) => Promise<any>;
  openEod: () => Promise<any>;
    getDeviceCategories: () => Promise<any[]>;
    addDeviceCategory: (c: any) => Promise<any>;
  getProductCategories: () => Promise<any[]>;
  addProductCategory: (c: any) => Promise<any>;
    deleteFromCollection: (key: string, id: number) => Promise<boolean>;
    dbGet: (key: string) => Promise<any[]>;
    dbAdd: (key: string, item: any) => Promise<any>;
    dbUpdate: (key: string, id: any, item: any) => Promise<any>;
  dbDelete: (key: string, id: any) => Promise<boolean>;
    dbResetAll: () => Promise<{ ok: boolean; removed?: string[]; errors?: string[]; dataRoot?: string }>;
  sendRepairSelected: (repair: any) => void;
    openDevMenu: () => Promise<any>;
    devOpenUserDataFolder: () => Promise<any>;
    devBackupDatabase: () => Promise<any>;
    devEnvironmentInfo: () => Promise<any>;
    devOpenAllDevTools: () => Promise<any>;
  openDataTools: () => Promise<any>;
  openClearDatabase: () => Promise<any>;
  backupPickAndRead: () => Promise<any>;
  backupExportPayload: (payload: any) => Promise<any>;
  backupExportPayloadNamed: (payload: any, label?: string) => Promise<any>;
  runBatchOut: () => Promise<any>;
  getBatchOutInfo: () => Promise<{ ok: boolean; lastBackupPath?: string; lastBackupDate?: string; lastBatchOutDate?: string }>;
    backupExport: () => Promise<any>;
    backupImport: () => Promise<any>;
    // backup window & encryption helpers
    openBackup: () => Promise<any>;
    createEncryptedBackup: (backupData: any, password: string) => Promise<any>;
    restoreEncryptedBackup: (password: string) => Promise<any>;
    getLastBackupPath: () => Promise<string>;
    // export helpers
    exportHtml: (html: string, filenameBase?: string) => Promise<any>;
    exportPdf: (html: string, filenameBase?: string) => Promise<any>;
    openInteractiveHtml: (html: string, title?: string) => Promise<any>;
    openUrl: (url: string) => Promise<any>;
    // email
    emailGetConfig: () => Promise<{ ok: boolean; fromEmail?: string; fromName?: string; hasAppPassword?: boolean; error?: string }>;
    emailSetGmailAppPassword: (appPassword: string, fromName?: string) => Promise<{ ok: boolean; error?: string }>;
    emailSetFromName: (fromName: string) => Promise<{ ok: boolean; error?: string }>;
    emailClearGmailAppPassword: () => Promise<{ ok: boolean; error?: string }>;
    emailSendQuoteHtml: (payload: { to: string; subject: string; bodyText: string; filename: string; html: string }) => Promise<{ ok: boolean; messageId?: string | null; error?: string }>;
    openReporting: () => Promise<any>;
  openCharts: () => Promise<any>;
    openReleaseForm: (payload: any) => Promise<any>;
    openCustomerReceipt: (payload: any) => Promise<any>;
  openProductForm: (payload: any) => Promise<any>;
  pickSaleProduct: () => Promise<any>;
  onSalesChanged: (cb: () => void) => () => void;
      onCustomersChanged: (cb: () => void) => () => void;
      onDeviceCategoriesChanged: (cb: () => void) => () => void;
      onPartSourcesChanged: (cb: () => void) => () => void;
  onTechniciansChanged: (cb: () => void) => () => void;
  onCalendarEventsChanged: (cb: () => void) => () => void;
  onTimeEntriesChanged: (cb: () => void) => () => void;
  onProductCategoriesChanged: (cb: () => void) => () => void;
  onProductsChanged: (cb: () => void) => () => void;
  // window controls
  getFullScreen: () => Promise<boolean>;
  setFullScreen: (flag: boolean) => Promise<any>;
  toggleFullScreen: () => Promise<any>;
    };
  }
}
