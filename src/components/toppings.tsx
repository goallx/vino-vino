// SVG topping artwork — used both as builder chips (ToppingIcon)
// and as the scattered ingredients on the pizza illustration (PieMark).

interface Visual {
  color: string;
  dark: string;
  light?: string;
}

export const toppingVisual: Record<string, Visual> = {
  t_mushroom: { color: '#e7d4ad', dark: '#a9824f' },
  t_onion: { color: '#ead9f1', dark: '#9c6fb0' },
  t_olives: { color: '#33303a', dark: '#16131b' },
  t_corn: { color: '#f4c948', dark: '#d29a1d' },
  t_pepper: { color: '#43ad54', dark: '#2c7d3c' },
  t_jalapeno: { color: '#4caa3a', dark: '#357a27' },
  t_pineapple: { color: '#f4d44e', dark: '#cf9f22' },
  t_tomato: { color: '#e6533b', dark: '#b5331f' },
  t_bulgarit: { color: '#fbf7ef', dark: '#d9cdb6' },
  t_pepperoni: { color: '#c0392b', dark: '#7d211a', light: '#d65b4d' },
  t_salami: { color: '#a83246', dark: '#6e1f2e', light: '#f1d9dd' },
  t_goose: { color: '#8a5a3b', dark: '#5d3a24' },
  t_tuna: { color: '#e7b9a3', dark: '#c98f73' },
  t_chicken: { color: '#e0a85a', dark: '#a9762f' },
  t_extra_cheese: { color: '#f6cf6a', dark: '#d6a52f' },
};

/** Compact pie mark (~14px) scattered on the pizza. */
export function PieMark({ id, x, y, r = 7 }: { id: string; x: number; y: number; r?: number }) {
  const v = toppingVisual[id] ?? { color: '#cfa14e', dark: '#9c7426' };
  switch (id) {
    case 't_pepperoni':
    case 't_salami':
      return (
        <g transform={`translate(${x} ${y})`}>
          <circle r={r} fill={v.color} stroke={v.dark} strokeWidth="0.8" />
          <circle cx={-2} cy={-2} r="1" fill={v.light} opacity="0.8" />
          <circle cx={2.4} cy={1} r="1.1" fill={v.light} opacity="0.7" />
          <circle cx={-1} cy={2.6} r="0.8" fill={v.light} opacity="0.7" />
        </g>
      );
    case 't_olives':
      return (
        <g transform={`translate(${x} ${y})`}>
          <circle r={r - 1} fill={v.color} />
          <circle r={r - 4} fill="#7a4f2a" />
        </g>
      );
    case 't_onion':
      return (
        <g transform={`translate(${x} ${y})`} fill="none" stroke={v.dark} strokeWidth="1.4">
          <path d={`M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0`} />
          <path d={`M ${-r + 3} 0 A ${r - 3} ${r - 3} 0 0 1 ${r - 3} 0`} />
        </g>
      );
    case 't_mushroom':
      return (
        <g transform={`translate(${x} ${y})`}>
          <path d={`M ${-r} 0 A ${r} ${r} 0 0 1 ${r} 0 Z`} fill={v.color} stroke={v.dark} strokeWidth="0.7" />
          <rect x={-1.6} y={-0.5} width="3.2" height={r - 1} rx="1.2" fill="#efe6d0" stroke={v.dark} strokeWidth="0.5" />
        </g>
      );
    case 't_pepper':
    case 't_jalapeno':
      return (
        <g transform={`translate(${x} ${y})`}>
          <path d={`M ${-r} -1 Q 0 ${r} ${r} -1 Q 0 2 ${-r} -1 Z`} fill={v.color} stroke={v.dark} strokeWidth="0.7" />
        </g>
      );
    case 't_corn':
      return (
        <g transform={`translate(${x} ${y})`} fill={v.color} stroke={v.dark} strokeWidth="0.4">
          <circle cx={-3} cy={-2} r="1.7" /><circle cx={0} cy={-3} r="1.7" /><circle cx={3} cy={-2} r="1.7" />
          <circle cx={-2} cy={1} r="1.7" /><circle cx={2} cy={1} r="1.7" /><circle cx={0} cy={3} r="1.7" />
        </g>
      );
    case 't_bulgarit':
    case 't_extra_cheese':
      return <rect x={x - r + 1} y={y - r + 1} width={2 * r - 2} height={2 * r - 2} rx="2" fill={v.color} stroke={v.dark} strokeWidth="0.7" transform={`rotate(12 ${x} ${y})`} />;
    case 't_pineapple':
      return <path d={`M ${x} ${y - r} L ${x + r} ${y + r} L ${x - r} ${y + r} Z`} fill={v.color} stroke={v.dark} strokeWidth="0.7" />;
    case 't_tomato':
      return (
        <g transform={`translate(${x} ${y})`}>
          <circle r={r} fill={v.color} stroke={v.dark} strokeWidth="0.7" />
          <circle cx={-2} cy={0} r="0.9" fill="#f6d2c5" /><circle cx={2} cy={-1} r="0.9" fill="#f6d2c5" /><circle cx={0} cy={2} r="0.9" fill="#f6d2c5" />
        </g>
      );
    default: // meats / tuna / chicken
      return <rect x={x - r} y={y - r / 2} width={2 * r} height={r} rx={r / 2} fill={v.color} stroke={v.dark} strokeWidth="0.7" transform={`rotate(-18 ${x} ${y})`} />;
  }
}

/** 24×24 icon for the builder topping chips. */
export function ToppingIcon({ id, size = 22 }: { id: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true">
      <PieMark id={id} x={0} y={0} r={9} />
    </svg>
  );
}
