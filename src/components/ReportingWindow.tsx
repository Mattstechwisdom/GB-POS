// SYNC_TEST_MARKER: reporting-window
import React, { useEffect, useMemo, useState } from 'react';
import { listTechnicians } from '@/lib/admin';
import { dispatchOpenModal } from '@/lib/modalBus';
import { itemFullCost } from '@/lib/orderAccounting';
import { buildReportingLedger, collectReportingPayments, verifiedPurchaseTotal } from '@/lib/reportingAccounting';
import { buildMonthEndWorkbookHtml } from '@/lib/monthEndWorkbook';
import {
  DEFAULT_COMMISSION_SETTINGS,
  allocateMonthlySalesCommission,
  consultationCommission,
  normalizeCommissionSettings,
  salesCommissionPool,
  selectedSalesCommissionTechnicians,
  technicianReceivesConsultationCommission,
  splitCommissionPool,
  technicianCommissionId,
  type CommissionSettings,
} from '@/lib/commission';

function reportDate(value: any): Date | null {
  try {
    if (value instanceof Date) {
      const timestamp = Date.prototype.getTime.call(value);
      return Number.isNaN(timestamp) ? null : new Date(timestamp);
    }
    if (typeof value === 'number' || typeof value === 'string') {
      const date = new Date(value);
      return Number.isNaN(Date.prototype.getTime.call(date)) ? null : date;
    }
  } catch {
    return null;
  }
  return null;
}

function reportTimestamp(value: any): number | null {
  const date = reportDate(value);
  if (!date) return null;
  try {
    const timestamp = Date.prototype.getTime.call(date);
    return Number.isNaN(timestamp) ? null : timestamp;
  } catch {
    return null;
  }
}

function startOfPeriod(value: any, period: 'day' | 'week' | 'month' | 'year') {
  const d = reportDate(value) || new Date(0);
  if (period === 'day') {
    d.setHours(0,0,0,0);
  } else if (period === 'week') {
    const day = d.getDay();
    const diff = (day + 6) % 7; // make Monday start
    d.setDate(d.getDate() - diff);
    d.setHours(0,0,0,0);
  } else if (period === 'month') {
    d.setDate(1); d.setHours(0,0,0,0);
  } else if (period === 'year') {
    d.setMonth(0,1); d.setHours(0,0,0,0);
  }
  return d;
}

function formatCSV(rows: Array<Record<string, any>>) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: any) => {
    const s = String(v ?? '');
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  return [headers.join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
}

const PERIODS = [
  { key: 'day', label: 'Daily' },
  { key: 'week', label: 'Weekly' },
  { key: 'month', label: 'Monthly' },
  { key: 'year', label: 'Yearly' },
] as const;

type SummaryRange = 'today' | 'week' | 'month' | 'year' | 'all';

type ReportingSettings = {
  defaultSummaryRange: SummaryRange;
  includeRepairs: boolean;
  includeSales: boolean;
  onlyPaid: boolean;
  excludeTax: boolean;
  showPaymentSummary: boolean;
  showTypeBreakdown: boolean;
  showTopItems: boolean;
  showDetailTable: boolean;
  showCsvPreview: boolean;
};

const DEFAULT_REPORTING_SETTINGS: ReportingSettings = {
  defaultSummaryRange: 'all',
  includeRepairs: true,
  includeSales: true,
  onlyPaid: true,
  excludeTax: true,
  showPaymentSummary: true,
  showTypeBreakdown: true,
  showTopItems: true,
  showDetailTable: true,
  showCsvPreview: false,
};

function normalizeReportingSettings(value: any): ReportingSettings {
  const source = value && typeof value === 'object' ? value : {};
  const range: SummaryRange = ['today', 'week', 'month', 'year', 'all'].includes(source.defaultSummaryRange)
    ? source.defaultSummaryRange
    : DEFAULT_REPORTING_SETTINGS.defaultSummaryRange;
  return {
    ...DEFAULT_REPORTING_SETTINGS,
    ...source,
    defaultSummaryRange: range,
    includeRepairs: source.includeRepairs !== false,
    includeSales: source.includeSales !== false,
    onlyPaid: source.onlyPaid !== false,
    excludeTax: source.excludeTax !== false,
    showPaymentSummary: source.showPaymentSummary !== false,
    showTypeBreakdown: source.showTypeBreakdown !== false,
    showTopItems: source.showTopItems !== false,
    showDetailTable: source.showDetailTable !== false,
    showCsvPreview: source.showCsvPreview === true,
  };
}

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function money(value: number | null | undefined) {
  if (value === null || typeof value === 'undefined' || !Number.isFinite(Number(value))) return '-';
  return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function dateOnly(value: any) {
  const d = reportDate(value);
  return d ? d.toISOString().slice(0, 10) : '';
}

function monthRange(monthValue: string) {
  const [yearRaw, monthRaw] = String(monthValue || '').split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const now = new Date();
  const safeYear = Number.isFinite(year) ? year : now.getFullYear();
  const safeMonthIndex = Number.isFinite(month) ? Math.max(0, Math.min(11, month - 1)) : now.getMonth();
  const start = new Date(safeYear, safeMonthIndex, 1, 0, 0, 0, 0);
  const end = new Date(safeYear, safeMonthIndex + 1, 0, 23, 59, 59, 999);
  return { start, end };
}

function dateInRange(value: any, start: any, end: any) {
  const timestamp = reportTimestamp(value);
  const startTimestamp = reportTimestamp(start);
  const endTimestamp = reportTimestamp(end);
  if (timestamp === null || startTimestamp === null || endTimestamp === null) return false;
  return timestamp >= startTimestamp && timestamp <= endTimestamp;
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function endOfInputDate(value: string) {
  const d = new Date(`${value}T00:00:00`);
  if (!Number.isNaN(d.getTime())) d.setHours(23, 59, 59, 999);
  return d;
}

function startOfInputDate(value: string) {
  const d = new Date(`${value}T00:00:00`);
  if (!Number.isNaN(d.getTime())) d.setHours(0, 0, 0, 0);
  return d;
}

function reportingRecordKey(record: any) {
  const kind = record?.kind === 'sale' ? 'sale' : 'repair';
  return `${kind}:${String(record?.id ?? record?.ticketNumber ?? record?.invoiceNumber ?? 'unknown')}`;
}

function saleReportDate(sale: any) {
  return sale?.checkoutDate || sale?.saleDate || sale?.transactionDate || sale?.invoiceDate || sale?.checkInAt || sale?.createdAt || sale?.updatedAt || '';
}

function purchaseReportDate(purchase: any) {
  return purchase?.checkedOutAt || purchase?.updatedAt || purchase?.createdAt || '';
}

function saleItemsForReport(sale: any) {
  const items = Array.isArray(sale?.items) ? sale.items : [];
  if (items.length) return items;
  if (sale?.itemDescription || sale?.price || sale?.quantity) {
    return [{
      description: sale.itemDescription || 'Sale Item',
      qty: sale.quantity || 1,
      price: sale.price || 0,
      internalCost: sale.internalCost,
      category: sale.category,
      consultationHours: sale.consultationHours,
    }];
  }
  return [];
}

function isConsultationLine(item: any, sale?: any) {
  const category = String(item?.category || sale?.category || '').trim().toLowerCase();
  const description = String(item?.description || item?.name || item?.title || sale?.itemDescription || '').trim().toLowerCase();
  return category.startsWith('consult') || description.includes('consultation');
}

function lineUnits(item: any) {
  const qty = Number(item?.qty ?? item?.quantity ?? 1);
  return Number.isFinite(qty) && qty > 0 ? qty : 1;
}

function consultationHours(item: any, sale: any) {
  const itemHours = Number(item?.consultationHours);
  if (Number.isFinite(itemHours) && itemHours > 0) return itemHours;
  if (Array.isArray(sale?.items) && sale.items.length) return 0;
  const direct = Number(sale?.consultationHours);
  if (Number.isFinite(direct) && direct > 0) return direct;
  const qty = Number(item?.qty ?? item?.quantity);
  if (Number.isFinite(qty) && qty > 0) return qty;
  return 0;
}

function lineTitle(item: any, sale: any) {
  return String(item?.description || item?.itemDescription || item?.name || item?.title || sale?.itemDescription || sale?.productDescription || 'Sale Item').trim();
}

function lineSoldTotal(item: any, sale: any) {
  if (isConsultationLine(item, sale)) {
    return roundMoney(consultationHours(item, sale) * Number(item?.price || 0));
  }
  return roundMoney(lineUnits(item) * Number(item?.price || 0));
}

function lineInternalCost(item: any) {
  return itemFullCost(item);
}

function technicianDisplay(tech: any) {
  return [tech?.firstName, tech?.lastName].filter(Boolean).join(' ') || tech?.nickname || String(tech?.id || '').trim() || 'Unknown technician';
}

function technicianKey(tech: any) {
  return String(tech?.nickname || tech?.firstName || tech?.id || '').trim().toLowerCase();
}

function technicianMatchKeys(tech: any) {
  return [
    tech?.nickname,
    tech?.firstName,
    [tech?.firstName, tech?.lastName].filter(Boolean).join(' '),
    tech?.id,
  ]
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean);
}

function saleAssignedTechKey(sale: any) {
  return String(sale?.assignedTo || sale?.technician || sale?.technicianName || sale?.techName || '').trim().toLowerCase();
}

function buildEndOfMonthReport(sales: any[], technicians: any[], vendors: any[], purchases: any[], monthValue: string, commissionSettings: CommissionSettings) {
  const { start, end } = monthRange(monthValue);
  const activeTechs = (technicians || []).filter((tech: any) => tech && tech.active !== false);
  const configuredSplitTechs = selectedSalesCommissionTechnicians(activeTechs, commissionSettings);
  const salesSplitTechs = configuredSplitTechs.length ? configuredSplitTechs : [{ id: 'unassigned-sales', nickname: 'Unassigned Sales Split' }];
  const salesSplitCount = salesSplitTechs.length;
  const techTotals = new Map<string, {
    technician: string;
    salesCommission: number;
    consultationCommission: number;
    consultationHours: number;
    totalCommission: number;
  }>();

  const ensureTech = (key: string, label: string) => {
    const safeKey = key || label.toLowerCase() || 'unassigned';
    if (!techTotals.has(safeKey)) {
      techTotals.set(safeKey, {
        technician: label || 'Unassigned',
        salesCommission: 0,
        consultationCommission: 0,
        consultationHours: 0,
        totalCommission: 0,
      });
    }
    return techTotals.get(safeKey)!;
  };

  for (const tech of salesSplitTechs) ensureTech(technicianKey(tech), technicianDisplay(tech));

  const productRows: Array<Record<string, any>> = [];
  const consultationRows: Array<Record<string, any>> = [];
  let physicalSalesBase = 0;
  let physicalSalesCommissionPool = 0;
  let knownInternalCost = 0;
  let knownProfit = 0;
  let missingInternalCostCount = 0;
  let missingConsultationAssignmentCount = 0;
  let missingConsultationHoursCount = 0;
  let vendorPayoutTotal = 0;
  let vendorProfitTotal = 0;

  const monthSaleLedger = buildReportingLedger(sales || [])
    .filter(entry => entry.kind === 'sale' && entry.date >= start && entry.date <= end);
  const ledgerBySale = new Map<string, typeof monthSaleLedger>();
  for (const entry of monthSaleLedger) {
    if (!ledgerBySale.has(entry.recordKey)) ledgerBySale.set(entry.recordKey, []);
    ledgerBySale.get(entry.recordKey)!.push(entry);
  }
  const monthSales = (sales || []).filter((sale) => ledgerBySale.has(reportingRecordKey(sale)));
  const purchaseRows = (purchases || [])
    .filter((purchase) => purchase?.status === 'checked_out' && dateInRange(purchaseReportDate(purchase), start, end))
    .map((purchase) => ({
      Date: dateOnly(purchaseReportDate(purchase)),
      Distributor: purchase?.distributor || 'Unassigned distributor',
      Type: purchase?.itemType || 'Part',
      Item: purchase?.title || 'Supplier purchase',
      Quantity: Number(purchase?.quantity || 1),
      'Item Cost': money(Number(purchase?.itemCost || 0)),
      'Supplier Tax': money(Number(purchase?.supplierTax || 0)),
      'Tax Exempt': purchase?.taxExempt === true ? 'Yes' : 'No',
      'Additional Cost': money(Number(purchase?.additionalCost || 0)),
      'Supplier Spend': money(verifiedPurchaseTotal(purchase)),
      Source: purchase?.sourceType || '',
      'Source ID': purchase?.sourceId || purchase?.inventoryId || '',
    }));
  const supplierSpendParts = roundMoney((purchases || [])
    .filter((purchase) => purchase?.status === 'checked_out' && String(purchase?.itemType || 'Part').toLowerCase() === 'part' && dateInRange(purchaseReportDate(purchase), start, end))
    .reduce((sum, purchase) => sum + verifiedPurchaseTotal(purchase), 0));
  const supplierSpendProducts = roundMoney((purchases || [])
    .filter((purchase) => purchase?.status === 'checked_out' && String(purchase?.itemType || '').toLowerCase() === 'product' && dateInRange(purchaseReportDate(purchase), start, end))
    .reduce((sum, purchase) => sum + verifiedPurchaseTotal(purchase), 0));

  for (const sale of monthSales) {
    const items = saleItemsForReport(sale);
    const gross = items.reduce((sum: number, item: any) => sum + lineSoldTotal(item, sale), 0);
    const discount = Math.max(0, Number(sale?.discount || 0) || 0);
    const invoiceNet = Math.max(0, gross - discount);
    const saleEntries = ledgerBySale.get(reportingRecordKey(sale)) || [];
    const collectedNet = roundMoney(saleEntries.reduce((sum, entry) => sum + entry.collected - entry.taxCollected, 0));
    const collectionRatio = invoiceNet > 0 ? Math.min(1, collectedNet / invoiceNet) : 0;
    const latestPaymentDate = saleEntries.reduce<Date | null>((latest, entry) => (
      !latest || entry.date > latest ? entry.date : latest
    ), null);

    for (const item of items) {
      const soldGross = lineSoldTotal(item, sale);
      const allocatedDiscount = gross > 0 ? roundMoney(discount * (soldGross / gross)) : 0;
      const soldNet = roundMoney(Math.max(0, soldGross - allocatedDiscount) * collectionRatio);
      const title = lineTitle(item, sale);
      const date = dateOnly(latestPaymentDate);

      if (isConsultationLine(item, sale)) {
        const hours = roundMoney(consultationHours(item, sale) * collectionRatio);
        const assignedKey = saleAssignedTechKey(sale);
        const assignedTech = activeTechs.find((tech: any) => technicianMatchKeys(tech).includes(assignedKey));
        const techLabel = assignedTech ? technicianDisplay(assignedTech) : (sale?.assignedTo || 'Unassigned');
        const commission = assignedTech && !technicianReceivesConsultationCommission(assignedTech, commissionSettings)
          ? 0
          : consultationCommission(hours, commissionSettings);
        if (!assignedKey) missingConsultationAssignmentCount += 1;
        if (!(hours > 0)) missingConsultationHoursCount += 1;
        const techTotal = ensureTech(assignedKey || 'unassigned', techLabel);
        techTotal.consultationHours = roundMoney(techTotal.consultationHours + hours);
        techTotal.consultationCommission = roundMoney(techTotal.consultationCommission + commission);
        techTotal.totalCommission = roundMoney(techTotal.totalCommission + commission);
        consultationRows.push({
          Date: date,
          Technician: techLabel,
          Customer: sale?.customerName || '',
          Consultation: title,
          Hours: hours.toFixed(2),
          'Hourly Payout': money(commissionSettings.consultationTechHourlyRate),
          'Commission Earned': money(commission),
          'Audit Flag': !assignedKey ? 'Missing assigned technician' : (!(hours > 0) ? 'Missing consultation hours' : ''),
        });
        continue;
      }

      const fullCost = lineInternalCost(item);
      const cost = fullCost === null ? null : roundMoney(fullCost * collectionRatio);
      const distributor = String(item?.distributor || '').trim();
      const vendor = distributor ? (vendors || []).find((row: any) =>
        (row?.inventoryMode || 'Product') === 'Product'
        && String(row?.name || '').trim().toLowerCase() === distributor.toLowerCase()) : null;
      const snapshotRelationship = String(item?.vendorRelationship || '').trim();
      const isConsignment = snapshotRelationship
        ? snapshotRelationship === 'consignment'
        : vendor?.relationship === 'consignment';
      const snapshotShare = item?.vendorSharePct === undefined || item?.vendorSharePct === null ? Number.NaN : Number(item.vendorSharePct);
      const currentShare = Number(vendor?.vendorSharePct);
      const vendorSharePct = isConsignment
        ? (Number.isFinite(snapshotShare) ? snapshotShare : (Number.isFinite(currentShare) ? currentShare : null))
        : null;
      const vendorPayout = vendorSharePct === null ? 0 : roundMoney(soldNet * (vendorSharePct / 100));
      const profit = isConsignment
        ? (vendorSharePct === null ? null : roundMoney(soldNet - vendorPayout))
        : (cost === null ? null : roundMoney(soldNet - cost));
      const margin = profit === null || soldNet <= 0 ? null : roundMoney((profit / soldNet) * 100);
      const commissionPool = salesCommissionPool(soldNet, commissionSettings);
      const perTechCommission = splitCommissionPool(commissionPool, salesSplitCount);
      physicalSalesBase = roundMoney(physicalSalesBase + soldNet);
      if (cost === null) {
        if (!isConsignment) missingInternalCostCount += 1;
      } else {
        knownInternalCost = roundMoney(knownInternalCost + cost);
      }
      if (profit !== null) knownProfit = roundMoney(knownProfit + profit);
      if (isConsignment && vendorSharePct !== null) {
        vendorPayoutTotal = roundMoney(vendorPayoutTotal + vendorPayout);
        vendorProfitTotal = roundMoney(vendorProfitTotal + (profit || 0));
      }

      productRows.push({
        Date: date,
        'Sale ID': sale?.id || '',
        Customer: sale?.customerName || '',
        Product: title,
        Qty: lineUnits(item),
        'Sold Total': money(soldNet),
        'Internal Cost': cost === null ? 'Missing' : money(cost),
        Vendor: distributor,
        'Vendor Share %': isConsignment ? (vendorSharePct === null ? 'Missing' : `${vendorSharePct.toFixed(2)}%`) : '',
        'Vendor Owed': isConsignment ? (vendorSharePct === null ? 'Missing' : money(vendorPayout)) : '',
        'Gross Profit': profit === null ? 'Needs internal cost' : money(profit),
        'Margin %': margin === null ? 'Needs internal cost' : `${margin.toFixed(2)}%`,
        'Commission Rate': `${commissionSettings.salesCommissionPercent}%`,
        'Commission Pool': money(commissionPool),
        'Per-Tech Sales Commission': money(perTechCommission),
        'Split Across Techs': salesSplitCount,
        'Audit Flag': isConsignment && vendorSharePct === null ? 'Missing vendor share percentage' : (!isConsignment && cost === null ? 'Missing internal cost' : ''),
      });
    }
  }

  const monthlyAllocation = allocateMonthlySalesCommission(physicalSalesBase, commissionSettings, salesSplitCount);
  physicalSalesCommissionPool = monthlyAllocation.pool;
  salesSplitTechs.forEach((tech, index) => {
    const total = ensureTech(technicianKey(tech), technicianDisplay(tech));
    const exactShare = monthlyAllocation.shares[index] || 0;
    total.salesCommission = roundMoney(total.salesCommission + exactShare);
    total.totalCommission = roundMoney(total.totalCommission + exactShare);
  });

  const technicianRows = Array.from(techTotals.values())
    .map((row) => ({
      Technician: row.technician,
      'Sales Commission': money(row.salesCommission),
      'Consultation Hours': row.consultationHours.toFixed(2),
      'Consultation Commission': money(row.consultationCommission),
      'Total Commission': money(row.totalCommission),
    }))
    .sort((a, b) => String(a.Technician).localeCompare(String(b.Technician)));

  const totalCommission = Array.from(techTotals.values()).reduce((sum, row) => sum + row.totalCommission, 0);

  return {
    monthLabel: start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
    start,
    end,
    productRows,
    consultationRows,
    purchaseRows,
    technicianRows,
    summary: {
      salesCount: productRows.length,
      consultationCount: consultationRows.length,
      physicalSalesBase,
      physicalSalesCommissionPool,
      knownInternalCost,
      knownProfit,
      totalCommission: roundMoney(totalCommission),
      salesSplitCount,
      missingInternalCostCount,
      missingConsultationAssignmentCount,
      missingConsultationHoursCount,
      vendorPayoutTotal,
      vendorProfitTotal,
      supplierSpendParts,
      supplierSpendProducts,
      supplierSpendTotal: roundMoney(supplierSpendParts + supplierSpendProducts),
      salesSplitWarning: !configuredSplitTechs.length
        ? 'No selected active technicians were found, so sales commission is parked in Unassigned Sales Split.'
        : '',
    },
  };
}

const ReportingWindow: React.FC = () => {
  const [period, setPeriod] = useState<'day'|'week'|'month'|'year'>('day');
  const [from, setFrom] = useState<string>(() => todayInputValue());
  const [to, setTo] = useState<string>(() => todayInputValue());
  const [reportView, setReportView] = useState<'summary' | 'monthEnd'>('summary');
  const [monthEndMonth, setMonthEndMonth] = useState(() => new Date().toISOString().slice(0, 7));
  // Store filter removed
  const [tech, setTech] = useState<string>('');
  const [excludeTax, setExcludeTax] = useState<boolean>(true);
  const [data, setData] = useState<any[]>([]);
  const [vendors, setVendors] = useState<any[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<any[]>([]);
  const [commissionSettings, setCommissionSettings] = useState<CommissionSettings>(DEFAULT_COMMISSION_SETTINGS);
  const [commissionSettingsRecordId, setCommissionSettingsRecordId] = useState<any>(null);
  const [commissionDraft, setCommissionDraft] = useState<CommissionSettings>(DEFAULT_COMMISSION_SETTINGS);
  const [showCommissionSettings, setShowCommissionSettings] = useState(false);
  const [savingCommissionSettings, setSavingCommissionSettings] = useState(false);
  const [reportingSettings, setReportingSettings] = useState<ReportingSettings>(DEFAULT_REPORTING_SETTINGS);
  const [reportingDraft, setReportingDraft] = useState<ReportingSettings>(DEFAULT_REPORTING_SETTINGS);
  const [csv, setCsv] = useState<string>('');
  const [topRepairs, setTopRepairs] = useState<Array<{title: string; count: number}>>([]);
  const [topSales, setTopSales] = useState<Array<{title: string; count: number}>>([]);
  const [includeRepairs, setIncludeRepairs] = useState<boolean>(true);
  const [includeSales, setIncludeSales] = useState<boolean>(true);
  const [dayMetric, setDayMetric] = useState<'orders'|'revenue'>('orders');
  const [onlyPaid, setOnlyPaid] = useState<boolean>(true);

  useEffect(() => {
    // Debug marker to ensure the admin Reporting window is using the latest renderer bundle.
    console.log('[ReportingWindow] BUILD_MARKER: reporting-v2');
  }, []);

  useEffect(() => {
    let disposed = false;
    const loadRecords = async (includeSettings = false) => {
    try {
      const wos = await (window as any).api.getWorkOrders();
      const [sales, vendorRows, purchaseRows, eodRows] = await Promise.all([
        (window as any).api.dbGet('sales').catch(() => []),
        (window as any).api.dbGet('vendors').catch(() => []),
        (window as any).api.dbGet('purchaseOrders').catch(() => []),
        includeSettings ? (window as any).api.dbGet('settings').catch(() => []) : Promise.resolve([]),
      ]);
      if (disposed) return;
      setVendors(Array.isArray(vendorRows) ? vendorRows : []);
      setPurchaseOrders(Array.isArray(purchaseRows) ? purchaseRows : []);
      let loadedReporting = reportingSettings;
      if (includeSettings) {
        const settingsRecord = Array.isArray(eodRows) ? eodRows[0] : null;
        const loadedCommission = normalizeCommissionSettings(settingsRecord?.commissionSettings);
        loadedReporting = normalizeReportingSettings(settingsRecord?.reportingSettings);
        setCommissionSettings(loadedCommission);
        setCommissionDraft(loadedCommission);
        setReportingSettings(loadedReporting);
        setReportingDraft(loadedReporting);
        setIncludeRepairs(loadedReporting.includeRepairs);
        setIncludeSales(loadedReporting.includeSales);
        setOnlyPaid(loadedReporting.onlyPaid);
        setExcludeTax(loadedReporting.excludeTax);
        setCommissionSettingsRecordId(settingsRecord?.id ?? null);
      }
      // Tag repairs and normalize sales
      const mappedWOs = (Array.isArray(wos) ? wos : []).map((w: any) => ({ ...w, kind: 'repair' as const }));
      const mappedSales = (Array.isArray(sales) ? sales : []).map((s: any) => {
        const items = Array.isArray(s.items) ? s.items : [{ description: s.itemDescription, qty: s.quantity || 1, price: s.price || 0, internalCost: s.internalCost }];
        const parts = items.reduce((sum: number, it: any) => sum + (Number(it.qty || 1) * Number(it.price || 0)), 0);
        return {
          ...s,
          kind: 'sale' as const,
          id: s.id,
          checkInAt: s.checkInAt || s.createdAt,
          assignedTo: s.assignedTo,
          productDescription: (items[0]?.description || s.itemDescription || 'Sale Item'),
          laborCost: 0,
          partCosts: Number(s.partCosts || parts || 0),
          discount: Number(s.discount || 0),
          taxRate: Number(s.taxRate || 0),
          amountPaid: Number(s.amountPaid || 0),
          paymentType: s.paymentType,
          payments: s.payments,
          items,
        };
      });
      const combined = [...(mappedWOs || []), ...mappedSales];
      setData(combined);
      if (includeSettings) applySummaryRange(loadedReporting.defaultSummaryRange, [...combined, ...(Array.isArray(purchaseRows) ? purchaseRows : [])]);
    } catch (e) { console.error(e); }
    };
    void loadRecords(true);
    const off = (window as any).api?.onPurchaseOrdersChanged?.(() => {
      (window as any).api.dbGet('purchaseOrders').then((rows: any[]) => setPurchaseOrders(Array.isArray(rows) ? rows : [])).catch(() => {});
    });
    const offWorkOrders = (window as any).api?.onWorkOrdersChanged?.(() => { void loadRecords(false); });
    const offSales = (window as any).api?.onSalesChanged?.(() => { void loadRecords(false); });
    return () => {
      disposed = true;
      try { off && off(); } catch {}
      try { offWorkOrders && offWorkOrders(); } catch {}
      try { offSales && offSales(); } catch {}
    };
  }, []);

  const paymentLedger = useMemo(() => buildReportingLedger(data), [data]);

  const filtered = useMemo(() => {
    if (!data?.length) return [] as any[];
    const fromDate = from ? startOfInputDate(from) : null;
    const toDate = to ? endOfInputDate(to) : null;
    const paidRecordKeys = new Set(paymentLedger
      .filter(entry => (!fromDate || entry.date >= fromDate) && (!toDate || entry.date <= toDate))
      .map(entry => entry.recordKey));
    return data.filter(w => {
      if (w.kind === 'repair' && !includeRepairs) return false;
      if (w.kind === 'sale' && !includeSales) return false;
      if (onlyPaid && !paidRecordKeys.has(reportingRecordKey(w))) return false;
      const d = reportDate(w.checkInAt || w.createdAt || w.repairCompletionDate || w.checkoutDate);
      if (!d) return false;
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      if (tech) {
        const at = (w.assignedTo ?? '').toString();
        // Match exact nickname/firstName stored convention
        if (at.toLowerCase() !== tech.toLowerCase()) return false;
      }
      return true;
    });
  }, [data, from, to, tech, includeRepairs, includeSales, onlyPaid, paymentLedger]);

  const filteredPurchases = useMemo(() => {
    const fromDate = from ? startOfInputDate(from) : null;
    const toDate = to ? endOfInputDate(to) : null;
    return purchaseOrders.filter((purchase) => {
      if (purchase?.status !== 'checked_out') return false;
      const date = reportDate(purchaseReportDate(purchase));
      if (!date) return false;
      if (fromDate && date < fromDate) return false;
      if (toDate && date > toDate) return false;
      return true;
    });
  }, [from, purchaseOrders, to]);

  const filteredLedger = useMemo(() => {
    const allowed = new Set(filtered.map(reportingRecordKey));
    const fromDate = from ? startOfInputDate(from) : null;
    const toDate = to ? endOfInputDate(to) : null;
    return paymentLedger.filter(entry => (
      allowed.has(entry.recordKey)
      && (!fromDate || entry.date >= fromDate)
      && (!toDate || entry.date <= toDate)
    ));
  }, [filtered, from, paymentLedger, to]);

  // Registered technicians list
  const [technicians, setTechnicians] = useState<any[]>([]);
  useEffect(() => {
    let disposed = false;
    async function refresh() {
      try {
        const list = await listTechnicians();
        if (!disposed) setTechnicians(list as any[]);
      } catch (e) { console.error('load technicians failed', e); }
    }
    refresh();
    const off = (window as any).api?.onTechniciansChanged?.(() => refresh());
    return () => { disposed = true; try { off && off(); } catch {} };
  }, []);
  const technicianOptions = useMemo(() => {
    return (technicians || []).map((t: any) => ({
      value: (t.nickname?.trim() || t.firstName || String(t.id)).toString(),
      label: [t.firstName, t.lastName].filter(Boolean).join(' ') || t.nickname || `Tech ${t.id}`,
    }));
  }, [technicians]);

  async function saveCommissionSettings() {
    const api = (window as any).api;
    const normalized = normalizeCommissionSettings(commissionDraft);
    const activeTechnicians = technicians.filter((row: any) => row?.active !== false);
    if (activeTechnicians.length && !normalized.salesCommissionTechnicianIds.length) {
      alert('Select at least one technician to receive the shared sales commission.');
      return;
    }
    setSavingCommissionSettings(true);
    try {
      if (commissionSettingsRecordId !== null && commissionSettingsRecordId !== undefined) {
        await api.dbUpdate('settings', commissionSettingsRecordId, { commissionSettings: normalized, reportingSettings: reportingDraft, updatedAt: new Date().toISOString() });
      } else {
        const created = await api.dbAdd('settings', { commissionSettings: normalized, reportingSettings: reportingDraft, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        setCommissionSettingsRecordId(created?.id ?? null);
      }
      setCommissionSettings(normalized);
      setCommissionDraft(normalized);
      setReportingSettings(reportingDraft);
      setIncludeRepairs(reportingDraft.includeRepairs);
      setIncludeSales(reportingDraft.includeSales);
      setOnlyPaid(reportingDraft.onlyPaid);
      setExcludeTax(reportingDraft.excludeTax);
      applySummaryRange(reportingDraft.defaultSummaryRange, data);
      setShowCommissionSettings(false);
    } catch (error: any) {
      alert(error?.message || 'Reporting settings could not be saved.');
    } finally {
      setSavingCommissionSettings(false);
    }
  }

  const weekdayTallies = useMemo(() => {
    // getDay(): 0=Sun..6=Sat; we will present Monday..Sunday
    const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const counts: Record<string, { orders: number; revenue: number }> = {};
    for (const n of names) counts[n] = { orders: 0, revenue: 0 };
    const ordersByDay = new Map<string, Set<string>>();
    for (const entry of filteredLedger) {
      const name = names[entry.date.getDay()];
      if (!ordersByDay.has(name)) ordersByDay.set(name, new Set());
      ordersByDay.get(name)!.add(entry.recordKey);
      counts[name].revenue += excludeTax ? entry.collected - entry.taxCollected : entry.collected;
    }
    for (const [name, keys] of ordersByDay) counts[name].orders = keys.size;
    const order = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    return order.map(day => ({ day, ...counts[day] }));
  }, [filteredLedger, excludeTax]);

  function sumInternalCost(w: any): number {
    // If items array has entries, sum from items only (avoid double-counting with w.internalCost)
    if (Array.isArray(w.items) && w.items.length > 0) {
      let sum = 0;
      for (const it of w.items) {
        const cost = itemFullCost(it);
        if (cost !== null) sum += cost;
      }
      return sum;
    }
    // Fall back to a direct field if no items array
    const direct = Number((w.internalCost || 0));
    return Number.isFinite(direct) ? direct : 0;
  }

  function missingInternalCostCount(w: any): number {
    if (Array.isArray(w.items) && w.items.length > 0) {
      return w.items.filter((item: any) => {
        const category = String(item?.category || '').toLowerCase();
        if (category.startsWith('consult')) return false;
        const physicalCharge = w.kind === 'sale'
          ? Number(item?.price ?? item?.unitPrice ?? 0)
          : Number(item?.parts ?? item?.partCost ?? item?.price ?? 0);
        return physicalCharge > 0 && itemFullCost(item) === null;
      }).length;
    }
    const physicalCharge = w.kind === 'sale' ? Number(w.price || 0) : Number(w.partCosts || 0);
    const raw = w.internalCost;
    return physicalCharge > 0 && (raw === null || raw === undefined || raw === '' || !Number.isFinite(Number(raw))) ? 1 : 0;
  }

  const grouped = useMemo(() => {
    const map = new Map<string, { orders: number; labor: number; parts: number; subtotal: number; tax: number; total: number; cost: number; profit: number; missingCost: number; supplierSpend: number }>();
    const orderKeysByBucket = new Map<string, Set<string>>();
    const missingKeysByBucket = new Map<string, Set<string>>();
    for (const entry of filteredLedger) {
      const periodStart = startOfPeriod(entry.date, period);
      const bucket = periodStart.toISOString().slice(0,10);
      const prev = map.get(bucket) || { orders: 0, labor: 0, parts: 0, subtotal: 0, tax: 0, total: 0, cost: 0, profit: 0, missingCost: 0, supplierSpend: 0 };
      if (!orderKeysByBucket.has(bucket)) orderKeysByBucket.set(bucket, new Set());
      orderKeysByBucket.get(bucket)!.add(entry.recordKey);
      if (entry.missingInternalCost > 0) {
        if (!missingKeysByBucket.has(bucket)) missingKeysByBucket.set(bucket, new Set());
        missingKeysByBucket.get(bucket)!.add(entry.recordKey);
      }
      const netCollected = entry.collected - entry.taxCollected;
      prev.labor = roundMoney(prev.labor + entry.laborCharged);
      prev.parts = roundMoney(prev.parts + entry.partsCharged);
      prev.subtotal = roundMoney(prev.subtotal + netCollected);
      prev.tax = roundMoney(prev.tax + entry.taxCollected);
      prev.total = roundMoney(prev.total + (excludeTax ? netCollected : entry.collected));
      prev.cost = roundMoney(prev.cost + entry.internalCost);
      prev.profit = roundMoney(prev.profit + entry.profitExcludingTax);
      map.set(bucket, prev);
    }
    for (const purchase of filteredPurchases) {
      const periodStart = startOfPeriod(purchaseReportDate(purchase), period);
      const bucket = periodStart.toISOString().slice(0,10);
      const prev = map.get(bucket) || { orders: 0, labor: 0, parts: 0, subtotal: 0, tax: 0, total: 0, cost: 0, profit: 0, missingCost: 0, supplierSpend: 0 };
      prev.supplierSpend += verifiedPurchaseTotal(purchase);
      map.set(bucket, prev);
    }
    for (const [bucket, value] of map) {
      value.orders = orderKeysByBucket.get(bucket)?.size || 0;
      value.missingCost = missingKeysByBucket.get(bucket)?.size || 0;
    }
    return Array.from(map.entries()).sort((a,b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v }));
  }, [filteredLedger, filteredPurchases, period, excludeTax]);

  const csvRows = useMemo(() => grouped.map(r => ({
    period_start: r.date,
    orders: r.orders,
    labor: r.labor.toFixed(2),
    parts: r.parts.toFixed(2),
    subtotal: r.subtotal.toFixed(2),
    tax: r.tax.toFixed(2),
    revenue: r.total.toFixed(2),
    cost: r.cost.toFixed(2),
    supplier_spend: r.supplierSpend.toFixed(2),
    profit: r.missingCost ? 'Needs internal cost' : r.profit.toFixed(2),
    margin_pct: r.missingCost ? 'Needs internal cost' : ((r.subtotal ? (r.profit / r.subtotal) : 0) * 100).toFixed(1),
    audit_flag: r.missingCost ? `${r.missingCost} charged physical line(s) missing internal cost` : '',
  })), [grouped]);

  useEffect(() => { setCsv(formatCSV(csvRows)); }, [csvRows]);

  useEffect(() => {
    const rep = new Map<string, number>();
    const sal = new Map<string, number>();
    for (const w of filtered) {
      const key = (w.productDescription || 'Unknown').toString();
      if (w.kind === 'sale') sal.set(key, (sal.get(key) || 0) + 1);
      else rep.set(key, (rep.get(key) || 0) + 1);
    }
    setTopRepairs(Array.from(rep.entries()).map(([title, count]) => ({ title, count })).sort((a,b) => b.count - a.count).slice(0, 10));
    setTopSales(Array.from(sal.entries()).map(([title, count]) => ({ title, count })).sort((a,b) => b.count - a.count).slice(0, 10));
  }, [filtered]);

  // Respond to ChartsWindow fallback requests
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      const d: any = e?.data;
      if (!d || typeof d !== 'object') return;
      if (d.type === 'charts:request-data') {
        try {
          const payload = (filtered || []).map((w: any) => ({ ...w }));
          (e.source as WindowProxy | null)?.postMessage({ type: 'charts:data', payload }, '*');
        } catch {}
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [filtered]);

  function downloadCSV() {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `report-${period}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  // Summary metrics across filtered set
  const summary = useMemo(() => {
    const s = grouped.reduce((acc, g) => {
      acc.orders += g.orders; acc.labor += g.labor; acc.parts += g.parts; acc.subtotal += g.subtotal; acc.tax += g.tax; acc.revenue += g.total; acc.cost += g.cost; acc.profit += g.profit; acc.missingCost += g.missingCost; acc.supplierSpend += g.supplierSpend; return acc;
    }, { orders: 0, labor: 0, parts: 0, subtotal: 0, tax: 0, revenue: 0, cost: 0, profit: 0, missingCost: 0, supplierSpend: 0 });
    const margin = s.subtotal ? (s.profit / s.subtotal) : 0;
    const avgTicket = s.orders ? (s.revenue / s.orders) : 0;
    return { ...s, margin, avgTicket };
  }, [grouped]);

  const endOfMonthReport = useMemo(() => {
    const sales = data.filter((row: any) => row.kind === 'sale');
    return buildEndOfMonthReport(sales, technicians, vendors, purchaseOrders, monthEndMonth, commissionSettings);
  }, [data, technicians, vendors, purchaseOrders, monthEndMonth, commissionSettings]);

  const monthRepairFinancials = useMemo(() => {
    const { start, end } = monthRange(monthEndMonth);
    return paymentLedger
      .filter(entry => entry.kind === 'repair' && entry.date >= start && entry.date <= end)
      .reduce((totals, entry) => ({
        partsCost: roundMoney(totals.partsCost + entry.internalCost),
        partsCharged: roundMoney(totals.partsCharged + entry.partsCharged),
        laborCharged: roundMoney(totals.laborCharged + entry.laborCharged),
      }), { partsCost: 0, partsCharged: 0, laborCharged: 0 });
  }, [paymentLedger, monthEndMonth]);

  function downloadEndOfMonthReport() {
    const report = endOfMonthReport;
    const summaryRows = [{
      Month: report.monthLabel,
      'Physical Sales Lines': report.summary.salesCount,
      'Consultation Lines': report.summary.consultationCount,
      'Parts Cost': money(monthRepairFinancials.partsCost),
      'Parts Charged': money(monthRepairFinancials.partsCharged),
      'Labor Charged': money(monthRepairFinancials.laborCharged),
      'Sales Commission Base': money(report.summary.physicalSalesBase),
      'Sales Commission Pool': money(report.summary.physicalSalesCommissionPool),
      'Known Internal Cost': money(report.summary.knownInternalCost),
      'Product Sales Gross Profit': money(report.summary.knownProfit),
      'Vendor Payouts Owed': money(report.summary.vendorPayoutTotal),
      'Profit From Vendor Sales': money(report.summary.vendorProfitTotal),
      'Verified Parts Supplier Spend': money(report.summary.supplierSpendParts),
      'Verified Products Supplier Spend': money(report.summary.supplierSpendProducts),
      'Verified Supplier Spend Total': money(report.summary.supplierSpendTotal),
      'Total Commission': money(report.summary.totalCommission),
      'Sales Split Across Techs': report.summary.salesSplitCount,
      'Sales Commission Rate': `${commissionSettings.salesCommissionPercent}%`,
      'Consultation Hourly Commission': money(commissionSettings.consultationTechHourlyRate),
      'Missing Internal Cost Lines': report.summary.missingInternalCostCount,
      'Missing Consultation Assignment Lines': report.summary.missingConsultationAssignmentCount,
      'Missing Consultation Hour Lines': report.summary.missingConsultationHoursCount,
      'Audit Note': [
        report.summary.salesSplitWarning,
        report.summary.missingInternalCostCount ? 'Some product rows need internal cost before profit/margin is final.' : '',
        report.summary.missingConsultationAssignmentCount ? 'Some consultation rows need an assigned technician.' : '',
        report.summary.missingConsultationHoursCount ? 'Some consultation rows need logged hours.' : '',
      ].filter(Boolean).join(' '),
    }];
    const body = buildMonthEndWorkbookHtml({
      monthLabel: report.monthLabel,
      summary: [
        { label: 'Parts Cost', value: money(monthRepairFinancials.partsCost) },
        { label: 'Parts Charged', value: money(monthRepairFinancials.partsCharged) },
        { label: 'Labor Charged', value: money(monthRepairFinancials.laborCharged), tone: 'positive' },
        { label: 'Monthly Sales Base', value: money(report.summary.physicalSalesBase) },
        { label: 'Monthly Sales Pool', value: money(report.summary.physicalSalesCommissionPool), tone: 'accent' },
        { label: 'Total Commission', value: money(report.summary.totalCommission), tone: 'accent' },
        { label: 'Product Sales Gross Profit', value: money(report.summary.knownProfit), tone: 'positive' },
        { label: 'Vendor Owed', value: money(report.summary.vendorPayoutTotal), tone: 'negative' },
      ],
      sections: [
        { title: 'End of Month Summary', rows: summaryRows },
        { title: 'Technician Commission Totals', rows: report.technicianRows },
        { title: 'Product Sales Line Items', rows: report.productRows },
        { title: 'Consultation Commission Line Items', rows: report.consultationRows },
        { title: 'Verified Supplier Purchase Line Items', rows: report.purchaseRows },
      ],
    });
    const blob = new Blob(['\ufeff', body], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `end-of-month-report-${monthEndMonth}.xls`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const paymentTotals = useMemo(() => {
    let cashTender = 0;
    let cashChange = 0;
    let card = 0;
    let other = 0;

    const appliedAmount = (payment: any) => {
      const applied = Number(payment?.applied);
      if (Number.isFinite(applied) && applied > 0) return applied;
      const amount = Number(payment?.amount ?? payment?.tender ?? payment?.paid ?? 0);
      const change = Number(payment?.change ?? payment?.changeDue ?? 0);
      if (!Number.isFinite(amount) || amount <= 0) return 0;
      if (Number.isFinite(change) && change > 0) return Math.max(0, amount - change);
      return amount;
    };

    const fromDate = from ? startOfInputDate(from) : null;
    const toDate = to ? endOfInputDate(to) : null;
    for (const w of filtered) {
      const payments = collectReportingPayments(w).filter((payment: any) => {
        const date = reportDate(payment?.at ?? payment?.date ?? payment?.createdAt ?? payment?.timestamp);
        return !!date && (!fromDate || date >= fromDate) && (!toDate || date <= toDate);
      });
      if (payments.length) {
        for (const p of payments) {
          const pt = String((p && (p.paymentType ?? p.type)) || '').toLowerCase();
          const amt = appliedAmount(p);
          const change = Number(p?.change || p?.changeDue || 0);
          if (!Number.isFinite(amt) || amt <= 0) continue;
          if (pt.includes('cash')) {
            const tendered = Number(p?.amount ?? p?.tender ?? p?.paid ?? amt);
            cashTender += Number.isFinite(tendered) && tendered > 0 ? tendered : amt;
            if (Number.isFinite(change) && change > 0) cashChange += change;
          } else if (pt.includes('card') || pt.includes('credit') || pt.includes('debit')) {
            card += amt;
          } else if (amt > 0) {
            other += amt;
          }
        }
        continue;
      }

    }

    const cashNet = cashTender - cashChange;
    return { cashTender, cashChange, cashNet, card, other, nonCash: card + other };
  }, [filtered, from, to]);

  async function downloadSummary() {
    const payload = {
      generatedAt: new Date().toISOString(),
      filters: {
        period,
        from: from || null,
        to: to || null,
        technician: tech || null,
        excludeTax,
        includeRepairs,
        includeSales,
      },
      totals: {
        grandTotal: Number(summary.revenue || 0),
        cashTotal: Number(paymentTotals.cashTender || 0),
        cardTotal: Number((paymentTotals.nonCash || 0)),
        changeGiven: Number(paymentTotals.cashChange || 0),
        cashToDeposit: Number(paymentTotals.cashNet || 0),
      },
      popular: {
        repairs: topRepairs,
        products: topSales,
      },
    };

    const api = (window as any).api;
    if (api && typeof api.backupExportPayloadNamed === 'function') {
      await api.backupExportPayloadNamed(payload, 'reporting-summary');
      return;
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporting-summary-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function applySummaryRange(key: SummaryRange, records: any[] = data) {
    const now = new Date();
    if (key === 'today') {
      const d = new Date(); d.setHours(0,0,0,0); setFrom(d.toISOString().slice(0,10)); setTo(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).toISOString().slice(0,10)); setPeriod('day');
    } else if (key === 'week') {
      const start = startOfPeriod(now, 'week'); const end = new Date(start); end.setDate(start.getDate() + 6);
      setFrom(start.toISOString().slice(0,10)); setTo(end.toISOString().slice(0,10)); setPeriod('week');
    } else if (key === 'month') {
      const start = startOfPeriod(now, 'month'); const end = new Date(start.getFullYear(), start.getMonth()+1, 0);
      setFrom(start.toISOString().slice(0,10)); setTo(end.toISOString().slice(0,10)); setPeriod('month');
    } else if (key === 'year') {
      const start = startOfPeriod(now, 'year'); const end = new Date(start.getFullYear(), 11, 31);
      setFrom(start.toISOString().slice(0,10)); setTo(end.toISOString().slice(0,10)); setPeriod('year');
    } else {
      const dates = records
        .map(record => reportDate(record.checkInAt || record.repairCompletionDate || record.checkoutDate || purchaseReportDate(record) || record.createdAt))
        .filter((date): date is Date => Boolean(date))
        .sort((a, b) => a.getTime() - b.getTime());
      setFrom(dates[0]?.toISOString().slice(0, 10) || todayInputValue());
      setTo(dates[dates.length - 1]?.toISOString().slice(0, 10) || todayInputValue());
      setPeriod('year');
    }
  }

  function setQuickRange(key: SummaryRange) {
    applySummaryRange(key);
  }

  return (
    <div className="h-screen bg-zinc-900 text-gray-100 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-bold">Reporting</div>
          <div className="text-xs text-zinc-500">Sales, repair intake, payments, and exportable summaries.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="px-3 py-2 bg-[#BC13FE] text-white rounded font-semibold hover:bg-[#a80ee0]"
            onClick={() => {
              setCommissionDraft({
                ...commissionSettings,
                salesCommissionTechnicianIds: commissionSettings.salesCommissionTechnicianIds.length
                  ? commissionSettings.salesCommissionTechnicianIds
                  : technicians.filter((row: any) => row?.active !== false).map(technicianCommissionId).filter(Boolean),
                consultationCommissionTechnicianIds: commissionSettings.consultationCommissionTechnicianIds,
              });
              setReportingDraft(reportingSettings);
              setShowCommissionSettings(true);
            }}
          >
            Settings
          </button>
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <span className="text-xs text-zinc-500">Reports</span>
            <select
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2"
              value={reportView}
              onChange={e => {
                if (e.target.value === 'eod') {
                  dispatchOpenModal('eod');
                  return;
                }
                setReportView(e.target.value as 'summary' | 'monthEnd');
              }}
            >
              <option value="summary">Summary Report</option>
              <option value="eod">End of Day Report</option>
              <option value="monthEnd">End of the Month Report</option>
            </select>
          </label>
          <button
            type="button"
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#BC13FE]"
            onClick={() => {
              try {
                const payload = (filtered || []).map((w: any) => ({ ...w }));
                dispatchOpenModal('charts', { payload });
              } catch {}
            }}
          >
            Charts
          </button>
        </div>
      </div>
      {showCommissionSettings && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-3" onMouseDown={() => setShowCommissionSettings(false)}>
          <section className="w-full max-w-2xl max-h-[calc(100dvh-1.5rem)] overflow-y-auto rounded-lg border border-[#BC13FE]/70 bg-zinc-950 p-4 shadow-2xl" onMouseDown={event => event.stopPropagation()}>
            <header className="flex items-start justify-between gap-3 border-b border-zinc-800 pb-3">
              <div>
                <h2 className="text-xl font-semibold text-white">Reporting Settings</h2>
                <p className="mt-1 text-xs text-zinc-400">Choose reporting defaults and commission rules without changing any saved sales, work orders, or payments.</p>
              </div>
              <button type="button" aria-label="Close reporting settings" className="px-2 py-1 text-zinc-400 hover:text-white" onClick={() => setShowCommissionSettings(false)}>x</button>
            </header>
            <div className="mt-4 rounded border border-zinc-800 bg-zinc-900 p-3">
              <div className="text-sm font-semibold text-zinc-100">Summary report defaults</div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block text-sm text-zinc-300">Default date range
                  <select className="mt-1 w-full rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-white" value={reportingDraft.defaultSummaryRange} onChange={event => setReportingDraft(current => ({ ...current, defaultSummaryRange: event.target.value as SummaryRange }))}>
                    <option value="all">All records</option>
                    <option value="today">Today</option>
                    <option value="week">This week</option>
                    <option value="month">This month</option>
                    <option value="year">This year</option>
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  {([
                    ['includeRepairs', 'Repairs'],
                    ['includeSales', 'Sales'],
                    ['onlyPaid', 'Paid only'],
                    ['excludeTax', 'Exclude tax'],
                  ] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-2 rounded border border-zinc-700 bg-zinc-950 px-3 py-2">
                      <input type="checkbox" className="h-4 w-4 accent-[#39FF14]" checked={reportingDraft[key]} onChange={event => setReportingDraft(current => ({ ...current, [key]: event.target.checked }))} />
                      <span>{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div className="mt-3 text-xs text-zinc-500">These defaults control the opening Summary Report. Date and technician filters can still be changed for an individual report.</div>
            </div>
            <div className="mt-4 rounded border border-zinc-800 bg-zinc-900 p-3">
              <div className="text-sm font-semibold text-zinc-100">Summary sections</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {([
                  ['showPaymentSummary', 'Payment totals'],
                  ['showTypeBreakdown', 'Repairs vs. sales'],
                  ['showTopItems', 'Top repairs and sales'],
                  ['showDetailTable', 'Period detail table'],
                  ['showCsvPreview', 'CSV preview'],
                ] as const).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-3 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-[#39FF14]" checked={reportingDraft[key]} onChange={event => setReportingDraft(current => ({ ...current, [key]: event.target.checked }))} />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="mt-4 border-t border-zinc-800 pt-4">
              <div className="text-base font-semibold text-[#BC13FE]">Commission</div>
              <div className="mt-1 text-xs text-zinc-500">Commission is calculated only from factual saved sales, consultation hours, and technician assignments.</div>
            </div>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <label className="block text-sm text-zinc-300">Sales commission percentage
                <div className="mt-1 flex items-center rounded border border-zinc-700 bg-zinc-900 focus-within:border-[#BC13FE]">
                  <input type="number" min="0" max="100" step="0.01" className="min-w-0 flex-1 bg-transparent px-3 py-2 text-white outline-none" value={commissionDraft.salesCommissionPercent} onChange={event => setCommissionDraft(current => ({ ...current, salesCommissionPercent: Number(event.target.value) }))} />
                  <span className="pr-3 text-zinc-500">%</span>
                </div>
              </label>
              <label className="block text-sm text-zinc-300">Consultation commission per hour
                <div className="mt-1 flex items-center rounded border border-zinc-700 bg-zinc-900 focus-within:border-[#BC13FE]">
                  <span className="pl-3 text-zinc-500">$</span>
                  <input type="number" min="0" max="1000" step="0.01" className="min-w-0 flex-1 bg-transparent px-2 py-2 text-white outline-none" value={commissionDraft.consultationTechHourlyRate} onChange={event => setCommissionDraft(current => ({ ...current, consultationTechHourlyRate: Number(event.target.value) }))} />
                </div>
              </label>
            </div>
            <div className="mt-4 rounded border border-zinc-800 bg-zinc-900 p-3">
              <div className="text-sm font-semibold text-zinc-100">Split the sales commission pool between</div>
              <div className="mt-1 text-xs text-zinc-500">Every eligible sale contributes {commissionDraft.salesCommissionPercent || 0}% to one pool. The pool is divided evenly among the checked technicians.</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {technicians.filter((technician: any) => technician?.active !== false).map((technician: any) => {
                  const id = technicianCommissionId(technician);
                  const checked = commissionDraft.salesCommissionTechnicianIds.includes(id);
                  return <label key={id} className="flex items-center gap-3 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-[#BC13FE]" checked={checked} onChange={event => setCommissionDraft(current => ({ ...current, salesCommissionTechnicianIds: event.target.checked ? Array.from(new Set([...current.salesCommissionTechnicianIds, id])) : current.salesCommissionTechnicianIds.filter(value => value !== id) }))} />
                    <span>{technicianDisplay(technician)}</span>
                  </label>;
                })}
              </div>
              {!technicians.length && <div className="mt-3 text-sm text-amber-300">Add technicians before configuring the split.</div>}
            </div>
            <div className="mt-4 rounded border border-zinc-800 bg-zinc-900 p-3">
              <div className="text-sm font-semibold text-zinc-100">Pay consultation commission to</div>
              <div className="mt-1 text-xs text-zinc-500">Leave all unchecked to pay the technician assigned to each consultation. Check one or more names to limit consultation commission to those technicians.</div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {technicians.filter((technician: any) => technician?.active !== false).map((technician: any) => {
                  const id = technicianCommissionId(technician);
                  const checked = commissionDraft.consultationCommissionTechnicianIds.includes(id);
                  return <label key={`consultation-${id}`} className="flex items-center gap-3 rounded border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm">
                    <input type="checkbox" className="h-4 w-4 accent-[#BC13FE]" checked={checked} onChange={event => setCommissionDraft(current => ({ ...current, consultationCommissionTechnicianIds: event.target.checked ? Array.from(new Set([...current.consultationCommissionTechnicianIds, id])) : current.consultationCommissionTechnicianIds.filter(value => value !== id) }))} />
                    <span>{technicianDisplay(technician)}</span>
                  </label>;
                })}
              </div>
            </div>
            <div className="mt-4 rounded border border-blue-500/30 bg-blue-500/10 p-3 text-xs text-blue-100">
              Consultation pricing remains $75 for the first hour and $50 for each additional hour. Commission uses the saved hours and pays only the technician assigned to that consultation at the hourly amount above.
            </div>
            <footer className="mt-4 flex justify-end gap-2">
              <button type="button" className="rounded border border-zinc-700 px-4 py-2 text-sm" onClick={() => setShowCommissionSettings(false)}>Cancel</button>
              <button type="button" disabled={savingCommissionSettings} className="rounded bg-[#BC13FE] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50" onClick={() => void saveCommissionSettings()}>{savingCommissionSettings ? 'Saving...' : 'Save Settings'}</button>
            </footer>
          </section>
        </div>
      )}
      {reportView === 'monthEnd' ? (
        <>
          <div className="bg-zinc-950 border border-zinc-800 rounded p-4 space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <div className="text-lg font-semibold text-zinc-100">End of the Month Report</div>
                <div className="text-xs text-zinc-500">
                  Product sales commission, consultation commission, internal cost, gross profit, and audit flags.
                </div>
              </div>
              <div className="flex flex-wrap items-end gap-2">
                <label className="block">
                  <span className="block text-xs mb-1 text-zinc-400">Month</span>
                  <input
                    type="month"
                    className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2"
                    value={monthEndMonth}
                    onChange={e => setMonthEndMonth(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="px-3 py-2 bg-[#39FF14] text-black rounded font-semibold disabled:opacity-50"
                  onClick={downloadEndOfMonthReport}
                  disabled={!endOfMonthReport.productRows.length && !endOfMonthReport.consultationRows.length && !endOfMonthReport.purchaseRows.length}
                >
                  Download Styled Spreadsheet
                </button>
              </div>
            </div>

            <div className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-4">
              <section className="rounded border border-zinc-800 bg-zinc-900 p-3">
                <div className="mb-3 text-xs font-semibold uppercase text-zinc-400">Repair Revenue</div>
                <div className="grid grid-cols-3 gap-2">
                  <MonthMetric label="Parts Cost" value={money(monthRepairFinancials.partsCost)} tone="text-amber-300" />
                  <MonthMetric label="Parts Charged" value={money(monthRepairFinancials.partsCharged)} />
                  <MonthMetric label="Labor Charged" value={money(monthRepairFinancials.laborCharged)} tone="text-[#39FF14]" />
                </div>
              </section>
              <section className="rounded border border-zinc-800 bg-zinc-900 p-3">
                <div className="mb-3 text-xs font-semibold uppercase text-zinc-400">Commission</div>
                <div className="grid grid-cols-3 gap-2">
                  <MonthMetric label="Sales Base" value={money(endOfMonthReport.summary.physicalSalesBase)} tone="text-[#39FF14]" />
                  <MonthMetric label="Sales Pool" value={money(endOfMonthReport.summary.physicalSalesCommissionPool)} />
                  <MonthMetric label="Total Commission" value={money(endOfMonthReport.summary.totalCommission)} tone="text-[#BC13FE]" />
                </div>
              </section>
              <section className="rounded border border-zinc-800 bg-zinc-900 p-3">
                <div className="mb-3 text-xs font-semibold uppercase text-zinc-400">Product Sales &amp; Vendors</div>
                <div className="grid grid-cols-3 gap-2">
                  <MonthMetric label="Product Sales Gross Profit" value={money(endOfMonthReport.summary.knownProfit)} />
                  <MonthMetric label="Vendor Owed" value={money(endOfMonthReport.summary.vendorPayoutTotal)} tone="text-red-300" />
                  <MonthMetric label="Vendor Profit" value={money(endOfMonthReport.summary.vendorProfitTotal)} tone="text-[#39FF14]" />
                </div>
              </section>
              <section className="rounded border border-zinc-800 bg-zinc-900 p-3">
                <div className="mb-3 text-xs font-semibold uppercase text-zinc-400">Verified Purchasing</div>
                <div className="grid grid-cols-2 gap-2">
                  <MonthMetric label="Parts Spend" value={money(endOfMonthReport.summary.supplierSpendParts)} tone="text-amber-300" />
                  <MonthMetric label="Products Spend" value={money(endOfMonthReport.summary.supplierSpendProducts)} tone="text-amber-300" />
                </div>
              </section>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded p-3 text-sm text-zinc-300 space-y-2">
              <div className="font-semibold text-zinc-100">Audit Rules</div>
              <div>Repairs are excluded from commission. Eligible sales contribute {commissionSettings.salesCommissionPercent}% of the monthly saved sales base after discounts to one pool. That final monthly pool is split once and evenly across the technicians selected in Reporting Settings.</div>
              <div>Customer sales tax is excluded from profit. Supplier tax and checkout costs paid on non-exempt purchases are included in acquisition cost exactly once.</div>
              <div>Consultation commission is saved consultation hours multiplied by {money(commissionSettings.consultationTechHourlyRate)} and assigned only to the saved technician on that consultation.</div>
              <div>Internal cost is pulled only from saved line item cost values. Missing costs, missing hours, and missing technician assignments are flagged instead of estimated.</div>
              <div>Consignment payouts use the exact product vendor and saved vendor-share percentage. Wholesale parts distributors do not create vendor payouts.</div>
              <div>Supplier spend includes only distributor carts verified at checkout. It is a cash-spend audit value and is not subtracted from gross profit a second time.</div>
              {(endOfMonthReport.summary.salesSplitWarning
                || endOfMonthReport.summary.missingInternalCostCount
                || endOfMonthReport.summary.missingConsultationAssignmentCount
                || endOfMonthReport.summary.missingConsultationHoursCount) && (
                <div className="mt-2 rounded border border-yellow-500/40 bg-yellow-500/10 p-2 text-yellow-100">
                  {endOfMonthReport.summary.salesSplitWarning && <div>{endOfMonthReport.summary.salesSplitWarning}</div>}
                  {endOfMonthReport.summary.missingInternalCostCount > 0 && <div>{endOfMonthReport.summary.missingInternalCostCount} product line(s) are missing internal cost.</div>}
                  {endOfMonthReport.summary.missingConsultationAssignmentCount > 0 && <div>{endOfMonthReport.summary.missingConsultationAssignmentCount} consultation line(s) are missing an assigned technician.</div>}
                  {endOfMonthReport.summary.missingConsultationHoursCount > 0 && <div>{endOfMonthReport.summary.missingConsultationHoursCount} consultation line(s) are missing logged hours.</div>}
                </div>
              )}
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="text-sm text-zinc-400">Technician Commission Totals</div>
              <div className="text-xs text-zinc-500">{endOfMonthReport.monthLabel}</div>
            </div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-800 text-zinc-400">
                  <tr>
                    <th className="px-2 py-1 text-left">Technician</th>
                    <th className="px-2 py-1 text-right">Sales Commission</th>
                    <th className="px-2 py-1 text-right">Consultation Hours</th>
                    <th className="px-2 py-1 text-right">Consultation Commission</th>
                    <th className="px-2 py-1 text-right">Total Commission</th>
                  </tr>
                </thead>
                <tbody>
                  {endOfMonthReport.technicianRows.map((row, idx) => (
                    <tr key={`${row.Technician}-${idx}`} className="border-b border-zinc-800">
                      <td className="px-2 py-1">{row.Technician}</td>
                      <td className="px-2 py-1 text-right">{row['Sales Commission']}</td>
                      <td className="px-2 py-1 text-right">{row['Consultation Hours']}</td>
                      <td className="px-2 py-1 text-right">{row['Consultation Commission']}</td>
                      <td className="px-2 py-1 text-right font-semibold text-[#BC13FE]">{row['Total Commission']}</td>
                    </tr>
                  ))}
                  {endOfMonthReport.technicianRows.length === 0 && (
                    <tr><td colSpan={5} className="px-2 py-6 text-center text-zinc-500">No technician totals for this month.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
            <div className="text-sm text-zinc-400 mb-2">Product Sales Commission</div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-800 text-zinc-400">
                  <tr>
                    <th className="px-2 py-1 text-left">Date</th>
                    <th className="px-2 py-1 text-left">Product</th>
                    <th className="px-2 py-1 text-right">Qty</th>
                    <th className="px-2 py-1 text-right">Sold Total</th>
                    <th className="px-2 py-1 text-right">Internal Cost</th>
                    <th className="px-2 py-1 text-left">Vendor</th>
                    <th className="px-2 py-1 text-right">Vendor Owed</th>
                    <th className="px-2 py-1 text-right">Gross Profit</th>
                    <th className="px-2 py-1 text-right">Margin</th>
                    <th className="px-2 py-1 text-right">Commission Pool</th>
                    <th className="px-2 py-1 text-right">Per Tech</th>
                    <th className="px-2 py-1 text-left">Audit</th>
                  </tr>
                </thead>
                <tbody>
                  {endOfMonthReport.productRows.map((row, idx) => (
                    <tr key={`${row['Sale ID']}-${idx}`} className="border-b border-zinc-800">
                      <td className="px-2 py-1 whitespace-nowrap">{row.Date}</td>
                      <td className="px-2 py-1 min-w-56">{row.Product}</td>
                      <td className="px-2 py-1 text-right">{row.Qty}</td>
                      <td className="px-2 py-1 text-right">{row['Sold Total']}</td>
                      <td className="px-2 py-1 text-right">{row['Internal Cost']}</td>
                      <td className="px-2 py-1">{row.Vendor}</td>
                      <td className="px-2 py-1 text-right">{row['Vendor Owed']}</td>
                      <td className="px-2 py-1 text-right">{row['Gross Profit']}</td>
                      <td className="px-2 py-1 text-right">{row['Margin %']}</td>
                      <td className="px-2 py-1 text-right">{row['Commission Pool']}</td>
                      <td className="px-2 py-1 text-right">{row['Per-Tech Sales Commission']}</td>
                      <td className="px-2 py-1 text-yellow-200">{row['Audit Flag']}</td>
                    </tr>
                  ))}
                  {endOfMonthReport.productRows.length === 0 && (
                    <tr><td colSpan={12} className="px-2 py-6 text-center text-zinc-500">No product sales for this month.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
            <div className="text-sm text-zinc-400 mb-2">Consultation Commission Log</div>
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-zinc-800 text-zinc-400">
                  <tr>
                    <th className="px-2 py-1 text-left">Date</th>
                    <th className="px-2 py-1 text-left">Technician</th>
                    <th className="px-2 py-1 text-left">Consultation</th>
                    <th className="px-2 py-1 text-right">Hours</th>
                    <th className="px-2 py-1 text-right">Hourly Payout</th>
                    <th className="px-2 py-1 text-right">Commission Earned</th>
                    <th className="px-2 py-1 text-left">Audit</th>
                  </tr>
                </thead>
                <tbody>
                  {endOfMonthReport.consultationRows.map((row, idx) => (
                    <tr key={`${row.Date}-${row.Technician}-${idx}`} className="border-b border-zinc-800">
                      <td className="px-2 py-1 whitespace-nowrap">{row.Date}</td>
                      <td className="px-2 py-1">{row.Technician}</td>
                      <td className="px-2 py-1 min-w-56">{row.Consultation}</td>
                      <td className="px-2 py-1 text-right">{row.Hours}</td>
                      <td className="px-2 py-1 text-right">{row['Hourly Payout']}</td>
                      <td className="px-2 py-1 text-right font-semibold">{row['Commission Earned']}</td>
                      <td className="px-2 py-1 text-yellow-200">{row['Audit Flag']}</td>
                    </tr>
                  ))}
                  {endOfMonthReport.consultationRows.length === 0 && (
                    <tr><td colSpan={7} className="px-2 py-6 text-center text-zinc-500">No consultations for this month.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : (
        <>
      <div className="rounded border border-zinc-800 bg-zinc-950 px-4 py-3">
        <div className="font-semibold text-zinc-100">Summary Report</div>
        <div className="mt-1 text-xs text-zinc-500">A consolidated overview of saved POS revenue, payments, costs, profit, work orders, sales, and purchasing for the selected range.</div>
      </div>
  <div className="flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs mb-1">Period</label>
          <select className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={period} onChange={e => setPeriod(e.target.value as any)}>
            {PERIODS.map(p => <option key={p.key} value={p.key}>{p.label}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs mb-1">From</label>
          <input type="date" className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs mb-1">To</label>
          <input type="date" className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        {/* Store filter removed */}
        <div>
          <label className="block text-xs mb-1">Technician</label>
          <select className="bg-zinc-800 border border-zinc-700 rounded px-2 py-1" value={tech} onChange={e => setTech(e.target.value)}>
            <option value="">All</option>
            {technicianOptions.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <label className="inline-flex items-center gap-2 text-sm ml-auto">
          <input type="checkbox" className="accent-[#39FF14]" checked={excludeTax} onChange={e => setExcludeTax(e.target.checked)} />
          Exclude tax from revenue
        </label>
        <div className="flex items-center gap-3 ml-4 text-sm">
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className="accent-[#39FF14]" checked={includeRepairs} onChange={e => setIncludeRepairs(e.target.checked)} /> Repairs
          </label>
          <label className="inline-flex items-center gap-2">
            <input type="checkbox" className="accent-[#39FF14]" checked={includeSales} onChange={e => setIncludeSales(e.target.checked)} /> Sales
          </label>
          <label className="inline-flex items-center gap-2 border-l border-zinc-700 pl-3">
            <input type="checkbox" className="accent-[#39FF14]" checked={onlyPaid} onChange={e => setOnlyPaid(e.target.checked)} /> Paid only
          </label>
        </div>
        <button className="px-3 py-2 bg-[#39FF14] text-black rounded font-semibold" onClick={downloadSummary} disabled={!filtered.length}>Download</button>
      </div>

      <div className="flex gap-2 flex-wrap">
        <QuickRange onPick={setQuickRange} />
      </div>

      {reportingSettings.showPaymentSummary && <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400">Grand Total</div>
          <div className="mt-2 text-3xl font-bold text-neon-green">${summary.revenue.toFixed(2)}</div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400">Cash Intake</div>
          <div className="mt-2 text-2xl font-bold text-zinc-100">${paymentTotals.cashTender.toFixed(2)}</div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400">Change Given</div>
          <div className="mt-2 text-2xl font-bold text-zinc-100">-${paymentTotals.cashChange.toFixed(2)}</div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400">Cash to Deposit</div>
          <div className="mt-2 text-2xl font-bold text-neon-green">${paymentTotals.cashNet.toFixed(2)}</div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400">Card Total</div>
          <div className="mt-2 text-2xl font-bold text-zinc-100">${paymentTotals.card.toFixed(2)}</div>
        </div>
      </div>
      </>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400">Revenue & Orders</div>
          <div className="mt-2 space-y-1">
            <div>Orders: <span className="font-semibold">{summary.orders}</span></div>
            <div>Labor charged &amp; collected: <span className="font-semibold">${summary.labor.toFixed(2)}</span></div>
            <div>Parts / products charged &amp; collected: <span className="font-semibold">${summary.parts.toFixed(2)}</span></div>
            <div>Revenue {excludeTax ? '(excl tax)' : '(incl tax)'}: <span className="font-semibold">${summary.revenue.toFixed(2)}</span></div>
          </div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400">Cost & Profit</div>
          <div className="mt-2 space-y-1">
            <div>Parts / product cost: <span className="font-semibold">${summary.cost.toFixed(2)}</span></div>
            <div>Verified supplier spend: <span className="font-semibold text-amber-300">${summary.supplierSpend.toFixed(2)}</span></div>
            <div>Gross profit: <span className={`font-semibold ${summary.missingCost ? 'text-amber-300' : ''}`}>{summary.missingCost ? 'Needs internal cost' : `$${summary.profit.toFixed(2)}`}</span></div>
            <div>Margin: <span className={`font-semibold ${summary.missingCost ? 'text-amber-300' : ''}`}>{summary.missingCost ? 'Needs internal cost' : `${(summary.margin * 100).toFixed(1)}%`}</span></div>
            <div>Avg ticket: <span className="font-semibold">${summary.avgTicket.toFixed(2)}</span></div>
          </div>
          <div className="text-[11px] text-zinc-500 mt-2">Charges, cost, and profit follow the payment date. Partial checkouts recognize only the paid portion. Verified supplier spend records when cash left the shop and is not deducted twice.</div>
          {summary.missingCost ? <div className="mt-2 text-xs text-amber-300">{summary.missingCost} charged physical line{summary.missingCost === 1 ? '' : 's'} need internal cost before profit is final.</div> : null}
        </div>
        {/* Repairs vs Sales split */}
        {reportingSettings.showTypeBreakdown && (() => {
          const accum = (kind: 'repair' | 'sale') => {
            const orderKeys = new Set<string>();
            const missingKeys = new Set<string>();
            return filteredLedger.filter(entry => entry.kind === kind).reduce((acc, entry) => {
            orderKeys.add(entry.recordKey);
            if (entry.missingInternalCost > 0) missingKeys.add(entry.recordKey);
            const net = entry.collected - entry.taxCollected;
            acc.orders = orderKeys.size;
            acc.labor += entry.laborCharged;
            acc.parts += entry.partsCharged;
            acc.subtotal += net;
            acc.tax += entry.taxCollected;
            acc.revenue += excludeTax ? net : entry.collected;
            acc.cost += entry.internalCost;
            acc.profit += entry.profitExcludingTax;
            acc.missingCost = missingKeys.size;
            return acc;
          }, { orders:0, labor:0, parts:0, subtotal:0, tax:0, revenue:0, cost:0, profit:0, missingCost:0 });
          };
          const repS = accum('repair'); const salS = accum('sale');
          return (
            <div className="bg-zinc-950 border border-zinc-800 rounded p-3 col-span-2">
              <div className="text-sm text-zinc-400 mb-2">Split by Type</div>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-zinc-400">Repairs</div>
                  <div className="mt-1 space-y-1">
                    <div>Orders: <span className="font-semibold">{repS.orders}</span></div>
                    <div>Labor: <span className="font-semibold">${repS.labor.toFixed(2)}</span></div>
                    <div>Parts: <span className="font-semibold">${repS.parts.toFixed(2)}</span></div>
                    <div>Revenue: <span className="font-semibold">${repS.revenue.toFixed(2)}</span></div>
                    <div>Profit: <span className="font-semibold">{repS.missingCost ? 'Needs cost' : `$${repS.profit.toFixed(2)}`}</span></div>
                  </div>
                </div>
                <div>
                  <div className="text-zinc-400">Sales</div>
                  <div className="mt-1 space-y-1">
                    <div>Orders: <span className="font-semibold">{salS.orders}</span></div>
                    <div>Revenue: <span className="font-semibold">${salS.revenue.toFixed(2)}</span></div>
                    <div>Profit: <span className="font-semibold">{salS.missingCost ? 'Needs cost' : `$${salS.profit.toFixed(2)}`}</span></div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
        {/* Trends moved to Charts window */}
      </div>

      {reportingSettings.showTopItems && <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400 mb-2">Top Repairs</div>
          <ul className="text-sm space-y-1">
            {topRepairs.map(r => (
              <li key={r.title} className="flex justify-between"><span className="text-zinc-300 truncate mr-2" title={r.title}>{r.title}</span><span className="text-zinc-400">{r.count}</span></li>
            ))}
            {topRepairs.length === 0 && <li className="text-zinc-500 text-sm">No data.</li>}
          </ul>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400 mb-2">Top Sales</div>
          <ul className="text-sm space-y-1">
            {topSales.map(r => (
              <li key={r.title} className="flex justify-between"><span className="text-zinc-300 truncate mr-2" title={r.title}>{r.title}</span><span className="text-zinc-400">{r.count}</span></li>
            ))}
            {topSales.length === 0 && <li className="text-zinc-500 text-sm">No data.</li>}
          </ul>
        </div>
      </div>}

      {/* Popular Days moved to Charts window */}

      {reportingSettings.showDetailTable && <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
        <div className="text-sm text-zinc-400 mb-2">Detail (by {period})</div>
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-zinc-800 text-zinc-400">
              <tr>
                <th className="px-2 py-1 text-left">Start</th>
                <th className="px-2 py-1 text-right">Orders</th>
                <th className="px-2 py-1 text-right">Labor</th>
                <th className="px-2 py-1 text-right">Parts</th>
                <th className="px-2 py-1 text-right">Subtotal</th>
                <th className="px-2 py-1 text-right">Tax</th>
                <th className="px-2 py-1 text-right">Revenue</th>
                <th className="px-2 py-1 text-right">Cost</th>
                <th className="px-2 py-1 text-right">Supplier Spend</th>
                <th className="px-2 py-1 text-right">Profit</th>
                <th className="px-2 py-1 text-right">Margin %</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(g => (
                <tr key={g.date} className="border-b border-zinc-800">
                  <td className="px-2 py-1">{g.date}</td>
                  <td className="px-2 py-1 text-right">{g.orders}</td>
                  <td className="px-2 py-1 text-right">${g.labor.toFixed(2)}</td>
                  <td className="px-2 py-1 text-right">${g.parts.toFixed(2)}</td>
                  <td className="px-2 py-1 text-right">${g.subtotal.toFixed(2)}</td>
                  <td className="px-2 py-1 text-right">${g.tax.toFixed(2)}</td>
                  <td className="px-2 py-1 text-right">${g.total.toFixed(2)}</td>
                  <td className="px-2 py-1 text-right">${g.cost.toFixed(2)}</td>
                  <td className="px-2 py-1 text-right text-amber-200">${g.supplierSpend.toFixed(2)}</td>
                  <td className={`px-2 py-1 text-right ${g.missingCost ? 'text-amber-300' : ''}`}>{g.missingCost ? 'Needs cost' : `$${g.profit.toFixed(2)}`}</td>
                  <td className={`px-2 py-1 text-right ${g.missingCost ? 'text-amber-300' : ''}`}>{g.missingCost ? 'Needs cost' : `${(g.subtotal ? (g.profit / g.subtotal) * 100 : 0).toFixed(1)}%`}</td>
                </tr>
              ))}
              {grouped.length === 0 && (
                <tr><td colSpan={10} className="px-2 py-6 text-center text-zinc-500">No data in range.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>}

      {reportingSettings.showCsvPreview && <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
        <div className="text-sm text-zinc-400 mb-2">CSV Preview</div>
        <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto">{csv || 'No rows.'}</pre>
      </div>}
        </>
      )}
    </div>
  );
};

export default ReportingWindow;

const MonthMetric: React.FC<{ label: string; value: string; tone?: string }> = ({ label, value, tone = 'text-zinc-100' }) => (
  <div className="min-w-0 rounded border border-zinc-800 bg-zinc-950 px-2 py-3">
    <div className="text-[11px] leading-tight text-zinc-500">{label}</div>
    <div className={`mt-1 truncate text-base font-bold sm:text-lg ${tone}`} title={value}>{value}</div>
  </div>
);

const QuickRange: React.FC<{ onPick: (k: SummaryRange) => void }> = ({ onPick }) => (
  <div className="flex items-center gap-2">
    <span className="text-xs text-zinc-400">Quick range:</span>
    <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded" onClick={() => onPick('today')}>Today</button>
    <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded" onClick={() => onPick('week')}>This week</button>
    <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded" onClick={() => onPick('month')}>This month</button>
    <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded" onClick={() => onPick('year')}>This year</button>
    <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded" onClick={() => onPick('all')}>All records</button>
  </div>
);

// Simple SVG donut chart with stroke-dasharray segments (no external deps)
const DonutChart: React.FC<{ data: Array<{ label: string; value: number }>; size?: number; thickness?: number }> = ({ data, size = 200, thickness = 24 }) => {
  const total = data.reduce((s, d) => s + Math.max(0, Number(d.value) || 0), 0);
  if (!(total > 0)) {
    return (
      <div className="flex items-center justify-center" style={{ width: size, height: size }}>
        <div className="text-xs text-zinc-500">No data</div>
      </div>
    );
  }
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let acc = 0;
  const colors = ['#39FF14','#7CFC00','#98FB98','#66CDAA','#20B2AA','#32CD32','#3CB371'];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <g transform={`translate(${size/2}, ${size/2}) rotate(-90)`}>
        {/* Background ring */}
        <circle r={r} cx={0} cy={0} fill="transparent" stroke="#27272a" strokeWidth={thickness} />
        {data.map((d, idx) => {
          const val = Math.max(0, Number(d.value) || 0);
          const frac = val / total;
          const dash = Math.max(0, frac * c);
          const gap = Math.max(0, c - dash);
          const offset = (c - acc) % c; // accumulate from top
          acc += dash;
          return (
            <circle
              key={d.label + idx}
              r={r}
              cx={0}
              cy={0}
              fill="transparent"
              stroke={colors[idx % colors.length]}
              strokeWidth={thickness}
              strokeDasharray={`${dash} ${gap}`}
              strokeDashoffset={offset}
              strokeLinecap="butt"
            />
          );
        })}
      </g>
      {/* Center labels */}
      <g>
        <text x="50%" y="48%" textAnchor="middle" className="fill-zinc-200" style={{ fontSize: 14, fontWeight: 600 }}>{total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</text>
        <text x="50%" y="62%" textAnchor="middle" className="fill-zinc-400" style={{ fontSize: 11 }}>Total</text>
      </g>
    </svg>
  );
};
