#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const args = process.argv.slice(2);
const opts = {
  execute: args.includes('--execute'),
  dryRun: !args.includes('--execute'),
  backupPath: valueAfter('--backup'),
  shopId: valueAfter('--shop-id'),
  shopName: valueAfter('--shop-name') || process.env.GBPOS_SHOP_NAME || 'GadgetBoy Repair & Retail',
  sourceFileName: valueAfter('--source-file-name'),
};

function valueAfter(flag) {
  const idx = args.indexOf(flag);
  return idx >= 0 ? args[idx + 1] : null;
}

function usage(exitCode = 0) {
  console.log(`
Usage:
  node tools/import-backup-to-supabase.cjs --backup "C:/path/to/GB-POS-Backup.json"
  node tools/import-backup-to-supabase.cjs --backup "C:/path/to/GB-POS-Backup.json" --execute

Required for --execute:
  SUPABASE_URL or VITE_SUPABASE_URL
  SUPABASE_SERVICE_ROLE_KEY

Options:
  --shop-id <uuid>       Import into an existing shop row.
  --shop-name <name>     Create/find shop by name when --shop-id is omitted.
  --source-file-name <n> Override import batch source file name.

Safety:
  Dry-run is the default. The script will not write to Supabase unless --execute is present.
`);
  process.exit(exitCode);
}

if (args.includes('--help') || !opts.backupPath) usage(args.includes('--help') ? 0 : 1);

const backupPath = path.resolve(opts.backupPath);
const raw = fs.readFileSync(backupPath, 'utf8');
const backup = JSON.parse(raw);
const collections = backup.collections || backup;

const TABLES = [
  'technicians',
  'timeEntries',
  'customers',
  'workOrders',
  'sales',
  'quotes',
  'calendarEvents',
  'deviceCategories',
  'productCategories',
  'products',
  'partSources',
  'repairCategories',
  'repairItems',
  'intakeSources',
  'suppliers',
  'vendors',
  'invoices',
  'payments',
  'settings',
  'preferences',
  'systemLogs',
];

const counts = Object.fromEntries(
  TABLES.map((key) => [key, Array.isArray(collections[key]) ? collections[key].length : 0]),
);

console.log('Backup import summary:');
console.log(JSON.stringify({
  source: backup.source || 'unknown',
  backupTimestamp: backup.timestamp || null,
  dataComplete: backup.dataComplete ?? null,
  sourceFile: backupPath,
  mode: opts.execute ? 'execute' : 'dry-run',
  counts,
}, null, 2));

if (!opts.execute) {
  console.log('\nDry-run only. No Supabase data was changed.');
  console.log('Run again with --execute after setting SUPABASE_SERVICE_ROLE_KEY to perform the import.');
  process.exit(0);
}

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl) throw new Error('Missing SUPABASE_URL or VITE_SUPABASE_URL.');
if (!serviceRoleKey) throw new Error('Missing SUPABASE_SERVICE_ROLE_KEY. Never use the publishable key for imports.');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

main().catch((err) => {
  console.error('Import failed:', err && err.stack ? err.stack : err);
  process.exit(1);
});

async function main() {
  const shopId = await getShopId();
  const importBatch = await createImportBatch(shopId);

  const customerMap = new Map();
  const staffMap = new Map();
  const workOrderMap = new Map();
  const saleMap = new Map();

  await importTechnicians(shopId, staffMap);
  await importCustomers(shopId, customerMap);
  await importSimpleNamed(shopId, 'device_categories', collections.deviceCategories, mapDeviceCategory);
  await importSimpleNamed(shopId, 'product_categories', collections.productCategories, mapProductCategory);
  await importSimpleNamed(shopId, 'part_sources', collections.partSources, mapNamedPayload);
  await importSimpleNamed(shopId, 'intake_sources', collections.intakeSources, mapNamedPayload);
  await importPayloadTable(shopId, 'suppliers', collections.suppliers, mapNamedPayload);
  await importPayloadTable(shopId, 'vendors', collections.vendors, mapNamedPayload);
  await importProducts(shopId);
  await importRepairCategories(shopId);
  await importPayloadTable(shopId, 'repair_items', collections.repairItems, mapPayloadOnly);
  await importSales(shopId, customerMap, saleMap);
  await importQuotes(shopId);
  await importWorkOrders(shopId, customerMap, workOrderMap);
  await linkWorkOrderAddOnSales(shopId, workOrderMap, saleMap);
  await importCalendarEvents(shopId, customerMap, workOrderMap, saleMap);
  await importPayloadTable(shopId, 'invoices', collections.invoices, mapPayloadOnly);
  await importPayments(shopId, customerMap, workOrderMap, saleMap);
  await importTimeEntries(shopId, staffMap);
  await importSettings(shopId);
  await importPreferences(shopId);
  await importSystemLogs(shopId);

  await completeImportBatch(importBatch.id, counts);
  await verifyCounts(shopId);
  console.log('\nImport complete.');
}

async function getShopId() {
  if (opts.shopId) return opts.shopId;
  const existing = await supabase
    .from('shops')
    .select('id')
    .eq('name', opts.shopName)
    .maybeSingle();
  if (existing.error) throw existing.error;
  if (existing.data?.id) return existing.data.id;

  const created = await supabase
    .from('shops')
    .insert({ name: opts.shopName })
    .select('id')
    .single();
  if (created.error) throw created.error;
  return created.data.id;
}

async function createImportBatch(shopId) {
  const metadata = backup.metadata || {};
  const res = await supabase
    .from('import_batches')
    .insert({
      shop_id: shopId,
      source_file_name: opts.sourceFileName || path.basename(backupPath),
      source_backup_timestamp: toIso(backup.timestamp),
      source_total_records: Number(metadata.totalRecords || Object.values(counts).reduce((a, b) => a + b, 0)),
      status: 'running',
      counts,
      notes: 'Imported from GB POS local JSON backup.',
    })
    .select('id')
    .single();
  if (res.error) throw res.error;
  return res.data;
}

async function completeImportBatch(id, finalCounts) {
  const res = await supabase
    .from('import_batches')
    .update({ status: 'completed', counts: finalCounts, completed_at: new Date().toISOString() })
    .eq('id', id);
  if (res.error) throw res.error;
}

async function importTechnicians(shopId, staffMap) {
  const techs = arr(collections.technicians);
  if (!techs.length) return;
  const rows = techs.map((t) => ({
    shop_id: shopId,
    legacy_id: textId(t.id),
    first_name: str(t.firstName),
    last_name: str(t.lastName),
    nickname: str(t.nickname),
    phone: str(t.phone),
    email: str(t.email) || `legacy-technician-${textId(t.id) || cryptoSuffix()}@local.gbpos.invalid`,
    schedule: objectOrEmpty(t.schedule),
    status: 'active',
    role: 'technician',
    legacy_updated_at: toIso(t.updatedAt),
  }));
  const saved = await upsert('staff_profiles', rows, 'shop_id,email', 'id,legacy_id,email');
  for (const row of saved || []) {
    if (row.legacy_id) staffMap.set(String(row.legacy_id), row.id);
    if (row.email) staffMap.set(String(row.email).toLowerCase(), row.id);
  }

  const privateRows = techs
    .filter((t) => t.passcode !== undefined && t.passcode !== null && String(t.passcode) !== '')
    .map((t) => ({
      shop_id: shopId,
      staff_profile_id: staffMap.get(textId(t.id)) || null,
      legacy_technician_id: textId(t.id),
      legacy_passcode: String(t.passcode),
    }));
  await upsert('technician_private_credentials', privateRows, 'shop_id,legacy_technician_id');
}

async function importCustomers(shopId, customerMap) {
  const rows = arr(collections.customers).map((c) => ({
    shop_id: shopId,
    legacy_id: intId(c.id),
    first_name: str(c.firstName),
    last_name: str(c.lastName),
    email: str(c.email),
    phone: str(c.phone),
    phone_alt: str(c.phoneAlt || c.altPhone),
    zip: str(c.zip),
    legacy_created_at: toIso(c.createdAt),
    legacy_updated_at: toIso(c.updatedAt),
  })).filter((r) => r.legacy_id !== null);
  const saved = await upsert('customers', rows, 'shop_id,legacy_id', 'id,legacy_id');
  for (const row of saved || []) customerMap.set(Number(row.legacy_id), row.id);
}

async function importProducts(shopId) {
  const rows = arr(collections.products).map((p) => ({
    shop_id: shopId,
    legacy_id: intId(p.id),
    item_description: str(p.itemDescription),
    price: money(p.price),
    internal_cost: money(p.internalCost),
    notes: str(p.notes),
    condition: str(p.condition),
    category: str(p.category),
    item_type: str(p.itemType || 'Product'),
    part_category: str(p.partCategory),
    distributor: str(p.distributor),
    distributor_sku: str(p.distributorSku),
    reorder_qty: intOrZero(p.reorderQty) || 1,
    reorder_url_template: str(p.reorderUrlTemplate),
    associated_devices: Array.isArray(p.associatedDevices) ? p.associatedDevices.map((value) => String(value || '').trim()).filter(Boolean) : [],
    track_stock: bool(p.trackStock),
    stock_count: intOrZero(p.stockCount),
    low_stock_threshold: intOrZero(p.lowStockThreshold),
    legacy_created_at: toIso(p.createdAt),
    legacy_updated_at: toIso(p.updatedAt),
  })).filter((r) => r.legacy_id !== null);
  await upsert('products', rows, 'shop_id,legacy_id');
}

async function importRepairCategories(shopId) {
  const rows = arr(collections.repairCategories).map((r) => ({
    shop_id: shopId,
    legacy_id: textId(r.id),
    category: str(r.category),
    repair_category: str(r.repairCategory),
    title: str(r.title),
    alt_description: str(r.altDescription),
    part_cost: money(r.partCost),
    labor_cost: money(r.laborCost),
    internal_cost: money(r.internalCost),
    order_date: str(r.orderDate),
    est_delivery: str(r.estDelivery),
    part_source: str(r.partSource),
    order_source_url: str(r.orderSourceUrl),
    type: str(r.type),
    model: str(r.model),
    track_stock: bool(r.trackStock),
    legacy_created_at: toIso(r.createdAt),
    legacy_updated_at: toIso(r.updatedAt),
  })).filter((r) => r.legacy_id);
  await upsert('repair_categories', rows, 'shop_id,legacy_id');
}

async function importSales(shopId, customerMap, saleMap) {
  const rows = arr(collections.sales).map((s) => ({
    shop_id: shopId,
    legacy_id: intId(s.id),
    customer_id: customerMap.get(intId(s.customerId)) || null,
    legacy_customer_id: intId(s.customerId),
    customer_name: str(s.customerName),
    customer_phone: str(s.customerPhone),
    customer_email: str(s.customerEmail),
    status: str(s.status),
    assigned_to: str(s.assignedTo),
    category: str(s.category),
    item_description: str(s.itemDescription),
    condition: str(s.condition),
    intake_source: str(s.intakeSource),
    notes: str(s.notes),
    in_stock: nullableBool(s.inStock),
    quantity: nullableNumber(s.quantity),
    price: nullableNumber(s.price),
    total: nullableNumber(s.total),
    discount: money(s.discount),
    discount_type: str(s.discountType),
    discount_pct_value: nullableNumber(s.discountPctValue),
    amount_paid: money(s.amountPaid),
    tax_rate: nullableNumber(s.taxRate) || 0,
    labor_cost: money(s.laborCost),
    part_costs: money(s.partCosts),
    payment_type: str(s.paymentType),
    ordered_date: toIso(s.orderedDate),
    estimated_delivery_date: toIso(s.estimatedDeliveryDate),
    check_in_at: toIso(s.checkInAt),
    repair_completion_date: toIso(s.repairCompletionDate),
    checkout_date: toIso(s.checkoutDate),
    client_pickup_date: toIso(s.clientPickupDate),
    parts_order_url: str(s.partsOrderUrl),
    parts_tracking_url: str(s.partsTrackingUrl),
    consultation_hours: nullableNumber(s.consultationHours),
    consultation_type: str(s.consultationType),
    consultation_address: str(s.consultationAddress),
    driver_fee: nullableNumber(s.driverFee),
    appointment_date: dateOnly(s.appointmentDate),
    appointment_time: str(s.appointmentTime),
    appointment_end_time: str(s.appointmentEndTime),
    items: arrayOrEmpty(s.items),
    payments: arrayOrEmpty(s.payments),
    totals: objectOrEmpty(s.totals),
    legacy_created_at: toIso(s.createdAt),
    legacy_updated_at: toIso(s.updatedAt),
  })).filter((r) => r.legacy_id !== null);
  const saved = await upsert('sales', rows, 'shop_id,legacy_id', 'id,legacy_id');
  for (const row of saved || []) saleMap.set(Number(row.legacy_id), row.id);
}

async function importQuotes(shopId) {
  const rows = arr(collections.quotes).map((q) => {
    const legacyCustomerId = intId(q.customerId);
    return {
      shop_id: shopId,
      legacy_id: intId(q.id),
      legacy_customer_id: legacyCustomerId,
      quote_type: str(q.type || 'sales'),
      customer_name: str(q.customerName),
      customer_phone: str(q.customerPhone),
      customer_email: str(q.customerEmail),
      payload: objectOrEmpty(q),
      legacy_created_at: toIso(q.createdAt),
      legacy_updated_at: toIso(q.updatedAt),
      content_updated_at: toIso(q.contentUpdatedAt || q.updatedAt || q.createdAt),
    };
  }).filter((r) => r.legacy_id !== null);
  await upsert('quotes', rows, 'shop_id,legacy_id');
}

async function importWorkOrders(shopId, customerMap, workOrderMap) {
  const privateRows = [];
  const rows = arr(collections.workOrders).map((w) => {
    const legacyId = intId(w.id);
    if (w.password !== undefined && w.password !== null && String(w.password) !== '') {
      privateRows.push({ legacy_work_order_id: legacyId, device_password: String(w.password) });
    }
    return {
      shop_id: shopId,
      legacy_id: legacyId,
      customer_id: customerMap.get(intId(w.customerId)) || null,
      legacy_customer_id: intId(w.customerId),
      legacy_addon_sale_id: intId(w.addonSaleId),
      status: str(w.status),
      assigned_to: str(w.assignedTo),
      check_in_at: toIso(w.checkInAt),
      repair_completion_date: toIso(w.repairCompletionDate),
      checkout_date: toIso(w.checkoutDate),
      product_category: str(w.productCategory),
      product_description: str(w.productDescription),
      model: str(w.model),
      serial: str(w.serial),
      intake_source: str(w.intakeSource),
      problem_info: str(w.problemInfo),
      work_order_type: str(w.workOrderType),
      parts_ordered: bool(w.partsOrdered),
      parts_dates: str(w.partsDates),
      parts_order_url: str(w.partsOrderUrl),
      parts_tracking_url: str(w.partsTrackingUrl),
      parts_order_date: toIso(w.partsOrderDate),
      parts_estimated_delivery: toIso(w.partsEstimatedDelivery),
      parts_est_delivery: toIso(w.partsEstDelivery),
      discount: money(w.discount),
      discount_type: str(w.discountType),
      discount_pct_value: nullableNumber(w.discountPctValue),
      amount_paid: money(w.amountPaid),
      tax_rate: nullableNumber(w.taxRate) || 0,
      labor_cost: money(w.laborCost),
      part_costs: money(w.partCosts),
      payment_type: str(w.paymentType),
      totals: objectOrEmpty(w.totals),
      items: arrayOrEmpty(w.items),
      payments: arrayOrEmpty(w.payments),
      internal_notes: str(w.internalNotes),
      internal_notes_log: arrayOrEmpty(w.internalNotesLog),
      pattern_sequence: arrayOrEmpty(w.patternSequence),
      drone_checklist: objectOrEmpty(w.droneChecklist),
      dropoff_accessories: arrayOrEmpty(w.dropoffAccessories),
      activity_at: toIso(w.activityAt),
      legacy_created_at: toIso(w.createdAt),
      legacy_updated_at: toIso(w.updatedAt),
    };
  }).filter((r) => r.legacy_id !== null);
  const saved = await upsert('work_orders', rows, 'shop_id,legacy_id', 'id,legacy_id');
  for (const row of saved || []) workOrderMap.set(Number(row.legacy_id), row.id);

  const credentials = privateRows
    .filter((r) => r.legacy_work_order_id !== null && workOrderMap.has(r.legacy_work_order_id))
    .map((r) => ({
      shop_id: shopId,
      work_order_id: workOrderMap.get(r.legacy_work_order_id),
      legacy_work_order_id: r.legacy_work_order_id,
      device_password: r.device_password,
    }));
  await upsert('work_order_private_credentials', credentials, 'shop_id,work_order_id');
}

async function linkWorkOrderAddOnSales(shopId, workOrderMap, saleMap) {
  const rows = arr(collections.workOrders)
    .map((w) => {
      const legacyId = intId(w.id);
      const saleLegacyId = intId(w.addonSaleId);
      if (legacyId === null || saleLegacyId === null) return null;
      const workOrderId = workOrderMap.get(legacyId);
      const saleId = saleMap.get(saleLegacyId);
      if (!workOrderId || !saleId) return null;
      return { id: workOrderId, shop_id: shopId, addon_sale_id: saleId, legacy_addon_sale_id: saleLegacyId };
    })
    .filter(Boolean);
  await upsert('work_orders', rows, 'id');
}

async function importCalendarEvents(shopId, customerMap, workOrderMap, saleMap) {
  const rows = arr(collections.calendarEvents).map((e) => ({
    shop_id: shopId,
    legacy_id: intId(e.id),
    customer_id: customerMap.get(intId(e.customerId)) || null,
    work_order_id: workOrderMap.get(intId(e.workOrderId)) || null,
    sale_id: saleMap.get(intId(e.saleId)) || null,
    legacy_customer_id: intId(e.customerId),
    legacy_work_order_id: intId(e.workOrderId),
    legacy_sale_id: intId(e.saleId),
    event_date: dateOnly(e.date),
    title: str(e.title),
    event_time: str(e.time),
    end_time: str(e.endTime),
    category: str(e.category),
    location: str(e.location),
    customer_name: str(e.customerName),
    customer_phone: str(e.customerPhone),
    technician: str(e.technician),
    notes: str(e.notes),
    part_name: str(e.partName),
    source: str(e.source),
    order_url: str(e.orderUrl),
    parts_status: str(e.partsStatus),
    consultation_type: str(e.consultationType),
    legacy_created_at: toIso(e.createdAt),
    legacy_updated_at: toIso(e.updatedAt),
  })).filter((r) => r.legacy_id !== null);
  await upsert('calendar_events', rows, 'shop_id,legacy_id');
}

async function importPayments(shopId, customerMap, workOrderMap, saleMap) {
  const rows = arr(collections.payments).map((p) => ({
    shop_id: shopId,
    legacy_id: intId(p.id),
    customer_id: customerMap.get(intId(p.customerId)) || null,
    work_order_id: workOrderMap.get(intId(p.workOrderId)) || null,
    sale_id: saleMap.get(intId(p.saleId)) || null,
    amount: nullableNumber(p.amount),
    payment_type: str(p.paymentType),
    paid_at: toIso(p.paidAt || p.date),
    payload: objectOrValue(p),
  })).filter((r) => r.legacy_id !== null);
  await upsert('payments', rows, 'shop_id,legacy_id');
}

async function importTimeEntries(shopId, staffMap) {
  const rows = arr(collections.timeEntries).map((t) => {
    const legacyTech = textId(t.technicianId);
    return {
      shop_id: shopId,
      legacy_id: intId(t.id),
      staff_profile_id: staffMap.get(legacyTech) || null,
      legacy_technician_id: legacyTech,
      clock_in_at: toIso(t.clockIn),
      clock_out_at: toIso(t.clockOut),
      payload: objectOrValue(t),
    };
  }).filter((r) => r.legacy_id !== null);
  await upsert('time_entries', rows, 'shop_id,legacy_id');
}

async function importSettings(shopId) {
  const rows = arr(collections.settings).map((s) => ({
    shop_id: shopId,
    legacy_id: intId(s.id),
    shop_address: str(s.shopAddress),
    shop_lat: nullableNumber(s.shopLat),
    shop_lng: nullableNumber(s.shopLng),
    payload: objectOrValue(s),
    legacy_created_at: toIso(s.createdAt),
    legacy_updated_at: toIso(s.updatedAt),
  })).filter((r) => r.legacy_id !== null);
  await upsert('shop_settings', rows, 'shop_id,legacy_id');
}

async function importPreferences(shopId) {
  const rows = arr(collections.preferences).map((p) => ({
    shop_id: shopId,
    legacy_id: intId(p.id),
    key: str(p.key || p.name || p.id) || `legacy-${textId(p.id) || cryptoSuffix()}`,
    value: objectOrValue(p.value !== undefined ? p.value : p),
  })).filter((r) => r.key);
  await upsert('preferences', rows, 'shop_id,key');
}

async function importSystemLogs(shopId) {
  const rows = arr(collections.systemLogs).map((l) => ({
    shop_id: shopId,
    legacy_id: intId(l.id),
    level: str(l.level),
    message: str(l.message),
    payload: objectOrValue(l),
    logged_at: toIso(l.loggedAt || l.createdAt) || new Date().toISOString(),
  })).filter((r) => r.legacy_id !== null);
  await upsert('system_logs', rows, 'shop_id,legacy_id');
}

async function importSimpleNamed(shopId, table, source, mapper) {
  const rows = dedupeByName(
    arr(source).map((x) => mapper(shopId, x)).filter(Boolean),
    table,
  );
  await upsert(table, rows, 'shop_id,legacy_id');
}

async function importPayloadTable(shopId, table, source, mapper) {
  const rows = arr(source).map((x) => mapper(shopId, x)).filter(Boolean);
  await upsert(table, rows, 'shop_id,legacy_id');
}

function mapDeviceCategory(shopId, c) {
  const name = str(c.name || c.title);
  if (!name) return null;
  return {
    shop_id: shopId,
    legacy_id: intId(c.id),
    name,
    title: str(c.title),
    legacy_created_at: toIso(c.createdAt),
    legacy_updated_at: toIso(c.updatedAt),
  };
}

function mapProductCategory(shopId, c) {
  const name = str(c.name || c.title);
  if (!name) return null;
  return { shop_id: shopId, legacy_id: intId(c.id), name, title: str(c.title) };
}

function mapNamedPayload(shopId, x) {
  const name = str(x.name || x.title || x.label);
  return {
    shop_id: shopId,
    legacy_id: intId(x.id),
    name,
    payload: objectOrValue(x),
  };
}

function mapPayloadOnly(shopId, x) {
  return {
    shop_id: shopId,
    legacy_id: intId(x.id),
    payload: objectOrValue(x),
  };
}

async function upsert(table, rows, onConflict, select = null) {
  if (!rows || rows.length === 0) {
    console.log(`${table}: 0`);
    return [];
  }
  const out = [];
  for (let i = 0; i < rows.length; i += 250) {
    const batch = rows.slice(i, i + 250);
    let q = supabase.from(table).upsert(batch, { onConflict, ignoreDuplicates: false });
    if (select) q = q.select(select);
    const res = await q;
    if (res.error) throw new Error(`${table}: ${res.error.message}`);
    if (Array.isArray(res.data)) out.push(...res.data);
  }
  console.log(`${table}: ${rows.length}`);
  return out;
}

function dedupeByName(rows, table) {
  const seen = new Set();
  const out = [];
  let skipped = 0;
  for (const row of rows || []) {
    const key = String(row?.name || '').trim().toLowerCase();
    if (!key) {
      out.push(row);
      continue;
    }
    if (seen.has(key)) {
      skipped += 1;
      continue;
    }
    seen.add(key);
    out.push(row);
  }
  if (skipped) console.log(`${table}: skipped ${skipped} duplicate name row(s) from backup`);
  return out;
}

async function verifyCounts(shopId) {
  const tables = [
    ['customers', counts.customers],
    ['work_orders', counts.workOrders],
    ['sales', counts.sales],
    ['quotes', counts.quotes],
    ['calendar_events', counts.calendarEvents],
    ['device_categories', counts.deviceCategories],
    ['products', counts.products],
    ['repair_categories', counts.repairCategories],
    ['time_entries', counts.timeEntries],
  ];
  const result = {};
  for (const [table, expected] of tables) {
    const res = await supabase.from(table).select('id', { count: 'exact', head: true }).eq('shop_id', shopId);
    if (res.error) throw res.error;
    result[table] = { expectedAtLeast: expected, actual: res.count };
  }
  console.log('\nVerification counts:');
  console.log(JSON.stringify(result, null, 2));
}

function arr(v) {
  return Array.isArray(v) ? v : [];
}

function str(v) {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function intId(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function textId(v) {
  const s = str(v);
  return s || null;
}

function money(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function nullableNumber(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function intOrZero(v) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

function bool(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}

function nullableBool(v) {
  if (v === undefined || v === null || v === '') return null;
  return bool(v);
}

function toIso(v) {
  if (!v) return null;
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString();
}

function dateOnly(v) {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v);
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function arrayOrEmpty(v) {
  return Array.isArray(v) ? v : [];
}

function objectOrEmpty(v) {
  return v && typeof v === 'object' && !Array.isArray(v) ? v : {};
}

function objectOrValue(v) {
  if (v && typeof v === 'object') return v;
  return { value: v ?? null };
}

function cryptoSuffix() {
  return Math.random().toString(36).slice(2, 10);
}
