import React, { useCallback, useEffect, useRef, useState } from 'react';
import SidebarFilters from './components/SidebarFilters';
import Toolbar from './components/Toolbar';
import WorkOrdersTable from './components/WorkOrdersTable';
import SalesTable from './components/SalesTable';
import CustomerHoverCard from './components/CustomerHoverCard';
import ItemsDescriptionHoverCard from './components/ItemsDescriptionHoverCard';
import Pagination from './components/Pagination';
import RecentCustomers from './components/RecentCustomers';
import CustomerSearchWindow from './components/CustomerSearchWindow';
import ContextMenu, { ContextMenuItem } from './components/ContextMenu';
import { useContextMenu } from './lib/useContextMenu';
import { formatPhone } from './lib/format';
import { PaginationProvider, usePagination } from './lib/pagination';
import { dispatchOpenModal, registerOpenModal, unregisterOpenModal } from './lib/modalBus';
import { storeWindowPayload } from './lib/windowPayload';

// ── Lazy window components (shared chunk cache with main.tsx) ─────────────
const NewWorkOrderWindow        = React.lazy(() => import('./workorders/NewWorkOrderWindow'));
const SaleWindow                = React.lazy(() => import('./sales/SaleWindow'));
const CalendarWindow            = React.lazy(() => import('./components/CalendarWindow'));
const ClockInWindow             = React.lazy(() => import('./components/ClockInWindow'));
const QuoteGeneratorWindow      = React.lazy(() => import('./components/QuoteGeneratorWindow'));
const EODWindow                 = React.lazy(() => import('./components/EODWindow'));
const ProductsWindow            = React.lazy(() => import('./components/ProductsWindow'));
const InventoryWindow           = React.lazy(() => import('./components/InventoryWindow'));
const WorkOrderRepairPickerWindow = React.lazy(() => import('./workorders/WorkOrderRepairPickerWindow'));
const CustomerOverviewWindow    = React.lazy(() => import('./components/CustomerOverviewWindow'));
const QuickSaleWindow           = React.lazy(() => import('./components/QuickSaleWindow'));
const ConsultationBookingWindow = React.lazy(() => import('./components/ConsultationBookingWindow'));
const CheckoutWindow            = React.lazy(() => import('./workorders/CheckoutWindow'));
const DevMenuWindow             = React.lazy(() => import('./components/DevMenuWindow'));
const DataToolsWindow           = React.lazy(() => import('./components/DataToolsWindow'));
const ReportingWindow           = React.lazy(() => import('./components/ReportingWindow'));
const ReportEmailWindow         = React.lazy(() => import('./components/ReportEmailWindow'));
const ChartsWindow              = React.lazy(() => import('./components/ChartsWindow'));
const NotificationsWindow       = React.lazy(() => import('./components/NotificationsWindow'));
const NotificationSettingsWindow = React.lazy(() => import('./components/NotificationSettingsWindow'));
const ReleaseFormWindow         = React.lazy(() => import('./workorders/ReleaseFormWindow'));
const CustomerReceiptWindow     = React.lazy(() => import('./workorders/CustomerReceiptWindow'));
const ProductFormWindow         = React.lazy(() => import('./sales/ProductFormWindow'));
const BackupWindow              = React.lazy(() => import('./components/BackupWindow'));
const ClearDatabaseWindow       = React.lazy(() => import('./components/ClearDatabaseWindow'));
const RepairCategoriesWindow    = React.lazy(() => import('./repairs/RepairCategoriesWindow'));
const DeviceCategoriesWindow    = React.lazy(() => import('./components/DeviceCategoriesWindow'));
const CustomBuildItemWindow     = React.lazy(() => import('./workorders/CustomBuildItemWindow'));

// ── map api method names → modal type ─────────────────────────────────────
const API_TO_MODAL: Record<string, string> = {
  openNewWorkOrder:          'newWorkOrder',
  openNewSale:               'newSale',
  openCalendar:              'calendar',
  openClockIn:               'clockIn',
  openQuoteGenerator:        'quoteGenerator',
  openEod:                   'eod',
  openProducts:              'products',
  openInventory:             'inventory',
  openWorkOrderRepairPicker: 'workOrderRepairPicker',
  openCustomerOverview:      'customerOverview',
  openQuickSale:             'quickSale',
  openConsultation:          'consultation',
  openCheckout:              'checkout',
  openDevMenu:               'devMenu',
  openDataTools:             'dataTools',
  openReporting:             'reporting',
  openReportEmail:           'reportEmail',
  openCharts:                'charts',
  openNotifications:         'notifications',
  openNotificationSettings:  'notificationSettings',
  openReleaseForm:           'releaseForm',
  openCustomerReceipt:       'customerReceipt',
  openProductForm:           'productForm',
  openBackup:                'backup',
  openRepairCategories:      'repairCategories',
  openDeviceCategories:      'deviceCategories',
  openWorkOrder:             'newWorkOrder',
};

interface ModalEntry { id: string; type: string; }

// ── Overlay close button + content shell ─────────────────────────────────
function ModalShell({ entry, zIndex, onClose }: { entry: ModalEntry; zIndex: number; onClose: () => void }) {
  // Close on Escape – only the top-most modal should fire.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true });
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 bg-zinc-900 overflow-y-auto overflow-x-hidden pr-12 pt-12"
      style={{ zIndex }}
      data-modal-shell="1"
    >
      {/* Floating actions + close button */}
      <div
        className="fixed top-2 flex items-center gap-2"
        style={{ zIndex: zIndex + 1, right: 'calc(0.75rem + 32px)' }}
      >
        {entry.type === 'products' && (
          <button
            type="button"
            onClick={() => dispatchOpenModal('inventory')}
            title="Open Inventory"
            className="h-8 px-3 rounded-full bg-[#BC13FE] text-white font-semibold text-sm shadow-lg border border-[#BC13FE] hover:brightness-110 transition"
          >
            Inventory
          </button>
        )}
        <button
          onClick={onClose}
          title="Close window (Esc)"
          className="w-8 h-8 rounded-full bg-zinc-700 hover:bg-red-600 text-zinc-300 hover:text-white flex items-center justify-center text-lg font-bold leading-none shadow-lg transition-colors select-none"
        >
          ✕
        </button>
      </div>
      <React.Suspense fallback={
        <div className="flex items-center justify-center h-screen text-zinc-500">Loading…</div>
      }>
        <ModalContent type={entry.type} onClose={onClose} />
      </React.Suspense>
    </div>
  );
}

// ── Route modal type → window component ──────────────────────────────────
function ModalContent({ type, onClose }: { type: string; onClose: () => void }) {
  switch (type) {
    case 'newWorkOrder':           return <NewWorkOrderWindow />;
    case 'newSale':                return <SaleWindow />;
    case 'calendar':               return <CalendarWindow />;
    case 'clockIn':                return <ClockInWindow />;
    case 'quoteGenerator':         return <QuoteGeneratorWindow />;
    case 'eod':                    return <EODWindow />;
    case 'products':               return <ProductsWindow />;
    case 'inventory':              return <InventoryWindow />;
    case 'workOrderRepairPicker':  return <WorkOrderRepairPickerWindow />;
    case 'customerOverview':       return <CustomerOverviewWindow onClose={onClose} />;
    case 'quickSale':              return <QuickSaleWindow />;
    case 'consultation':           return <ConsultationBookingWindow />;
    case 'checkout':               return <CheckoutWindow />;
    case 'devMenu':                return <DevMenuWindow />;
    case 'dataTools':              return <DataToolsWindow />;
    case 'reporting':              return <ReportingWindow />;
    case 'reportEmail':            return <ReportEmailWindow />;
    case 'charts':                 return <ChartsWindow />;
    case 'notifications':          return <NotificationsWindow />;
    case 'notificationSettings':   return <NotificationSettingsWindow />;
    case 'releaseForm':            return <ReleaseFormWindow />;
    case 'customerReceipt':        return <CustomerReceiptWindow />;
    case 'productForm':            return <ProductFormWindow />;
    case 'backup':                 return <BackupWindow />;
    case 'clearDb':                return <ClearDatabaseWindow />;
    case 'repairCategories':       return <RepairCategoriesWindow mode="admin" />;
    case 'deviceCategories':       return <DeviceCategoriesWindow />;
    case 'customBuildItem':        return <CustomBuildItemWindow />;
    default:                       return <div className="p-8 text-zinc-400">Unknown modal: {type}</div>;
  }
}

function getActivityDate(record: any): Date {
  const raw = record?.activityAt || record?.checkoutDate || record?.repairCompletionDate || record?.clientPickupDate || record?.checkInAt || record?.createdAt || record?.updatedAt || 0;
  return new Date(raw);
}

const App: React.FC = () => {
  const [showCustomerSearch, setShowCustomerSearch] = useState(false);
  const [technicianFilter, setTechnicianFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'open' | 'closed'>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [woQuery, setWoQuery] = useState<string>('');
  const [mode, setMode] = useState<'workorders'|'sales'|'all'>('all');
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <PaginationProvider pageSize={30}>
      <AppInner
        showCustomerSearch={showCustomerSearch}
        setShowCustomerSearch={setShowCustomerSearch}
        technicianFilter={technicianFilter}
        setTechnicianFilter={setTechnicianFilter}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        woQuery={woQuery}
        setWoQuery={setWoQuery}
        mode={mode}
        setMode={setMode}
        refreshKey={refreshKey}
        setRefreshKey={setRefreshKey}
      />
    </PaginationProvider>
  );
};

export default App;

const AppInner: React.FC<{
  showCustomerSearch: boolean;
  setShowCustomerSearch: (v: boolean) => void;
  technicianFilter: string;
  setTechnicianFilter: (v: string) => void;
  statusFilter: 'all' | 'open' | 'closed';
  setStatusFilter: (v: 'all' | 'open' | 'closed') => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  woQuery: string;
  setWoQuery: (v: string) => void;
  mode: 'workorders' | 'sales' | 'all';
  setMode: (v: 'workorders' | 'sales' | 'all') => void;
  refreshKey: number;
  setRefreshKey: (v: number) => void;
}> = ({
  showCustomerSearch,
  setShowCustomerSearch,
  technicianFilter,
  setTechnicianFilter,
  statusFilter,
  setStatusFilter,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  woQuery,
  setWoQuery,
  mode,
  setMode,
  refreshKey,
  setRefreshKey,
}) => {
  const { setPage } = usePagination();
  const [invoiceQuery, setInvoiceQuery] = useState<string>('');

  // ── Modal stack ──────────────────────────────────────────────────────────
  const [modalStack, setModalStack] = useState<ModalEntry[]>([]);
  const modalCounterRef = useRef(0);

  const openModal = useCallback((type: string, payload?: any) => {
    if (payload !== undefined && payload !== null) {
      storeWindowPayload(type, payload);
    }
    const id = `${type}-${++modalCounterRef.current}`;
    setModalStack(s => [...s, { id, type }]);
  }, []);

  const closeModal = useCallback((id: string) => {
    setModalStack(s => s.filter(m => m.id !== id));
  }, []);

  const closeTopModal = useCallback(() => {
    setModalStack(s => s.length > 0 ? s.slice(0, -1) : s);
  }, []);

  // Keep a ref so the window.close override always sees the latest callback.
  const closeTopModalRef = useRef(closeTopModal);
  useEffect(() => { closeTopModalRef.current = closeTopModal; });

  // Register bus + intercept window.api.open* calls
  useEffect(() => {
    registerOpenModal(openModal);

    const api = (window as any).api;
    if (!api) return () => { unregisterOpenModal(); };

    const canOverrideApiMethod = (method: string): boolean => {
      try {
        const d = Object.getOwnPropertyDescriptor(api, method);
        // contextBridge typically exposes non-writable, non-configurable props.
        // If we can't confirm it's writable/configurable, do not attempt to patch.
        return !!d && (d.writable === true || d.configurable === true);
      } catch {
        return false;
      }
    };

    // Save originals so we can restore on unmount.
    const saved: Record<string, any> = {};
    for (const [method, type] of Object.entries(API_TO_MODAL)) {
      if (method in api) {
        saved[method] = api[method];
        const capturedType = type;

        if (canOverrideApiMethod(method)) {
          try {
            (api as any)[method] = (payload?: any) => {
              openModal(capturedType, payload);
              return Promise.resolve();
            };
          } catch {
            // If the API object is read-only (contextBridge), skip patching.
          }
        }
      }
    }

    // closeSelfWindow → close top modal
    if ('closeSelfWindow' in api) {
      saved.closeSelfWindow = api.closeSelfWindow;
      if (canOverrideApiMethod('closeSelfWindow')) {
        try {
          api.closeSelfWindow = () => { closeTopModalRef.current(); return Promise.resolve(); };
        } catch {
          // read-only in packaged builds
        }
      }
    }

    // window.close → close top modal (falls back to real close when no modals are open)
    const origWindowClose = window.close.bind(window);
    try {
      (window as any).close = () => {
        if (modalCounterRef.current > 0 && document.querySelectorAll('[data-modal-shell]').length > 0) {
          closeTopModalRef.current();
        } else {
          origWindowClose();
        }
      };
    } catch { /* read-only in some envs */ }

    return () => {
      unregisterOpenModal();
      for (const [method, orig] of Object.entries(saved)) {
        if (canOverrideApiMethod(method)) {
          try { (api as any)[method] = orig; } catch {}
        }
      }
      try { (window as any).close = origWindowClose; } catch {}
    };
  }, [openModal]); // openModal is stable (useCallback [])

  useEffect(() => {
    // Keep invoice search scoped to Sales mode.
    if (mode !== 'sales' && invoiceQuery) setInvoiceQuery('');
  }, [mode, invoiceQuery]);

  useEffect(() => {
    // Keep WO# filter scoped to non-sales mode.
    if (mode === 'sales' && woQuery) setWoQuery('');
  }, [mode, woQuery, setWoQuery]);

  useEffect(() => {
    setPage(1);
  }, [mode, technicianFilter, dateFrom, dateTo, woQuery, setPage]);

  const handleClear = () => {
    setTechnicianFilter('');
    setStatusFilter('all');
    setDateFrom('');
    setDateTo('');
    setWoQuery('');
    setInvoiceQuery('');
  };

  return (
    <div className="bg-zinc-900 min-h-screen text-white flex flex-col relative">
      <div className="flex flex-1">
        <aside className="w-[320px] shrink-0 bg-zinc-800 border-r border-zinc-700 p-4 flex flex-col gap-6 overflow-y-auto">
          <SidebarFilters
            technicianFilter={technicianFilter}
            onTechnicianFilterChange={setTechnicianFilter}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            dateFrom={dateFrom}
            dateTo={dateTo}
            onDateFromChange={setDateFrom}
            onDateToChange={setDateTo}
            onOpenCustomerSearch={() => setShowCustomerSearch(true)}
            onAddCustomer={() => openModal('customerOverview', 0)}
            mode={mode}
            onModeChange={setMode}
            invoiceQuery={invoiceQuery}
            onInvoiceQueryChange={setInvoiceQuery}
            woQuery={woQuery}
            onWoQueryChange={setWoQuery}
            onClear={handleClear}
            onRefresh={() => setRefreshKey(refreshKey + 1)}
          />
          <div>
            <RecentCustomers />
          </div>
        </aside>
        <main className="flex-1 min-w-0 flex flex-col">
          <Toolbar mode={mode} onModeChange={setMode} />
          <div className="flex-1 overflow-x-auto overflow-y-hidden">
            {mode === 'workorders' && (
              <WorkOrdersTable statusFilter={statusFilter} technicianFilter={technicianFilter} dateFrom={dateFrom} dateTo={dateTo} woQuery={woQuery} refreshKey={refreshKey} />
            )}
            {mode === 'sales' && (
              <SalesTable statusFilter={statusFilter} technicianFilter={technicianFilter} dateFrom={dateFrom} dateTo={dateTo} invoiceQuery={invoiceQuery} />
            )}
            {mode === 'all' && (
              <UnifiedList statusFilter={statusFilter} technicianFilter={technicianFilter} dateFrom={dateFrom} dateTo={dateTo} />
            )}
          </div>
          <div className="border-t border-zinc-700 p-2 flex items-center justify-end bg-zinc-900">
            <Pagination />
          </div>
        </main>
      </div>
      {/* Footer removed; table and pagination now consume extra space */}
      {showCustomerSearch && (
        <CustomerSearchWindow onClose={() => setShowCustomerSearch(false)} />
      )}
      {/* ── Internal modal windows ─────────────────────────────────────── */}
      {modalStack.map((entry, idx) => (
        <ModalShell
          key={entry.id}
          entry={entry}
          zIndex={200 + idx * 10}
          onClose={() => closeModal(entry.id)}
        />
      ))}
    </div>
  );
};

// Unified list of Work Orders and Sales in one table, ordered by id desc
const UnifiedList: React.FC<{ statusFilter?: 'all' | 'open' | 'closed'; technicianFilter?: string; dateFrom?: string; dateTo?: string }> = ({ statusFilter = 'all', technicianFilter = '', dateFrom = '', dateTo = '' }) => {
  const [wo, setWo] = React.useState<any[]>([]);
  const [sa, setSa] = React.useState<any[]>([]);
  const [loading, setLoading] = React.useState<boolean>(false);
  const [techIndex, setTechIndex] = React.useState<Record<string,string>>({});
  const [customerIndex, setCustomerIndex] = React.useState<Record<number, { name: string; phone?: string; phoneAlt?: string; email?: string }>>({});
  const { page, setPage, pageSize, setTotalItems } = usePagination();

  const MAX_PAGES = 10;
  const MAX_ITEMS = pageSize * MAX_PAGES;

  const load = React.useCallback(async () => {
    try {
      setLoading(true);
      const [wos, sales] = await Promise.all([
        (window as any).api.getWorkOrders({ limit: MAX_ITEMS, sortBy: 'activityAt', sortDir: 'desc' }),
        (window as any).api.dbGet('sales', { limit: MAX_ITEMS, sortBy: 'checkInAt', sortDir: 'desc' }).catch(() => []),
      ]);
      setWo(Array.isArray(wos) ? wos : []);
      setSa(Array.isArray(sales) ? sales : []);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);

  React.useEffect(() => { load(); }, [load]);
  React.useEffect(() => {
    const api = (window as any).api;
    if (!api) {
      // Running in plain Vite/browser without Electron preload; skip IPC subscriptions
      return;
    }
    const offWO = api.onWorkOrdersChanged?.(() => load());
    const offSA = api.onSalesChanged?.(() => load());
    return () => { try { offWO && offWO(); } catch {} try { offSA && offSA(); } catch {} };
  }, [load]);

  React.useEffect(() => {
    const refreshTechs = async () => {
      try {
        const techs = await (await import('./lib/admin')).listTechnicians();
        const map: Record<string,string> = {};
        techs.forEach((t: any) => { map[t.id] = (t.nickname && t.nickname.trim()) || t.firstName || t.id; });
        setTechIndex(map);
      } catch {}
    };
    const refreshCustomers = async () => {
      try {
        const customers = await ((window as any).api.getCustomers?.() ?? (window as any).api.dbGet('customers'));
        const cMap: Record<number, { name: string; phone?: string; phoneAlt?: string; email?: string }> = {};
        (customers || []).forEach((c: any) => {
          const composed = [c.firstName, c.lastName].filter(Boolean).join(' ').trim();
          const name = composed || c.name || c.email || `Customer #${c.id}`;
          cMap[c.id] = { name, phone: c.phone || '', phoneAlt: c.phoneAlt || '', email: c.email || '' };
        });
        setCustomerIndex(cMap);
      } catch {}
    };
    refreshTechs();
    refreshCustomers();
    const api = (window as any).api;
    const offCustomers = api.onCustomersChanged?.(() => refreshCustomers());
    const offTechs = api.onTechniciansChanged?.(() => refreshTechs());
    return () => { try { offCustomers && offCustomers(); } catch {} try { offTechs && offTechs(); } catch {} };
  }, []);

  const rows = React.useMemo(() => {
    const from = dateFrom ? new Date(dateFrom) : null;
    const to = dateTo ? new Date(dateTo) : null;

    const normalizeWoStatus = (w: any, remaining: number): 'open' | 'in progress' | 'closed' => {
      const raw = String(w?.status || '').toLowerCase().trim();
      if (raw === 'closed') return 'closed';
      if (raw === 'in progress' || raw === 'inprogress') return 'in progress';
      if (raw === 'open') return 'open';
      return remaining <= 0 ? 'closed' : 'open';
    };

    const mapped = [
      ...wo.map(w => ({
        type: 'workorder' as const,
        id: w.id,
        customerId: (w as any).customerId as number | undefined,
        date: getActivityDate(w),
        originalDate: new Date(w.checkInAt || w.createdAt || 0),
        status: (() => {
          const total = Number(w.totals?.total || w.total || 0) || 0;
          const remaining = Math.max(0, total - Number(w.amountPaid || 0));
          return normalizeWoStatus(w, remaining);
        })(),
        desc: w.productDescription || w.summary || '',
        items: (() => {
          const list = Array.isArray((w as any).items) ? (w as any).items : [];
          const titles = list.map((it: any) => (it.repair || it.description || it.title || it.name || it.altDescription || '').toString().trim()).filter(Boolean);
          return titles.join(', ');
        })(),
        problem: w.problemInfo || (w as any).problem || '',
        customer: (() => {
          const id = (w as any).customerId as number | undefined;
          const fromIndex = id ? customerIndex[id]?.name : '';
          if (fromIndex) return fromIndex;
          const inline = (w as any).customerName as string | undefined;
          if (inline && inline.trim()) return inline.trim();
          const composed = `${(w as any).firstName || ''} ${(w as any).lastName || ''}`.trim();
          if (composed) return composed;
          return id ? `Customer #${id}` : '';
        })(),
        phone: (w.customerId && customerIndex[w.customerId]?.phone) || w.customerPhone || w.phone || '',
        tech: ((): string => {
          const at = (w.assignedTo || '').toString().trim();
          if (!at) return '';
          if (techIndex[at]) return techIndex[at];
          // Try match by known label or first name
          for (const [, label] of Object.entries(techIndex)) {
            if (!label) continue;
            if (label === at) return label;
            const first = label.split(' ')[0];
            if (first && first === at) return label;
          }
          return '';
        })(),
        total: Number(w.totals?.total || w.total || 0) || 0,
        remaining: Number(w.totals?.remaining || w.balance || 0) || 0,
      })),
      ...sa.map(s => ({
        type: 'sale' as const,
        id: s.id,
        customerId: (s as any).customerId as number | undefined,
        date: new Date(s.checkInAt || s.createdAt || 0),
        status: ((Number(s.totals?.total || s.total || 0) || 0) - (Number(s.amountPaid || 0) || 0) <= 0 ? 'closed' : 'open') as 'open'|'closed',
        desc: (Array.isArray(s.items) && s.items[0]?.description) || s.itemDescription || '',
        items: (() => {
          const list = Array.isArray(s.items) ? s.items : [];
          const titles = list.map((it: any) => (it.description || it.name || it.title || '').toString().trim()).filter(Boolean);
          return titles.join(', ');
        })(),
        problem: '',
        customer: (() => {
          const id = (s as any).customerId as number | undefined;
          const fromIndex = id ? customerIndex[id]?.name : '';
          if (fromIndex) return fromIndex;
          const inline = (s as any).customerName as string | undefined;
          if (inline && inline.trim()) return inline.trim();
          return id ? `Customer #${id}` : '';
        })(),
        phone: (s.customerId && customerIndex[s.customerId]?.phone) || s.customerPhone || '',
        tech: ((): string => {
          const at = (s.assignedTo || '').toString().trim();
          if (!at) return '';
          if (techIndex[at]) return techIndex[at];
          for (const [, label] of Object.entries(techIndex)) {
            if (!label) continue;
            if (label === at) return label;
            const first = label.split(' ')[0];
            if (first && first === at) return label;
          }
          return '';
        })(),
        total: Number(s.totals?.total || s.total || 0) || 0,
        remaining: (Number(s.totals?.total || s.total || 0) || 0) - (Number(s.amountPaid || 0) || 0),
      })),
    ];
    return mapped
      .filter(r => {
        if (statusFilter !== 'all') {
          const st = String((r as any).status || '').toLowerCase().trim();
          const isClosed = st === 'closed';
          if (statusFilter === 'closed' && !isClosed) return false;
          if (statusFilter === 'open' && isClosed) return false;
        }
        if (technicianFilter) {
          const at = (r.tech || '').toString();
          if (technicianFilter === '__unassigned') { if (at) return false; }
          else {
            // allow match by tech id or by mapped label
            const match = Object.keys(techIndex).some(id => id === technicianFilter && (at === id || at === techIndex[id]));
            if (!match) return false;
          }
        }
        if (from && r.date < from) return false;
        if (to && r.date > to) return false;
        return true;
      })
      .sort((a, b) => {
        const bd = b.date?.getTime?.() || 0;
        const ad = a.date?.getTime?.() || 0;
        return (bd - ad) || (b.id - a.id);
      });
  }, [wo, sa, statusFilter, technicianFilter, dateFrom, dateTo, techIndex, customerIndex]);

  React.useEffect(() => {
    // Cap pagination to MAX_PAGES (older records stay stored, but not always loaded here)
    setTotalItems(Math.min(rows.length, MAX_ITEMS));
    return () => {
      // Clear when switching away from this view
      setTotalItems(0);
    };
  }, [rows.length, setTotalItems, MAX_ITEMS]);

  const totalPages = Math.max(1, Math.ceil(Math.min(rows.length, MAX_ITEMS) / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const startIdx = (safePage - 1) * pageSize;
  const capped = rows.slice(0, MAX_ITEMS);
  const endIdx = Math.min(startIdx + pageSize, capped.length);
  const pagedRows = React.useMemo(() => capped.slice(startIdx, endIdx), [capped, startIdx, endIdx]);

  React.useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage, setPage]);

  const ctx = useContextMenu<(typeof rows)[number]>();
  const ctxRow = ctx.state.data;

  const computeWOTotals = React.useCallback((w: any) => {
    const labor = Number(w.laborCost || 0);
    const parts = Number(w.partCosts || 0);
    const discount = Number(w.discount || 0);
    const taxRate = Number(w.taxRate || 0);
    const subTotal = Math.max(0, labor + parts - discount);
    const tax = Math.round((subTotal * (taxRate / 100)) * 100) / 100;
    const total = Math.round((subTotal + tax) * 100) / 100;
    const amountPaid = Number(w.amountPaid || 0);
    const remaining = Math.max(0, Math.round((total - amountPaid) * 100) / 100);
    return { subTotal, tax, total, remaining };
  }, []);

  const ctxItems: ContextMenuItem[] = React.useMemo(() => {
    if (!ctxRow) return [];

    const inv = `GB${String(ctxRow.id).padStart(7, '0')}`;
    const hasCustomer = !!ctxRow.customerId;
    const phone = (formatPhone(String(ctxRow.phone || '')) || String(ctxRow.phone || '')).trim();

    const api = (window as any).api;

    if (ctxRow.type === 'workorder') {
      return [
        { type: 'header', label: `Work Order ${inv}` },
        { label: 'Edit / Open', onClick: async () => { await api?.openNewWorkOrder?.({ workOrderId: ctxRow.id }); } },
        { label: 'View Customer', disabled: !hasCustomer, onClick: async () => { await api?.openCustomerOverview?.(ctxRow.customerId); } },
        { type: 'separator' },
        { label: 'Copy Invoice #', onClick: async () => { try { await navigator.clipboard.writeText(inv); } catch {} } },
        { label: 'Copy Phone', disabled: !phone, hint: phone || undefined, onClick: async () => { if (!phone) return; try { await navigator.clipboard.writeText(phone); } catch {} } },
        { type: 'separator' },
        { label: 'Print Customer Receipt', onClick: async () => { await api?.openCustomerReceipt?.({ workOrderId: ctxRow.id }); } },
        { label: 'Print Release Form', onClick: async () => { await api?.openReleaseForm?.({ workOrderId: ctxRow.id }); } },
        { type: 'separator' },
        {
          label: 'Mark Paid in Full',
          disabled: !(ctxRow.remaining > 0),
          onClick: async () => {
            // Load, compute totals, and update to closed/paid
            const found = await api?.findWorkOrders?.({ id: ctxRow.id }).catch(() => []);
            const full = Array.isArray(found) ? found[0] : null;
            if (!full) return;
            const totals = computeWOTotals(full);
            const updated = { ...full, amountPaid: totals.total, totals: { ...totals, remaining: 0 }, status: 'closed' };
            await api?.dbUpdate?.('workOrders', ctxRow.id, updated);
          },
        },
        {
          label: 'Reopen',
          disabled: !(ctxRow.remaining <= 0),
          onClick: async () => {
            const found = await api?.findWorkOrders?.({ id: ctxRow.id }).catch(() => []);
            const full = Array.isArray(found) ? found[0] : null;
            if (!full) return;
            const totals = computeWOTotals(full);
            const updated = { ...full, status: 'open', totals };
            await api?.dbUpdate?.('workOrders', ctxRow.id, updated);
          },
        },
        { type: 'separator' },
        {
          label: 'Delete…',
          danger: true,
          onClick: async () => {
            const ok = window.confirm(`Delete work order ${inv}? This cannot be undone.`);
            if (!ok) return;
            await api?.dbDelete?.('workOrders', ctxRow.id);
          },
        },
      ];
    }

    // Sale
    return [
      { type: 'header', label: `Sale ${inv}` },
      { label: 'Edit / Open', onClick: async () => { await api?.openNewSale?.({ id: ctxRow.id }); } },
      { label: 'View Customer', disabled: !hasCustomer, onClick: async () => { await api?.openCustomerOverview?.(ctxRow.customerId); } },
      { type: 'separator' },
      { label: 'Copy Invoice #', onClick: async () => { try { await navigator.clipboard.writeText(inv); } catch {} } },
      { label: 'Copy Phone', disabled: !phone, hint: phone || undefined, onClick: async () => { if (!phone) return; try { await navigator.clipboard.writeText(phone); } catch {} } },
      { type: 'separator' },
      {
        label: 'Delete…',
        danger: true,
        onClick: async () => {
          const ok = window.confirm(`Delete sale ${inv}? This cannot be undone.`);
          if (!ok) return;
          await api?.dbDelete?.('sales', ctxRow.id);
        },
      },
    ];
  }, [ctxRow, computeWOTotals]);

  return (
    <div className="p-2 overflow-x-auto">
      <table className="w-full table-fixed text-[13px] leading-tight">
        <thead className="bg-zinc-800 text-zinc-300">
          <tr>
            <th className="px-2 py-1 text-left w-[110px]">Invoice #</th>
            <th className="px-2 py-1 text-left w-[105px]">Date</th>
            <th className="px-2 py-1 text-left w-[70px]">Status</th>
            <th className="px-2 py-1 text-left w-[56px]">Type</th>
            <th className="px-2 py-1 text-left w-[110px]">Tech</th>
            <th className="px-2 py-1 text-left">Customer</th>
            <th className="px-2 py-1 text-left">Items</th>
            <th className="px-2 py-1 text-left">Description</th>
            <th className="px-2 py-1 text-right w-[100px]">Total</th>
            <th className="px-2 py-1 text-right w-[110px]">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {loading && (<tr><td colSpan={10} className="p-6 text-center text-zinc-500">Loading...</td></tr>)}
          {!loading && rows.length === 0 && (<tr><td colSpan={10} className="p-6 text-center text-zinc-500">No entries yet</td></tr>)}
          {!loading && pagedRows.map(r => {
            const customer = r.customerId ? ({ id: r.customerId, ...(customerIndex[r.customerId] || {}) } as any) : null;
            return (
              <tr
                key={`${r.type}-${r.id}`}
                className="odd:bg-zinc-900 even:bg-zinc-800/40 cursor-pointer"
                onContextMenu={(e) => ctx.openFromEvent(e, r)}
                onDoubleClick={async () => {
                  try {
                    const api = (window as any).api;
                    if (r.type === 'workorder') {
                      await api.openNewWorkOrder?.({ workOrderId: r.id });
                    } else {
                      const payload = { id: r.id };
                      await api.openNewSale?.(payload);
                    }
                  } catch (e) { console.error('Open editor failed', e); }
                }}
              >
                <td className="px-2 py-1 font-mono">GB{String(r.id).padStart(7,'0')}</td>
                <td className="px-2 py-1" title={r.type === 'workorder' && (r as any).originalDate && !isNaN((r as any).originalDate.getTime()) ? `Checked in: ${(r as any).originalDate.toISOString().slice(0,10)}` : undefined}>{isNaN(r.date.getTime()) ? '' : r.date.toISOString().slice(0,10)}</td>
                <td className="px-2 py-1 capitalize">{r.status}</td>
                <td className="px-2 py-1 font-semibold">{r.type === 'workorder' ? 'WO' : 'Sale'}</td>
                <td className="px-2 py-1">{r.tech}</td>
                <td className="px-2 py-1" title={r.customer}>
                  <CustomerHoverCard customerId={r.customerId} customer={customer} className="min-w-0">
                    <div className="truncate">{r.customer || (r.type === 'sale' ? ('Customer #' + r.id) : '')}</div>
                  </CustomerHoverCard>
                </td>
                <td className="px-2 py-1" title={r.items || ''}>
                  <ItemsDescriptionHoverCard items={String(r.items || '')} description={String(r.desc || '')} problem={String((r as any).problem || '')} className="min-w-0">
                    <div className="truncate">{r.items || ''}</div>
                  </ItemsDescriptionHoverCard>
                </td>
                <td className="px-2 py-1" title={r.desc}>
                  <ItemsDescriptionHoverCard items={String(r.items || '')} description={String(r.desc || '')} problem={String((r as any).problem || '')} className="min-w-0">
                    <div className="truncate">{r.desc}</div>
                  </ItemsDescriptionHoverCard>
                </td>
                <td className="px-2 py-1 text-right">${r.total.toFixed(2)}</td>
                <td className="px-2 py-1 text-right">${r.remaining.toFixed(2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <ContextMenu
        id="home-ctx-menu"
        open={ctx.state.open}
        x={ctx.state.x}
        y={ctx.state.y}
        items={ctxItems}
        onClose={ctx.close}
      />
    </div>
  );
};
