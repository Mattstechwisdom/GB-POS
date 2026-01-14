import React, { useCallback, useMemo, useRef, useState } from 'react';

type Props = {
  value?: number[];
  onChange?: (seq: number[]) => void;
  size?: number;           // overall square size in px
  dotRadius?: number;      // dot radius in px
  strokeColor?: string;    // line color
  disabled?: boolean;
  showNumbers?: boolean;
};

const PatternLock: React.FC<Props> = ({
  value = [],
  onChange,
  size = 200,
  dotRadius = 10,
  strokeColor = '#39FF14',
  disabled = false,
  showNumbers = true,
}) => {
  const [seq, setSeq] = useState<number[]>(value);
  const [dragging, setDragging] = useState(false);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);

  const padding = 18;
  const grid = useMemo(() => {
    const step = (size - padding * 2) / 2;
    const dots: Array<{ x: number; y: number }> = [];
    for (let r = 0; r < 3; r++) {
      for (let c = 0; c < 3; c++) {
        dots.push({ x: padding + c * step, y: padding + r * step });
      }
    }
    return { step, dots };
  }, [size]);

  const pickDot = useCallback((clientX: number, clientY: number) => {
    if (!svgRef.current) return -1;
    const rect = svgRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    let hit = -1;
    const tol = dotRadius * 1.6;
    grid.dots.forEach((p, i) => {
      const dx = p.x - x;
      const dy = p.y - y;
      if (Math.hypot(dx, dy) <= tol) hit = i;
    });
    if (hit >= 0) return hit;
    setCursor({ x, y });
    return -1;
  }, [grid.dots, dotRadius]);

  const start = useCallback((cx: number, cy: number) => {
    if (disabled) return;
    setSeq([]);
    setDragging(true);
    const hit = pickDot(cx, cy);
    if (hit >= 0) setSeq([hit]);
  }, [disabled, pickDot]);

  const move = useCallback((cx: number, cy: number) => {
    if (!dragging || disabled) return;
    const hit = pickDot(cx, cy);
    if (hit >= 0 && !seq.includes(hit)) setSeq(s => [...s, hit]);
  }, [dragging, disabled, pickDot, seq]);

  const end = useCallback(() => {
    if (!dragging) return;
    setDragging(false);
    setCursor(null);
    onChange?.(seq);
  }, [dragging, onChange, seq]);

  const pathD = useMemo(() => {
    if (seq.length === 0) return '';
    const pts = seq.map(i => grid.dots[i]);
    const start = pts[0];
    const rest = pts.slice(1);
    let d = `M ${start.x} ${start.y}`;
    rest.forEach(p => { d += ` L ${p.x} ${p.y}`; });
    if (dragging && cursor) {
      d += ` L ${cursor.x} ${cursor.y}`;
    }
    return d;
  }, [seq, grid.dots, dragging, cursor]);

  return (
    <svg
      ref={svgRef}
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ touchAction: 'none', background: '#0b0b0b', border: '1px solid #262626', borderRadius: 8 }}
      onMouseDown={e => start(e.clientX, e.clientY)}
      onMouseMove={e => move(e.clientX, e.clientY)}
      onMouseUp={end}
      onMouseLeave={end}
      onTouchStart={e => {
        const t = e.touches[0];
        if (t) start(t.clientX, t.clientY);
      }}
      onTouchMove={e => {
        const t = e.touches[0];
        if (t) move(t.clientX, t.clientY);
      }}
      onTouchEnd={end}
    >
      <defs>
        <marker id="arrow-end" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill={strokeColor} />
        </marker>
      </defs>

      {/* grid lines (subtle) */}
      <g stroke="#1f2937" strokeWidth="1">
        <line x1={padding} y1={padding + grid.step} x2={size - padding} y2={padding + grid.step} />
        <line x1={padding} y1={padding + grid.step * 2} x2={size - padding} y2={padding + grid.step * 2} />
        <line x1={padding + grid.step} y1={padding} x2={padding + grid.step} y2={size - padding} />
        <line x1={padding + grid.step * 2} y1={padding} x2={padding + grid.step * 2} y2={size - padding} />
      </g>

      {/* connection path */}
      {pathD && (
        <path d={pathD} fill="none" stroke={strokeColor} strokeWidth={3} markerEnd={seq.length > 0 ? 'url(#arrow-end)' : undefined} />
      )}

      {/* dots */}
      {grid.dots.map((p, i) => {
        const index = seq.indexOf(i);
        const selected = index !== -1;
        return (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r={dotRadius + 2} fill={selected ? 'rgba(57,255,20,0.15)' : 'transparent'} />
            <circle cx={p.x} cy={p.y} r={dotRadius} fill={selected ? strokeColor : 'none'} stroke="#525252" strokeWidth={1} />
            {selected && showNumbers && (
              <text x={p.x} y={p.y + 4} textAnchor="middle" fontSize={dotRadius} fill="#000" fontFamily="Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial">
                {index + 1}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
};

export default PatternLock;
