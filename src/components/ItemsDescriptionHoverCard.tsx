import React from 'react';
import { createPortal } from 'react-dom';

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function computeCardSize(items: string, description: string, problem: string) {
  const maxLen = Math.max(items.length, description.length, problem.length);
  const widthExtra = Math.round((clamp(maxLen, 0, 300) / 300) * 320);
  const width = clamp(280 + widthExtra, 280, 640);

  const estLines = Math.ceil(items.length / 45) + Math.ceil(description.length / 45) + Math.ceil(problem.length / 45);
  const height = clamp(140 + estLines * 16, 160, 480);

  return { width, height };
}

export default function ItemsDescriptionHoverCard(props: {
  items: string;
  description: string;
  problem?: string;
  children: React.ReactNode;
  className?: string;
}) {
  const { items, description, problem, children, className } = props;

  const [pos, setPos] = React.useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [hoverAnchor, setHoverAnchor] = React.useState(false);
  const [hoverCard, setHoverCard] = React.useState(false);

  const open = hoverAnchor || hoverCard;

  const itemsText = (items || '').toString().trim();
  const descText = (description || '').toString().trim();
  const probText = (problem || '').toString().trim();
  const hasContent = !!(itemsText || descText || probText);

  const closeTimer = React.useRef<number | null>(null);
  const clearCloseTimer = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };

  React.useEffect(() => {
    return () => {
      clearCloseTimer();
    };
  }, []);

  const onAnchorEnter = (e: React.MouseEvent) => {
    if (!hasContent) return;
    clearCloseTimer();
    setHoverAnchor(true);
    setPos({ x: e.clientX, y: e.clientY });
  };

  const onAnchorMove = (e: React.MouseEvent) => {
    if (!open) return;
    setPos({ x: e.clientX, y: e.clientY });
  };

  const scheduleCloseAnchor = () => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => {
      setHoverAnchor(false);
    }, 60);
  };

  const card = (() => {
    if (!open) return null;
    if (!hasContent) return null;

    const { width, height } = computeCardSize(itemsText, descText, probText);

    const left = clamp(pos.x + 12, 8, window.innerWidth - width - 8);
    const top = clamp(pos.y + 12, 8, window.innerHeight - height - 8);

    return createPortal(
      <div
        className="fixed z-[9999]"
        style={{ left, top, width, maxHeight: height }}
        onMouseEnter={() => {
          clearCloseTimer();
          setHoverCard(true);
        }}
        onMouseLeave={() => {
          setHoverCard(false);
        }}
      >
        <div className="bg-zinc-900 border border-zinc-700 rounded-lg shadow-2xl p-3 overflow-auto">
          <div className="grid grid-cols-1 gap-2 text-[12px] text-zinc-200">
            <div>
              <div className="text-zinc-400">Items</div>
              <div className="whitespace-pre-wrap break-words">{itemsText || '—'}</div>
            </div>
            <div className="h-px bg-zinc-800" />
            <div>
              <div className="text-zinc-400">Description</div>
              <div className="whitespace-pre-wrap break-words">{descText || '—'}</div>
            </div>
            {probText ? (
              <>
                <div className="h-px bg-zinc-800" />
                <div>
                  <div className="text-zinc-400">Problem</div>
                  <div className="whitespace-pre-wrap break-words">{probText}</div>
                </div>
              </>
            ) : null}
          </div>
        </div>
      </div>,
      document.body
    );
  })();

  return (
    <div
      className={className}
      onMouseEnter={onAnchorEnter}
      onMouseMove={onAnchorMove}
      onMouseLeave={scheduleCloseAnchor}
    >
      {children}
      {card}
    </div>
  );
}
