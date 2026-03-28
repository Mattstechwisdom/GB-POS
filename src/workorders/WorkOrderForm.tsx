import React, { useEffect, useMemo, useRef, useState } from 'react';
import PatternLock from '../components/PatternLock';
import { WorkOrderFull } from '../lib/types';

type WorkOrderValidationFlags = Partial<Record<'productDescription' | 'problemInfo' | 'password' | 'model' | 'serial', boolean>>;

type DeviceCat = { id?: number; name: string; title?: string };

// ── Shared hook: loads + subscribes to deviceCategories ──────────────────────
function useDeviceCategories() {
  const [cats, setCats] = useState<DeviceCat[]>([]);
  const load = async () => {
    try {
      const list = await (window as any).api.getDeviceCategories();
      setCats(Array.isArray(list) ? list : []);
    } catch { setCats([]); }
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    const off = (window as any).api?.onDeviceCategoriesChanged?.(() => load());
    return () => { if (typeof off === 'function') off(); };
  }, []);
  return cats;
}

// ── Category dropdown (shows distinct title values) ───────────────────────────
const DeviceCategorySelect: React.FC<{
  value: string;
  onChange: (val: string) => void;
  cats: DeviceCat[];
}> = ({ value, onChange, cats }) => {
  const [inputVal, setInputVal] = useState(value);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep input in sync when parent value changes (e.g. device selection)
  useEffect(() => { setInputVal(value); }, [value]);

  const titles = useMemo(() => {
    const s = new Set<string>();
    for (const c of cats) { const t = (c?.title || '').trim(); if (t) s.add(t); }
    return Array.from(s).sort((a, b) => a.localeCompare(b));
  }, [cats]);

  const filtered = useMemo(() =>
    inputVal ? titles.filter(t => t.toLowerCase().includes(inputVal.toLowerCase())) : titles
  , [titles, inputVal]);

  return (
    <div className="mt-1 relative">
      <input
        ref={inputRef}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
        value={inputVal}
        placeholder="Type or select…"
        autoComplete="off"
        onChange={e => { setInputVal(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 bg-zinc-900 border border-zinc-700 mt-0.5 rounded shadow-lg max-h-40 overflow-y-auto">
          {filtered.map(t => (
            <li key={t}
              className="px-3 py-1.5 text-sm hover:bg-[#39FF14] hover:text-black cursor-pointer"
              onMouseDown={() => { onChange(t); setInputVal(t); setOpen(false); inputRef.current?.blur(); }}
            >{t}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

// ── Device field (shows names within selected category) ───────────────────────
const DeviceSelect: React.FC<{
  category: string;
  value: string;
  onChange: (deviceName: string, categoryIfNew?: string) => void;
  cats: DeviceCat[];
}> = ({ category, value, onChange, cats }) => {
  const [inputVal, setInputVal] = useState(value);
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setInputVal(value); }, [value]);

  const devices = useMemo(() => {
    const trimCat = category.trim().toLowerCase();
    const filtered = cats.filter(c => (c.title || '').trim().toLowerCase() === trimCat);
    const names = Array.from(new Set(filtered.map(c => (c.name || '').trim()).filter(Boolean)));
    return names.sort((a, b) => a.localeCompare(b));
  }, [cats, category]);

  const filtered = useMemo(() =>
    inputVal ? devices.filter(d => d.toLowerCase().includes(inputVal.toLowerCase())) : devices
  , [devices, inputVal]);

  const handleSelect = (name: string) => {
    setInputVal(name);
    setOpen(false);
    inputRef.current?.blur();
    // Does this name exist in the DB? If not, don't pass a categoryIfNew
    const exists = cats.some(c => (c.name || '').trim() === name);
    onChange(name, exists ? undefined : category || undefined);
  };

  return (
    <div className="mt-1 relative">
      <input
        ref={inputRef}
        className="w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm"
        value={inputVal}
        placeholder={category ? `Device in ${category}…` : 'Type device name…'}
        autoComplete="off"
        onChange={e => {
          const v = e.target.value;
          setInputVal(v);
          setOpen(true);
          // If user clears or types something not in dropdown, still propagate
          const exists = cats.some(c => (c.name || '').trim() === v);
          onChange(v, exists ? undefined : (category || undefined));
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-20 left-0 right-0 bg-zinc-900 border border-zinc-700 mt-0.5 rounded shadow-lg max-h-40 overflow-y-auto">
          {filtered.map(d => (
            <li key={d}
              className="px-3 py-1.5 text-sm hover:bg-[#39FF14] hover:text-black cursor-pointer"
              onMouseDown={() => handleSelect(d)}
            >{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
};

interface Props {
  workOrder: WorkOrderFull;
  onChange: (patch: Partial<WorkOrderFull>) => void;
  validationFlags?: WorkOrderValidationFlags;
  mode?: 'standard' | 'customBuild';
}

function sameValidationFlags(a?: WorkOrderValidationFlags, b?: WorkOrderValidationFlags) {
  return !!a?.productDescription === !!b?.productDescription
    && !!a?.problemInfo === !!b?.problemInfo
    && !!a?.password === !!b?.password
    && !!a?.model === !!b?.model
    && !!a?.serial === !!b?.serial;
}

const WorkOrderForm: React.FC<Props> = ({ workOrder, onChange, validationFlags, mode = 'standard' }) => {
  const needsProductDescription = !!validationFlags?.productDescription;
  const needsProblem = !!validationFlags?.problemInfo;
  const needsPassword = !!validationFlags?.password;
  const needsModel = !!validationFlags?.model;
  const needsSerial = !!validationFlags?.serial;
  const needsAnyItemFields = needsProductDescription || needsProblem || needsPassword || needsModel || needsSerial;

  const isCustomBuild = mode === 'customBuild';
  const headerLabel = isCustomBuild ? 'Custom PC Build' : 'Item / Problem';
  const descriptionLabel = isCustomBuild ? 'Build summary' : 'Device name / description';
  const problemLabel = isCustomBuild ? 'Requirements / Additional info' : 'Problem / Additional info';

  const cats = useDeviceCategories();

  // Local state for free-text inputs — prevents per-keystroke parent re-renders.
  // Parent is updated on blur rather than on every change.
  const [localProblemInfo, setLocalProblemInfo] = useState(workOrder.problemInfo || '');
  const [localPassword, setLocalPassword] = useState(workOrder.password || '');
  const [localModel, setLocalModel] = useState(workOrder.model || '');
  const [localSerial, setLocalSerial] = useState(workOrder.serial || '');
  const [localCustomDesc, setLocalCustomDesc] = useState(workOrder.productDescription || '');

  // Sync local fields when the parent changes them externally (e.g. loading a different work order).
  // Use functional setter so React skips the re-render when the value hasn't actually changed.
  useEffect(() => { setLocalProblemInfo(v => v === (workOrder.problemInfo || '') ? v : (workOrder.problemInfo || '')); }, [workOrder.problemInfo]);
  useEffect(() => { setLocalPassword(v => v === (workOrder.password || '') ? v : (workOrder.password || '')); }, [workOrder.password]);
  useEffect(() => { setLocalModel(v => v === (workOrder.model || '') ? v : (workOrder.model || '')); }, [workOrder.model]);
  useEffect(() => { setLocalSerial(v => v === (workOrder.serial || '') ? v : (workOrder.serial || '')); }, [workOrder.serial]);
  useEffect(() => { setLocalCustomDesc(v => v === (workOrder.productDescription || '') ? v : (workOrder.productDescription || '')); }, [workOrder.productDescription]);

  return (
    <div className="bg-zinc-900 border border-zinc-700 rounded p-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-zinc-200">
          {headerLabel}
          {needsAnyItemFields && <span className="ml-1 text-red-500">*</span>}
        </h3>
        <div className="text-xs text-zinc-400">{isCustomBuild ? 'Build info' : 'Product info'}</div>
      </div>

      {!isCustomBuild && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          <div>
            <label className="block text-xs text-zinc-400">Device Category</label>
            <DeviceCategorySelect
              value={workOrder.productCategory}
              cats={cats}
              onChange={val => onChange({ productCategory: val })}
            />
          </div>
          <div className="col-span-2">
            <label className="block text-xs text-zinc-400">
              Device
              {needsProductDescription && <span className="ml-1 text-red-500">*</span>}
            </label>
            <DeviceSelect
              category={workOrder.productCategory}
              value={workOrder.productDescription}
              cats={cats}
              onChange={(deviceName, categoryIfNew) => {
                const patch: Partial<WorkOrderFull> = { productDescription: deviceName };
                // If user typed a brand-new device name, also back-fill the category
                if (categoryIfNew && !workOrder.productCategory.trim()) {
                  patch.productCategory = categoryIfNew;
                }
                onChange(patch);
              }}
            />
          </div>
        </div>
      )}

      {isCustomBuild && (
        <div className="mb-2">
          <label className="block text-xs text-zinc-400">
            {descriptionLabel}
            {needsProductDescription && <span className="ml-1 text-red-500">*</span>}
          </label>
          <input
            className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
            value={localCustomDesc}
            onChange={e => setLocalCustomDesc(e.target.value)}
            onBlur={e => onChange({ productDescription: e.target.value })}
          />
        </div>
      )}

      <div className="mb-2">
        <label className="block text-xs text-zinc-400">
          {problemLabel}
          {needsProblem && <span className="ml-1 text-red-500">*</span>}
        </label>
        <textarea
          className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 h-16"
          value={localProblemInfo}
          onChange={e => setLocalProblemInfo(e.target.value)}
          onBlur={e => onChange({ problemInfo: e.target.value })}
        />
      </div>

      {!isCustomBuild && (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-xs text-zinc-400">
                Password
                {needsPassword && <span className="ml-1 text-red-500">*</span>}
              </label>
              <input
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={localPassword}
                onChange={e => setLocalPassword(e.target.value)}
                onBlur={e => onChange({ password: e.target.value })}
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-400">
                Model
                {needsModel && <span className="ml-1 text-red-500">*</span>}
              </label>
              <input
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={localModel}
                onChange={e => setLocalModel(e.target.value)}
                onBlur={e => onChange({ model: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-400">
                Serial
                {needsSerial && <span className="ml-1 text-red-500">*</span>}
              </label>
              <input
                className="w-full mt-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1"
                value={localSerial}
                onChange={e => setLocalSerial(e.target.value)}
                onBlur={e => onChange({ serial: e.target.value })}
              />
            </div>
          </div>

          <PatternSection workOrder={workOrder} onChange={onChange} />
        </>
      )}
    </div>
  );
};

export default React.memo(WorkOrderForm, (prev, next) => {
  const a = prev.workOrder;
  const b = next.workOrder;
  const patternA = Array.isArray((a as any).patternSequence) ? ((a as any).patternSequence as any[]).join(',') : '';
  const patternB = Array.isArray((b as any).patternSequence) ? ((b as any).patternSequence as any[]).join(',') : '';
  return prev.mode === next.mode
    && sameValidationFlags(prev.validationFlags, next.validationFlags)
    && String(a.productCategory || '') === String(b.productCategory || '')
    && String(a.productDescription || '') === String(b.productDescription || '')
    && String(a.problemInfo || '') === String(b.problemInfo || '')
    && String(a.password || '') === String(b.password || '')
    && String(a.model || '') === String(b.model || '')
    && String(a.serial || '') === String(b.serial || '')
    && patternA === patternB;
});

const PatternSection: React.FC<{ workOrder: WorkOrderFull; onChange: (patch: Partial<WorkOrderFull>) => void }> = ({ workOrder, onChange }) => {
  const [enabled, setEnabled] = useState<boolean>(() => Array.isArray((workOrder as any).patternSequence) && (workOrder as any).patternSequence.length > 0);
  const seq = (workOrder as any).patternSequence as number[] | undefined;

  if (!enabled) {
    return (
      <div className="mt-2">
        <button
          type="button"
          className="text-xs px-2 py-1 border border-zinc-700 rounded bg-zinc-800 hover:bg-zinc-700"
          onClick={() => setEnabled(true)}
        >
          Add unlock pattern
        </button>
      </div>
    );
  }

  return (
    <div className="mt-2">
      <label className="block text-xs text-zinc-400 mb-1">Pattern (drag to set)</label>
      <div className="flex items-center gap-3">
        <PatternLock
          value={Array.isArray(seq) ? seq : []}
          onChange={(s) => onChange({ patternSequence: s as any })}
          size={140}
          dotRadius={7}
          strokeColor="#39FF14"
        />
        <div className="text-xs text-zinc-400">
          <div>• Drag from a dot; release to finish</div>
          <div>• Arrow shows the end of the path</div>
          <button
            type="button"
            className="mt-1 text-xs px-2 py-1 border border-zinc-700 rounded bg-zinc-800 hover:bg-zinc-700"
            onClick={() => { onChange({ patternSequence: [] as any }); setEnabled(false); }}
          >
            Remove pattern
          </button>
        </div>
      </div>
    </div>
  );
};
