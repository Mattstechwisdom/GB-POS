import { useCallback, useState } from 'react';

export type ContextMenuState<T> = {
	open: boolean;
	x: number;
	y: number;
	data: T | null;
};

export function useContextMenu<T>() {
	const [state, setState] = useState<ContextMenuState<T>>({ open: false, x: 0, y: 0, data: null });

	const getCoords = useCallback((e: any): { x: number; y: number } => {
		let x = 0;
		let y = 0;
		try {
			x = Number(e?.clientX ?? 0) || 0;
			y = Number(e?.clientY ?? 0) || 0;
		} catch {
			x = 0;
			y = 0;
		}

		// React synthetic events sometimes provide better coords on nativeEvent.
		if ((!x && !y) && e?.nativeEvent) {
			try {
				x = Number(e.nativeEvent.clientX ?? e.nativeEvent.pageX ?? 0) || 0;
				y = Number(e.nativeEvent.clientY ?? e.nativeEvent.pageY ?? 0) || 0;
			} catch {}
		}

		// Fallback: some contextmenu events report pageX/pageY.
		if ((!x && !y) && (e?.pageX || e?.pageY)) {
			try {
				x = Number(e.pageX ?? 0) || 0;
				y = Number(e.pageY ?? 0) || 0;
			} catch {}
		}

		// Last resort: anchor to the element we right-clicked.
		if (!x && !y && e?.currentTarget && typeof e.currentTarget.getBoundingClientRect === 'function') {
			try {
				const rect = e.currentTarget.getBoundingClientRect();
				x = Math.round((rect.left || 0) + 12);
				y = Math.round((rect.top || 0) + 12);
			} catch {}
		}

		return { x, y };
	}, []);

	const openAt = useCallback((x: number, y: number, data: T) => {
		setState({ open: true, x, y, data });
	}, []);

	const openFromEvent = useCallback((e: any, data: T) => {
		try { e.preventDefault?.(); } catch {}
		const { x, y } = getCoords(e);
		openAt(x, y, data);
	}, [getCoords, openAt]);

	const close = useCallback(() => {
		setState(s => ({ ...s, open: false }));
	}, []);

	return { state, openAt, openFromEvent, close, setState };
}
