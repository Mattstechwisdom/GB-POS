import { useCallback, useState } from 'react';

export type ContextMenuState<T> = {
	open: boolean;
	x: number;
	y: number;
	data: T | null;
};

export function useContextMenu<T>() {
	const [state, setState] = useState<ContextMenuState<T>>({ open: false, x: 0, y: 0, data: null });

	const openAt = useCallback((x: number, y: number, data: T) => {
		setState({ open: true, x, y, data });
	}, []);

	const openFromEvent = useCallback((e: { preventDefault?: () => void; clientX: number; clientY: number }, data: T) => {
		try { e.preventDefault?.(); } catch {}
		openAt(e.clientX, e.clientY, data);
	}, [openAt]);

	const close = useCallback(() => {
		setState(s => ({ ...s, open: false }));
	}, []);

	return { state, openAt, openFromEvent, close, setState };
}
