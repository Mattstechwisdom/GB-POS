// SYNC_TEST_MARKER: reporting-window
import React, { useEffect, useMemo, useState } from 'react';
import { listTechnicians } from '@/lib/admin';
import { computeTotals } from '../lib/calc';
import { dispatchOpenModal } from '@/lib/modalBus';

function startOfPeriod(date: Date, period: 'day' | 'week' | 'month' | 'year') {
  const d = new Date(date);
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

const SALES_COMMISSION_RATE = 0.05;
const CONSULTATION_TECH_RATE = 25;

function roundMoney(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function money(value: number | null | undefined) {
  if (value === null || typeof value === 'undefined' || !Number.isFinite(Number(value))) return '-';
  return Number(value).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
}

function dateOnly(value: any) {
  const d = new Date(value || 0);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
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

function dateInRange(value: any, start: Date, end: Date) {
  const d = new Date(value || 0);
  if (Number.isNaN(d.getTime())) return false;
  const t = d.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function todayInputValue() {
  return new Date().toISOString().slice(0, 10);
}

function endOfInputDate(value: string) {
  const d = new Date(value);
  if (!Number.isNaN(d.getTime())) d.setHours(23, 59, 59, 999);
  return d;
}

function saleReportDate(sale: any) {
  return sale?.checkoutDate || sale?.saleDate || sale?.transactionDate || sale?.invoiceDate || sale?.checkInAt || sale?.createdAt || sale?.updatedAt || '';
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
  const direct = Number(item?.consultationHours ?? sale?.consultationHours);
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
  const raw = item?.internalCost ?? item?.cost;
  if (raw === null || typeof raw === 'undefined' || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return roundMoney(n * lineUnits(item));
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

function buildEndOfMonthReport(sales: any[], technicians: any[], vendors: any[], monthValue: string) {
  const { start, end } = monthRange(monthValue);
  const activeTechs = (technicians || []).filter((tech: any) => tech && tech.active !== false);
  const salesSplitTechs = activeTechs.length ? activeTechs : [{ id: 'unassigned-sales', nickname: 'Unassigned Sales Split' }];
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

  const monthSales = (sales || []).filter((sale) => dateInRange(saleReportDate(sale), start, end));

  for (const sale of monthSales) {
    const items = saleItemsForReport(sale);
    const gross = items.reduce((sum: number, item: any) => sum + lineSoldTotal(item, sale), 0);
    const discount = Math.max(0, Number(sale?.discount || 0) || 0);

    for (const item of items) {
      const soldGross = lineSoldTotal(item, sale);
      const allocatedDiscount = gross > 0 ? roundMoney(discount * (soldGross / gross)) : 0;
      const soldNet = roundMoney(Math.max(0, soldGross - allocatedDiscount));
      const title = lineTitle(item, sale);
      const date = dateOnly(saleReportDate(sale));

      if (isConsultationLine(item, sale)) {
        const hours = roundMoney(consultationHours(item, sale));
        const assignedKey = saleAssignedTechKey(sale);
        const assignedTech = activeTechs.find((tech: any) => technicianMatchKeys(tech).includes(assignedKey));
        const techLabel = assignedTech ? technicianDisplay(assignedTech) : (sale?.assignedTo || 'Unassigned');
        const commission = roundMoney(hours * CONSULTATION_TECH_RATE);
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
          'Hourly Payout': money(CONSULTATION_TECH_RATE),
          'Commission Earned': money(commission),
          'Audit Flag': !assignedKey ? 'Missing assigned technician' : (!(hours > 0) ? 'Missing consultation hours' : ''),
        });
        continue;
      }

      const cost = lineInternalCost(item);
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
      const commissionPool = roundMoney(soldNet * SALES_COMMISSION_RATE);
      const perTechCommission = roundMoney(commissionPool / salesSplitCount);
      physicalSalesBase = roundMoney(physicalSalesBase + soldNet);
      physicalSalesCommissionPool = roundMoney(physicalSalesCommissionPool + commissionPool);
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

      for (const tech of salesSplitTechs) {
        const total = ensureTech(technicianKey(tech), technicianDisplay(tech));
        total.salesCommission = roundMoney(total.salesCommission + perTechCommission);
        total.totalCommission = roundMoney(total.totalCommission + perTechCommission);
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
        'Commission Pool (5%)': money(commissionPool),
        'Per-Tech Sales Commission': money(perTechCommission),
        'Split Across Techs': salesSplitCount,
        'Audit Flag': isConsignment && vendorSharePct === null ? 'Missing vendor share percentage' : (!isConsignment && cost === null ? 'Missing internal cost' : ''),
      });
    }
  }

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
      salesSplitWarning: !activeTechs.length
        ? 'No active technicians were found, so sales commission is parked in Unassigned Sales Split.'
        : (activeTechs.length !== 2 ? `Sales commission is split across ${salesSplitCount} active technician(s), not exactly 2.` : ''),
    },
  };
}

function csvSections(sections: Array<{ title: string; rows: Array<Record<string, any>> }>) {
  return sections.map((section) => {
    if (!section.rows.length) return `${section.title}\n(no rows)`;
    return `${section.title}\n${formatCSV(section.rows)}`;
  }).join('\n\n');
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

  useEffect(() => { (async () => {
    try {
      const wos = await (window as any).api.getWorkOrders();
      const [sales, vendorRows] = await Promise.all([
        (window as any).api.dbGet('sales').catch(() => []),
        (window as any).api.dbGet('vendors').catch(() => []),
      ]);
      setVendors(Array.isArray(vendorRows) ? vendorRows : []);
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
      setData([...(mappedWOs || []), ...mappedSales]);
    } catch (e) { console.error(e); }
  })(); }, []);

  const filtered = useMemo(() => {
    if (!data?.length) return [] as any[];
    const fromDate = from ? new Date(from) : null;
    const toDate = to ? endOfInputDate(to) : null;
    return data.filter(w => {
      if (w.kind === 'repair' && !includeRepairs) return false;
      if (w.kind === 'sale' && !includeSales) return false;
      // If "paid only" mode, skip work orders with no payment recorded
      if (onlyPaid && w.kind === 'repair') {
        const amtPaid = Number((w as any).amountPaid || 0);
        if (amtPaid <= 0) return false;
      }
      const d = new Date(w.checkInAt || w.repairCompletionDate || w.checkoutDate || w.createdAt || 0);
      if (isNaN(d.getTime())) return false;
      if (fromDate && d < fromDate) return false;
      if (toDate && d > toDate) return false;
      if (tech) {
        const at = (w.assignedTo ?? '').toString();
        // Match exact nickname/firstName stored convention
        if (at.toLowerCase() !== tech.toLowerCase()) return false;
      }
      return true;
    });
  }, [data, from, to, tech, includeRepairs, includeSales, onlyPaid]);

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

  const weekdayTallies = useMemo(() => {
    // getDay(): 0=Sun..6=Sat; we will present Monday..Sunday
    const names = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    const counts: Record<string, { orders: number; revenue: number }> = {};
    for (const n of names) counts[n] = { orders: 0, revenue: 0 };
    for (const w of filtered) {
      const d = new Date(w.checkInAt || w.repairCompletionDate || w.checkoutDate || w.createdAt || 0);
      const name = names[d.getDay()];
      const totals = computeTotals({
        laborCost: Number(w.laborCost || 0),
        partCosts: Number(w.partCosts || 0),
        discount: Number(w.discount || 0),
        taxRate: Number(w.taxRate || 0),
        amountPaid: Number(w.amountPaid || 0),
      });
      const labor = Number(w.laborCost || 0);
      const parts = Number(w.partCosts || 0);
      const discount = Number(w.discount || 0);
      const subtotal = Math.max(0, labor + parts - discount);
      const tax = totals.tax || 0;
      const revenue = excludeTax ? subtotal : (subtotal + tax);
      counts[name].orders += 1;
      counts[name].revenue += revenue;
    }
    const order = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    return order.map(day => ({ day, ...counts[day] }));
  }, [filtered, excludeTax]);

  function sumInternalCost(w: any): number {
    // If items array has entries, sum from items only (avoid double-counting with w.internalCost)
    if (Array.isArray(w.items) && w.items.length > 0) {
      let sum = 0;
      for (const it of w.items) {
        const val = Number((it && (it.internalCost || it.cost || 0)) || 0);
        const qty = Number((it && (it.qty ?? it.quantity ?? 1)) || 1);
        const units = Number.isFinite(qty) && qty > 0 ? qty : 1;
        if (Number.isFinite(val)) sum += val * units;
      }
      return sum;
    }
    // Fall back to a direct field if no items array
    const direct = Number((w.internalCost || 0));
    return Number.isFinite(direct) ? direct : 0;
  }

  const grouped = useMemo(() => {
    const map = new Map<string, { orders: number; labor: number; parts: number; subtotal: number; tax: number; total: number; cost: number; profit: number }>();
    for (const w of filtered) {
      const totals = computeTotals({
        laborCost: Number(w.laborCost || 0),
        partCosts: Number(w.partCosts || 0),
        discount: Number(w.discount || 0),
        taxRate: Number(w.taxRate || 0),
        amountPaid: Number(w.amountPaid || 0),
      });
      const d = new Date(w.checkInAt || w.repairCompletionDate || w.checkoutDate || w.createdAt || 0);
      const bucket = startOfPeriod(d, period).toISOString().slice(0,10);
      const prev = map.get(bucket) || { orders: 0, labor: 0, parts: 0, subtotal: 0, tax: 0, total: 0, cost: 0, profit: 0 };
  const labor = Number(w.laborCost || 0);
  const parts = Number(w.partCosts || 0);
      const discount = Number(w.discount || 0);
      const subtotal = Math.max(0, labor + parts - discount);
  // Cost baseline is what WE pay: internal costs only
  const cost = sumInternalCost(w);
      const tax = totals.tax || 0;
      const revenue = excludeTax ? subtotal : (subtotal + tax);
      const profit = revenue - cost;
      prev.orders += 1;
      prev.labor += labor;
      prev.parts += parts;
      prev.subtotal += subtotal;
      prev.tax += tax;
      prev.total += revenue;
      prev.cost += cost;
      prev.profit += profit;
      map.set(bucket, prev);
    }
    return Array.from(map.entries()).sort((a,b) => a[0].localeCompare(b[0])).map(([date, v]) => ({ date, ...v }));
  }, [filtered, period, excludeTax]);

  const csvRows = useMemo(() => grouped.map(r => ({
    period_start: r.date,
    orders: r.orders,
    labor: r.labor.toFixed(2),
    parts: r.parts.toFixed(2),
    subtotal: r.subtotal.toFixed(2),
    tax: r.tax.toFixed(2),
    revenue: r.total.toFixed(2),
    cost: r.cost.toFixed(2),
    profit: r.profit.toFixed(2),
    margin_pct: ((r.subtotal ? (r.profit / r.subtotal) : 0) * 100).toFixed(1),
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
      acc.orders += g.orders; acc.labor += g.labor; acc.parts += g.parts; acc.subtotal += g.subtotal; acc.tax += g.tax; acc.revenue += g.total; acc.cost += g.cost; acc.profit += g.profit; return acc;
    }, { orders: 0, labor: 0, parts: 0, subtotal: 0, tax: 0, revenue: 0, cost: 0, profit: 0 });
    const margin = s.subtotal ? (s.profit / s.subtotal) : 0;
    const avgTicket = s.orders ? (s.revenue / s.orders) : 0;
    return { ...s, margin, avgTicket };
  }, [grouped]);

  const endOfMonthReport = useMemo(() => {
    const sales = data.filter((row: any) => row.kind === 'sale');
    return buildEndOfMonthReport(sales, technicians, vendors, monthEndMonth);
  }, [data, technicians, vendors, monthEndMonth]);

  function downloadEndOfMonthReport() {
    const report = endOfMonthReport;
    const summaryRows = [{
      Month: report.monthLabel,
      'Physical Sales Lines': report.summary.salesCount,
      'Consultation Lines': report.summary.consultationCount,
      'Sales Commission Base': money(report.summary.physicalSalesBase),
      'Sales Commission Pool': money(report.summary.physicalSalesCommissionPool),
      'Known Internal Cost': money(report.summary.knownInternalCost),
      'Known Gross Profit': money(report.summary.knownProfit),
      'Vendor Payouts Owed': money(report.summary.vendorPayoutTotal),
      'Profit From Vendor Sales': money(report.summary.vendorProfitTotal),
      'Total Commission': money(report.summary.totalCommission),
      'Sales Split Across Techs': report.summary.salesSplitCount,
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
    const body = csvSections([
      { title: 'End of Month Summary', rows: summaryRows },
      { title: 'Product Sales Commission', rows: report.productRows },
      { title: 'Consultation Commission', rows: report.consultationRows },
      { title: 'Technician Totals', rows: report.technicianRows },
    ]);
    const blob = new Blob([body], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `end-of-month-report-${monthEndMonth}.csv`;
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

    for (const w of filtered) {
      const payments = Array.isArray((w as any).payments) ? (w as any).payments : [];
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

      const pt = String((w as any).paymentType || '').toLowerCase();
      const amt = Number((w as any).amountPaid || 0);
      if (!Number.isFinite(amt) || amt <= 0) continue;
      if (pt.includes('cash')) cashTender += amt;
      else if (pt.includes('card') || pt.includes('credit') || pt.includes('debit')) card += amt;
      else other += amt;
    }

    const cashNet = cashTender - cashChange;
    return { cashTender, cashChange, cashNet, card, other, nonCash: card + other };
  }, [filtered]);

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

  function setQuickRange(key: 'today'|'week'|'month'|'year') {
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
    }
  }

  return (
    <div className="h-screen bg-zinc-900 text-gray-100 p-4 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-xl font-bold">Reporting</div>
          <div className="text-xs text-zinc-500">Sales, repair intake, payments, and exportable summaries.</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <label className="flex items-center gap-2 text-sm text-zinc-300">
            <span className="text-xs text-zinc-500">Reports</span>
            <select
              className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2"
              value={reportView}
              onChange={e => setReportView(e.target.value as any)}
            >
              <option value="summary">Summary Report</option>
              <option value="monthEnd">End of the Month Report</option>
            </select>
          </label>
          <button
            type="button"
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded hover:border-[#39FF14]"
            onClick={() => dispatchOpenModal('eod')}
          >
            End of Day Reports
          </button>
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
                  disabled={!endOfMonthReport.productRows.length && !endOfMonthReport.consultationRows.length}
                >
                  Download Spreadsheet CSV
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
              <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
                <div className="text-xs text-zinc-500">Sales Commission Base</div>
                <div className="mt-1 text-2xl font-bold text-[#39FF14]">{money(endOfMonthReport.summary.physicalSalesBase)}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
                <div className="text-xs text-zinc-500">Sales Commission Pool</div>
                <div className="mt-1 text-2xl font-bold">{money(endOfMonthReport.summary.physicalSalesCommissionPool)}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
                <div className="text-xs text-zinc-500">Known Gross Profit</div>
                <div className="mt-1 text-2xl font-bold">{money(endOfMonthReport.summary.knownProfit)}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
                <div className="text-xs text-zinc-500">Total Commission</div>
                <div className="mt-1 text-2xl font-bold text-[#BC13FE]">{money(endOfMonthReport.summary.totalCommission)}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
                <div className="text-xs text-zinc-500">Vendor Payouts Owed</div>
                <div className="mt-1 text-2xl font-bold text-red-300">{money(endOfMonthReport.summary.vendorPayoutTotal)}</div>
              </div>
              <div className="bg-zinc-900 border border-zinc-800 rounded p-3">
                <div className="text-xs text-zinc-500">Vendor-Sale Profit</div>
                <div className="mt-1 text-2xl font-bold text-[#39FF14]">{money(endOfMonthReport.summary.vendorProfitTotal)}</div>
              </div>
            </div>

            <div className="bg-zinc-900 border border-zinc-800 rounded p-3 text-sm text-zinc-300 space-y-2">
              <div className="font-semibold text-zinc-100">Audit Rules</div>
              <div>Repairs are excluded from commission. Product sales commission is the saved product sale total after saved discounts multiplied by 5%, then split across active technicians.</div>
              <div>Consultation commission is saved consultation hours multiplied by $25 and assigned to the saved technician on that sale.</div>
              <div>Internal cost is pulled only from saved line item cost values. Missing costs, missing hours, and missing technician assignments are flagged instead of estimated.</div>
              <div>Consignment payouts use the exact product vendor and saved vendor-share percentage. Wholesale parts distributors do not create vendor payouts.</div>
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
                      <td className="px-2 py-1 text-right">{row['Commission Pool (5%)']}</td>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400">Revenue & Orders</div>
          <div className="mt-2 space-y-1">
            <div>Orders: <span className="font-semibold">{summary.orders}</span></div>
            <div>Labor: <span className="font-semibold">${summary.labor.toFixed(2)}</span></div>
            <div>Parts: <span className="font-semibold">${summary.parts.toFixed(2)}</span></div>
            <div>Revenue {excludeTax ? '(excl tax)' : '(incl tax)'}: <span className="font-semibold">${summary.revenue.toFixed(2)}</span></div>
          </div>
        </div>
        <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
          <div className="text-sm text-zinc-400">Cost & Profit</div>
          <div className="mt-2 space-y-1">
            <div>Cost baseline: <span className="font-semibold">${summary.cost.toFixed(2)}</span></div>
            <div>Gross profit: <span className="font-semibold">${summary.profit.toFixed(2)}</span></div>
            <div>Margin: <span className="font-semibold">{(summary.margin * 100).toFixed(1)}%</span></div>
            <div>Avg ticket: <span className="font-semibold">${summary.avgTicket.toFixed(2)}</span></div>
          </div>
          <div className="text-[11px] text-zinc-500 mt-2">Note: Cost baseline uses Internal Cost (what we paid). Parts is what we charged the client.</div>
        </div>
        {/* Repairs vs Sales split */}
        {(() => {
          const repOnly = filtered.filter((x:any) => x.kind !== 'sale');
          const salOnly = filtered.filter((x:any) => x.kind === 'sale');
          const accum = (arr: any[]) => arr.reduce((acc, w) => {
            const t = computeTotals({ laborCost: Number(w.laborCost||0), partCosts: Number(w.partCosts||0), discount: Number(w.discount||0), taxRate: Number(w.taxRate||0), amountPaid: Number(w.amountPaid||0) });
            const labor = Number(w.laborCost||0);
            const parts = Number(w.partCosts||0);
            const subtotal = Math.max(0, labor + parts - Number(w.discount||0));
            const tax = t.tax || 0;
            const revenue = excludeTax ? subtotal : (subtotal + tax);
            const cost = sumInternalCost(w);
            acc.orders += 1; acc.labor += labor; acc.parts += parts; acc.subtotal += subtotal; acc.tax += tax; acc.revenue += revenue; acc.cost += cost; acc.profit += (revenue - cost);
            return acc;
          }, { orders:0, labor:0, parts:0, subtotal:0, tax:0, revenue:0, cost:0, profit:0 });
          const repS = accum(repOnly); const salS = accum(salOnly);
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
                    <div>Profit: <span className="font-semibold">${repS.profit.toFixed(2)}</span></div>
                  </div>
                </div>
                <div>
                  <div className="text-zinc-400">Sales</div>
                  <div className="mt-1 space-y-1">
                    <div>Orders: <span className="font-semibold">{salS.orders}</span></div>
                    <div>Revenue: <span className="font-semibold">${salS.revenue.toFixed(2)}</span></div>
                    <div>Profit: <span className="font-semibold">${salS.profit.toFixed(2)}</span></div>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}
        {/* Trends moved to Charts window */}
      </div>

      <div className="grid grid-cols-2 gap-4">
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
      </div>

      {/* Popular Days moved to Charts window */}

      <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
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
                  <td className="px-2 py-1 text-right">${g.profit.toFixed(2)}</td>
                  <td className="px-2 py-1 text-right">{(g.subtotal ? (g.profit / g.subtotal) * 100 : 0).toFixed(1)}%</td>
                </tr>
              ))}
              {grouped.length === 0 && (
                <tr><td colSpan={10} className="px-2 py-6 text-center text-zinc-500">No data in range.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-zinc-950 border border-zinc-800 rounded p-3">
        <div className="text-sm text-zinc-400 mb-2">CSV Preview</div>
        <pre className="text-xs whitespace-pre-wrap max-h-48 overflow-auto">{csv || 'No rows.'}</pre>
      </div>
        </>
      )}
    </div>
  );
};

export default ReportingWindow;

const QuickRange: React.FC<{ onPick: (k: 'today'|'week'|'month'|'year') => void }> = ({ onPick }) => (
  <div className="flex items-center gap-2">
    <span className="text-xs text-zinc-400">Quick range:</span>
    <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded" onClick={() => onPick('today')}>Today</button>
    <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded" onClick={() => onPick('week')}>This week</button>
    <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded" onClick={() => onPick('month')}>This month</button>
    <button className="px-2 py-1 text-xs bg-zinc-800 border border-zinc-700 rounded" onClick={() => onPick('year')}>This year</button>
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
