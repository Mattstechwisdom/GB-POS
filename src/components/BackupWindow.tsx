import React, { useState, useEffect, useRef } from 'react';
import Button from './Button';

interface BackupData {
  version: string;
  timestamp: string;
  source?: string;
  dataComplete?: boolean;
  scanTimestamp?: string;
  collections: Record<string, any[]>; // Flexible to handle any collections
  metadata?: {
    totalRecords: number;
    collectionCount: number;
    backupType: string;
    note: string;
  };
}

interface BackupStats {
  technicians: number;
  customers: number;
  workOrders: number;
  sales: number;
  calendarEvents: number;
  deviceCategories: number;
  total: number;
}

const BackupWindow: React.FC = () => {
  const [stats, setStats] = useState<BackupStats | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [message, setMessage] = useState('');
  const [serverSyncEnabled, setServerSyncEnabled] = useState<boolean>(false);
  const [serverPath, setServerPath] = useState<string>('');
  const [serverHost, setServerHost] = useState<string>('');
  const [serverShare, setServerShare] = useState<string>('');
  const [useCustomServerPath, setUseCustomServerPath] = useState<boolean>(false);
  const [useCustomServerBackups, setUseCustomServerBackups] = useState<boolean>(false);
  const [serverBackupsPath, setServerBackupsPath] = useState<string>('');
  const [serverAutoSync, setServerAutoSync] = useState<boolean>(true);
  const [serverBackupToLocal, setServerBackupToLocal] = useState<boolean>(true);
  const [serverBackupToServer, setServerBackupToServer] = useState<boolean>(true);
  const [serverLastSyncAt, setServerLastSyncAt] = useState<string>('');
  const [serverLastTestAt, setServerLastTestAt] = useState<string>('');
  const [serverLastOkAt, setServerLastOkAt] = useState<string>('');
  const [serverLastError, setServerLastError] = useState<string>('');
  const [serverResolvedRoot, setServerResolvedRoot] = useState<string>('');
  const [serverBusy, setServerBusy] = useState<boolean>(false);
  const [preview, setPreview] = useState<{
    filePath: string;
    isComprehensive: boolean;
    collections: string[];
    counts: Record<string, number>;
    totalRecords: number;
  } | null>(null);
  const [busyEncrypt, setBusyEncrypt] = useState(false);
  const [busyDecrypt, setBusyDecrypt] = useState(false);
  // No password required for backup/restore
  const [lastBackupPath, setLastBackupPath] = useState<string>('');
  const [lastUpdateTime, setLastUpdateTime] = useState<string>('');
  const [isDataLive, setIsDataLive] = useState(true);
  const [autoBackupEnabled, setAutoBackupEnabled] = useState<boolean>(true);
  const [autoBackupSaving, setAutoBackupSaving] = useState<boolean>(false);
  const [autoBackupTime, setAutoBackupTime] = useState<string>('21:00');
  const [serverDropdownOpen, setServerDropdownOpen] = useState<boolean>(false);
  const [showInstructionsMenu, setShowInstructionsMenu] = useState<boolean>(false);
  const [activeInstructionsKey, setActiveInstructionsKey] = useState<string | null>(null);
  const instructionsMenuRef = useRef<HTMLDivElement | null>(null);
  const hasElectron = typeof (window as any).api !== 'undefined';
  const api = hasElectron ? (window as any).api : null;

  const serverConnected = Boolean(serverSyncEnabled && serverLastOkAt && !serverLastError);

  const normalizeHostShare = (hostRaw: string, shareRaw: string): { host: string; share: string } => {
    let host = String(hostRaw || '').trim();
    let share = String(shareRaw || '').trim();

    // If the user pasted a UNC like \\SERVER\SHARE into either field, split it.
    const tryParseUnc = (value: string): { host?: string; share?: string } => {
      const v = String(value || '').trim();
      if (!v) return {};
      const parts = v.split(/[\\/]+/).filter(Boolean);
      if (parts.length >= 2) return { host: parts[0], share: parts[1] };
      return {};
    };

    // If host field itself contains a UNC and share is blank, parse host.
    if ((host.startsWith('\\\\') || host.startsWith('//')) && !share) {
      const parsed = tryParseUnc(host);
      if (parsed.host) host = parsed.host;
      if (parsed.share) share = parsed.share;
    }

    // If share contains separators, it might be a full UNC or a share+subfolder.
    if (share.includes('\\') || share.includes('/')) {
      const parsed = tryParseUnc(share);
      if (parsed.host && parsed.share) {
        if (!host || host === parsed.host) {
          host = host || parsed.host;
          share = parsed.share;
        } else {
          // Host already specified; treat first segment as the share name.
          share = parsed.host;
        }
      }
    }

    host = host.replace(/^\\+/, '').replace(/^\/+/, '');
    share = share.replace(/^\\+/, '').replace(/^\/+/, '');
    return { host, share };
  };

  const serverRootPreview = (() => {
    if (useCustomServerPath) return (serverPath || '').trim() || '—';
    const { host, share } = normalizeHostShare(serverHost, serverShare);
    if (!host || !share) return '—';
    // Display as a valid UNC: \\HOST\SHARE\GadgetBoy POS
    return `\\\\${host}\\${share}\\GadgetBoy POS`;
  })();

  const serverBackupsPreview = (() => {
    const explicit = (serverBackupsPath || '').trim();
    if (useCustomServerBackups && explicit) return explicit;
    if (serverRootPreview === '—') return '—';
    return `${serverRootPreview}\\backups`;
  })();

  const instructionSections: Array<{ key: string; title: string }> = [
    { key: 'server', title: 'Server Connection (NAS)' },
    { key: 'sync', title: 'Sync & Offline-First' },
    { key: 'backups', title: 'Backups (Create/Preview)' },
    { key: 'restore', title: 'Restore' },
    { key: 'encrypted', title: 'Encrypted Backups (.gbpos)' },
    { key: 'auto', title: 'Auto Backup (Batch Out)' },
  ];

  useEffect(() => {
    const onDown = (ev: MouseEvent) => {
      if (!showInstructionsMenu) return;
      const el = instructionsMenuRef.current;
      if (!el) return;
      if (!el.contains(ev.target as any)) setShowInstructionsMenu(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showInstructionsMenu]);

  const renderInstructionsBody = (key: string) => {
    if (key === 'server') {
      const uncPreview = (serverHost || '').trim() && (serverShare || '').trim()
        ? `\\\\${serverHost.trim()}\\${serverShare.trim()}`
        : '—';
      return (
        <div className="space-y-2">
          <div className="text-xs text-gray-300">
            Use this to keep a copy of your data and snapshot backups on a NAS/server share.
            The app remains offline-first: it always runs from local data, and the NAS is a sync/backup target.
          </div>
          <div className="text-xs text-gray-300">
            <div className="font-medium text-gray-100">What “Share” means (and why it matters)</div>
            <div>
              On Windows/SMB you connect to <span className="text-gray-100">\\SERVER\SHARE</span>. The <span className="text-gray-100">share</span> is the top-level exported storage.
              After that, you can browse and create subfolders inside the share.
            </div>
          </div>
          <div className="text-xs text-gray-300">
            <div className="font-medium text-gray-100">Setup</div>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Check <span className="text-gray-100">Enable server sync</span>.</li>
              <li>Enter <span className="text-gray-100">NAS IP</span> (or hostname) and <span className="text-gray-100">Share</span> (this is the Windows/SMB share name, not a folder path).</li>
              <li>Click <span className="text-gray-100">Save</span>.</li>
              <li>Click <span className="text-gray-100">Test Connection</span> and confirm the status shows <span className="text-[#39FF14]">Connected</span>. Browsing is enabled after this.</li>
              <li>(Optional) Use <span className="text-gray-100">Browse…</span> to choose a custom <span className="text-gray-100">App data root</span> and/or a custom <span className="text-gray-100">Server backups folder</span>.</li>
            </ol>
          </div>
          <div className="text-xs text-gray-300">
            <div className="font-medium text-gray-100">What the app writes on the NAS</div>
            <div>From the share root, it creates/uses a <span className="text-gray-100">GadgetBoy POS</span> folder and subfolders like <span className="text-gray-100">backups</span>.</div>
          </div>
          <div className="text-xs text-gray-300">
            <div className="font-medium text-gray-100">UNC path preview</div>
            <div className="text-gray-300">{uncPreview}</div>
          </div>
          <div className="text-xs text-gray-300">
            <div className="font-medium text-gray-100">Success indicators</div>
            <ul className="list-disc pl-4 space-y-1">
              <li>Green dot + status <span className="text-gray-100">Connected</span></li>
              <li><span className="text-gray-100">Last OK</span> updates after a successful test/sync</li>
              <li><span className="text-gray-100">Server data root</span> shows the resolved target folder</li>
            </ul>
          </div>
          <div className="text-xs text-gray-300">
            <div className="font-medium text-gray-100">Troubleshooting</div>
            <ul className="list-disc pl-4 space-y-1">
              <li>In Windows File Explorer, try opening <span className="text-gray-100">{uncPreview}</span>. If Windows prompts for credentials, sign in and retry the test.</li>
              <li>The share must allow <span className="text-gray-100">read + write</span> for the Windows user running GadgetBoy POS (it creates a temp file to test).</li>
              <li>If you want a specific subfolder, click <span className="text-gray-100">Browse…</span> (or enable <span className="text-gray-100">Use custom server path (advanced)</span>) and pick/enter a full UNC folder path.</li>
            </ul>
          </div>
        </div>
      );
    }

    if (key === 'sync') {
      return (
        <div className="space-y-2 text-xs text-gray-300">
          <div>
            <div className="font-medium text-gray-100">Offline-first behavior</div>
            <div>The POS always saves and runs from the local database first. If the NAS is offline, your work still saves locally.</div>
          </div>
          <div>
            <div className="font-medium text-gray-100">Sync Now</div>
            <div>Use <span className="text-gray-100">Sync Now</span> to push/pull the database file between this PC and the NAS. The newest copy wins.</div>
          </div>
          <div>
            <div className="font-medium text-gray-100">Auto sync after saves</div>
            <div>When enabled, the app will attempt a background sync after local saves. If it fails, it won’t block your workflow.</div>
          </div>
        </div>
      );
    }

    if (key === 'backups') {
      return (
        <div className="space-y-2 text-xs text-gray-300">
          <div>
            <div className="font-medium text-gray-100">Full Backup</div>
            <div>Creates a complete JSON backup of all available collections.</div>
          </div>
          <div>
            <div className="font-medium text-gray-100">Create Selected</div>
            <div>Select specific data tiles and click <span className="text-gray-100">Create Selected</span> to export only those collections.</div>
          </div>
          <div>
            <div className="font-medium text-gray-100">Preview Backup (Dry-run)</div>
            <div>Shows what would be included (collections + record counts) before you import anything.</div>
          </div>
        </div>
      );
    }

    if (key === 'restore') {
      return (
        <div className="space-y-2 text-xs text-gray-300">
          <div>
            <div className="font-medium text-gray-100">Select & Restore Backup</div>
            <div>Choose a backup file and import it into the app. This replaces the current local data.</div>
          </div>
          <div>
            <div className="font-medium text-gray-100">Safe workflow</div>
            <ol className="list-decimal pl-4 space-y-1">
              <li>Create a fresh <span className="text-gray-100">Full Backup</span> first (so you can roll back).</li>
              <li>Use <span className="text-gray-100">Preview Backup</span> to confirm what you’re importing.</li>
              <li>Run the restore, then verify totals and recent work orders.</li>
            </ol>
          </div>
        </div>
      );
    }

    if (key === 'encrypted') {
      return (
        <div className="space-y-2 text-xs text-gray-300">
          <div>
            <div className="font-medium text-gray-100">What it is</div>
            <div>Encrypted backups are password-protected <span className="text-gray-100">.gbpos</span> files (AES-256-GCM + compression).</div>
          </div>
          <div>
            <div className="font-medium text-gray-100">Create Encrypted Backup</div>
            <div>Use <span className="text-gray-100">Create Encrypted Backup (.gbpos)</span> when you need to store/send backups securely.</div>
          </div>
          <div>
            <div className="font-medium text-gray-100">Restore Encrypted</div>
            <div>Use <span className="text-gray-100">Restore Encrypted (.gbpos)</span> and enter the same password used during creation.</div>
          </div>
        </div>
      );
    }

    if (key === 'auto') {
      return (
        <div className="space-y-2 text-xs text-gray-300">
          <div>
            <div className="font-medium text-gray-100">Auto backup at Batch Out</div>
            <div>When enabled, the app will automatically create a snapshot backup at the configured time.</div>
          </div>
          <div>
            <div className="font-medium text-gray-100">Local vs Server targets</div>
            <div>In the Server section, choose whether automatic snapshots go to <span className="text-gray-100">Local</span>, <span className="text-gray-100">Server</span>, or both.</div>
          </div>
        </div>
      );
    }

    return (
      <div className="text-xs text-gray-300">Select a section from the Instructions menu.</div>
    );
  };
  type TileDef = {
    key: string;
    label: string;
    collections: string[];
    count: number;
    // Optional per-collection filters (OR-combined across tiles when exporting)
    collectionFilters?: Record<string, (item: any) => boolean>;
  };
  const coreKeys = ['technicians','customers','workOrders','sales','calendarEvents','deviceCategories'];
  const allData: Record<string, any[]> = (typeof window !== 'undefined' && (window as any)._currentBackupData) || {};
  // Selected collections (plain set of collection names)
  const [selectedCollections, setSelectedCollections] = useState<Set<string>>(new Set());

  // Hoisted helper: classify legacy/derived schedule entries so we can exclude them
  function isLegacyScheduleEvent(e: any) {
    try {
      const t = (e?.type || e?.kind || e?.category || '').toString().toLowerCase();
      if (t === 'schedule') return true;
      if (e?.legacy === true) return true;
      if (e?.derived === true) return true;
      if (typeof e?.technicianId !== 'undefined' || typeof e?.techId !== 'undefined') return true;
      if (Array.isArray(e?.tags) && e.tags.map((x: any) => String(x).toLowerCase()).includes('schedule')) return true;
    } catch {}
    return false;
  }

  // Build tile definitions combining core tiles and extras (grouping certain collections)
  const tileDefs: TileDef[] = (() => {
    const tiles: TileDef[] = [];
    // Core tiles
    tiles.push({ key: 'Technicians', label: 'Technicians', collections: ['technicians'], count: stats?.technicians ?? ((allData.technicians || []).length) });
    tiles.push({ key: 'Customers', label: 'Customers', collections: ['customers'], count: stats?.customers ?? ((allData.customers || []).length) });
    tiles.push({ key: 'WorkOrders', label: 'Work Orders', collections: ['workOrders'], count: stats?.workOrders ?? ((allData.workOrders || []).length) });
    tiles.push({ key: 'Sales', label: 'Sales', collections: ['sales'], count: stats?.sales ?? ((allData.sales || []).length) });
    // Calendar sub-tiles
    // Helper guards
    const isParts = (e: any) => (e?.category || e?.type || e?.kind)?.toString().toLowerCase() === 'parts';
    const isEvent = (e: any) => (e?.category || e?.type || e?.kind)?.toString().toLowerCase() === 'event';
    const isConsult = (e: any) => (e?.category || e?.type || e?.kind)?.toString().toLowerCase() === 'consultation';
    // Counts from available data (respect legacy schedule filtering)
    const calendarList = Array.isArray(allData.calendarEvents) ? allData.calendarEvents.filter((e: any) => !isLegacyScheduleEvent(e)) : [];
    const partsCount = calendarList.filter(isParts).length;
    const eventsCount = calendarList.filter(isEvent).length;
    const consultCount = calendarList.filter(isConsult).length;
    // Schedules: derived from technicians' schedule definitions
    const techsList = Array.isArray(allData.technicians) ? allData.technicians : [];
    const hasSched = (t: any) => {
      const s = t?.schedule || {};
      const days = ['sun','mon','tue','wed','thu','fri','sat'];
      return days.some((d) => !!s?.[d]?.off || (!!s?.[d]?.start && !!s?.[d]?.end));
    };
    const schedulesCount = techsList.filter(hasSched).length;
    tiles.push({ key: 'Calendar: Schedules', label: 'Calendar: Schedules', collections: ['technicians'], count: schedulesCount });
    tiles.push({ key: 'Calendar: Orders/Parts', label: 'Calendar: Orders/Parts', collections: ['calendarEvents'], count: partsCount, collectionFilters: { calendarEvents: isParts } });
    tiles.push({ key: 'Calendar: Events', label: 'Calendar: Events', collections: ['calendarEvents'], count: eventsCount, collectionFilters: { calendarEvents: isEvent } });
    tiles.push({ key: 'Calendar: Consultations', label: 'Calendar: Consultations', collections: ['calendarEvents'], count: consultCount, collectionFilters: { calendarEvents: isConsult } });
    tiles.push({ key: 'DeviceCategories', label: 'Device Categories', collections: ['deviceCategories'], count: stats?.deviceCategories ?? ((allData.deviceCategories || []).length) });
    // Additional explicit tiles (no overlap with others)
    tiles.push({ key: 'TimeEntries', label: 'Time Entries', collections: ['timeEntries'], count: (allData.timeEntries || []).length });
    tiles.push({ key: 'RepairCategories', label: 'Repair Categories', collections: ['repairCategories'], count: (allData.repairCategories || []).length });
    tiles.push({ key: 'RepairItems', label: 'Repair Items', collections: ['repairItems'], count: (allData.repairItems || []).length });
    tiles.push({ key: 'PartSources', label: 'Part Sources', collections: ['partSources'], count: (allData.partSources || []).length });
    tiles.push({ key: 'IntakeSources', label: 'Intake Sources', collections: ['intakeSources'], count: (allData.intakeSources || []).length });
    // Extras from allData keys (skip core and grouped children)
    const skip = new Set([
      'technicians','customers','workOrders','sales','calendarEvents','deviceCategories',
      'timeEntries','repairCategories','repairItems','partSources','intakeSources','products','productCategories'
    ]);
    const keys = Object.keys(allData || {});
    for (const k of keys) {
      if (skip.has(k)) continue;
      if (k === 'repairCategories') { /* handled explicitly above */ continue; }
      if (k === 'products') {
        tiles.push({ key: 'Products', label: 'Products', collections: ['products'], count: (allData.products || []).length });
        continue;
      }
      if (k === 'productCategories') {
        tiles.push({ key: 'ProductCategories', label: 'Product Categories', collections: ['productCategories'], count: (allData.productCategories || []).length });
        continue;
      }
      // Generic tile for any other collection
      const label = k.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
      tiles.push({ key: `Misc:${k}`, label, collections: [k], count: Array.isArray(allData[k]) ? allData[k].length : 0 });
    }
    return tiles;
  })();

  useEffect(() => {
    loadDataStats();
    loadLastBackupPath();
    loadAutoBackup();
    loadServerSync();
    setupDataChangeListeners();
    
    // Show initial message that data is being loaded
  setMessage('🔍 Scanning all data sources...');
    setTimeout(() => {
      setMessage('✅ Complete data inventory ready - Backup will capture everything currently accessible');
      setTimeout(() => setMessage(''), 4000);
    }, 1000);
    
    // Cleanup event listeners on unmount
    return () => {
      if (typeof (window as any)._backupWindowCleanup === 'function') {
        try {
          (window as any)._backupWindowCleanup();
          delete (window as any)._backupWindowCleanup;
        } catch (e) {
          console.warn('Error during backup window cleanup:', e);
        }
      }
    };
  }, []);

  const loadServerSync = async () => {
    try {
      const api = (window as any).api;
      if (!api?.serverSyncGetConfig) return;
      const res = await api.serverSyncGetConfig();
      if (!res?.ok) return;
      const cfg = res?.config || {};
      setServerSyncEnabled(cfg?.enabled === true);
      const host = typeof cfg?.serverHost === 'string' ? cfg.serverHost : '';
      const share = typeof cfg?.serverShare === 'string' ? cfg.serverShare : '';
      setServerHost(host);
      setServerShare(share);
      setServerPath(typeof cfg?.serverPath === 'string' ? cfg.serverPath : '');
      const backupsPath = typeof cfg?.serverBackupsPath === 'string' ? cfg.serverBackupsPath : '';
      setServerBackupsPath(backupsPath);
      setUseCustomServerBackups(Boolean((backupsPath || '').trim()));
      setServerAutoSync(cfg?.autoSync !== false);
      setServerBackupToLocal(cfg?.backupToLocal !== false);
      setServerBackupToServer(cfg?.backupToServer !== false);
      setServerLastSyncAt(typeof cfg?.lastSyncAt === 'string' ? cfg.lastSyncAt : '');
      setServerLastTestAt(typeof cfg?.lastTestAt === 'string' ? cfg.lastTestAt : '');
      setServerLastOkAt(typeof cfg?.lastOkAt === 'string' ? cfg.lastOkAt : '');
      setServerLastError(typeof cfg?.lastError === 'string' ? cfg.lastError : '');
      // If we have a custom path and no host/share, default to custom mode.
      const hasCustom = typeof cfg?.serverPath === 'string' && cfg.serverPath.trim().length > 0;
      const hasHostShare = (host || '').trim() && (share || '').trim();
      setUseCustomServerPath(!!(hasCustom && !hasHostShare));
    } catch (e) {
      console.warn('Server sync config load failed', e);
    }
  };

  const saveServerSync = async (patch?: Record<string, any>) => {
    const api = (window as any).api;
    if (!api?.serverSyncSetConfig) return;
    const effectiveServerPath = useCustomServerPath ? (serverPath || '').trim() : '';
    const { host: normalizedHost, share: normalizedShare } = normalizeHostShare(serverHost, serverShare);
    const basePatch = {
      enabled: serverSyncEnabled,
      serverPath: effectiveServerPath,
      serverHost: normalizedHost,
      serverShare: normalizedShare,
      serverBackupsPath: useCustomServerBackups ? (serverBackupsPath || '').trim() : '',
      autoSync: serverAutoSync,
      backupToLocal: serverBackupToLocal,
      backupToServer: serverBackupToServer,
    };
    const res = await api.serverSyncSetConfig({ ...basePatch, ...(patch || {}) });
    if (res?.ok) {
      const cfg = res?.config || {};
      setServerSyncEnabled(cfg?.enabled === true);
      setServerHost(typeof cfg?.serverHost === 'string' ? cfg.serverHost : '');
      setServerShare(typeof cfg?.serverShare === 'string' ? cfg.serverShare : '');
      setServerPath(typeof cfg?.serverPath === 'string' ? cfg.serverPath : '');
      const backupsPath = typeof cfg?.serverBackupsPath === 'string' ? cfg.serverBackupsPath : '';
      setServerBackupsPath(backupsPath);
      setUseCustomServerBackups(Boolean((backupsPath || '').trim()));
      setServerAutoSync(cfg?.autoSync !== false);
      setServerBackupToLocal(cfg?.backupToLocal !== false);
      setServerBackupToServer(cfg?.backupToServer !== false);
      setServerLastSyncAt(typeof cfg?.lastSyncAt === 'string' ? cfg.lastSyncAt : '');
      setServerLastTestAt(typeof cfg?.lastTestAt === 'string' ? cfg.lastTestAt : '');
      setServerLastOkAt(typeof cfg?.lastOkAt === 'string' ? cfg.lastOkAt : '');
      setServerLastError(typeof cfg?.lastError === 'string' ? cfg.lastError : '');
      return true;
    }
    return false;
  };

  const handleServerTest = async () => {
    const api = (window as any).api;
    if (!api?.serverSyncTest) return;
    setServerBusy(true);
    try {
      await saveServerSync();
      const res = await api.serverSyncTest();
      if (res?.ok) {
        setServerResolvedRoot(res?.serverRoot || '');
        setMessage(`✅ Server connection OK${res?.serverRoot ? `: ${res.serverRoot}` : ''}`);
      } else {
        setServerResolvedRoot(res?.serverRoot || '');
        setMessage(`❌ Server connection failed: ${res?.error || 'Unknown error'}`);
      }
      await loadServerSync();
    } catch (e) {
      console.error('Server test failed', e);
      setMessage('❌ Server connection test failed');
    } finally {
      setServerBusy(false);
    }
  };

  const handleServerBrowse = async () => {
    const api = (window as any).api;
    if (!api?.serverSyncBrowse) return;
    if (!serverConnected) {
      setMessage('ℹ️ Run “Test Connection” first to enable browsing');
      return;
    }
    const computedUnc = (() => {
      const host = (serverHost || '').trim();
      const share = (serverShare || '').trim().replace(/^\\+/, '').replace(/^\/+/, '');
      if (!host || !share) return '';
      return `\\\\${host}\\${share}`;
    })();
    const basePath = (serverResolvedRoot || serverRootPreview || (useCustomServerPath ? (serverPath || '').trim() : computedUnc) || computedUnc || (serverPath || '').trim()).toString().trim();
    setServerBusy(true);
    try {
      const res = await api.serverSyncBrowse({ basePath });
      if (res?.ok && res?.path) {
        setUseCustomServerPath(true);
        setServerPath(String(res.path));
        setServerResolvedRoot(String(res.path));
        setMessage(`✅ Selected server folder: ${res.path}`);
      }
    } catch (e) {
      console.warn('Server browse failed', e);
    } finally {
      setServerBusy(false);
    }
  };

  const handleServerBrowseBackups = async () => {
    const api = (window as any).api;
    if (!api?.serverSyncBrowse) return;
    if (!serverConnected) {
      setMessage('ℹ️ Run “Test Connection” first to enable browsing');
      return;
    }
    const basePath = ((useCustomServerBackups ? (serverBackupsPath || '').trim() : '') || serverBackupsPreview || serverResolvedRoot || serverRootPreview || '').toString().trim();
    setServerBusy(true);
    try {
      const res = await api.serverSyncBrowse({ basePath });
      if (res?.ok && res?.path) {
        setUseCustomServerBackups(true);
        setServerBackupsPath(String(res.path));
        setMessage(`✅ Selected server backups folder: ${res.path}`);
      } else if (res?.error) {
        setMessage(`❌ Browse failed: ${res.error}`);
      }
    } catch (e) {
      console.warn('Server backups browse failed', e);
    } finally {
      setServerBusy(false);
    }
  };

  const handleServerSyncNow = async (direction: 'auto' | 'push' | 'pull' = 'auto') => {
    const api = (window as any).api;
    if (!api?.serverSyncNow) return;
    setServerBusy(true);
    try {
      await saveServerSync();
      setMessage('🔄 Syncing with server...');
      const res = await api.serverSyncNow(direction);
      if (res?.ok) {
        setMessage(`✅ Sync complete (${res?.action || 'ok'})`);
      } else {
        setMessage(`❌ Sync failed: ${res?.error || 'Unknown error'}`);
      }
      await loadServerSync();
    } catch (e) {
      console.error('Server sync failed', e);
      setMessage('❌ Sync failed');
    } finally {
      setServerBusy(false);
    }
  };

  const handleServerBackupNow = async () => {
    const api = (window as any).api;
    if (!api?.serverBackupNow) return;
    setServerBusy(true);
    try {
      await saveServerSync();
      setMessage('💾 Creating DB snapshot backup...');
      const res = await api.serverBackupNow('manual');
      if (res?.ok) {
        const localMsg = res?.localBackupPath ? 'local' : '';
        const serverMsg = res?.serverBackupPath ? (localMsg ? '+server' : 'server') : '';
        const where = (localMsg || serverMsg) ? `${localMsg}${serverMsg}` : 'done';
        setMessage(`✅ Snapshot backup created (${where})`);
      } else {
        setMessage(`❌ Snapshot backup failed: ${res?.error || 'Unknown error'}`);
      }
      if (res?.serverError) {
        setMessage(`⚠️ Server backup warning: ${res.serverError}`);
      }
      await loadServerSync();
    } catch (e) {
      console.error('Server snapshot backup failed', e);
      setMessage('❌ Snapshot backup failed');
    } finally {
      setServerBusy(false);
    }
  };

  const setupDataChangeListeners = () => {
    const api = (window as any).api;
    if (!api) return;

    const refreshData = () => {
      console.log('Data changed - refreshing backup window stats');
      setMessage('🔄 Refreshing data...');
      setIsDataLive(false);
      
      // Slight delay to show the refreshing message
      setTimeout(async () => {
        await loadDataStats();
        setMessage(`✅ Data refreshed - ${new Date().toLocaleTimeString()}`);
        
        // Clear the success message after 3 seconds
        setTimeout(() => {
          setMessage('');
        }, 3000);
      }, 100);
    };

    try {
      // Set up listeners for all data collections using existing preload functions
      const cleanupFunctions: (() => void)[] = [];

      if (api.onWorkOrdersChanged) {
        cleanupFunctions.push(api.onWorkOrdersChanged(refreshData));
      }
      if (api.onCustomersChanged) {
        cleanupFunctions.push(api.onCustomersChanged(refreshData));
      }
      if (api.onSalesChanged) {
        cleanupFunctions.push(api.onSalesChanged(refreshData));
      }
      if (api.onDeviceCategoriesChanged) {
        cleanupFunctions.push(api.onDeviceCategoriesChanged(refreshData));
      }
      if (api.onTechniciansChanged) {
        cleanupFunctions.push(api.onTechniciansChanged(refreshData));
      }
      if (api.onProductCategoriesChanged) {
        cleanupFunctions.push(api.onProductCategoriesChanged(refreshData));
      }
      if (api.onProductsChanged) {
        cleanupFunctions.push(api.onProductsChanged(refreshData));
      }
      if (api.onPartSourcesChanged) {
        cleanupFunctions.push(api.onPartSourcesChanged(refreshData));
      }
      if (api.onCalendarEventsChanged) {
        cleanupFunctions.push(api.onCalendarEventsChanged(refreshData));
      }

      // Store cleanup functions for component unmount
      (window as any)._backupWindowCleanup = () => {
        cleanupFunctions.forEach(cleanup => cleanup());
      };

    } catch (error) {
      console.warn('Could not setup data change listeners:', error);
    }
  };

  // Summarize a picked backup file into counts
  function summarizeBackupData(data: any) {
    const hasCollections = data && typeof data === 'object' && data.collections && typeof data.collections === 'object';
    const root = hasCollections ? data.collections : data || {};
    const collections = Object.keys(root);
    const counts: Record<string, number> = {};
    let total = 0;
    for (const k of collections) {
      const v = (root as any)[k];
      const n = Array.isArray(v) ? v.length : 0;
      counts[k] = n;
      total += n;
    }
    return { isComprehensive: !!hasCollections, collections, counts, totalRecords: total };
  }

  const handlePreviewBackup = async () => {
    setIsProcessing(true);
    setMessage('🔎 Selecting backup to preview...');
    try {
      const res = await (window as any).api.backupPickAndRead();
      if (!res?.ok || res?.canceled) {
        setMessage('⚠️ Preview canceled');
        setPreview(null);
        return;
      }
      const summary = summarizeBackupData(res.data);
      setPreview({ filePath: res.filePath, ...summary });
      setMessage('✅ Preview ready');
    } catch (e) {
      console.error('Preview failed:', e);
      setMessage('❌ Failed to preview backup');
      setPreview(null);
    } finally {
      setIsProcessing(false);
    }
  };

  const buildFullBackupPayload = (allCurrentData: Record<string, any[]>) => ({
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    source: 'Local Database',
    dataComplete: true,
    scanTimestamp: lastUpdateTime,
    collections: {
      ...allCurrentData,
      calendarEvents: Array.isArray(allCurrentData.calendarEvents)
        ? allCurrentData.calendarEvents.filter((e: any) => !isLegacyScheduleEvent(e))
        : allCurrentData.calendarEvents,
    },
    metadata: {
      totalRecords: Object.values(allCurrentData).reduce((sum: number, collection: any) =>
        sum + (Array.isArray(collection) ? collection.length : 0), 0),
      collectionCount: Object.keys(allCurrentData).length,
      backupType: 'comprehensive',
      note: 'Contains all data currently accessible by the application'
    }
  });

  const ensureCurrentData = async (): Promise<Record<string, any[]>> => {
    let allCurrentData = (window as any)._currentBackupData;
    if (!allCurrentData) {
      setMessage('🔍 Performing final data scan...');
      await loadDataStats();
      allCurrentData = (window as any)._currentBackupData || {};
    }
    return allCurrentData;
  };

  const handleCreateEncryptedBackup = async () => {
    try {
      setBusyEncrypt(true);
      setMessage('🔐 Preparing encrypted backup...');
      await loadDataStats();
      const data = await ensureCurrentData();
      const backupData = buildFullBackupPayload(data);
      const pwd1 = window.prompt('Enter a password to encrypt the backup (.gbpos):');
      if (!pwd1) { setMessage('⚠️ Encryption canceled'); return; }
      const pwd2 = window.prompt('Confirm password:');
      if (pwd1 !== pwd2) { setMessage('❌ Passwords do not match'); return; }
      const res = await (window as any).api.createEncryptedBackup(backupData, pwd1);
      if (res?.ok || res?.success) {
        const path = res.filePath || '';
        setLastBackupPath(path);
        setMessage(`✅ Encrypted backup saved: ${path}`);
      } else if (res?.canceled) {
        setMessage('⚠️ Encryption canceled');
      } else {
        setMessage(`❌ Failed to create encrypted backup: ${res?.error || 'Unknown error'}`);
      }
    } catch (e) {
      console.error('Encrypted backup failed:', e);
      setMessage('❌ Failed to create encrypted backup');
    } finally {
      setBusyEncrypt(false);
    }
  };

  const handleRestoreEncryptedBackup = async () => {
    try {
      setBusyDecrypt(true);
      setMessage('🔐 Select encrypted backup to restore (.gbpos)...');
      const pwd = window.prompt('Enter password to decrypt the backup (.gbpos):');
      if (!pwd) { setMessage('⚠️ Restore canceled'); return; }
      const res = await (window as any).api.restoreEncryptedBackup(pwd);
      if (res?.ok || res?.success) {
        setMessage('✅ Encrypted backup restored');
        setTimeout(() => { loadDataStats(); }, 500);
      } else {
        setMessage(`❌ Restore failed: ${res?.error || 'Invalid password or corrupted file'}`);
      }
    } catch (e) {
      console.error('Encrypted restore failed:', e);
      setMessage('❌ Failed to restore encrypted backup');
    } finally {
      setBusyDecrypt(false);
    }
  };

  const loadDataStats = async () => {
    try {
      setMessage('🔍 Scanning all available data sources...');
      
      // Comprehensive data scan - get everything the application can currently access
      const dataCollections = Array.from(new Set([
        'technicians','timeEntries','customers','workOrders','sales','calendarEvents','deviceCategories','productCategories','products','partSources','repairCategories','repairItems','intakeSources',
        // additional potential collections often used
        'suppliers','vendors','invoices','payments','settings','preferences','userProfiles','systemLogs'
      ]));

      const collectedData: Record<string, any[]> = {};
      let totalRecords = 0;
      let availableCollections = 0;

      console.log('🔍 Starting comprehensive data scan...');

      for (const collection of dataCollections) {
        try {
          const data = await (window as any).api.dbGet(collection) || [];
          if (data && Array.isArray(data) && data.length > 0) {
            collectedData[collection] = data;
            totalRecords += data.length;
            availableCollections++;
            console.log(`✅ ${collection}: ${data.length} records`);
          } else if (data && Array.isArray(data)) {
            collectedData[collection] = data;
            console.log(`📭 ${collection}: empty collection`);
          }
        } catch (error) {
          console.log(`⚠️ ${collection}: not available or error accessing`);
        }
      }

      // Core collections for display (always show these even if empty)
      const calendarClean = Array.isArray(collectedData.calendarEvents)
        ? collectedData.calendarEvents.filter((e: any) => !isLegacyScheduleEvent(e))
        : [];
      const coreStats = {
        technicians: (collectedData.technicians || []).length,
        customers: (collectedData.customers || []).length,
        workOrders: (collectedData.workOrders || []).length,
        sales: (collectedData.sales || []).length,
        calendarEvents: calendarClean.length,
        deviceCategories: (collectedData.deviceCategories || []).length,
        total: totalRecords
      };

      setStats(coreStats);
      setLastUpdateTime(new Date().toLocaleString());
      setIsDataLive(true);
      
      console.log(`📊 Data scan complete: ${availableCollections} collections, ${totalRecords} total records`);
      console.log('Available data:', Object.keys(collectedData));
      
      // Store the complete collected data for backup operations
      (window as any)._currentBackupData = collectedData;
      
    } catch (error) {
      console.error('Failed to load data stats:', error);
      setMessage('❌ Failed to scan data sources');
      setIsDataLive(false);
    }
  };

  const loadLastBackupPath = async () => {
    try {
      const path = await (window as any).api.getLastBackupPath?.() || '';
      setLastBackupPath(path);
    } catch (error) {
      // Ignore if method doesn't exist yet
    }
  };

  const updateEodSettings = async (patch: Record<string, any>) => {
    const api = (window as any).api;
    if (!api?.dbGet || !api?.dbAdd) return null;
    const rows = await api.dbGet('eodSettings').catch(() => []);
    const current = Array.isArray(rows) && rows[0] ? rows[0] : null;
    const fallback = {
      includeWorkOrders: true,
      includeSales: true,
      includeOutstanding: true,
      includePayments: true,
      includeCounts: true,
      includeBatchInfo: true,
      schedule: 'daily',
      sendTime: '18:00',
      batchOutTime: '21:00',
      subjectTemplate: 'Reports - {{date}}',
      recipients: '',
      headline: '',
      notes: '',
      emailBody: '',
      lastSentAt: null,
      autoBackup: true,
    };
    const next = { ...fallback, ...current, ...patch };
    if (current?.id) {
      await api.dbUpdate('eodSettings', current.id, next);
    } else {
      const created = await api.dbAdd('eodSettings', next);
      if (created?.id) next.id = created.id;
    }
    return next;
  };

  const loadAutoBackup = async () => {
    try {
      const api = (window as any).api;
      if (!api?.dbGet) return;
      const rows = await api.dbGet('eodSettings').catch(() => []);
      const settings = Array.isArray(rows) && rows[0] ? rows[0] : null;
      const enabled = settings?.autoBackup !== false;
      const time = settings?.batchOutTime || settings?.sendTime || '21:00';
      setAutoBackupEnabled(enabled);
      setAutoBackupTime(time);
    } catch (e) {
      console.warn('Auto-backup load failed', e);
    }
  };

  const handleToggleAutoBackup = async (enabled: boolean) => {
    setAutoBackupEnabled(enabled);
    setAutoBackupSaving(true);
    try {
      const next = await updateEodSettings({ autoBackup: enabled });
      if (next) setAutoBackupTime(next.batchOutTime || next.sendTime || '21:00');
      setMessage(enabled ? '✅ Auto backup enabled (runs at batch-out time).' : '⚠️ Auto backup disabled.');
    } catch (e) {
      console.error('Auto-backup toggle failed', e);
      setAutoBackupEnabled(!enabled);
      setMessage('❌ Failed to update auto backup setting');
    } finally {
      setAutoBackupSaving(false);
    }
  };

  const handleAutoBackupTimeChange = async (val: string) => {
    setAutoBackupTime(val);
    setAutoBackupSaving(true);
    try {
      await updateEodSettings({ batchOutTime: val });
      setMessage(`⏰ Auto backup time set to ${val || '21:00'}`);
    } catch (e) {
      console.error('Auto-backup time update failed', e);
      setMessage('❌ Failed to update auto backup time');
    } finally {
      setAutoBackupSaving(false);
    }
  };

  const validatePassword = () => true;

  

  const handleCreateBackup = async () => {
    setIsProcessing(true);
    setMessage('📦 Refreshing data and creating backup...');

    try {
      // First refresh the data stats to ensure we have current data
      await loadDataStats();
      
  setMessage('📦 Creating backup with all current data...');
      
      // Use the comprehensive data that was scanned, or perform fresh scan if needed
      let allCurrentData = (window as any)._currentBackupData;
      if (!allCurrentData) {
        setMessage('🔍 Performing final data scan...');
        await loadDataStats();
        allCurrentData = (window as any)._currentBackupData || {};
      }

      // Create backup with ALL available data (not just hardcoded collections)
      const backupData = {
        version: '1.0.0',
        timestamp: new Date().toISOString(),
        source: 'Local Database', // Will change to 'Server' when connected
        dataComplete: true,
        scanTimestamp: lastUpdateTime,
        collections: {
          ...allCurrentData,
          // Exclude legacy/derived schedule entries from calendar export
          calendarEvents: Array.isArray(allCurrentData.calendarEvents)
            ? allCurrentData.calendarEvents.filter((e: any) => !isLegacyScheduleEvent(e))
            : allCurrentData.calendarEvents,
        },
        metadata: {
          totalRecords: Object.values(allCurrentData).reduce((sum: number, collection: any) => 
            sum + (Array.isArray(collection) ? collection.length : 0), 0),
          collectionCount: Object.keys(allCurrentData).length,
          backupType: 'comprehensive',
          note: 'Contains all data currently accessible by the application'
        }
      };

    // Use existing export path (plain JSON)
    const result = await (window as any).api.backupExportPayloadNamed(backupData, 'full-backup');
      
      if (result?.ok) {
        setMessage(`✅ Backup created successfully at: ${result.filePath}`);
        setLastBackupPath(result.filePath);
  // nothing to clear
      } else {
        setMessage(`❌ Backup failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Backup creation failed:', error);
      setMessage('❌ Failed to create backup');
    } finally {
      setIsProcessing(false);
    }
  };

  const createSectionBackup = async (collections: string[], label: string) => {
    try {
      setIsProcessing(true);
      setMessage(`📦 Creating ${label} backup...`);
      // Build payload of selected collections
      const payload: any = {};
      // Aggregate per-collection filters from selected tiles (OR across tiles for same collection)
      const activeTiles = tileDefs.filter(t => t.collections.every(c => selectedCollections.has(c)));
      const filtersByCollection = new Map<string, Array<(item: any) => boolean>>();
      for (const t of activeTiles) {
        if (!t.collectionFilters) continue;
        for (const [col, fn] of Object.entries(t.collectionFilters)) {
          if (!filtersByCollection.has(col)) filtersByCollection.set(col, []);
          filtersByCollection.get(col)!.push(fn);
        }
      }
      for (const k of collections) {
        const data = await (window as any).api.dbGet(k);
        let list = Array.isArray(data) ? data.slice() : data;
        if (k === 'calendarEvents' && Array.isArray(list)) {
          // Always exclude legacy/derived schedule entries
          list = list.filter((e: any) => !isLegacyScheduleEvent(e));
        }
        // If we have filters for this collection, OR-combine them
        const fns = filtersByCollection.get(k) || [];
        if (Array.isArray(list) && fns.length > 0) {
          list = list.filter(item => fns.some(fn => {
            try { return !!fn(item); } catch { return false; }
          }));
        }
        payload[k] = list;
      }
      const res = await (window as any).api.backupExportPayloadNamed(payload, label);
      if (res?.ok) setMessage(`✅ ${label} backup saved: ${res.filePath}`);
      else if (res?.canceled) setMessage('⚠️ Backup canceled');
      else setMessage(`❌ ${label} backup failed: ${res?.error || 'Unknown error'}`);
    } catch (e) {
      setMessage(`❌ ${label} backup failed`);
    } finally {
      setIsProcessing(false);
    }
  };

  const isTileSelected = (tile: TileDef) => tile.collections.every(c => selectedCollections.has(c));
  const toggleTile = (tile: TileDef) => {
    setSelectedCollections(prev => {
      const next = new Set(prev);
      if (isTileSelected(tile)) {
        // remove all collections for this tile
        tile.collections.forEach(c => next.delete(c));
      } else {
        // add all collections for this tile
        tile.collections.forEach(c => next.add(c));
      }
      return next;
    });
  };
  const selectAll = () => {
    const next = new Set<string>();
    tileDefs.forEach(t => t.collections.forEach(c => next.add(c)));
    setSelectedCollections(next);
  };
  const deselectAll = () => {
    setSelectedCollections(new Set());
  };
  const createSelectedBackup = async () => {
    const collections = Array.from(selectedCollections);
    if (!collections.length) { setMessage('❌ Please select at least one box'); return; }
    const pickedTiles = tileDefs.filter(t => t.collections.every(c => selectedCollections.has(c)));
    const names = pickedTiles.map(p => p.key.replace('Calendar: ', 'Cal-'));
    const label = names.length <= 3 && names.length > 0 ? names.join('+') : `Selected-${names.length || collections.length}`;
    await createSectionBackup(collections, label);
  };

  const handleRestoreBackup = async () => {
    setIsProcessing(true);
    setMessage('🔄 Selecting backup file...');

    try {
  const result = await (window as any).api.backupImport();
      
      if (result?.ok) {
  setMessage(`✅ Backup imported successfully!`);
  // nothing to clear
        // Refresh stats after restore
        setTimeout(() => {
          loadDataStats();
        }, 1000);
      } else {
        setMessage(`❌ Restore failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Backup restore failed:', error);
      setMessage('❌ Failed to restore backup');
    } finally {
      setIsProcessing(false);
    }
  };

  const clearMessage = () => {
    setTimeout(() => setMessage(''), 5000);
  };

  useEffect(() => {
    if (message) clearMessage();
  }, [message]);

  return (
    <div className="h-screen overflow-auto bg-zinc-900 text-gray-100 p-3">
      <div className="max-w-6xl mx-auto space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold text-[#39FF14]">Data Management</h1>
          <div className="relative" ref={instructionsMenuRef}>
            <button
              type="button"
              className="px-3 py-2 bg-zinc-900 border border-zinc-700 rounded text-sm hover:border-[#39FF14] hover:text-[#39FF14] transition"
              onClick={() => setShowInstructionsMenu((v) => !v)}
            >Instructions ▾</button>
            {showInstructionsMenu && (
              <div className="absolute right-0 top-full mt-2 w-72 bg-zinc-900 border border-zinc-700 rounded shadow-lg z-50">
                {instructionSections.map((s) => (
                  <button
                    key={s.key}
                    type="button"
                    className="w-full text-left px-3 py-2 hover:bg-zinc-800 text-sm"
                    onClick={() => {
                      setShowInstructionsMenu(false);
                      setActiveInstructionsKey(s.key);
                    }}
                  >{s.title}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {activeInstructionsKey && (
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="text-sm font-semibold text-gray-100">
                {instructionSections.find((s) => s.key === activeInstructionsKey)?.title || 'Instructions'}
              </div>
              <button
                type="button"
                className="text-xs text-gray-300 hover:text-white underline"
                onClick={() => setActiveInstructionsKey(null)}
              >Close</button>
            </div>
            <div className="mt-2 max-h-64 overflow-auto bg-zinc-900 border border-zinc-700 rounded p-3">
              {renderInstructionsBody(activeInstructionsKey)}
            </div>
          </div>
        )}

        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
          <button
            type="button"
            className="w-full flex items-center justify-between gap-3"
            onClick={() => setServerDropdownOpen(v => !v)}
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="font-medium text-gray-100">Server Connection (NAS)</div>
              <div className="flex items-center gap-2 text-[11px] text-gray-400 shrink-0">
                <div className={`w-2 h-2 rounded-full ${serverSyncEnabled && serverLastOkAt && !serverLastError ? 'bg-[#39FF14]' : (serverSyncEnabled ? 'bg-red-500' : 'bg-zinc-600')}`}></div>
                <span>
                  {(() => {
                    if (!hasElectron) return 'Not running in Electron';
                    if (!api?.serverSyncGetConfig) return 'Update required';
                    if (!serverSyncEnabled) return 'Disabled';
                    if (serverLastOkAt && !serverLastError) return 'Connected';
                    if (serverLastError) return 'Disconnected';
                    return 'Unknown';
                  })()}
                </span>
              </div>
            </div>
            <div className="text-xs text-gray-400 shrink-0">{serverDropdownOpen ? '▴' : '▾'}</div>
          </button>

          {serverDropdownOpen && (
            <div className="mt-3 bg-zinc-900 border border-zinc-700 rounded p-2 text-sm">
              {!hasElectron || !api?.serverSyncGetConfig ? (
                <div className="text-[11px] text-gray-400">
                  Server sync options are only available in the desktop app. If you’re running the dev site in a browser, open this from the Electron app.
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={serverSyncEnabled}
                      onChange={(e) => setServerSyncEnabled(e.target.checked)}
                      disabled={serverBusy}
                    />
                    <span className="text-sm">Enable server sync</span>
                  </div>

                  <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-gray-400 shrink-0">NAS IP</label>
                      <input
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs"
                        placeholder="192.168.1.50"
                        value={serverHost}
                        onChange={(e) => setServerHost(e.target.value)}
                        disabled={serverBusy || !serverSyncEnabled || useCustomServerPath}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="text-[11px] text-gray-400 shrink-0">Share</label>
                      <input
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs"
                        placeholder="POS (share name)"
                        value={serverShare}
                        onChange={(e) => setServerShare(e.target.value)}
                        disabled={serverBusy || !serverSyncEnabled || useCustomServerPath}
                      />
                    </div>
                  </div>

                  <div className="mt-1 text-[11px] text-gray-400">
                    Share is the Windows/SMB share name (not a folder path). Use Browse… or custom path to pick a subfolder.
                  </div>

                  <div className="mt-2 flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={useCustomServerPath}
                      onChange={(e) => setUseCustomServerPath(e.target.checked)}
                      disabled={serverBusy || !serverSyncEnabled}
                    />
                    <span className="text-xs text-gray-300">Use custom server path (advanced)</span>
                  </div>

                  {useCustomServerPath ? (
                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-[11px] text-gray-400 shrink-0">Server path</label>
                      <input
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs"
                        placeholder="\\\\SERVER\\Share (or C:\\temp\\gbpos-nas-test)"
                        value={serverPath}
                        onChange={(e) => setServerPath(e.target.value)}
                        disabled={serverBusy || !serverSyncEnabled}
                      />
                      <Button
                        onClick={handleServerBrowse}
                        disabled={serverBusy || !serverSyncEnabled || !serverConnected}
                        className="text-xs py-1.5 bg-zinc-900 border border-zinc-700 hover:border-[#39FF14] hover:text-[#39FF14]"
                      >Browse…</Button>
                    </div>
                  ) : (
                    <div className="mt-2 flex items-center justify-between gap-2 text-[11px] text-gray-400">
                      <div className="truncate">
                        UNC path: <span className="text-gray-300">{(() => {
                          const { host, share } = normalizeHostShare(serverHost, serverShare);
                          return host && share ? `\\\\${host}\\${share}` : '—';
                        })()}</span>
                      </div>
                      <Button
                        onClick={handleServerBrowse}
                        disabled={serverBusy || !serverSyncEnabled || !serverConnected || !(serverHost || '').trim() || !(serverShare || '').trim()}
                        className="text-xs py-1.5 bg-zinc-900 border border-zinc-700 hover:border-[#39FF14] hover:text-[#39FF14]"
                      >Browse…</Button>
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={serverAutoSync}
                        onChange={(e) => setServerAutoSync(e.target.checked)}
                        disabled={serverBusy || !serverSyncEnabled}
                      />
                      <span>Auto sync after saves</span>
                    </label>
                  </div>

                  <div className="mt-2 bg-zinc-800/40 border border-zinc-700 rounded p-2">
                    <div className="text-xs text-gray-200 font-medium">Automatic snapshot backup targets</div>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-xs">
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={serverBackupToLocal}
                          onChange={(e) => setServerBackupToLocal(e.target.checked)}
                          disabled={serverBusy}
                        />
                        <span>Local</span>
                      </label>
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={serverBackupToServer}
                          onChange={(e) => setServerBackupToServer(e.target.checked)}
                          disabled={serverBusy || !serverSyncEnabled}
                        />
                        <span>Server</span>
                      </label>
                      <span className="text-[11px] text-gray-400">(Used by Batch Out + “Backup Now”)</span>
                    </div>
                  </div>

                  <div className="mt-2 bg-zinc-800/40 border border-zinc-700 rounded p-2">
                    <div className="text-xs text-gray-200 font-medium">Server folders</div>
                    <div className="mt-1 text-[11px] text-gray-400 space-y-0.5">
                      <div className="truncate">App data root: <span className="text-gray-300" title={(serverResolvedRoot || serverRootPreview) || ''}>{serverResolvedRoot || serverRootPreview}</span></div>
                      <div className="truncate">Backups folder: <span className="text-gray-300" title={serverBackupsPreview || ''}>{serverBackupsPreview}</span></div>
                    </div>

                    <div className="mt-2 flex items-center gap-2 text-xs">
                      <label className="flex items-center gap-1">
                        <input
                          type="checkbox"
                          checked={useCustomServerBackups}
                          onChange={(e) => {
                            const next = e.target.checked;
                            setUseCustomServerBackups(next);
                            if (!next) setServerBackupsPath('');
                          }}
                          disabled={serverBusy || !serverSyncEnabled}
                        />
                        <span>Custom server backups folder</span>
                      </label>
                    </div>

                    <div className="mt-2 flex items-center gap-2">
                      <label className="text-[11px] text-gray-400 shrink-0">Backups path</label>
                      <input
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs"
                        placeholder={serverBackupsPreview}
                        value={serverBackupsPath}
                        onChange={(e) => setServerBackupsPath(e.target.value)}
                        disabled={serverBusy || !serverSyncEnabled || !useCustomServerBackups}
                      />
                      <Button
                        onClick={handleServerBrowseBackups}
                        disabled={serverBusy || !serverSyncEnabled || !serverConnected}
                        className="text-xs py-1.5 bg-zinc-900 border border-zinc-700 hover:border-[#39FF14] hover:text-[#39FF14]"
                      >Browse…</Button>
                    </div>
                    <div className="mt-1 text-[11px] text-gray-400">Browse is enabled after a successful Test Connection.</div>
                  </div>

                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Button
                      onClick={async () => {
                        setServerBusy(true);
                        try {
                          const ok = await saveServerSync();
                          setMessage(ok ? '✅ Server settings saved' : '❌ Failed to save server settings');
                        } finally {
                          setServerBusy(false);
                        }
                      }}
                      disabled={serverBusy}
                      className="text-xs py-1.5 bg-indigo-700 hover:bg-indigo-800"
                    >
                      💾 Save
                    </Button>
                    <Button
                      onClick={handleServerTest}
                      disabled={serverBusy || !serverSyncEnabled}
                      className="text-xs py-1.5 bg-indigo-700 hover:bg-indigo-800"
                    >
                      🔌 Test Connection
                    </Button>
                    <Button
                      onClick={() => handleServerSyncNow('auto')}
                      disabled={serverBusy || !serverSyncEnabled}
                      className="text-xs py-1.5 bg-indigo-700 hover:bg-indigo-800"
                    >
                      🔄 Sync Now
                    </Button>
                    <Button
                      onClick={handleServerBackupNow}
                      disabled={serverBusy}
                      className="text-xs py-1.5 bg-indigo-700 hover:bg-indigo-800"
                    >
                      💾 Backup Now
                    </Button>
                  </div>

                  <div className="mt-2 text-[11px] text-gray-400 space-y-0.5">
                    <div className="truncate">Server data root: <span className="text-gray-300" title={serverResolvedRoot || ''}>{serverResolvedRoot || '—'}</span></div>
                    <div className="truncate">Last test: <span className="text-gray-300" title={serverLastTestAt || ''}>{serverLastTestAt || '—'}</span></div>
                    <div className="truncate">Last OK: <span className="text-gray-300" title={serverLastOkAt || ''}>{serverLastOkAt || '—'}</span></div>
                    <div className="truncate">Last sync: <span className="text-gray-300" title={serverLastSyncAt || ''}>{serverLastSyncAt || '—'}</span></div>
                    <div className="truncate">Last error: <span className={serverLastError ? 'text-red-400' : 'text-gray-300'} title={serverLastError || ''}>{serverLastError || '—'}</span></div>
                    <div>Offline-first: the app always uses local data; server is a sync/backup target.</div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>

        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2">
              <h3 className="text-base font-semibold mb-1 text-gray-100">Backups</h3>
              <div className="text-xs text-gray-400">
                Use <span className="text-gray-200 font-medium">Instructions ▾</span> for step-by-step help.
              </div>
              <div className="mt-3 bg-zinc-900 border border-zinc-700 rounded p-2 flex flex-col gap-1 text-sm">
                <div className="flex items-center gap-2">
                  <input type="checkbox" checked={autoBackupEnabled} onChange={e => handleToggleAutoBackup(e.target.checked)} disabled={autoBackupSaving} />
                  <span className="font-medium">Auto backup at Batch Out</span>
                </div>
                <div className="flex items-center gap-2 text-sm">
                  <label className="text-[11px] text-gray-400">Backup time</label>
                  <input
                    type="time"
                    className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs"
                    value={autoBackupTime}
                    onChange={e => handleAutoBackupTimeChange(e.target.value)}
                    disabled={autoBackupSaving}
                  />
                </div>
                <div className="text-[11px] text-gray-400">Runs at the configured time to create an automatic backup. Adjust here; Reports handles email schedules separately.</div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <h2 className="text-lg font-semibold text-gray-100">Backup Actions</h2>
            {lastBackupPath && (
              <div className="truncate text-xs text-gray-400">Last backup: <span className="text-[#39FF14]" title={lastBackupPath}>{lastBackupPath}</span></div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <Button onClick={handleCreateBackup} disabled={isProcessing} className="w-full text-sm py-2.5 bg-indigo-700 hover:bg-indigo-800">
              {isProcessing ? '⏳ Creating...' : '📦 Full Backup'}
            </Button>
            <Button onClick={handleRestoreBackup} disabled={isProcessing} className="w-full text-sm py-2.5 bg-indigo-700 hover:bg-indigo-800">
              {isProcessing ? '⏳ Restoring...' : '📂 Select & Restore Backup'}
            </Button>
            <Button onClick={handleCreateEncryptedBackup} disabled={busyEncrypt} className="w-full text-sm py-2.5 bg-[#39FF14] text-black hover:bg-[#32E610]">
              {busyEncrypt ? '⏳ Encrypting...' : '🔒 Create Encrypted Backup (.gbpos)'}
            </Button>
            <Button onClick={handleRestoreEncryptedBackup} disabled={busyDecrypt} className="w-full text-sm py-2.5 bg-[#39FF14] text-black hover:bg-[#32E610]">
              {busyDecrypt ? '⏳ Decrypting...' : '🔓 Restore Encrypted (.gbpos)'}
            </Button>
            <Button onClick={handlePreviewBackup} disabled={isProcessing} className="w-full text-xs py-2 bg-red-700 hover:bg-red-800 md:col-span-2">
              {isProcessing ? '⏳ Previewing...' : '🔎 Preview Backup (Dry-run)'}
            </Button>
          </div>
        </div>

        {preview && (
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-base font-semibold text-gray-100">Preview Result</h3>
              <button
                className="text-xs text-gray-300 hover:text-white underline"
                onClick={() => setPreview(null)}
              >Clear</button>
            </div>
            <div className="text-xs text-gray-300 space-y-1">
              <div className="truncate"><span className="text-gray-400">File:</span> <span className="text-[#39FF14]" title={preview.filePath}>{preview.filePath}</span></div>
              <div><span className="text-gray-400">Type:</span> {preview.isComprehensive ? 'Comprehensive backup (with metadata)' : 'Plain database snapshot'}</div>
              <div><span className="text-gray-400">Collections:</span> {preview.collections.length}</div>
              <div><span className="text-gray-400">Total records:</span> {preview.totalRecords}</div>
            </div>
            <div className="mt-2 max-h-40 overflow-auto border border-zinc-700 rounded">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-zinc-900 text-gray-300">
                    <th className="text-left px-2 py-1">Collection</th>
                    <th className="text-right px-2 py-1">Count</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.collections.sort().map(k => (
                    <tr key={k} className="border-t border-zinc-700">
                      <td className="px-2 py-1 text-gray-100">{k}</td>
                      <td className="px-2 py-1 text-right text-[#39FF14]">{preview.counts[k] ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="text-[11px] text-gray-400 mt-2">
              To restore this exact file, click “Select & Restore Backup” and choose it. The restore will replace the current database.
            </div>
          </div>
        )}

        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-4">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 mb-3">
            <h2 className="text-lg font-semibold text-gray-100">Select Data to Backup</h2>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="hidden md:flex items-center gap-1">
                <div className={`w-2 h-2 rounded-full ${isDataLive ? 'bg-[#39FF14] animate-pulse' : 'bg-red-500'}`}></div>
                <span className="text-xs text-gray-400">{isDataLive ? 'Live Data' : 'Offline'}</span>
              </div>
              <button onClick={loadDataStats} disabled={isProcessing} className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-xs text-gray-300 disabled:opacity-50">🔄 Refresh</button>
              <button onClick={selectAll} disabled={isProcessing} className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-xs text-gray-300 disabled:opacity-50">✓ Select All</button>
              <button onClick={deselectAll} disabled={isProcessing} className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 border border-zinc-600 rounded text-xs text-gray-300 disabled:opacity-50">✕ Deselect All</button>
              <button onClick={createSelectedBackup} disabled={isProcessing || tileDefs.filter(t => isTileSelected(t)).length === 0} className="px-3 py-1 bg-[#39FF14] text-black rounded text-xs font-medium hover:bg-[#32E610] disabled:opacity-50">Create Selected Backup</button>
              <span className="text-[10px] text-gray-400">Selected: {tileDefs.filter(t => isTileSelected(t)).length}</span>
            </div>
          </div>
          {lastUpdateTime && <div className="text-xs text-gray-500 mb-4">Last updated: {lastUpdateTime}</div>}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {tileDefs.map(tile => {
              const selected = isTileSelected(tile);
              return (
                <button
                  type="button"
                  key={tile.key}
                  onClick={() => toggleTile(tile)}
                  className={`relative text-left p-2 rounded border transition-colors h-16 ${selected ? 'bg-zinc-950 border-[#39FF14] ring-1 ring-[#39FF14]/40' : 'bg-zinc-900 border-zinc-600 hover:bg-zinc-800'}`}
                >
                  <div className="text-xs text-gray-400">{tile.label}</div>
                  <div className="text-xl font-bold text-[#39FF14] leading-none">{tile.count}</div>
                  {selected && (<div className="absolute top-1.5 right-1.5 w-4 h-4 rounded-full bg-[#39FF14] text-black text-[9px] font-bold flex items-center justify-center">✓</div>)}
                </button>
              );
            })}
          </div>
        </div>

        {message && (
          <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-2 text-center text-sm text-gray-100">
            {message}
          </div>
        )}
      </div>
    </div>
  );
};

export default BackupWindow;