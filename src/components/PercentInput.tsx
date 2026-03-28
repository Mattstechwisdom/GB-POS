import React, { useId, useRef } from 'react';

const PRESETS = [5, 10, 15, 20, 25, 30, 40, 50, 75, 100];

interface Props {
  value: string | number;
  onChange: (pct: string) => void;
  presets?: number[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * A single number input with a built-in datalist of preset percentage options.
 * Typing any value works directly; clicking the dropdown arrow shows presets.
 * Shows the % symbol inline.
 */
const PercentInput: React.FC<Props> = ({
  value,
  onChange,
  presets = PRESETS,
  placeholder = '0',
  className = '',
  disabled = false,
}) => {
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="relative flex items-center">
      <input
        ref={inputRef}
        type="number"
        list={listId}
        min="0"
        max="100"
        step="0.5"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={`pr-5 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm focus:border-[#39FF14] focus:outline-none ${className}`}
      />
      <span className="absolute right-2 text-xs text-zinc-400 pointer-events-none">%</span>
      <datalist id={listId}>
        {presets.map(p => (
          <option key={p} value={p} />
        ))}
      </datalist>
    </div>
  );
};

export default PercentInput;
