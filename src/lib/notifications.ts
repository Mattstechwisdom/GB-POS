export type NotificationKind = 'consultation' | 'parts_delivery' | 'event' | 'tech_schedule' | 'daily_look';

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

  // housekeeping
  keepUnreadDays: number;
  purgeReadAfterDays: number;
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

  keepUnreadDays: 30,
  purgeReadAfterDays: 14,
};

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
      dailyLookTimeLocal: /^\d{2}:\d{2}$/.test(String(first.dailyLookTimeLocal || '')) ? String(first.dailyLookTimeLocal) : DEFAULT_SETTINGS.dailyLookTimeLocal,
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
    dailyLookTimeLocal: /^\d{2}:\d{2}$/.test(String(next.dailyLookTimeLocal || '')) ? String(next.dailyLookTimeLocal) : DEFAULT_SETTINGS.dailyLookTimeLocal,
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
}

export async function syncNotificationsFromCalendar(): Promise<void> {
  const a = api();
  if (!a?.dbGet || !a?.dbAdd) return;

  const settings = await loadNotificationSettings();
  const calendar: any[] = await a.dbGet('calendarEvents').catch(() => []);
  const existingNotifications: NotificationRecord[] = await listNotifications();
  const now = new Date();

  const desiredKeys = new Set<string>();

  const consultLeadMs = settings.consultationLeadMinutes * 60 * 1000;
  const eventLeadMs = settings.eventLeadMinutes * 60 * 1000;
  const lookaheadPartsMs = settings.partsDeliveryLookaheadDays * 24 * 60 * 60 * 1000;
  const todayStart = startOfTodayLocal();
  const todayYmd = fmtLocalYmd(todayStart);

  // Daily Look digest (once per day)
  if (settings.enabledDailyLook) {
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
    const cat = ev?.category;

    // Consultations
    if (settings.enabledConsultations && cat === 'consultation') {
      const when = parseCalendarEventAt(ev);
      if (!when) continue;
      const diff = when.getTime() - now.getTime();
      if (diff < 0 || diff > consultLeadMs) continue;
      const key = `cal:${ev.id}:consultation`;
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

      const key = `cal:${ev.id}:parts_delivery`;
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
      const key = `cal:${ev.id}:event`;
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

  // Technician schedule changes (detected locally; settings editable in admin only)
  if (settings.enabledTechScheduleChanges) {
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
