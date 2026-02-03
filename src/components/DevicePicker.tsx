import React, { useEffect, useMemo, useRef, useState } from 'react';

type DeviceCat = { id?: number; name: string; title?: string };

interface DevicePickerProps {
  value: string;
  onChange: (value: string) => void; // called when a device is chosen
  onTitleSelect?: (title: string) => void; // called when a title (main category) is clicked
  className?: string;
}

// A hoverable two-level dropdown: Titles on left, Devices (by Title) on right.
// Limits visible rows to 10 with scroll.
const DevicePicker: React.FC<DevicePickerProps> = ({ value, onChange, onTitleSelect, className }) => {
  const [open, setOpen] = useState(false);
  const [cats, setCats] = useState<DeviceCat[]>([]);
  const [activeTitle, setActiveTitle] = useState<string>('');
  const [submenuTop, setSubmenuTop] = useState<number>(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    (async () => {
      try {
        const list = await (window as any).api.getDeviceCategories();
        setCats(Array.isArray(list) ? list : []);
      } catch (e) { setCats([]); }
    })();
  }, []);

  // Reload categories any time the menu is opened to reflect latest changes
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const list = await (window as any).api.getDeviceCategories();
        setCats(Array.isArray(list) ? list : []);
      } catch (e) { /* ignore */ }
    })();
  }, [open]);

  // React to global device categories change events
  useEffect(() => {
    const off = (window as any).api?.onDeviceCategoriesChanged?.(async () => {
      try {
        const list = await (window as any).api.getDeviceCategories();
        setCats(Array.isArray(list) ? list : []);
      } catch (e) { /* ignore */ }
    });
    return () => { if (off) off(); };
  }, []);

  const UNASSIGNED_TITLE_LABEL = '(Unassigned)';
  const titles = useMemo(() => {
    const list = Array.isArray(cats) ? cats : [];
    const set = new Set<string>();
    let hasUnassigned = false;
    for (const c of list) {
      if (c && typeof c.title === 'string' && c.title.trim()) set.add(c.title.trim());
      else hasUnassigned = true;
    }
    const arr = Array.from(set.values()).sort((a, b) => a.localeCompare(b));
    if (hasUnassigned) arr.unshift(UNASSIGNED_TITLE_LABEL);
    return arr;
  }, [cats]);
  // Build devices by Title for hover submenu
  const devicesByTitle = useMemo(() => {
    const map = new Map<string, DeviceCat[]>();
    for (const c of cats) {
      const t = (c.title && c.title.trim()) ? c.title.trim() : UNASSIGNED_TITLE_LABEL;
      if (!map.has(t)) map.set(t, []);
      map.get(t)!.push(c);
    }
    // Sort devices by name
    for (const [k, arr] of map.entries()) {
      map.set(k, arr.slice().sort((a, b) => (a.name || '').localeCompare(b.name || '')));
    }
    return map;
  }, [cats]);

  // Close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!btnRef.current) return;
      const target = e.target as Node;
      if (!btnRef.current.parentElement?.contains(target)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const selectedLabel = value && value.trim() ? value.trim() : 'Categories';
  const TITLE_MENU_WIDTH = 220; // px

  return (
    <div ref={wrapperRef} className={`relative inline-block text-left ${className || ''}`}>
      <button
        ref={btnRef}
        type="button"
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-left"
        onClick={() => setOpen(o => !o)}
      >
        {selectedLabel}
      </button>

      {open && (
        <>
        {/* Main Titles dropdown */}
        <div ref={menuRef} className="absolute z-50 mt-1 bg-zinc-900 border border-zinc-700 rounded shadow-lg" style={{ minWidth: TITLE_MENU_WIDTH }}>
          <div className="max-h-64 overflow-y-auto">
            <ul>
              {titles.length === 0 && (
                <li className="px-2 py-1 text-zinc-500 text-sm">No titles</li>
              )}
              {titles.map(t => (
                <li
                  key={t}
                  className={`relative px-2 py-1 text-sm cursor-pointer hover:bg-zinc-800 ${activeTitle === t ? 'bg-zinc-800' : ''}`}
                  onMouseEnter={(e) => {
                    setActiveTitle(t);
                    try {
                      const rowRect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      const menuRect = menuRef.current?.getBoundingClientRect();
                      if (menuRect) setSubmenuTop(rowRect.top - menuRect.top);
                    } catch {}
                  }}
                  onClick={() => {
                    if (typeof (onTitleSelect) === 'function') {
                      onTitleSelect(t);
                      setOpen(false);
                    }
                  }}
                >
                  <div className="flex items-center justify-between">
                    <span>{t}</span>
                    <span className="text-zinc-500">›</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
        {/* Separate Devices submenu aligned to hovered row */}
        {activeTitle && (
          <div
            className="absolute z-50 mt-1 bg-zinc-900 border border-zinc-700 rounded shadow-lg w-64 max-h-64 overflow-y-auto"
            style={{ left: TITLE_MENU_WIDTH + 4, top: submenuTop }}
            onMouseEnter={() => {/* keep open while hovering submenu */}}
          >
            <ul>
              {(devicesByTitle.get(activeTitle) || []).map((d, idx) => (
                <li
                  key={(d.id ?? idx) + '-' + d.name}
                  className="px-2 py-1 text-sm cursor-pointer hover:bg-zinc-800 whitespace-nowrap"
                  onClick={() => { onChange(d.name); setOpen(false); }}
                >
                  {d.name}
                </li>
              ))}
            </ul>
          </div>
        )}
        </>
      )}
    </div>
  );
};

export default DevicePicker;