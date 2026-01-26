import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export type ContextMenuItem =
	| { type?: 'item'; label: string; onClick?: () => void | Promise<void>; disabled?: boolean; danger?: boolean; hint?: string }
	| { type: 'separator' }
	| { type: 'header'; label: string };

function isInteractive(item: ContextMenuItem): item is Extract<ContextMenuItem, { type?: 'item' }> {
	return !('type' in item) || item.type === 'item';
}

export default function ContextMenu(props: {
	open: boolean;
	x: number;
	y: number;
	items: ContextMenuItem[];
	onClose: () => void;
	minWidth?: number;
	id?: string;
}) {
	const { open, x, y, items, onClose, minWidth = 240, id = 'ctx-menu' } = props;
	const menuRef = useRef<HTMLDivElement | null>(null);
	const [pos, setPos] = useState<{ left: number; top: number }>({ left: x, top: y });

	const hasItems = useMemo(() => items.some(it => (it as any)?.type !== 'separator'), [items]);

	useLayoutEffect(() => {
		if (!open) return;
		// Start with the raw click position, then clamp after measuring.
		setPos({ left: x, top: y });
	}, [open, x, y]);

	useLayoutEffect(() => {
		if (!open) return;
		const el = menuRef.current;
		if (!el) return;

		const rect = el.getBoundingClientRect();
		const vw = typeof window !== 'undefined' ? window.innerWidth : rect.width;
		const vh = typeof window !== 'undefined' ? window.innerHeight : rect.height;
		const pad = 8;

		const left = Math.max(pad, Math.min(pos.left, vw - rect.width - pad));
		const top = Math.max(pad, Math.min(pos.top, vh - rect.height - pad));

		if (left !== pos.left || top !== pos.top) setPos({ left, top });
	}, [open, pos.left, pos.top]);

	useLayoutEffect(() => {
		if (!open) return;
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === 'Escape') onClose();
		};
		window.addEventListener('keydown', onKeyDown);
		return () => window.removeEventListener('keydown', onKeyDown);
	}, [open, onClose]);

	if (!open || !hasItems) return null;

	return createPortal(
		<>
			<div className="fixed inset-0 z-40" onMouseDown={onClose} />
			<div
				id={id}
				ref={menuRef}
				className="fixed z-50 bg-zinc-900 border border-zinc-700 rounded shadow-xl py-1"
				style={{ left: pos.left, top: pos.top, minWidth }}
				role="menu"
			>
				{items.map((it, idx) => {
					if ((it as any).type === 'separator') {
						return <div key={`sep-${idx}`} className="my-1 border-t border-zinc-800" />;
					}
					if ((it as any).type === 'header') {
						return (
							<div key={`hdr-${idx}`} className="px-3 py-2 text-xs text-zinc-400 select-none">
								{(it as any).label}
							</div>
						);
					}

					const item = it as Extract<ContextMenuItem, { type?: 'item' }>;
					const disabled = !!item.disabled;
					const danger = !!item.danger;

					return (
						<button
							key={`it-${idx}`}
							className={
								`w-full text-left px-3 py-2 flex items-center justify-between gap-3 ` +
								(disabled
									? 'opacity-50 cursor-not-allowed'
									: danger
										? 'hover:bg-red-900/50 text-red-300'
										: 'hover:bg-zinc-800')
							}
							disabled={disabled}
							onClick={async () => {
								if (disabled) return;
								try {
									await item.onClick?.();
								} finally {
									onClose();
								}
							}}
							role={isInteractive(item) ? 'menuitem' : undefined}
						>
							<span>{item.label}</span>
							{item.hint ? <span className="text-xs text-zinc-500">{item.hint}</span> : null}
						</button>
					);
				})}
			</div>
		</>,
		document.body
	);
}
