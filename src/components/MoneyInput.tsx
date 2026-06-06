import React, { useEffect, useMemo, useRef, useState } from 'react';

function extractDigits(s: string): string {
  return String(s || '').replace(/\D+/g, '');
}

function digitsToMoney(digits: string): number {
  const d = extractDigits(digits);
  if (!d) return 0;
  const cents = Number.parseInt(d, 10);
  if (!Number.isFinite(cents) || cents < 0) return 0;
  return cents / 100;
}

function moneyToDigits(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  const cents = Math.round(value * 100);
  return String(Math.max(0, cents));
}

function formatDigits(digits: string): string {
  const d = extractDigits(digits);
  if (!d) return '0.00';
  const cents = Number.parseInt(d, 10);
  if (!Number.isFinite(cents) || cents < 0) return '0.00';
  const dollars = Math.floor(cents / 100);
  const c = cents % 100;
  return `${dollars}.${String(c).padStart(2, '0')}`;
}

export interface MoneyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type' | 'inputMode'> {
  value?: number;
  onValueChange: (value: number | undefined) => void;
  allowEmpty?: boolean;
  maxDigits?: number;
}

const MoneyInput: React.FC<MoneyInputProps> = ({
  value,
  onValueChange,
  allowEmpty = false,
  maxDigits = 12,
  className,
  ...rest
}) => {
  const [focused, setFocused] = useState(false);
  const [digits, setDigits] = useState<string>(() => {
    if (value == null) return allowEmpty ? '' : '0';
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) return allowEmpty ? '' : '0';
    return moneyToDigits(n);
  });

  const lastPropValueRef = useRef<number | undefined>(value);

  useEffect(() => {
    if (focused) return;
    if (lastPropValueRef.current === value) return;
    lastPropValueRef.current = value;

    if (value == null) {
      setDigits(allowEmpty ? '' : '0');
      return;
    }
    const n = Number(value);
    if (!Number.isFinite(n) || n === 0) {
      setDigits(allowEmpty ? '' : '0');
      return;
    }
    setDigits(moneyToDigits(n));
  }, [value, focused, allowEmpty]);

  const display = useMemo(() => {
    if (allowEmpty && digits === '') return '';
    return formatDigits(digits);
  }, [digits, allowEmpty]);

  const commit = (nextDigits: string) => {
    const normalized = extractDigits(nextDigits).slice(0, maxDigits);
    if (allowEmpty && normalized.length === 0) {
      setDigits('');
      onValueChange(undefined);
      return;
    }
    const finalDigits = normalized.length ? normalized : '0';
    setDigits(finalDigits);
    onValueChange(digitsToMoney(finalDigits));
  };

  return (
    <input
      {...rest}
      inputMode="numeric"
      type="text"
      className={className}
      value={display}
      onFocus={(e) => {
        setFocused(true);
        rest.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        // Ensure we never leave a visually-invalid value behind.
        if (!allowEmpty && digits === '') commit('0');
        rest.onBlur?.(e);
      }}
      onKeyDown={(e) => {
        rest.onKeyDown?.(e);
        if (e.defaultPrevented) return;

        const k = e.key;
        if (e.ctrlKey || e.metaKey) return;
        if (k === 'Escape') return;
        if (k === 'Tab' || k === 'Enter' || k.startsWith('Arrow')) return;
        if (k === 'Home' || k === 'End') return;

        if (k === 'Backspace') {
          e.preventDefault();
          commit(digits.slice(0, -1));
          return;
        }
        if (k === 'Delete') {
          e.preventDefault();
          commit('0');
          return;
        }

        if (k.length === 1 && /\d/.test(k)) {
          e.preventDefault();
          const next = (digits === '0' && !allowEmpty) ? k : (digits + k);
          commit(next);
          return;
        }

        // Ignore decimal separator and any other characters.
        if (k === '.' || k === ',') {
          e.preventDefault();
          return;
        }

        e.preventDefault();
      }}
      onPaste={(e) => {
        rest.onPaste?.(e);
        if (e.defaultPrevented) return;
        e.preventDefault();
        const text = e.clipboardData?.getData('text') || '';
        const next = extractDigits(text);
        commit(next);
      }}
      onChange={() => {
        // Intentionally ignored: this input is driven by key events.
      }}
    />
  );
};

export default MoneyInput;
