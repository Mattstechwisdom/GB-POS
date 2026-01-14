import React, { useEffect, useMemo, useRef, useState } from 'react';

type ComboInputProps = {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  className?: string;
};

// A lightweight, accessible-ish combobox that:
// - Opens suggestions automatically on focus
// - Filters as you type (case-insensitive substring)
// - Allows keyboard navigation (↑/↓/Enter/Escape)
// - Closes on blur/click outside
// - Keeps native input (free text) semantics
export const ComboInput: React.FC<ComboInputProps> = ({ value, onChange, options, placeholder, className }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => setQuery(value || ''), [value]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  // Close on outside click, and also if clicking inside dropdown background (not an option)
  useEffect(() => {
    function isOptionEl(el: HTMLElement | null): boolean {
      if (!el) return false;
      if ((el as any).dataset?.comboOption === '1') return true;
      return !!el.closest('[data-combo-option="1"]');
    }
    function onDocMouseDown(e: MouseEvent) {
      const target = e.target as HTMLElement | null;
      if (!rootRef.current) return;
      if (!rootRef.current.contains(target as Node)) {
        setOpen(false);
        return;
      }
      // If click occurs inside the dropdown container but not on an option, close so underlying fields become clickable on next click
      const dropdown = rootRef.current.querySelector('[data-combo-dropdown="1"]');
      if (dropdown && dropdown.contains(target as Node) && !isOptionEl(target!)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocMouseDown, true);
    return () => document.removeEventListener('mousedown', onDocMouseDown, true);
  }, []);

  function handleSelect(option: string) {
    onChange(option);
    setQuery(option);
    setOpen(false);
    setActiveIndex(-1);
    // Return focus to input for quick continued edits
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!open && (e.key === 'ArrowDown' || e.key === 'Enter')) {
      setOpen(true);
      e.preventDefault();
      return;
    }
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => {
        const next = Math.min((prev ?? -1) + 1, filtered.length - 1);
        return next;
      });
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => Math.max((prev ?? 0) - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = activeIndex >= 0 ? filtered[activeIndex] : (filtered[0] ?? query);
      if (pick != null) handleSelect(pick);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <input
        ref={inputRef}
        className={className || 'w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm'}
        value={query}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          setQuery(e.target.value);
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
      />
      {open && filtered.length > 0 && (
        <div data-combo-dropdown="1" className="absolute z-30 mt-1 w-full max-h-56 overflow-auto rounded border border-zinc-700 bg-zinc-800 shadow-lg">
          {filtered.map((opt, i) => (
            <div
              key={opt + i}
              data-combo-option="1"
              className={`px-2 py-1 text-sm cursor-pointer ${i === activeIndex ? 'bg-zinc-700 text-white' : 'text-zinc-100 hover:bg-zinc-700/70'}`}
              onMouseEnter={() => setActiveIndex(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(opt)}
              title={opt}
            >
              {opt}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ComboInput;
