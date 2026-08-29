import React from 'react';

export type TechnicianIconTheme = 'default' | 'neon' | 'matrix' | 'gothic';
export type TechnicianIconId =
  | 'default-robot' | 'default-rocket' | 'default-cat' | 'default-controller' | 'default-wrench' | 'default-headphones' | 'default-coffee' | 'default-star' | 'default-lightning' | 'default-satellite'
  | 'neon-arcade' | 'neon-sunset' | 'neon-skate' | 'neon-cassette' | 'neon-computer'
  | 'matrix-terminal' | 'matrix-skull' | 'matrix-eye' | 'matrix-ghost' | 'matrix-chip'
  | 'gothic-raven' | 'gothic-moon' | 'gothic-rose' | 'gothic-castle' | 'gothic-bat';

export type TechnicianIconDefinition = { id: TechnicianIconId; label: string; theme: TechnicianIconTheme; glyph: string };

export const TECHNICIAN_ICONS: TechnicianIconDefinition[] = [
  { id: 'default-robot', label: 'Robot', theme: 'default', glyph: '🤖' }, { id: 'default-rocket', label: 'Rocket', theme: 'default', glyph: '🚀' },
  { id: 'default-cat', label: 'Cat', theme: 'default', glyph: '🐱' }, { id: 'default-controller', label: 'Game Controller', theme: 'default', glyph: '🎮' },
  { id: 'default-wrench', label: 'Wrench', theme: 'default', glyph: '🔧' }, { id: 'default-headphones', label: 'Headphones', theme: 'default', glyph: '🎧' },
  { id: 'default-coffee', label: 'Coffee', theme: 'default', glyph: '☕' }, { id: 'default-star', label: 'Star', theme: 'default', glyph: '★' },
  { id: 'default-lightning', label: 'Lightning', theme: 'default', glyph: '⚡' }, { id: 'default-satellite', label: 'Satellite', theme: 'default', glyph: '🛰' },
  { id: 'neon-arcade', label: 'Arcade Cabinet', theme: 'neon', glyph: '▣' }, { id: 'neon-sunset', label: 'Synthwave Sunset', theme: 'neon', glyph: '◒' },
  { id: 'neon-skate', label: 'Neon Roller Skate', theme: 'neon', glyph: '➟' }, { id: 'neon-cassette', label: 'Cassette Tape', theme: 'neon', glyph: '▤' },
  { id: 'neon-computer', label: 'Retro Computer', theme: 'neon', glyph: '▰' },
  { id: 'matrix-terminal', label: 'Glitched Terminal', theme: 'matrix', glyph: '>_' }, { id: 'matrix-skull', label: 'Digital Skull', theme: 'matrix', glyph: '☠' },
  { id: 'matrix-eye', label: 'Code Eye', theme: 'matrix', glyph: '◉' }, { id: 'matrix-ghost', label: 'Data Ghost', theme: 'matrix', glyph: '♙' },
  { id: 'matrix-chip', label: 'Corrupted Chip', theme: 'matrix', glyph: '▦' },
  { id: 'gothic-raven', label: 'Raven', theme: 'gothic', glyph: '♠' }, { id: 'gothic-moon', label: 'Crescent Moon', theme: 'gothic', glyph: '☾' },
  { id: 'gothic-rose', label: 'Gothic Rose', theme: 'gothic', glyph: '✥' }, { id: 'gothic-castle', label: 'Haunted Castle', theme: 'gothic', glyph: '♜' },
  { id: 'gothic-bat', label: 'Bat', theme: 'gothic', glyph: '⌁' },
];

export const DEFAULT_TECHNICIAN_ICON_ID: TechnicianIconId = 'default-robot';
const known = new Set<string>(TECHNICIAN_ICONS.map((item) => item.id));

export function resolveTechnicianIconId(value: unknown): TechnicianIconId {
  return known.has(String(value || '')) ? String(value) as TechnicianIconId : DEFAULT_TECHNICIAN_ICON_ID;
}

const palettes: Record<TechnicianIconTheme, { bg: string; ring: string; color: string }> = {
  default: { bg: '#27272a', ring: '#39ff14', color: '#f4f4f5' },
  neon: { bg: '#20002e', ring: '#ff3df2', color: '#31f7ff' },
  matrix: { bg: '#00150a', ring: '#00ff66', color: '#7dff9e' },
  gothic: { bg: '#120d18', ring: '#8b5cf6', color: '#e5d5ff' },
};

export function TechnicianAvatar({ iconId, size = 36, className = '', ariaLabel }: { iconId?: unknown; size?: number; className?: string; ariaLabel?: string }) {
  const definition = TECHNICIAN_ICONS.find((item) => item.id === resolveTechnicianIconId(iconId)) || TECHNICIAN_ICONS[0];
  const palette = palettes[definition.theme];
  return <svg width={size} height={size} viewBox="0 0 48 48" role="img" aria-label={ariaLabel || definition.label} className={className}>
    <circle cx="24" cy="24" r="22" fill={palette.bg} stroke={palette.ring} strokeWidth="2" />
    {definition.theme === 'matrix' ? <path d="M8 13h32M7 34h34" stroke={palette.ring} strokeWidth="1" opacity=".35" /> : null}
    {definition.theme === 'neon' ? <circle cx="24" cy="24" r="17" fill="none" stroke={palette.color} opacity=".25" /> : null}
    {definition.theme === 'gothic' ? <path d="M10 36Q24 26 38 36" fill="none" stroke={palette.ring} opacity=".35" /> : null}
    <text x="24" y="30" textAnchor="middle" fontSize={definition.glyph.length > 1 ? 15 : 23} fontFamily="Segoe UI Symbol, Apple Color Emoji, sans-serif" fontWeight="700" fill={palette.color}>{definition.glyph}</text>
  </svg>;
}

export function TechnicianIconPicker({ value, onChange }: { value?: unknown; onChange: (id: TechnicianIconId) => void }) {
  const selected = resolveTechnicianIconId(value);
  const labels: Record<TechnicianIconTheme, string> = { default: 'Default', neon: 'Neon Retro', matrix: 'Matrix Glitch', gothic: 'Gothic Dark' };
  return <div className="col-span-2 max-h-64 overflow-y-auto rounded border border-zinc-700 bg-zinc-950 p-2">
    <div className="mb-2 flex items-center gap-2"><TechnicianAvatar iconId={selected} size={42} /><span className="text-xs text-zinc-400">Profile icon</span></div>
    {(['default', 'neon', 'matrix', 'gothic'] as TechnicianIconTheme[]).map((theme) => <fieldset key={theme} className="mb-3 last:mb-0"><legend className="mb-1 text-[11px] font-bold uppercase tracking-wide text-zinc-400">{labels[theme]}</legend><div className="grid grid-cols-5 gap-1">{TECHNICIAN_ICONS.filter((icon) => icon.theme === theme).map((icon) => <button key={icon.id} type="button" title={icon.label} aria-label={icon.label} aria-pressed={selected === icon.id} onClick={() => onChange(icon.id)} className={`flex min-h-12 items-center justify-center rounded border p-1 ${selected === icon.id ? 'border-[#39FF14] bg-[#39FF14]/10' : 'border-zinc-700 hover:border-zinc-500'}`}><TechnicianAvatar iconId={icon.id} size={34} /></button>)}</div></fieldset>)}
  </div>;
}
