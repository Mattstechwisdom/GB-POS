import React, { useState, useEffect } from 'react';
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
  const hasElectron = typeof (window as any).api !== 'undefined';
  const api = hasElectron ? (window as any).api : null;
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
        <h1 className="text-2xl font-bold text-[#39FF14]">Data Backup & Restore</h1>
        <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold mb-1 text-gray-100">Instructions</h3>
              <div className="space-y-0.5 text-xs text-gray-300">
                <p><strong>Create:</strong> Use Full Backup or select tiles then Create Selected.</p>
                <p><strong>Preview:</strong> Use Preview Backup (Dry-run) to see collections and record counts before importing.</p>
                <p><strong>Restore:</strong> Select & Restore a .json file. This replaces current data.</p>
                <p><strong>Encrypted:</strong> Use Encrypted Backup (.gbpos) to password-protect; use Restore Encrypted to load it.</p>
                <p><strong>Format:</strong> Plain JSON (no password) or encrypted .gbpos (AES‑256‑GCM, compressed).</p>
                {lastBackupPath && (
                  <p className="truncate">Last backup: <span className="text-[#39FF14]" title={lastBackupPath}>{lastBackupPath}</span></p>
                )}
              </div>
            </div>
            <div className="shrink-0 w-[380px] flex flex-col gap-2">
              <Button onClick={handleCreateBackup} disabled={isProcessing} className="w-full text-sm py-2.5 bg-indigo-700 hover:bg-indigo-800 col-span-2">
                {isProcessing ? '⏳ Creating...' : '📦 Full Backup'}
              </Button>
              <Button onClick={handleRestoreBackup} disabled={isProcessing} className="w-full text-sm py-2.5 bg-indigo-700 hover:bg-indigo-800 col-span-2">
                {isProcessing ? '⏳ Restoring...' : '📂 Select & Restore Backup'}
              </Button>
              <Button onClick={handleCreateEncryptedBackup} disabled={busyEncrypt} className="w-full text-sm py-2.5 bg-[#39FF14] text-black hover:bg-[#32E610] col-span-2">
                {busyEncrypt ? '⏳ Encrypting...' : '🔒 Create Encrypted Backup (.gbpos)'}
              </Button>
              <Button onClick={handleRestoreEncryptedBackup} disabled={busyDecrypt} className="w-full text-sm py-2.5 bg-[#39FF14] text-black hover:bg-[#32E610] col-span-2">
                {busyDecrypt ? '⏳ Decrypting...' : '🔓 Restore Encrypted (.gbpos)'}
              </Button>
              <Button onClick={handlePreviewBackup} disabled={isProcessing} className="w-full text-xs py-1.5 bg-red-700 hover:bg-red-800 col-span-2">
                {isProcessing ? '⏳ Previewing...' : '🔎 Preview Backup (Dry-run)'}
              </Button>
            </div>
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