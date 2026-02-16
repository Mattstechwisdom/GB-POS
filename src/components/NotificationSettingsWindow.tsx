import React, { useEffect, useState } from 'react';
import {
  loadNotificationSettings,
  saveNotificationSettings,
  syncNotificationsFromCalendar,
  NotificationSettings,
} from '@/lib/notifications';

const NotificationSettingsWindow: React.FC = () => {
  const [settings, setSettings] = useState<NotificationSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const s = await loadNotificationSettings();
      setSettings(s);
    })();
  }, []);

  const save = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      await saveNotificationSettings(settings);
      setSavedAt(new Date().toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true }));
      try { await syncNotificationsFromCalendar(); } catch {}
    } finally {
      setSaving(false);
    }
  };

  if (!settings) {
    return <div className="p-4 text-zinc-200 bg-zinc-900 h-screen">Loading…</div>;
  }

  return (
    <div className="h-screen bg-zinc-900 text-zinc-100 p-4 overflow-auto">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <div className="text-xl font-semibold">Notification Settings</div>
          <div className="text-xs text-zinc-400">Choose what to track and how far ahead to alert.</div>
        </div>
        <div className="flex items-center gap-2">
          {savedAt ? <div className="text-xs text-neon-green">Saved {savedAt}</div> : null}
          <button
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
            onClick={async () => {
              try {
                const api: any = (window as any).api;
                if (api?.closeSelfWindow) await api.closeSelfWindow({ focusMain: true });
                else window.close();
              } catch {
                try { window.close(); } catch {}
              }
            }}
          >
            Close
          </button>
          <button
            className={`px-3 py-1.5 rounded text-sm font-semibold ${saving ? 'bg-zinc-700 text-zinc-300' : 'bg-[#39FF14] text-black hover:brightness-110'}`}
            disabled={saving}
            onClick={save}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="border border-zinc-800 rounded p-3">
          <div className="font-semibold mb-2">Consultations</div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.enabledConsultations} onChange={e => setSettings(s => ({ ...(s as any), enabledConsultations: e.target.checked }))} />
            Enable consultation reminders
          </label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400">Lead time (minutes)</label>
              <input
                type="number"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={settings.consultationLeadMinutes}
                min={0}
                max={1440}
                onChange={e => setSettings(s => ({ ...(s as any), consultationLeadMinutes: Number(e.target.value || 0) }))}
              />
              <div className="text-[11px] text-zinc-500 mt-1">Example: 60 means "notify within the next hour".</div>
            </div>
          </div>
        </div>

        <div className="border border-zinc-800 rounded p-3">
          <div className="font-semibold mb-2">Parts expected delivery</div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.enabledPartsDelivery} onChange={e => setSettings(s => ({ ...(s as any), enabledPartsDelivery: e.target.checked }))} />
            Enable expected delivery notifications
          </label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400">Lookahead (days)</label>
              <input
                type="number"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={settings.partsDeliveryLookaheadDays}
                min={0}
                max={365}
                onChange={e => setSettings(s => ({ ...(s as any), partsDeliveryLookaheadDays: Number(e.target.value || 0) }))}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400">Overdue</label>
              <label className="flex items-center gap-2 text-sm mt-2">
                <input type="checkbox" checked={settings.includeOverduePartsDelivery} onChange={e => setSettings(s => ({ ...(s as any), includeOverduePartsDelivery: e.target.checked }))} />
                Include overdue deliveries
              </label>
            </div>
          </div>
        </div>

        <div className="border border-zinc-800 rounded p-3">
          <div className="font-semibold mb-2">Calendar events</div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.enabledEvents} onChange={e => setSettings(s => ({ ...(s as any), enabledEvents: e.target.checked }))} />
            Enable event reminders
          </label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400">Lead time (minutes)</label>
              <input
                type="number"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={settings.eventLeadMinutes}
                min={0}
                max={1440}
                onChange={e => setSettings(s => ({ ...(s as any), eventLeadMinutes: Number(e.target.value || 0) }))}
              />
            </div>
          </div>
        </div>

        <div className="border border-zinc-800 rounded p-3">
          <div className="font-semibold mb-2">Technicians</div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.enabledTechScheduleChanges} onChange={e => setSettings(s => ({ ...(s as any), enabledTechScheduleChanges: e.target.checked }))} />
            Notify when a technician schedule changes
          </label>
          <div className="text-[11px] text-zinc-500 mt-1">Detected on this computer when Admin updates schedules.</div>
        </div>

        <div className="border border-zinc-800 rounded p-3">
          <div className="font-semibold mb-2">Daily Look</div>
          <div className="text-xs text-zinc-400 mb-2">Send a daily digest of today’s calendar items into Notifications.</div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.enabledDailyLook} onChange={e => setSettings(s => ({ ...(s as any), enabledDailyLook: e.target.checked }))} />
            Enable Daily Look digest
          </label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400">Time of day</label>
              <input
                type="time"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={settings.dailyLookTimeLocal || '10:00'}
                onChange={e => setSettings(s => ({ ...(s as any), dailyLookTimeLocal: e.target.value }))}
                disabled={!settings.enabledDailyLook}
              />
              <div className="text-[11px] text-zinc-500 mt-1">Example: 10:00 sends today’s list at 10 AM.</div>
            </div>
            <div>
              <label className="block text-xs text-zinc-400">On open</label>
              <label className="flex items-center gap-2 text-sm mt-2">
                <input
                  type="checkbox"
                  checked={settings.dailyLookOnOpen !== false}
                  onChange={e => setSettings(s => ({ ...(s as any), dailyLookOnOpen: e.target.checked }))}
                  disabled={!settings.enabledDailyLook}
                />
                Also send when app opens
              </label>
              <div className="text-[11px] text-zinc-500 mt-1">If the time already passed, it’ll send on open automatically.</div>
            </div>
          </div>
        </div>

        <div className="border border-zinc-800 rounded p-3">
          <div className="font-semibold mb-2">Rules</div>
          <div className="text-xs text-zinc-400 mb-2">Control when reminders can be generated.</div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={settings.quietHoursEnabled} onChange={e => setSettings(s => ({ ...(s as any), quietHoursEnabled: e.target.checked }))} />
            Enable quiet hours
          </label>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400">Quiet starts</label>
              <input
                type="time"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={settings.quietHoursStartLocal || '20:00'}
                onChange={e => setSettings(s => ({ ...(s as any), quietHoursStartLocal: e.target.value }))}
                disabled={!settings.quietHoursEnabled}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400">Quiet ends</label>
              <input
                type="time"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={settings.quietHoursEndLocal || '08:00'}
                onChange={e => setSettings(s => ({ ...(s as any), quietHoursEndLocal: e.target.value }))}
                disabled={!settings.quietHoursEnabled}
              />
            </div>
          </div>
          <div className="text-[11px] text-zinc-500 mt-2">During quiet hours, the app won’t generate new notifications (consultations, events, parts, Daily Look, or schedule changes).</div>
        </div>

        <div className="border border-zinc-800 rounded p-3">
          <div className="font-semibold mb-2">Cleanup</div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-zinc-400">Keep unread (days)</label>
              <input
                type="number"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={settings.keepUnreadDays}
                min={1}
                max={365}
                onChange={e => setSettings(s => ({ ...(s as any), keepUnreadDays: Number(e.target.value || 30) }))}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400">Purge read after (days)</label>
              <input
                type="number"
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={settings.purgeReadAfterDays}
                min={0}
                max={365}
                onChange={e => setSettings(s => ({ ...(s as any), purgeReadAfterDays: Number(e.target.value || 14) }))}
              />
              <div className="text-[11px] text-zinc-500 mt-1">0 disables auto-purge.</div>
            </div>
          </div>
        </div>

        <div className="border border-zinc-800 rounded p-3">
          <div className="font-semibold mb-2">Test</div>
          <div className="text-xs text-zinc-400 mb-2">Regenerate notifications right now from the Calendar.</div>
          <button
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm"
            onClick={async () => {
              try { await syncNotificationsFromCalendar(); } catch {}
            }}
          >
            Run sync now
          </button>
        </div>
      </div>
    </div>
  );
};

export default NotificationSettingsWindow;
