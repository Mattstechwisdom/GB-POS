export type NotificationKind = 'consultation' | 'parts_delivery' | 'event' | 'tech_schedule' | 'daily_look' | 'work_order' | 'sale';

export type NotificationRecord = {
  id?: number;
  key: string; // stable de-dup key
  kind: NotificationKind;
  title: string;
  message?: string;
  createdAt: string; // ISO
  eventAt?: string; // ISO (when the underlying thing happens)
  source?: 'calendar';
  calendarEventId?: number;
  // Optional source pointers for quick-open actions
  workOrderId?: number;
  saleId?: number;
  customerId?: number;
  date?: string; // YYYY-MM-DD (copy from calendar when useful)
  time?: string; // HH:mm
  orderUrl?: string;
  trackingUrl?: string;
  readAt?: string | null;
};

export type NotificationSettings = {
  id?: number;
  enabledConsultations: boolean;
  consultationLeadMinutes: number; // reminder window ahead

  enabledPartsDelivery: boolean;
  partsDeliveryLookaheadDays: number;
  includeOverduePartsDelivery: boolean;

  enabledEvents: boolean;
  eventLeadMinutes: number;

  enabledTechScheduleChanges: boolean;

  // Daily Look digest (today's schedule/parts/events/consultations)
  enabledDailyLook: boolean;
  dailyLookOnOpen: boolean;
  dailyLookTimeLocal: string; // HH:mm

  // Rules
  quietHoursEnabled: boolean;
  quietHoursStartLocal: string; // HH:mm
  quietHoursEndLocal: string; // HH:mm

  // housekeeping
  keepUnreadDays: number;
  purgeReadAfterDays: number;
};

export type DeviceNotificationSettings = {
  enabled: boolean;
  permission: 'default' | 'prompt' | 'granted' | 'denied' | 'unsupported';
  consultationReminders: boolean;
  consultationLeadHours: number;
  newWorkOrders: boolean;
  newSales: boolean;
  partsDelivery: boolean;
  calendarEvents: boolean;
  dailyLook: boolean;
  technicianSchedules: boolean;
};

const DEFAULT_SETTINGS: NotificationSettings = {
  enabledConsultations: true,
  consultationLeadMinutes: 60,
  enabledPartsDelivery: true,
  partsDeliveryLookaheadDays: 7,
  includeOverduePartsDelivery: true,
  enabledEvents: true,
  eventLeadMinutes: 60,

  enabledTechScheduleChanges: true,

  enabledDailyLook: false,
  dailyLookOnOpen: true,
  dailyLookTimeLocal: '10:00',

  quietHoursEnabled: false,
  quietHoursStartLocal: '20:00',
  quietHoursEndLocal: '08:00',

  keepUnreadDays: 30,
  purgeReadAfterDays: 14,
};

const DEFAULT_DEVICE_SETTINGS: DeviceNotificationSettings = {
  enabled: false,
  permission: 'default',
  consultationReminders: true,
  consultationLeadHours: 1,
  newWorkOrders: true,
  newSales: true,
  partsDelivery: true,
  calendarEvents: false,
  dailyLook: true,
  technicianSchedules: true,
};

const DEVICE_SETTINGS_KEY = 'gbpos:deviceNotificationSettings:v1';
const DEVICE_PENDING_IDS_KEY = 'gbpos:deviceNotificationPendingIds:v1';
const SEEN_RECORDS_PREFIX = 'gbpos:deviceNotificationSeen';

function isValidHHmm(v: any): v is string {
  return /^\d{2}:\d{2}$/.test(String(v || ''));
}

function isWithinQuietHoursLocal(now: Date, startHHmm: string, endHHmm: string) {
  if (!isValidHHmm(startHHmm) || !isValidHHmm(endHHmm)) return false;
  const start = minutesFromHHmm(startHHmm);
  const end = minutesFromHHmm(endHHmm);
  if (start === end) return false;
  const cur = now.getHours() * 60 + now.getMinutes();
  if (start < end) return cur >= start && cur < end;
  return cur >= start || cur < end; // spans midnight
}

function api() {
  return (window as any).api as any;
}

function nowIso() {
  return new Date().toISOString();
}

function asNumber(v: any, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function hashString(input: string) {
  // djb2
  let h = 5381;
  for (let i = 0; i < input.length; i++) {
    h = ((h << 5) + h) ^ input.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

function notificationIdForKey(key: string): number {
  const hex = hashString(key).slice(0, 7);
  const id = parseInt(hex, 16);
  return Number.isFinite(id) ? id : Math.floor(Math.random() * 2_000_000_000);
}

function loadJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function saveJson(key: string, value: any) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

function startOfTodayLocal() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

function fmtLocalYmd(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function parseHHmmToLocalDate(ymd: string, hhmm: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  if (!/^\d{2}:\d{2}$/.test(hhmm)) return null;
  const [y, m, d] = ymd.split('-').map(Number);
  const [hh, mm] = hhmm.split(':').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
}

function minutesFromHHmm(hhmm?: string) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return 9 * 60;
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function fmtTime12(hhmm?: string) {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return '';
  const [hRaw, mRaw] = hhmm.split(':').map(Number);
  const h = (hRaw || 0);
  const m = (mRaw || 0);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const hh = ((h + 11) % 12) + 1;
  return `${hh}:${String(m).padStart(2, '0')} ${ampm}`;
}

function channelEnabledForKind(settings: DeviceNotificationSettings, kind: NotificationKind) {
  if (!settings.enabled || settings.permission !== 'granted') return false;
  if (kind === 'consultation') return settings.consultationReminders;
  if (kind === 'work_order') return settings.newWorkOrders;
  if (kind === 'sale') return settings.newSales;
  if (kind === 'parts_delivery') return settings.partsDelivery;
  if (kind === 'event') return settings.calendarEvents;
  if (kind === 'daily_look') return settings.dailyLook;
  if (kind === 'tech_schedule') return settings.technicianSchedules;
  return false;
}

async function getLocalNotificationsPlugin(): Promise<any | null> {
  try {
    const mod = await import('@capacitor/local-notifications');
    return (mod as any).LocalNotifications || null;
  } catch {
    return null;
  }
}

async function getDeviceNotificationPermission(): Promise<DeviceNotificationSettings['permission']> {
  const native = await getLocalNotificationsPlugin();
  if (native?.checkPermissions) {
    try {
      const status = await native.checkPermissions();
      const display = String(status?.display || '').toLowerCase();
      if (display === 'granted') return 'granted';
      if (display === 'denied') return 'denied';
      return 'prompt';
    } catch {
      // fall through to browser API
    }
  }
  if (typeof Notification !== 'undefined') {
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    return 'prompt';
  }
  return 'unsupported';
}

async function ensureAndroidNotificationChannel() {
  const native = await getLocalNotificationsPlugin();
  if (!native?.createChannel) return;
  try {
    await native.createChannel({
      id: 'gbpos-tech-alerts',
      name: 'GadgetBoy POS Alerts',
      description: 'Work order, sale, consultation, and shop reminders',
      importance: 4,
      visibility: 1,
    });
  } catch {
    // createChannel is Android-only; ignore unsupported platforms.
  }
}

async function sendDeviceNotification(rec: NotificationRecord, settings?: DeviceNotificationSettings) {
  const deviceSettings = settings || await loadDeviceNotificationSettings();
  if (!channelEnabledForKind(deviceSettings, rec.kind)) return;
  const title = String(rec.title || 'GadgetBoy POS').trim();
  const body = String(rec.message || '').trim();
  const id = notificationIdForKey(rec.key || `${rec.kind}:${title}:${rec.eventAt || rec.createdAt}`);

  const native = await getLocalNotificationsPlugin();
  if (native?.schedule) {
    try {
      await ensureAndroidNotificationChannel();
      await native.schedule({
        notifications: [{
          id,
          title,
          body,
          largeBody: body || title,
          channelId: 'gbpos-tech-alerts',
          schedule: { at: new Date(Date.now() + 250) },
        }],
      });
      return;
    } catch {
      // fall through to browser API
    }
  }

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      new Notification(title, { body, tag: rec.key });
    } catch {
      // ignore
    }
  }
}

export async function scheduleDeviceConsultationReminders(calendarInput?: any[], settingsInput?: DeviceNotificationSettings): Promise<void> {
  const native = await getLocalNotificationsPlugin();
  if (!native?.schedule) return;
  const settings = settingsInput || await loadDeviceNotificationSettings();
  if (!settings.enabled || settings.permission !== 'granted' || !settings.consultationReminders) return;

  const a = api();
  const calendar: any[] = Array.isArray(calendarInput)
    ? calendarInput
    : await a?.dbGet?.('calendarEvents').catch(() => []);
  const now = Date.now();
  const leadMs = settings.consultationLeadHours * 60 * 60 * 1000;
  const notifications: any[] = [];
  const pendingIds: number[] = loadJson<number[]>(DEVICE_PENDING_IDS_KEY, []);
  if (pendingIds.length && native.cancel) {
    try {
      await native.cancel({ notifications: pendingIds.map(id => ({ id })) });
    } catch {
      // ignore stale pending IDs
    }
  }

  for (const ev of Array.isArray(calendar) ? calendar : []) {
    if (ev?.category !== 'consultation') continue;
    const eventAt = parseCalendarEventAt(ev);
    if (!eventAt) continue;
    const alertAt = new Date(eventAt.getTime() - leadMs);
    if (alertAt.getTime() <= now) continue;
    const key = calendarNotificationKey(ev, 'consultation');
    const id = notificationIdForKey(`scheduled:${key}:${settings.consultationLeadHours}`);
    const customerName = String(ev.customerName || '').trim() || 'Customer';
    const time = fmtTime12(ev.time);
    notifications.push({
      id,
      title: `Consultation reminder: ${customerName}`,
      body: `${time ? `${time} - ` : ''}${String(ev.title || 'Consultation').trim() || 'Consultation'}`,
      largeBody: `${customerName}${time ? ` at ${time}` : ''}${ev.customerPhone ? `\n${ev.customerPhone}` : ''}`,
      channelId: 'gbpos-tech-alerts',
      schedule: {
        at: alertAt,
        allowWhileIdle: true,
      },
    });
  }

  await ensureAndroidNotificationChannel();
  if (notifications.length) {
    await native.schedule({ notifications });
  }
  saveJson(DEVICE_PENDING_IDS_KEY, notifications.map(n => n.id));
}

function recordDateForNotification(record: any): string {
  const raw = record?.activityAt || record?.checkInAt || record?.createdAt || record?.updatedAt || new Date().toISOString();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}

async function syncNewRecordNotificationsForKey(
  key: 'workOrders' | 'sales',
  rows: any[],
  enabled: boolean,
): Promise<void> {
  if (!enabled) return;
  const storageKey = `${SEEN_RECORDS_PREFIX}:${key}`;
  const seen = new Set(loadJson<string[]>(storageKey, []));
  const currentIds = (Array.isArray(rows) ? rows : [])
    .map(row => String(row?.id || '').trim())
    .filter(Boolean);

  if (!seen.size) {
    saveJson(storageKey, currentIds);
    return;
  }

  const existingNotifications = await listNotifications();
  for (const row of Array.isArray(rows) ? rows : []) {
    const id = String(row?.id || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);

    if (key === 'workOrders') {
      const customer = String(row?.customerName || [row?.firstName, row?.lastName].filter(Boolean).join(' ') || '').trim();
      const device = String(row?.productDescription || row?.productCategory || 'Work order').trim();
      await upsertByKeyWithCache(existingNotifications, {
        key: `workOrder:new:${id}`,
        kind: 'work_order',
        title: `New work order #${id}`,
        message: [customer, device].filter(Boolean).join(' - ') || undefined,
        createdAt: nowIso(),
        eventAt: recordDateForNotification(row),
        workOrderId: Number(id),
        customerId: row?.customerId != null ? Number(row.customerId) : undefined,
        readAt: null,
      });
    } else {
      const customer = String(row?.customerName || '').trim();
      const item = String(
        Array.isArray(row?.items) && row.items[0]
          ? row.items.map((it: any) => it?.description || it?.name || it?.title || '').filter(Boolean).join(', ')
          : row?.itemDescription || 'Sale'
      ).trim();
      await upsertByKeyWithCache(existingNotifications, {
        key: `sale:new:${id}`,
        kind: 'sale',
        title: `New sale #${id}`,
        message: [customer, item].filter(Boolean).join(' - ') || undefined,
        createdAt: nowIso(),
        eventAt: recordDateForNotification(row),
        saleId: Number(id),
        customerId: row?.customerId != null ? Number(row.customerId) : undefined,
        readAt: null,
      });
    }
  }
  saveJson(storageKey, Array.from(seen).slice(-2000));
}

export async function syncNotificationsFromRecords(): Promise<void> {
  const a = api();
  if (!a?.dbGet) return;
  const settings = await loadDeviceNotificationSettings();
  if (!settings.enabled) return;
  const [workOrders, sales] = await Promise.all([
    (a.getWorkOrders?.({ limit: 500, sortBy: 'activityAt', sortDir: 'desc' }) || a.dbGet('workOrders')).catch(() => []),
    a.dbGet('sales', { limit: 500, sortBy: 'checkInAt', sortDir: 'desc' }).catch(() => []),
  ]);
  await syncNewRecordNotificationsForKey('workOrders', workOrders, settings.newWorkOrders);
  await syncNewRecordNotificationsForKey('sales', sales, settings.newSales);
}

function parseCalendarEventAt(ev: any): Date | null {
  const date = String(ev?.date || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const t = (ev?.time || '').toString();
  const hhmm = /^\d{2}:\d{2}$/.test(t) ? t : '';
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return null;
  if (hhmm) {
    const [hh, mm] = hhmm.split(':').map(Number);
    return new Date(y, m - 1, d, hh || 0, mm || 0, 0, 0);
  }
  // If no time, treat as 9:00 AM local as a reasonable default.
  return new Date(y, m - 1, d, 9, 0, 0, 0);
}

function toIsoLocal(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
}

function calendarNotificationKey(ev: any, kind: 'consultation' | 'parts_delivery' | 'event') {
  const source = String(ev?.source || 'calendar').trim().toLowerCase();
  const date = String(ev?.date || '').slice(0, 10);
  const time = String(ev?.time || '').trim();
  const workOrderId = Number(ev?.workOrderId || 0) || 0;
  const saleId = Number(ev?.saleId || 0) || 0;
  const customerId = Number(ev?.customerId || 0) || 0;
  const partsStatus = String(ev?.partsStatus || '').trim().toLowerCase();
  const title = String(ev?.title || ev?.partName || '').trim().toLowerCase();
  return [
    'cal',
    kind,
    source,
    workOrderId || saleId || customerId || Number(ev?.id || 0) || 0,
    partsStatus,
    date,
    time,
    title,
  ].join(':');
}

export async function loadNotificationSettings(): Promise<NotificationSettings> {
  try {
    const list = await api()?.dbGet?.('notificationSettings');
    const first = Array.isArray(list) && list.length ? list[0] : null;
    if (!first) return { ...DEFAULT_SETTINGS };
    return {
      ...DEFAULT_SETTINGS,
      ...first,
      enabledConsultations: !!first.enabledConsultations,
      consultationLeadMinutes: clamp(asNumber(first.consultationLeadMinutes, DEFAULT_SETTINGS.consultationLeadMinutes), 0, 24 * 60),
      enabledPartsDelivery: !!first.enabledPartsDelivery,
      partsDeliveryLookaheadDays: clamp(asNumber(first.partsDeliveryLookaheadDays, DEFAULT_SETTINGS.partsDeliveryLookaheadDays), 0, 365),
      includeOverduePartsDelivery: !!first.includeOverduePartsDelivery,
      enabledEvents: !!first.enabledEvents,
      eventLeadMinutes: clamp(asNumber(first.eventLeadMinutes, DEFAULT_SETTINGS.eventLeadMinutes), 0, 24 * 60),

      enabledTechScheduleChanges: !!first.enabledTechScheduleChanges,
      enabledDailyLook: !!first.enabledDailyLook,
      dailyLookOnOpen: first.dailyLookOnOpen !== false,
      dailyLookTimeLocal: isValidHHmm(first.dailyLookTimeLocal) ? String(first.dailyLookTimeLocal) : DEFAULT_SETTINGS.dailyLookTimeLocal,

      quietHoursEnabled: !!first.quietHoursEnabled,
      quietHoursStartLocal: isValidHHmm(first.quietHoursStartLocal) ? String(first.quietHoursStartLocal) : DEFAULT_SETTINGS.quietHoursStartLocal,
      quietHoursEndLocal: isValidHHmm(first.quietHoursEndLocal) ? String(first.quietHoursEndLocal) : DEFAULT_SETTINGS.quietHoursEndLocal,

      keepUnreadDays: clamp(asNumber(first.keepUnreadDays, DEFAULT_SETTINGS.keepUnreadDays), 1, 365),
      purgeReadAfterDays: clamp(asNumber(first.purgeReadAfterDays, DEFAULT_SETTINGS.purgeReadAfterDays), 0, 365),
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export async function saveNotificationSettings(next: NotificationSettings): Promise<NotificationSettings> {
  const settings: NotificationSettings = {
    ...DEFAULT_SETTINGS,
    ...next,
    enabledConsultations: !!next.enabledConsultations,
    consultationLeadMinutes: clamp(asNumber(next.consultationLeadMinutes, DEFAULT_SETTINGS.consultationLeadMinutes), 0, 24 * 60),
    enabledPartsDelivery: !!next.enabledPartsDelivery,
    partsDeliveryLookaheadDays: clamp(asNumber(next.partsDeliveryLookaheadDays, DEFAULT_SETTINGS.partsDeliveryLookaheadDays), 0, 365),
    includeOverduePartsDelivery: !!next.includeOverduePartsDelivery,
    enabledEvents: !!next.enabledEvents,
    eventLeadMinutes: clamp(asNumber(next.eventLeadMinutes, DEFAULT_SETTINGS.eventLeadMinutes), 0, 24 * 60),

    enabledTechScheduleChanges: !!next.enabledTechScheduleChanges,
    enabledDailyLook: !!next.enabledDailyLook,
    dailyLookOnOpen: next.dailyLookOnOpen !== false,
    dailyLookTimeLocal: isValidHHmm(next.dailyLookTimeLocal) ? String(next.dailyLookTimeLocal) : DEFAULT_SETTINGS.dailyLookTimeLocal,

    quietHoursEnabled: !!next.quietHoursEnabled,
    quietHoursStartLocal: isValidHHmm(next.quietHoursStartLocal) ? String(next.quietHoursStartLocal) : DEFAULT_SETTINGS.quietHoursStartLocal,
    quietHoursEndLocal: isValidHHmm(next.quietHoursEndLocal) ? String(next.quietHoursEndLocal) : DEFAULT_SETTINGS.quietHoursEndLocal,

    keepUnreadDays: clamp(asNumber(next.keepUnreadDays, DEFAULT_SETTINGS.keepUnreadDays), 1, 365),
    purgeReadAfterDays: clamp(asNumber(next.purgeReadAfterDays, DEFAULT_SETTINGS.purgeReadAfterDays), 0, 365),
  };

  const list = await api()?.dbGet?.('notificationSettings').catch(() => []);
  const first = Array.isArray(list) && list.length ? list[0] : null;
  if (first?.id != null) {
    const updated = await api()?.dbUpdate?.('notificationSettings', first.id, { ...first, ...settings, updatedAt: nowIso() });
    return { ...settings, ...(updated || {}) };
  }
  const added = await api()?.dbAdd?.('notificationSettings', { ...settings, createdAt: nowIso(), updatedAt: nowIso() });
  return { ...settings, ...(added || {}) };
}

export async function loadDeviceNotificationSettings(): Promise<DeviceNotificationSettings> {
  const stored = loadJson<Partial<DeviceNotificationSettings>>(DEVICE_SETTINGS_KEY, {});
  const permission = await getDeviceNotificationPermission();
  const settings: DeviceNotificationSettings = {
    ...DEFAULT_DEVICE_SETTINGS,
    ...stored,
    enabled: !!stored.enabled,
    permission,
    consultationReminders: stored.consultationReminders !== false,
    consultationLeadHours: clamp(asNumber(stored.consultationLeadHours, DEFAULT_DEVICE_SETTINGS.consultationLeadHours), 1, 24),
    newWorkOrders: stored.newWorkOrders !== false,
    newSales: stored.newSales !== false,
    partsDelivery: stored.partsDelivery !== false,
    calendarEvents: !!stored.calendarEvents,
    dailyLook: stored.dailyLook !== false,
    technicianSchedules: stored.technicianSchedules !== false,
  };
  saveJson(DEVICE_SETTINGS_KEY, settings);
  return settings;
}

export async function saveDeviceNotificationSettings(next: DeviceNotificationSettings): Promise<DeviceNotificationSettings> {
  const permission = await getDeviceNotificationPermission();
  const settings: DeviceNotificationSettings = {
    ...DEFAULT_DEVICE_SETTINGS,
    ...next,
    enabled: !!next.enabled,
    permission,
    consultationReminders: !!next.consultationReminders,
    consultationLeadHours: clamp(asNumber(next.consultationLeadHours, DEFAULT_DEVICE_SETTINGS.consultationLeadHours), 1, 24),
    newWorkOrders: !!next.newWorkOrders,
    newSales: !!next.newSales,
    partsDelivery: !!next.partsDelivery,
    calendarEvents: !!next.calendarEvents,
    dailyLook: !!next.dailyLook,
    technicianSchedules: !!next.technicianSchedules,
  };
  saveJson(DEVICE_SETTINGS_KEY, settings);
  return settings;
}

export async function requestDeviceNotificationPermission(): Promise<DeviceNotificationSettings> {
  let permission = await getDeviceNotificationPermission();
  const native = await getLocalNotificationsPlugin();
  if (native?.requestPermissions && permission !== 'granted' && permission !== 'unsupported') {
    try {
      const status = await native.requestPermissions();
      const display = String(status?.display || '').toLowerCase();
      permission = display === 'granted' ? 'granted' : (display === 'denied' ? 'denied' : 'prompt');
    } catch {
      permission = await getDeviceNotificationPermission();
    }
  } else if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    try {
      const result = await Notification.requestPermission();
      permission = result === 'granted' ? 'granted' : (result === 'denied' ? 'denied' : 'prompt');
    } catch {
      permission = await getDeviceNotificationPermission();
    }
  }

  const current = loadJson<Partial<DeviceNotificationSettings>>(DEVICE_SETTINGS_KEY, {});
  const settings = await saveDeviceNotificationSettings({
    ...DEFAULT_DEVICE_SETTINGS,
    ...current,
    enabled: permission === 'granted',
    permission,
  } as DeviceNotificationSettings);
  if (permission === 'granted') {
    try { await ensureAndroidNotificationChannel(); } catch {}
    try { await scheduleDeviceConsultationReminders(); } catch {}
  }
  return settings;
}

export async function listNotifications(): Promise<NotificationRecord[]> {
  const list = await api()?.dbGet?.('notifications').catch(() => []);
  return Array.isArray(list) ? (list as NotificationRecord[]) : [];
}

export async function markNotificationRead(id: number, read: boolean): Promise<void> {
  const list = await listNotifications();
  const found = list.find(n => Number(n.id) === Number(id));
  if (!found?.id) return;
  await api()?.dbUpdate?.('notifications', found.id, { ...found, readAt: read ? nowIso() : null });
}

export async function markAllNotificationsRead(): Promise<void> {
  const list = await listNotifications();
  const unread = list.filter(n => !n.readAt && n.id != null);
  for (const n of unread) {
    try {
      await api()?.dbUpdate?.('notifications', n.id, { ...n, readAt: nowIso() });
    } catch {
      // ignore
    }
  }
}

export async function purgeReadNotifications(olderThanDays: number): Promise<void> {
  const days = clamp(asNumber(olderThanDays, 0), 0, 3650);
  if (days <= 0) return;
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  const list = await listNotifications();
  const toDelete = list.filter(n => n.readAt && new Date(n.readAt).getTime() < cutoff && n.id != null);
  for (const n of toDelete) {
    try {
      await api()?.dbDelete?.('notifications', n.id);
    } catch {
      // ignore
    }
  }
}

async function upsertByKey(rec: NotificationRecord): Promise<void> {
  const list = await listNotifications();
  await upsertByKeyWithCache(list, rec);
}

async function upsertByKeyWithCache(list: NotificationRecord[], rec: NotificationRecord): Promise<void> {
  const existing = list.find(n => n.key === rec.key);
  if (existing?.id != null) {
    const payload: NotificationRecord = {
      ...existing,
      ...rec,
      id: existing.id,
      createdAt: existing.createdAt || rec.createdAt,
      // Never re-unread an already-read notification during sync.
      readAt: existing.readAt ?? rec.readAt ?? null,
    };

    const same = (
      existing.key === payload.key &&
      existing.kind === payload.kind &&
      (existing.title || '') === (payload.title || '') &&
      (existing.message || '') === (payload.message || '') &&
      (existing.createdAt || '') === (payload.createdAt || '') &&
      (existing.eventAt || '') === (payload.eventAt || '') &&
      (existing.source || '') === (payload.source || '') &&
      Number(existing.calendarEventId || 0) === Number(payload.calendarEventId || 0) &&
      Number(existing.workOrderId || 0) === Number(payload.workOrderId || 0) &&
      Number(existing.saleId || 0) === Number(payload.saleId || 0) &&
      Number(existing.customerId || 0) === Number(payload.customerId || 0) &&
      (existing.date || '') === (payload.date || '') &&
      (existing.time || '') === (payload.time || '') &&
      (existing.orderUrl || '') === (payload.orderUrl || '') &&
      (existing.trackingUrl || '') === (payload.trackingUrl || '') &&
      (existing.readAt || null) === (payload.readAt || null)
    );
    if (same) return;

    await api()?.dbUpdate?.('notifications', existing.id, payload);
    return;
  }
  await api()?.dbAdd?.('notifications', rec);
  await sendDeviceNotification(rec).catch(() => {});
}

let _syncInflight = false;

export async function syncNotificationsFromCalendar(): Promise<void> {
  if (_syncInflight) return;
  _syncInflight = true;
  try {
    await _syncNotificationsFromCalendar();
  } finally {
    _syncInflight = false;
  }
}

async function _syncNotificationsFromCalendar(): Promise<void> {
  const a = api();
  if (!a?.dbGet || !a?.dbAdd) return;

  const settings = await loadNotificationSettings();
  const deviceSettings = await loadDeviceNotificationSettings();
  const calendar: any[] = await a.dbGet('calendarEvents').catch(() => []);
  const existingNotifications: NotificationRecord[] = await listNotifications();
  const now = new Date();

  const quietNow = settings.quietHoursEnabled && isWithinQuietHoursLocal(now, settings.quietHoursStartLocal, settings.quietHoursEndLocal);

  const desiredKeys = new Set<string>();

  const consultationLeadMinutes = deviceSettings.enabled && deviceSettings.consultationReminders
    ? deviceSettings.consultationLeadHours * 60
    : settings.consultationLeadMinutes;
  const consultLeadMs = consultationLeadMinutes * 60 * 1000;
  const eventLeadMs = settings.eventLeadMinutes * 60 * 1000;
  const lookaheadPartsMs = settings.partsDeliveryLookaheadDays * 24 * 60 * 60 * 1000;
  const todayStart = startOfTodayLocal();
  const todayYmd = fmtLocalYmd(todayStart);

  if (deviceSettings.enabled && deviceSettings.permission === 'granted' && deviceSettings.consultationReminders) {
    try { await scheduleDeviceConsultationReminders(calendar, deviceSettings); } catch {}
  }

  // Daily Look digest (once per day)
  if (settings.enabledDailyLook && !quietNow) {
    try {
      const triggerAt = parseHHmmToLocalDate(todayYmd, settings.dailyLookTimeLocal) || todayStart;
      const shouldSend = (settings.dailyLookOnOpen || now.getTime() >= triggerAt.getTime());

      if (shouldSend) {
        const todays = (Array.isArray(calendar) ? calendar : []).filter(ev => String(ev?.date || '').slice(0, 10) === todayYmd);
        const consultations = todays.filter(ev => ev?.category === 'consultation');
        const parts = todays.filter(ev => ev?.category === 'parts');
        const partsDelivery = parts.filter(ev => (ev?.partsStatus === 'delivery' || !ev?.partsStatus));
        const partsOrdered = parts.filter(ev => ev?.partsStatus === 'ordered');
        const eventsOnly = todays.filter(ev => ev?.category === 'event');

        // Derive schedule lines from technicians
        const techs: any[] = await a.dbGet('technicians').catch(() => []);
        const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
        const dayKey = dayNames[todayStart.getDay()];
        const schedules: Array<{ name: string; start?: string; end?: string; off?: boolean }> = [];
        for (const t of Array.isArray(techs) ? techs : []) {
          const name = (t.nickname || [t.firstName, t.lastName].filter(Boolean).join(' ').trim() || t.id || 'Technician').toString();
          const sd = (t.schedule || {})?.[dayKey];
          if (!sd) continue;
          if (sd.off || (sd.start && sd.end)) schedules.push({ name, start: sd.start, end: sd.end, off: !!sd.off });
        }
        schedules.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        function lineForConsultation(ev: any) {
          const t = fmtTime12(ev.time);
          const who = String(ev.customerName || '').trim() || 'Customer';
          const title = String(ev.title || '').trim();
          return `${t ? t + ' ' : ''}${who}${title ? ` — ${title}` : ''}`.trim();
        }
        function lineForEvent(ev: any) {
          const t = fmtTime12(ev.time);
          const title = String(ev.title || '').trim() || 'Event';
          const loc = String(ev.location || '').trim();
          return `${t ? t + ' ' : ''}${title}${loc ? ` @ ${loc}` : ''}`.trim();
        }
        function lineForPart(ev: any) {
          const t = fmtTime12(ev.time);
          const what = String(ev.partName || ev.title || 'Part').trim();
          const wo = ev.workOrderId ? `WO #${ev.workOrderId}` : (ev.saleId ? `Sale #${ev.saleId}` : '');
          return `${t ? t + ' ' : ''}${what}${wo ? ` (${wo})` : ''}`.trim();
        }

        const lines: string[] = [];
        if (consultations.length) {
          lines.push('Consultations:');
          consultations
            .slice()
            .sort((a, b) => minutesFromHHmm(a.time) - minutesFromHHmm(b.time))
            .forEach(ev => lines.push(`- ${lineForConsultation(ev)}`));
        }
        if (partsDelivery.length) {
          if (lines.length) lines.push('');
          lines.push('Parts expected (delivery):');
          partsDelivery
            .slice()
            .sort((a, b) => minutesFromHHmm(a.time) - minutesFromHHmm(b.time))
            .forEach(ev => lines.push(`- ${lineForPart(ev)}`));
        }
        if (partsOrdered.length) {
          if (lines.length) lines.push('');
          lines.push('Parts ordered:');
          partsOrdered
            .slice()
            .sort((a, b) => minutesFromHHmm(a.time) - minutesFromHHmm(b.time))
            .forEach(ev => lines.push(`- ${lineForPart(ev)}`));
        }
        if (eventsOnly.length) {
          if (lines.length) lines.push('');
          lines.push('Events:');
          eventsOnly
            .slice()
            .sort((a, b) => minutesFromHHmm(a.time) - minutesFromHHmm(b.time))
            .forEach(ev => lines.push(`- ${lineForEvent(ev)}`));
        }
        if (schedules.length) {
          if (lines.length) lines.push('');
          lines.push('Schedules:');
          schedules.forEach(s => {
            if (s.off) lines.push(`- ${s.name}: Off`);
            else lines.push(`- ${s.name}: ${fmtTime12(s.start)} - ${fmtTime12(s.end)}`);
          });
        }

        const key = `daily:${todayYmd}`;
        desiredKeys.add(key);
        await upsertByKeyWithCache(existingNotifications, {
          key,
          kind: 'daily_look',
          title: `Daily Look: ${todayYmd}`,
          message: lines.length ? lines.join('\n') : 'No calendar items for today.',
          createdAt: nowIso(),
          eventAt: toIsoLocal(triggerAt),
          readAt: null,
        });
      }
    } catch {
      // ignore
    }
  }

  for (const ev of Array.isArray(calendar) ? calendar : []) {
    if (quietNow) continue;
    const cat = ev?.category;

    // Consultations
    if (settings.enabledConsultations && cat === 'consultation') {
      const when = parseCalendarEventAt(ev);
      if (!when) continue;
      const diff = when.getTime() - now.getTime();
      if (diff < 0 || diff > consultLeadMs) continue;
      const key = calendarNotificationKey(ev, 'consultation');
      desiredKeys.add(key);
      await upsertByKeyWithCache(existingNotifications, {
        key,
        kind: 'consultation',
        title: `Consultation: ${String(ev.customerName || '').trim() || 'Customer'}`,
        message: String(ev.title || '').trim() || undefined,
        createdAt: nowIso(),
        eventAt: toIsoLocal(when),
        source: 'calendar',
        calendarEventId: ev.id,
        workOrderId: ev.workOrderId != null ? Number(ev.workOrderId) : undefined,
        saleId: ev.saleId != null ? Number(ev.saleId) : undefined,
        customerId: ev.customerId != null ? Number(ev.customerId) : undefined,
        date: String(ev.date || '').slice(0, 10),
        time: ev.time || undefined,
        readAt: null,
      });
    }

    // Parts expected delivery
    if (settings.enabledPartsDelivery && cat === 'parts' && (ev.partsStatus === 'delivery' || !ev.partsStatus)) {
      const when = parseCalendarEventAt({ ...ev, time: ev.time || '09:00' });
      if (!when) continue;
      const diff = when.getTime() - now.getTime();
      const isOverdue = when.getTime() < todayStart.getTime();
      const inLookahead = diff >= 0 && diff <= lookaheadPartsMs;
      if (!inLookahead && !(settings.includeOverduePartsDelivery && isOverdue)) continue;

      const key = calendarNotificationKey(ev, 'parts_delivery');
      desiredKeys.add(key);
      await upsertByKeyWithCache(existingNotifications, {
        key,
        kind: 'parts_delivery',
        title: isOverdue ? `Overdue delivery: ${String(ev.partName || ev.title || 'Part').trim()}` : `Expected delivery: ${String(ev.partName || ev.title || 'Part').trim()}`,
        message: ev.workOrderId ? `Work order #${ev.workOrderId}` : (ev.saleId ? `Sale #${ev.saleId}` : undefined),
        createdAt: nowIso(),
        eventAt: toIsoLocal(when),
        source: 'calendar',
        calendarEventId: ev.id,
        workOrderId: ev.workOrderId != null ? Number(ev.workOrderId) : undefined,
        saleId: ev.saleId != null ? Number(ev.saleId) : undefined,
        customerId: ev.customerId != null ? Number(ev.customerId) : undefined,
        date: String(ev.date || '').slice(0, 10),
        time: ev.time || undefined,
        orderUrl: ev.orderUrl || undefined,
        trackingUrl: (ev as any).trackingUrl || undefined,
        readAt: null,
      });
    }

    // Regular events
    if (settings.enabledEvents && cat === 'event') {
      const when = parseCalendarEventAt(ev);
      if (!when) continue;
      const diff = when.getTime() - now.getTime();
      if (diff < 0 || diff > eventLeadMs) continue;
      const key = calendarNotificationKey(ev, 'event');
      desiredKeys.add(key);
      await upsertByKeyWithCache(existingNotifications, {
        key,
        kind: 'event',
        title: `Event: ${String(ev.title || '').trim() || 'Event'}`,
        message: ev.location ? String(ev.location) : undefined,
        createdAt: nowIso(),
        eventAt: toIsoLocal(when),
        source: 'calendar',
        calendarEventId: ev.id,
        workOrderId: ev.workOrderId != null ? Number(ev.workOrderId) : undefined,
        saleId: ev.saleId != null ? Number(ev.saleId) : undefined,
        customerId: ev.customerId != null ? Number(ev.customerId) : undefined,
        date: String(ev.date || '').slice(0, 10),
        time: ev.time || undefined,
        readAt: null,
      });
    }
  }

  if (!quietNow) {
    try {
      const list = await listNotifications();
      for (const n of list) {
        if (n.id == null) continue;
        if (n.source !== 'calendar') continue;
        if (n.kind !== 'consultation' && n.kind !== 'parts_delivery' && n.kind !== 'event') continue;
        if (desiredKeys.has(n.key)) continue;
        await a.dbDelete('notifications', n.id).catch(() => {});
      }
    } catch {
      // ignore
    }
  }

  // Technician schedule changes (detected locally; settings editable in admin only)
  if (settings.enabledTechScheduleChanges && !quietNow) {
    try {
      const techs: any[] = await a.dbGet('technicians').catch(() => []);
      for (const t of Array.isArray(techs) ? techs : []) {
        const name = (t.nickname || [t.firstName, t.lastName].filter(Boolean).join(' ').trim() || t.id || 'Technician').toString();
        const scheduleStr = JSON.stringify(t.schedule || {});
        const cur = hashString(scheduleStr);
        const storageKey = `gbpos:techScheduleHash:${String(t.id || name)}`;
        const prev = (() => { try { return localStorage.getItem(storageKey) || ''; } catch { return ''; } })();
        if (!prev) {
          try { localStorage.setItem(storageKey, cur); } catch {}
          continue; // don't notify on first seen
        }
        if (prev !== cur) {
          try { localStorage.setItem(storageKey, cur); } catch {}
          const key = `tech:${String(t.id || name)}:schedule:${cur}`;
          desiredKeys.add(key);
          await upsertByKeyWithCache(existingNotifications, {
            key,
            kind: 'tech_schedule',
            title: `Technician schedule changed: ${name}`,
            message: 'A schedule was updated in Admin.',
            createdAt: nowIso(),
            eventAt: nowIso(),
            readAt: null,
          });
        }
      }
    } catch {
      // ignore
    }
  }

  // Cleanup: purge old read notifications, and also purge very old unread that user didn't act on.
  try {
    await purgeReadNotifications(settings.purgeReadAfterDays);
  } catch {
    // ignore
  }

  try {
    const list = await listNotifications();
    const unreadCutoff = Date.now() - settings.keepUnreadDays * 24 * 60 * 60 * 1000;
    for (const n of list) {
      if (n.readAt) continue;
      const t = new Date(n.eventAt || n.createdAt).getTime();
      if (Number.isFinite(t) && t < unreadCutoff && n.id != null) {
        await a.dbDelete('notifications', n.id).catch(() => {});
      }
    }
  } catch {
    // ignore
  }
}

export async function getUnreadCount(): Promise<number> {
  const list = await listNotifications();
  return list.filter(n => !n.readAt).length;
}
