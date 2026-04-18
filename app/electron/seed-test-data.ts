import fs from 'fs';
import path from 'path';

type SeedResult =
  | { ok: true; seeded: false; dbPath: string }
  | { ok: true; seeded: true; dbPath: string; counts: Record<string, number> }
  | { ok: false; error: string };

function mulberry32(seed: number) {
  let a = seed | 0;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function int(rng: () => number, min: number, max: number): number {
  const lo = Math.ceil(min);
  const hi = Math.floor(max);
  return Math.floor(rng() * (hi - lo + 1)) + lo;
}

function fmtDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysLocal(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
}

function isoAt(dateYYYYMMDD: string, hhmm: string): string {
  const [y, m, d] = dateYYYYMMDD.split('-').map(n => Number(n));
  const [hh, mm] = hhmm.split(':').map(n => Number(n));
  // Construct in local time to avoid UTC date-shift around midnight.
  return new Date(y, (m || 1) - 1, d || 1, hh || 12, mm || 0, 0, 0).toISOString();
}

function safePhone803(n: number) {
  const s = String(n).padStart(7, '0');
  return `803-${s.slice(0, 3)}-${s.slice(3)}`;
}

export function seedTestDataIfNeeded(dataRoot: string): SeedResult {
  const enabled = (process.env.GBPOS_SEED_TEST_DATA || '').toString().trim() === '1';
  if (!enabled) return { ok: false, error: 'GBPOS_SEED_TEST_DATA not enabled' };

  const reset = (process.env.GBPOS_SEED_TEST_DATA_RESET || '').toString().trim() === '1';

  if (!dataRoot || !dataRoot.trim()) return { ok: false, error: 'Missing dataRoot' };

  const dbPath = path.join(dataRoot, 'gbpos-db.json');

  try {
    fs.mkdirSync(dataRoot, { recursive: true });
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }

  // If the test DB already exists, avoid overwriting it unless reset is requested.
  // However, we still want newer sample collections (like Quote Generator saved quotes)
  // to appear even when the DB was created before those seed fields existed.
  if (!reset && fs.existsSync(dbPath)) {
    try {
      const raw = fs.readFileSync(dbPath, 'utf-8');
      const existing = JSON.parse(raw);

      if (existing && typeof existing === 'object') {
        const allQuotes: any[] = Array.isArray((existing as any).quotes) ? (existing as any).quotes : [];
        const salesQuotes = allQuotes.filter((q: any) => (q?.type ?? 'sales') === 'sales');

        if (salesQuotes.length === 0) {
          const nowIso = new Date().toISOString();
          const rng = mulberry32(0x47425053 ^ 0x12345);

          const customers: any[] = Array.isArray((existing as any).customers) ? (existing as any).customers : [];
          const getCustomer = (i: number) => {
            if (customers.length) return customers[i % customers.length];
            return {
              id: i + 1,
              firstName: 'Test',
              lastName: `Customer ${i + 1}`,
              phone: '803-555-0000',
              email: '',
            };
          };
          const customerLabel = (c: any) => [c?.firstName, c?.lastName].filter(Boolean).join(' ').trim();

          // Keep dates relative to "today" so quotes look recent.
          const today = new Date();
          const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0);
          const dayDates = Array.from({ length: 7 }).map((_, i) => fmtDateLocal(addDaysLocal(start, i)));
          const d0 = dayDates[0] || fmtDateLocal(start);
          const d1 = dayDates[1] || d0;
          const d2 = dayDates[2] || d0;
          const d3 = dayDates[3] || d0;
          const d4 = dayDates[4] || d0;
          const d5 = dayDates[5] || d0;
          const d6 = dayDates[6] || d0;

          let nextId = allQuotes.reduce((m: number, q: any) => Math.max(m, Number(q?.id) || 0), 0) + 1;

          const makeSalesQuote = (cust: any, items: any[], createdAt: string, editedAt: string, notes: string) => {
            const subtotal = (items || []).reduce((acc, it) => acc + (Number(it?.price) || 0), 0);
            return {
              id: nextId++,
              type: 'sales',
              customerId: cust?.id != null ? Number(cust.id) : undefined,
              customerName: customerLabel(cust),
              customerPhone: String(cust?.phone || ''),
              customerEmail: String(cust?.email || ''),
              notes,
              items,
              totals: { subtotal, total: subtotal },
              createdAt,
              contentUpdatedAt: editedAt,
              updatedAt: editedAt,
            };
          };

          const mkItem = (partial: any) => ({
            expanded: true,
            images: [],
            dynamic: {},
            ...partial,
          });

          const seededSalesQuotes = [
            makeSalesQuote(
              getCustomer(0),
              [mkItem({ deviceType: 'Apple Devices', brand: 'Apple', model: 'iPhone 14 Pro', description: 'Unlocked • Certified pre-owned', condition: 'Excellent', accessories: 'Box, USB-C cable', price: 799, internalCost: 620, markupPct: '29', inStock: true, dynamic: { device: 'iPhone', storage: '256 GB', color: 'Blue' } })],
              isoAt(d0, '09:10'),
              isoAt(d0, '09:25'),
              'Trade-in credit applied at checkout. Quote valid 24 hours.',
            ),
            makeSalesQuote(
              getCustomer(1),
              [mkItem({ deviceType: 'Phone', brand: 'Samsung', model: 'Galaxy S23', description: 'Factory unlocked', condition: 'Good', accessories: 'Charger included', price: 449, internalCost: 335, markupPct: '34', inStock: false, dynamic: { storage: '128 GB', carrier: 'Unlocked', color: 'Black', os: 'Android' } })],
              isoAt(d1, '11:05'),
              isoAt(d1, '11:22'),
              'Special order estimated 3–5 business days. Includes basic setup.',
            ),
            makeSalesQuote(
              getCustomer(2),
              [mkItem({ deviceType: 'Laptop', brand: 'Dell', model: 'Latitude 5420', description: 'Business-class laptop (refurbished)', condition: 'Excellent', accessories: '65W USB-C charger', price: 529, internalCost: 410, markupPct: '29', inStock: true, dynamic: { cpu: 'Intel i5', cpuGen: '11th Gen', ram: '16 GB', storage: '512 GB', screenSize: '14"', os: 'Windows 11', ports: 'USB-C, HDMI, 2×USB-A, SD', accessories: 'Charger included' } })],
              isoAt(d2, '14:10'),
              isoAt(d2, '14:40'),
              'Includes OS updates and driver install before pickup.',
            ),
            makeSalesQuote(
              getCustomer(3),
              [mkItem({ deviceType: 'Gaming Laptop', brand: 'ASUS', model: 'ROG Strix G16', description: 'Gaming laptop package', condition: 'Like New', accessories: 'Power brick, sleeve', price: 1499, internalCost: 1210, markupPct: '24', inStock: true, dynamic: { cpu: 'Intel i7-12700H', cpuGen: '12th Gen', ram: '32 GB', gpuBrand: 'NVIDIA', gpuModel: 'RTX 4070', gpuVram: '8 GB', bootDriveType: 'M.2 NVMe', bootDriveStorage: '1 TB', addSecondStorage: true, secondaryStorage1Type: 'SATA SSD', secondaryStorage1Storage: '2 TB', displaySize: '16"', displayResolution: '2560×1440 (QHD)', refreshRate: '165 Hz', cooling: 'Dual Fan', keyboard: 'Per-key RGB', os: 'Windows 11', ports: 'USB-C, HDMI 2.1, 2×USB-A', accessories: 'Mouse + headset bundle' } })],
              isoAt(d3, '16:05'),
              isoAt(d4, '09:20'),
              'Performance-focused setup for gaming and streaming.',
            ),
            makeSalesQuote(
              getCustomer(4),
              [
                mkItem({ deviceType: 'Console', brand: 'Sony', model: 'PS5', description: 'Console bundle', condition: 'Like New', accessories: '2 controllers, HDMI cable', price: 389, internalCost: 300, markupPct: '30', inStock: true, dynamic: { model: 'PS5', storage: '1 TB', edition: 'Digital', condition: 'Like New' } }),
                mkItem({ deviceType: 'Audio', brand: 'Sony', model: 'Pulse 3D', description: 'Wireless headset', condition: 'Excellent', accessories: 'USB dongle', price: 79, internalCost: 48, markupPct: '39', inStock: true, dynamic: { audioType: 'Headset', color: 'White', features: 'Wireless' } }),
              ],
              isoAt(d4, '12:30'),
              isoAt(d4, '12:45'),
              'Bundle pricing includes in-store setup and controller pairing.',
            ),
            makeSalesQuote(
              getCustomer(5),
              [mkItem({ deviceType: 'Drone', brand: 'DJI', model: 'Mini 3 Pro', description: 'Fly More-style kit', condition: 'Excellent', accessories: 'Hard case, spare props', price: 799, internalCost: 640, markupPct: '25', inStock: false, dynamic: { camera: '20 MP / 5.4K', flightTime: '30 min', range: '12 km (FCC)', maxSpeed: '35 mph', weight: '249 g', batteryCapacity: '2453 mAh', batteryCycles: '12', batteriesIncluded: '3', controller: 'DJI RC', obstacleAvoidance: 'Tri-directional', gps: 'GPS + GLONASS', storage: 'microSD 128GB included' } })],
              isoAt(d5, '10:00'),
              isoAt(d5, '10:30'),
              'Special order. We\'ll call when it arrives for pickup and test flight.',
            ),
            makeSalesQuote(
              getCustomer(6),
              [mkItem({ deviceType: 'TV', brand: 'LG', model: 'C3 OLED', description: 'Home theater upgrade', condition: 'New', accessories: 'Stand + remote', price: 1399, internalCost: 1110, markupPct: '26', inStock: true, dynamic: { brand: 'LG', screenSize: '65"', resolution: '4K UHD', displayTech: 'OLED', refreshRate: '120 Hz', hdr: 'Dolby Vision', tvIsSmart: true, tvOs: 'webOS (LG)', ports: '4×HDMI, 3×USB, eARC', yearModel: 'OLED65C3PUA (2023)' } })],
              isoAt(d6, '15:10'),
              isoAt(d6, '15:55'),
              'Includes delivery coordination and basic picture setup.',
            ),
          ];

          // Slight randomized shuffling to vary ordering when multiple quotes are created at the same timestamp.
          // (Still deterministic due to seeded RNG.)
          seededSalesQuotes.sort(() => (rng() < 0.5 ? -1 : 1));

          (existing as any).quotes = [...allQuotes, ...seededSalesQuotes];
          fs.writeFileSync(dbPath, JSON.stringify(existing, null, 2), 'utf-8');

          return { ok: true, seeded: true, dbPath, counts: { quotes: seededSalesQuotes.length } };
        }
      }
    } catch {
      // ignore
    }

    return { ok: true, seeded: false, dbPath };
  }

  const nowIso = new Date().toISOString();
  // Deterministic RNG seed so the dataset is stable across launches.
  const rng = mulberry32(0x47425053 ^ 0x12345);

  const firstNames = ['Alex', 'Jordan', 'Taylor', 'Casey', 'Morgan', 'Riley', 'Cameron', 'Drew', 'Avery', 'Parker', 'Quinn', 'Reese'];
  const lastNames = ['Johnson', 'Smith', 'Brown', 'Davis', 'Miller', 'Wilson', 'Moore', 'Anderson', 'Thomas', 'Jackson', 'White', 'Harris'];
  const scCities = ['Columbia', 'Lexington', 'Irmo', 'Cayce', 'West Columbia', 'Blythewood', 'Chapin', 'Forest Acres'];
  const streets = ['Devine St', 'Gervais St', 'Assembly St', 'Two Notch Rd', 'Broad River Rd', 'Forest Dr', 'Main St', 'Sumter St'];

  const technicians = [
    {
      id: 'tech-1',
      firstName: 'Sam',
      lastName: 'Tech',
      nickname: 'Sam',
      active: true,
      schedule: {
        mon: { start: '09:00', end: '17:00' },
        tue: { start: '09:00', end: '17:00' },
        wed: { start: '09:00', end: '17:00' },
        thu: { start: '09:00', end: '17:00' },
        fri: { start: '09:00', end: '17:00' },
        sat: { start: '10:00', end: '14:00' },
        sun: { off: true },
      },
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'tech-2',
      firstName: 'Jamie',
      lastName: 'Fixit',
      nickname: 'Jamie',
      active: true,
      schedule: {
        mon: { start: '10:00', end: '18:00' },
        tue: { start: '10:00', end: '18:00' },
        wed: { start: '10:00', end: '18:00' },
        thu: { start: '10:00', end: '18:00' },
        fri: { start: '10:00', end: '18:00' },
        sat: { off: true },
        sun: { off: true },
      },
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'tech-3',
      firstName: 'Chris',
      lastName: 'Bench',
      nickname: 'Chris',
      active: true,
      schedule: {
        mon: { off: true },
        tue: { start: '09:00', end: '15:00' },
        wed: { start: '09:00', end: '15:00' },
        thu: { start: '09:00', end: '15:00' },
        fri: { start: '09:00', end: '15:00' },
        sat: { start: '11:00', end: '16:00' },
        sun: { off: true },
      },
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  const deviceCategories = [
    { id: 1, name: 'iPhone' },
    { id: 2, name: 'Android' },
    { id: 3, name: 'iPad / Tablet' },
    { id: 4, name: 'Laptop' },
    { id: 5, name: 'Desktop' },
    { id: 6, name: 'Game Console' },
    { id: 7, name: 'Drone' },
  ].map(x => ({ ...x, createdAt: nowIso, updatedAt: nowIso }));

  const repairTypes = [
    { id: 1, name: 'Diagnostic' },
    { id: 2, name: 'Screen Repair' },
    { id: 3, name: 'Battery' },
    { id: 4, name: 'Charging Port' },
    { id: 5, name: 'Data Recovery' },
    { id: 6, name: 'Software / OS' },
    { id: 7, name: 'Soldering' },
  ].map(x => ({ ...x, createdAt: nowIso, updatedAt: nowIso }));

  const productCategories = [
    { id: 1, name: 'Device' },
    { id: 2, name: 'Accessory' },
    { id: 3, name: 'Consultation' },
    { id: 4, name: 'Other' },
  ].map(x => ({ ...x, createdAt: nowIso, updatedAt: nowIso }));

  // Products are physical items for sale (no repair parts here).
  const products = Array.from({ length: 18 }).map((_, idx) => {
    const category = (idx % 5 === 0) ? 'Device' : pick(rng, ['Accessory', 'Accessory', 'Other']);
    const condition = category === 'Device'
      ? pick(rng, ['Excellent', 'Good', 'Fair'])
      : 'New';

    const desc = category === 'Device'
      ? `${pick(rng, ['Unlocked', 'Refurbished', 'Open Box'])} ${pick(rng, ['iPhone 12', 'iPhone 13', 'Galaxy S22', 'Pixel 7', 'iPad 9th Gen', 'Dell Latitude 5420'])}`
      : pick(rng, ['USB-C Charger', 'Wireless Charger', 'Phone Case', 'Screen Protector', 'Mouse', 'Keyboard', 'HDMI Cable', 'USB-C Cable', 'Laptop Sleeve']);

    const internalCost = category === 'Device' ? int(rng, 120, 720) : int(rng, 3, 45);
    const price = category === 'Device'
      ? int(rng, internalCost + 40, internalCost + 220)
      : int(rng, internalCost + 3, internalCost + 25);

    const stockCount = category === 'Device' ? int(rng, 0, 5) : int(rng, 0, 25);
    const lowStockThreshold = category === 'Device' ? 1 : 2;

    const hasSupplier = category !== 'Device' && rng() < 0.7;
    const distributor = hasSupplier ? pick(rng, ['Amazon', 'Wholesale', 'Other']) : '';
    const distributorSku = hasSupplier ? `SKU-${20000 + idx}` : '';
    const reorderQty = hasSupplier ? int(rng, 1, 6) : 1;
    const reorderUrlTemplate = hasSupplier ? 'https://supplier.example/item?sku={{sku}}&qty={{qty}}' : '';

    return {
      id: idx + 1,
      itemDescription: desc,
      category,
      itemType: 'Product',
      condition,
      partCategory: '',
      price,
      internalCost,
      distributor,
      distributorSku,
      reorderQty,
      reorderUrlTemplate,
      trackStock: true,
      stockCount,
      lowStockThreshold,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  });

  // Repair parts live under repair categories; only some are stock-tracked “if necessary”.
  const partlessRepairTypes = ['Diagnostic', 'Software / OS', 'Data Recovery'];

  const repairCategories = Array.from({ length: 14 }).map((_, idx) => {
    const type = (idx % 4 === 0) ? 'product' : 'service';
    const device = pick(rng, ['iPhone 13', 'iPhone 14 Pro', 'Galaxy S23', 'Pixel 8', 'MacBook Air', 'PS5', 'DJI Mini']);
    const repairCategory = pick(rng, repairTypes.map(t => t.name));

    const isService = type === 'service';
    const serviceUsesParts = isService && !partlessRepairTypes.includes(repairCategory);

    const title = isService
      ? `${repairCategory} — ${device}`
      : `${device} Part — ${pick(rng, ['Screen', 'Battery', 'Port', 'Adhesive'])}`;

    const partCost = isService
      ? (serviceUsesParts ? int(rng, 15, 180) : 0)
      : int(rng, 10, 120);
    const laborCost = isService ? int(rng, 40, 220) : 0;

    const trackStock = partCost > 0 ? (rng() < (type === 'product' ? 0.7 : 0.4)) : false;
    const stockCount = trackStock ? int(rng, 0, 12) : undefined;
    const lowStockThreshold = trackStock ? int(rng, 1, 3) : undefined;

    return {
      id: `rc-${idx + 1}`,
      category: device,
      repairCategory,
      title,
      altDescription: isService ? (serviceUsesParts ? 'Includes required parts + testing.' : 'Service-only (no parts).') : undefined,
      partCost,
      laborCost,
      internalCost: Math.max(0, partCost - int(rng, 0, 10)),
      type,
      model: device,
      trackStock,
      stockCount,
      lowStockThreshold,
      orderSourceUrl: trackStock ? 'https://supplier.example/search' : '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  });

  const customers = Array.from({ length: 24 }).map((_, idx) => {
    const fn = pick(rng, firstNames);
    const ln = pick(rng, lastNames);
    const phoneNum = 1000000 + idx * 137 + int(rng, 0, 120);
    const zip = pick(rng, ['29201', '29205', '29206', '29072', '29063', '29170', '29036']);

    return {
      id: idx + 1,
      firstName: fn,
      lastName: ln,
      email: `${fn.toLowerCase()}.${ln.toLowerCase()}@example.com`,
      phone: safePhone803(phoneNum),
      zip,
      notes: idx % 7 === 0 ? 'Prefers text updates.' : '',
      createdAt: nowIso,
      updatedAt: nowIso,
    };
  });

  const settings = [
    {
      id: 1,
      shopAddress: '123 Devine St, Columbia, SC 29205',
      // Columbia, SC (approx)
      shopLat: 34.0103,
      shopLng: -81.0205,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  const addressHistory = [
    '123 Devine St, Columbia, SC 29205',
    '1100 Gervais St, Columbia, SC 29201',
    '101 Main St, Lexington, SC 29072',
    '200 Broad River Rd, Columbia, SC 29210',
  ];

  // Seed one-week window centered on today (so it shows up immediately in Calendar).
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0);
  const dayDates = Array.from({ length: 7 }).map((_, i) => fmtDateLocal(addDaysLocal(start, i)));

  let invoiceId = 1200;
  let calendarEventId = 1;

  const workOrders: any[] = [];
  const sales: any[] = [];
  const calendarEvents: any[] = [];

  const makeCustomerLabel = (c: any) => `${c.firstName} ${c.lastName}`.trim();

  for (const day of dayDates) {
    // 1–2 work orders per day
    const woCount = (rng() < 0.35) ? 1 : 2;
    for (let i = 0; i < woCount; i++) {
      invoiceId++;
      const c = pick(rng, customers);
      const tech = pick(rng, technicians);
      const device = pick(rng, deviceCategories).name;
      const productDescription = `${device} — ${pick(rng, ['No Power', 'Cracked Screen', 'Battery Swelling', 'Won\'t Charge', 'Slow / Freezing', 'Water Damage'])}`;
      const checkInTime = pick(rng, ['10:15', '11:30', '13:10', '14:45', '15:30']);
      const checkInAt = isoAt(day, checkInTime);

      const partCosts = int(rng, 10, 180);
      const laborCost = int(rng, 40, 240);
      const subTotal = partCosts + laborCost;
      const taxRate = 0.08;
      const tax = Math.round(subTotal * taxRate * 100) / 100;
      const total = Math.round((subTotal + tax) * 100) / 100;

      const statusRoll = rng();
      const status = statusRoll < 0.25 ? 'closed' : (statusRoll < 0.55 ? 'in progress' : 'open');

      const amountPaid = status === 'closed' ? total : (rng() < 0.5 ? 0 : Math.round((total * 0.35) * 100) / 100);
      const remaining = Math.max(0, Math.round((total - amountPaid) * 100) / 100);

      const partsOrdered = rng() < 0.45;
      const partsOrderDate = partsOrdered ? fmtDateLocal(addDaysLocal(new Date(day + 'T12:00:00'), int(rng, 0, 1))) : null;
      const partsEstDelivery = partsOrdered ? fmtDateLocal(addDaysLocal(new Date(day + 'T12:00:00'), int(rng, 2, 4))) : null;

      const wo = {
        id: invoiceId,
        status,
        assignedTo: tech.id,
        customerId: c.id,
        checkInAt,
        activityAt: checkInAt,
        repairCompletionDate: status === 'closed' ? isoAt(day, '16:30') : null,
        checkoutDate: status === 'closed' ? isoAt(day, '16:45') : null,

        productCategory: device,
        productDescription,
        problemInfo: pick(rng, ['Client reports intermittent issue.', 'Reproduce issue and run diagnostics.', 'Needs quick turnaround.', 'No additional notes.']),
        password: '',
        model: '',
        serial: '',
        intakeSource: pick(rng, ['Walk-in', 'Referral', 'Google', 'Repeat Client', 'Phone Call']),

        partsOrdered: partsOrdered || undefined,
        partsOrderUrl: partsOrdered ? 'https://supplier.example/order/WO' : undefined,
        partsTrackingUrl: partsOrdered ? 'https://carrier.example/track/123' : undefined,
        partsOrderDate: partsOrderDate,
        partsEstDelivery: partsEstDelivery,

        quotedPrice: total,
        discount: 0,
        amountPaid,
        paymentType: amountPaid > 0 ? pick(rng, ['Cash', 'Card', 'Apple Pay', 'Google Pay']) : undefined,
        taxRate,

        laborCost,
        partCosts,

        totals: { subTotal, tax, total, remaining },

        items: [
          {
            id: `wo-${invoiceId}-1`,
            status: rng() < 0.5 ? 'pending' : 'done',
            description: pick(rng, ['Diagnostic', 'Replace part', 'Clean / Reseat connectors', 'Update firmware', 'Install OS / drivers']),
            qty: 1,
            unitPrice: laborCost,
          },
        ],
        internalNotes: rng() < 0.25 ? 'Bench test after repair; check camera & charging.' : '',

        createdAt: checkInAt,
        updatedAt: checkInAt,
      };

      workOrders.push(wo);

      // Seed calendar parts events for work orders with parts.
      if (partsOrdered && partsOrderDate) {
        calendarEvents.push({
          id: calendarEventId++,
          category: 'parts',
          partsStatus: 'ordered',
          date: partsOrderDate,
          title: `WO #${wo.id} ${wo.productCategory}`,
          partName: `WO #${wo.id} ${wo.productDescription}`,
          customerName: makeCustomerLabel(c),
          customerPhone: c.phone,
          technician: tech.nickname || tech.firstName || tech.id,
          source: 'workorder',
          workOrderId: wo.id,
          orderUrl: wo.partsOrderUrl,
          trackingUrl: wo.partsTrackingUrl,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
      if (partsOrdered && partsEstDelivery) {
        calendarEvents.push({
          id: calendarEventId++,
          category: 'parts',
          partsStatus: 'delivery',
          date: partsEstDelivery,
          title: `WO #${wo.id} ${wo.productCategory}`,
          partName: `WO #${wo.id} ${wo.productDescription}`,
          customerName: makeCustomerLabel(c),
          customerPhone: c.phone,
          technician: tech.nickname || tech.firstName || tech.id,
          source: 'workorder',
          workOrderId: wo.id,
          orderUrl: wo.partsOrderUrl,
          trackingUrl: wo.partsTrackingUrl,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
    }

    // 1 consultation per day
    {
      invoiceId++;
      const c = pick(rng, customers);
      const tech = pick(rng, technicians);
      const atHome = rng() < 0.45;
      const city = pick(rng, scCities);
      const streetNo = int(rng, 100, 999);
      const addr = `${streetNo} ${pick(rng, streets)}, ${city}, SC ${pick(rng, ['29201', '29205', '29206', '29072'])}`;
      const title = pick(rng, ['Consultation', 'On-site Setup', 'Network / Wi-Fi Help', 'New Device Setup']);
      const time = pick(rng, ['09:30', '10:00', '13:30', '15:00']);
      const endTime = pick(rng, ['10:30', '11:00', '14:30', '16:00']);
      const hours = pick(rng, [1, 1, 2, 2, 3]);

      const baseRate = 75;
      const extraRate = 50;
      const extraHours = Math.max(0, hours - 1);
      const driverFee = atHome && rng() < 0.6 ? 20 : 0;

      const subTotal = baseRate + (extraHours * extraRate) + driverFee;
      const total = subTotal;

      const sale = {
        id: invoiceId,
        customerId: c.id,
        customerName: makeCustomerLabel(c),
        customerPhone: c.phone,
        category: 'Consultation',
        items: [
          { id: `s-${invoiceId}-1`, description: title, qty: 1, price: baseRate, category: 'Consultation', inStock: true, consultationHours: 1 },
          ...(extraHours > 0 ? [{ id: `s-${invoiceId}-2`, description: `${title} (Additional Hours)`, qty: extraHours, price: extraRate, category: 'Consultation', inStock: true, consultationHours: extraHours }] : []),
          ...(driverFee > 0 ? [{ id: `s-${invoiceId}-3`, description: 'Driver / Distance Fee (> 15 mi)', qty: 1, price: driverFee, category: 'Consultation', inStock: true }] : []),
        ],
        itemDescription: title,
        quantity: hours,
        price: baseRate,
        status: rng() < 0.2 ? 'closed' : 'open',
        assignedTo: tech.id,
        notes: rng() < 0.4 ? 'Bring device(s) + passwords if available.' : '',
        consultationHours: hours,
        consultationType: atHome ? 'athome' : 'instore',
        consultationAddress: atHome ? addr : undefined,
        appointmentDate: day,
        appointmentTime: time,
        appointmentEndTime: endTime,
        driverFee: driverFee || undefined,
        laborCost: subTotal,
        partCosts: 0,
        totals: { subTotal, tax: 0, total, remaining: total },
        total,
        amountPaid: 0,
        checkInAt: isoAt(day, '12:05'),
        createdAt: isoAt(day, '12:05'),
        updatedAt: isoAt(day, '12:05'),
      };

      sales.push(sale);

      calendarEvents.push({
        id: calendarEventId++,
        category: 'consultation',
        date: day,
        time,
        endTime,
        title,
        customerName: sale.customerName,
        customerPhone: sale.customerPhone,
        customerId: c.id,
        technician: tech.id,
        notes: sale.notes || undefined,
        location: atHome ? addr : 'In-Store',
        consultationType: sale.consultationType,
        saleId: sale.id,
        source: 'consultation',
        createdAt: nowIso,
        updatedAt: nowIso,
      });
    }

    // 0–1 retail sale per day
    if (rng() < 0.75) {
      invoiceId++;
      const c = pick(rng, customers);
      const tech = pick(rng, technicians);
      const p = pick(rng, products);
      const qty = int(rng, 1, 2);
      const inStock = rng() < 0.55;

      const orderedDate = !inStock ? fmtDateLocal(addDaysLocal(new Date(day + 'T12:00:00'), int(rng, 0, 1))) : null;
      const estimatedDeliveryDate = !inStock ? fmtDateLocal(addDaysLocal(new Date(day + 'T12:00:00'), int(rng, 2, 5))) : null;
      const clientPickupDate = !inStock && rng() < 0.4 ? `${fmtDateLocal(addDaysLocal(new Date(day + 'T12:00:00'), int(rng, 4, 7)))}T${pick(rng, ['11:00', '14:00', '16:30'])}:00.000Z` : null;

      const subTotal = Math.round(((Number(p.price || 0) || 0) * qty) * 100) / 100;
      const taxRate = 0.08;
      const tax = Math.round(subTotal * taxRate * 100) / 100;
      const total = Math.round((subTotal + tax) * 100) / 100;
      const amountPaid = rng() < 0.6 ? total : Math.round((total * 0.25) * 100) / 100;

      const sale = {
        id: invoiceId,
        customerId: c.id,
        customerName: makeCustomerLabel(c),
        customerPhone: c.phone,
        category: 'Retail',
        items: [
          { id: `s-${invoiceId}-1`, description: p.itemDescription, qty, price: p.price || 0, category: p.category || 'Other', inStock },
        ],
        itemDescription: p.itemDescription,
        quantity: qty,
        price: p.price || 0,
        status: amountPaid >= total ? 'closed' : 'open',
        assignedTo: tech.id,
        notes: rng() < 0.2 ? 'Client requested expedited shipping.' : '',
        inStock,
        orderedDate: orderedDate ? isoAt(orderedDate, '12:00') : null,
        estimatedDeliveryDate: estimatedDeliveryDate ? isoAt(estimatedDeliveryDate, '12:00') : null,
        clientPickupDate: clientPickupDate,
        totals: { subTotal, tax, total },
        total,
        amountPaid,
        checkInAt: isoAt(day, pick(rng, ['12:15', '13:05', '15:10'])),
        createdAt: isoAt(day, '12:15'),
        updatedAt: isoAt(day, '12:15'),
      };

      sales.push(sale);

      // Seed calendar part events for non-stock sales.
      if (!inStock && orderedDate) {
        calendarEvents.push({
          id: calendarEventId++,
          category: 'parts',
          partsStatus: 'ordered',
          date: orderedDate,
          title: p.itemDescription,
          partName: p.itemDescription,
          customerName: sale.customerName,
          customerPhone: sale.customerPhone,
          technician: tech.id,
          source: 'sale',
          saleId: sale.id,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
      if (!inStock && estimatedDeliveryDate) {
        calendarEvents.push({
          id: calendarEventId++,
          category: 'parts',
          partsStatus: 'delivery',
          date: estimatedDeliveryDate,
          title: p.itemDescription,
          partName: p.itemDescription,
          customerName: sale.customerName,
          customerPhone: sale.customerPhone,
          technician: tech.id,
          source: 'sale',
          saleId: sale.id,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
      if (clientPickupDate) {
        const date = String(clientPickupDate).split('T')[0];
        const time = String(clientPickupDate).includes('T') ? String(clientPickupDate).split('T')[1].slice(0, 5) : '';
        calendarEvents.push({
          id: calendarEventId++,
          category: 'event',
          date,
          time: time || undefined,
          title: `Pickup: ${p.itemDescription}`,
          customerName: sale.customerName,
          customerPhone: sale.customerPhone,
          createdAt: nowIso,
          updatedAt: nowIso,
        });
      }
    }
  }

  // A couple generic events for the week
  {
    const d1 = dayDates[1] || dayDates[0];
    const d2 = dayDates[4] || dayDates[0];
    calendarEvents.push({
      id: calendarEventId++,
      category: 'event',
      date: d1,
      time: '08:30',
      title: 'Morning Team Meeting',
      notes: 'Test environment: sample event.',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
    calendarEvents.push({
      id: calendarEventId++,
      category: 'event',
      date: d2,
      time: '17:15',
      title: 'Inventory Spot-Check',
      notes: 'Test environment: sample event.',
      createdAt: nowIso,
      updatedAt: nowIso,
    });
  }

  // Seed a handful of Saved Quotes for Quote Generator (sales quotes only)
  const quotes: any[] = [];
  {
    const makeSalesQuote = (id: number, c: any, items: any[], createdAt: string, editedAt: string, notes: string) => {
      const subtotal = items.reduce((acc, it) => acc + (Number(it?.price) || 0), 0);
      return {
        id,
        type: 'sales',
        customerId: c?.id != null ? Number(c.id) : undefined,
        customerName: c ? makeCustomerLabel(c) : '',
        customerPhone: c?.phone || '',
        customerEmail: c?.email || '',
        notes,
        items,
        totals: { subtotal, total: subtotal },
        createdAt,
        contentUpdatedAt: editedAt,
        updatedAt: editedAt,
      };
    };

    const d0 = dayDates[0];
    const d1 = dayDates[1] || d0;
    const d2 = dayDates[2] || d0;
    const d3 = dayDates[3] || d0;
    const d4 = dayDates[4] || d0;
    const d5 = dayDates[5] || d0;
    const d6 = dayDates[6] || d0;

    const c1 = customers[0];
    const c2 = customers[5] || c1;
    const c3 = customers[8] || c1;
    const c4 = customers[11] || c1;
    const c5 = customers[15] || c1;
    const c6 = customers[18] || c1;
    const c7 = customers[22] || c1;

    quotes.push(
      makeSalesQuote(
        1,
        c1,
        [
          {
            expanded: true,
            images: [],
            deviceType: 'Apple Devices',
            brand: 'Apple',
            model: 'iPhone 14 Pro',
            description: 'Unlocked • Certified pre-owned',
            condition: 'Excellent',
            accessories: 'Box, USB-C cable',
            price: 799,
            internalCost: 620,
            markupPct: '29',
            inStock: true,
            dynamic: { device: 'iPhone', storage: '256 GB', color: 'Blue' },
          },
        ],
        isoAt(d0, '09:10'),
        isoAt(d0, '09:25'),
        'Trade-in credit applied at checkout. Quote valid 24 hours.',
      ),
    );

    quotes.push(
      makeSalesQuote(
        2,
        c2,
        [
          {
            expanded: true,
            images: [],
            deviceType: 'Phone',
            brand: 'Samsung',
            model: 'Galaxy S23',
            description: 'Factory unlocked',
            condition: 'Good',
            accessories: 'Charger included',
            price: 449,
            internalCost: 335,
            markupPct: '34',
            inStock: false,
            dynamic: { storage: '128 GB', carrier: 'Unlocked', color: 'Black', os: 'Android' },
          },
        ],
        isoAt(d1, '11:05'),
        isoAt(d1, '11:22'),
        'Special order estimated 3–5 business days. Includes basic setup.',
      ),
    );

    quotes.push(
      makeSalesQuote(
        3,
        c3,
        [
          {
            expanded: true,
            images: [],
            deviceType: 'Laptop',
            brand: 'Dell',
            model: 'Latitude 5420',
            description: 'Business-class laptop (refurbished)',
            condition: 'Excellent',
            accessories: '65W USB-C charger',
            price: 529,
            internalCost: 410,
            markupPct: '29',
            inStock: true,
            dynamic: {
              cpu: 'Intel i5',
              cpuGen: '11th Gen',
              ram: '16 GB',
              storage: '512 GB',
              screenSize: '14"',
              os: 'Windows 11',
              ports: 'USB-C, HDMI, 2×USB-A, SD',
              accessories: 'Charger included',
            },
          },
        ],
        isoAt(d2, '14:10'),
        isoAt(d2, '14:40'),
        'Includes OS updates and driver install before pickup.',
      ),
    );

    quotes.push(
      makeSalesQuote(
        4,
        c4,
        [
          {
            expanded: true,
            images: [],
            deviceType: 'Gaming Laptop',
            brand: 'ASUS',
            model: 'ROG Strix G16',
            description: 'Gaming laptop package',
            condition: 'Like New',
            accessories: 'Power brick, sleeve',
            price: 1499,
            internalCost: 1210,
            markupPct: '24',
            inStock: true,
            dynamic: {
              cpu: 'Intel i7-12700H',
              cpuGen: '12th Gen',
              ram: '32 GB',
              gpuBrand: 'NVIDIA',
              gpuModel: 'RTX 4070',
              gpuVram: '8 GB',
              bootDriveType: 'M.2 NVMe',
              bootDriveStorage: '1 TB',
              addSecondStorage: true,
              secondaryStorage1Type: 'SATA SSD',
              secondaryStorage1Storage: '2 TB',
              displaySize: '16"',
              displayResolution: '2560×1440 (QHD)',
              refreshRate: '165 Hz',
              cooling: 'Dual Fan',
              keyboard: 'Per-key RGB',
              os: 'Windows 11',
              ports: 'USB-C, HDMI 2.1, 2×USB-A',
              accessories: 'Mouse + headset bundle',
            },
          },
        ],
        isoAt(d3, '16:05'),
        isoAt(d4, '09:20'),
        'Performance-focused setup for gaming and streaming.',
      ),
    );

    quotes.push(
      makeSalesQuote(
        5,
        c5,
        [
          {
            expanded: true,
            images: [],
            deviceType: 'Console',
            brand: 'Sony',
            model: 'PS5',
            description: 'Console bundle',
            condition: 'Like New',
            accessories: '2 controllers, HDMI cable',
            price: 389,
            internalCost: 300,
            markupPct: '30',
            inStock: true,
            dynamic: { model: 'PS5', storage: '1 TB', edition: 'Digital', condition: 'Like New' },
          },
          {
            expanded: true,
            images: [],
            deviceType: 'Audio',
            brand: 'Sony',
            model: 'Pulse 3D',
            description: 'Wireless headset',
            condition: 'Excellent',
            accessories: 'USB dongle',
            price: 79,
            internalCost: 48,
            markupPct: '39',
            inStock: true,
            dynamic: { audioType: 'Headset', color: 'White', features: 'Wireless' },
          },
        ],
        isoAt(d4, '12:30'),
        isoAt(d4, '12:45'),
        'Bundle pricing includes in-store setup and controller pairing.',
      ),
    );

    quotes.push(
      makeSalesQuote(
        6,
        c6,
        [
          {
            expanded: true,
            images: [],
            deviceType: 'Drone',
            brand: 'DJI',
            model: 'Mini 3 Pro',
            description: 'Fly More-style kit',
            condition: 'Excellent',
            accessories: 'Hard case, spare props',
            price: 799,
            internalCost: 640,
            markupPct: '25',
            inStock: false,
            dynamic: {
              camera: '20 MP / 5.4K',
              flightTime: '30 min',
              range: '12 km (FCC)',
              maxSpeed: '35 mph',
              weight: '249 g',
              batteryCapacity: '2453 mAh',
              batteryCycles: '12',
              batteriesIncluded: '3',
              controller: 'DJI RC',
              obstacleAvoidance: 'Tri-directional',
              gps: 'GPS + GLONASS',
              storage: 'microSD 128GB included',
              droneSpecs: [
                { desc: 'ND filter set', value: '4-pack' },
                { desc: 'Care plan', value: '1 year coverage' },
              ],
            },
          },
        ],
        isoAt(d5, '10:00'),
        isoAt(d5, '10:30'),
        'Special order. We\'ll call when it arrives for pickup and test flight.',
      ),
    );

    quotes.push(
      makeSalesQuote(
        7,
        c7,
        [
          {
            expanded: true,
            images: [],
            deviceType: 'TV',
            brand: 'LG',
            model: 'C3 OLED',
            description: 'Home theater upgrade',
            condition: 'New',
            accessories: 'Stand + remote',
            price: 1399,
            internalCost: 1110,
            markupPct: '26',
            inStock: true,
            dynamic: {
              brand: 'LG',
              screenSize: '65"',
              resolution: '4K UHD',
              displayTech: 'OLED',
              refreshRate: '120 Hz',
              hdr: 'Dolby Vision',
              tvIsSmart: true,
              tvOs: 'webOS (LG)',
              ports: '4×HDMI, 3×USB, eARC',
              yearModel: 'OLED65C3PUA (2023)',
            },
          },
        ],
        isoAt(d6, '15:10'),
        isoAt(d6, '15:55'),
        'Includes delivery coordination and basic picture setup.',
      ),
    );

    // Custom PC (shows category-based fields and cost breakdown print)
    {
      const dyn: any = {
        case: 'NZXT H6 Flow (Black)',
        casePrice: 109,
        motherboard: 'MSI B650 Tomahawk WiFi',
        motherboardPrice: 189,
        cpu: 'AMD Ryzen 7',
        cpuGen: '7800X3D (Zen 4)',
        cpuPrice: 349,
        cooling: 'Liquid Cooling',
        coolingPrice: 99,
        ram: '32 GB',
        ramSpeed: '3600 MHz',
        ramPrice: 89,
        gpuBrand: 'NVIDIA',
        gpuModel: 'RTX 4070',
        gpuVram: '12 GB',
        gpuPrice: 539,
        bootDriveType: 'M.2 NVMe',
        bootDriveStorage: '1 TB',
        storagePrice: 79,
        pcSecondaryStorageEnabled: true,
        pcSecondaryStorage: [
          { type: 'SATA SSD', size: '2 TB', price: 129 },
          { type: 'HDD', size: '4 TB', price: 99 },
        ],
        psu: 'Corsair RM850e (850W)',
        psuPrice: 119,
        os: 'Windows 11 Pro',
        peripherals: 'Keyboard + mouse bundle',
        pcExtras: [
          { label: 'Keyboard', desc: 'Keychron K6 (RGB)', price: 69 },
          { label: 'Mouse', desc: 'Logitech G305', price: 39 },
        ],
        extraParts: [
          { name: 'ARGB Fans', desc: '3-pack 120mm', price: 29 },
        ],
        buildLabor: 150,
      };

      // Before-tax customer total: (sum(parts)*1.05) + labor
      const partsRawSum =
        Number(dyn.casePrice || 0) +
        Number(dyn.motherboardPrice || 0) +
        Number(dyn.cpuPrice || 0) +
        Number(dyn.coolingPrice || 0) +
        Number(dyn.ramPrice || 0) +
        Number(dyn.gpuPrice || 0) +
        Number(dyn.storagePrice || 0) +
        Number(dyn.psuPrice || 0) +
        (Array.isArray(dyn.pcSecondaryStorage) ? dyn.pcSecondaryStorage.reduce((acc: number, d: any) => acc + (Number(d?.price || 0) || 0), 0) : 0) +
        (Array.isArray(dyn.pcExtras) ? dyn.pcExtras.reduce((acc: number, e: any) => acc + (Number(e?.price || 0) || 0), 0) : 0) +
        (Array.isArray(dyn.extraParts) ? dyn.extraParts.reduce((acc: number, e: any) => acc + (Number(e?.price || 0) || 0), 0) : 0);
      const customPcTotal = Math.round(((partsRawSum * 1.05) + (Number(dyn.buildLabor || 0) || 0)) * 100) / 100;

      quotes.push(
        makeSalesQuote(
          8,
          c2,
          [
            {
              expanded: true,
              images: [],
              deviceType: 'Custom PC',
              brand: 'Custom',
              model: 'Gaming + Workstation Tower',
              description: 'Parts + build labor (see breakdown)',
              condition: 'New',
              accessories: 'Driver install + stress test',
              price: customPcTotal,
              inStock: false,
              dynamic: dyn,
              prompt: 'Balanced build focused on high-FPS gaming, fast boot times, and quiet operation.',
            },
          ],
          isoAt(d2, '09:15'),
          isoAt(d2, '09:45'),
          'Custom build. Prices subject to supplier availability; print shows +5% markup on parts.',
        ),
      );
    }
  }

  const invoiceSeq = Math.max(
    0,
    ...workOrders.map(w => Number(w.id) || 0),
    ...sales.map(s => Number(s.id) || 0),
  );

  const db: any = {
    _meta: {
      seedProfile: 'test-week',
      seedVersion: 1,
      seededAt: nowIso,
    },
    invoiceSeq,
    settings,
    addressHistory,
    technicians,
    customers,
    deviceCategories,
    productCategories,
    products,
    repairTypes,
    repairCategories,
    workOrders,
    sales,
    quotes,
    calendarEvents,
  };

  try {
    fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf-8');
  } catch (e: any) {
    return { ok: false, error: e?.message || String(e) };
  }

  const counts: Record<string, number> = {
    customers: customers.length,
    technicians: technicians.length,
    deviceCategories: deviceCategories.length,
    repairCategories: repairCategories.length,
    repairTypes: repairTypes.length,
    products: products.length,
    workOrders: workOrders.length,
    sales: sales.length,
    quotes: quotes.length,
    calendarEvents: calendarEvents.length,
  };

  return { ok: true, seeded: true, dbPath, counts };
}
