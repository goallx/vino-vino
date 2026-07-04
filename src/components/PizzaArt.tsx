import { AnimatePresence, motion } from 'framer-motion';
import { PieMark } from './toppings';

interface PizzaArtProps {
  whole?: string[];
  left?: string[];
  right?: string[];
  split?: boolean;
  size?: number;
  animate?: boolean; // spring ingredients in / out (builder)
  idle?: boolean; // slow ambient rotation (builder)
  focus?: 'half_1' | 'half_2'; // dim the other half (builder editing)
}

const C = 100;

// Scatter slots: inner ring, outer ring, centre.
const SLOTS: { x: number; y: number }[] = [];
for (let i = 0; i < 6; i++) {
  const a = (i / 6) * Math.PI * 2 + 0.4;
  SLOTS.push({ x: C + Math.cos(a) * 27, y: C + Math.sin(a) * 27 });
}
for (let i = 0; i < 10; i++) {
  const a = (i / 10) * Math.PI * 2;
  SLOTS.push({ x: C + Math.cos(a) * 53, y: C + Math.sin(a) * 53 });
}
SLOTS.push({ x: C, y: C });

interface Mark {
  key: string;
  id: string;
  x: number;
  y: number;
}

function marksFor(whole: string[] | undefined, left: string[] | undefined, right: string[] | undefined, split: boolean): Mark[] {
  const out: Mark[] = [];
  const place = (side: 'whole' | 'left' | 'right', list: string[]) => {
    if (!list.length) return;
    const slots = SLOTS.filter((s) => {
      if (side === 'whole') return true;
      if (Math.abs(s.x - C) < 11) return false; // keep clear of the divider
      return side === 'left' ? s.x < C : s.x > C;
    });
    slots.forEach((s, i) => {
      const id = list[i % list.length];
      out.push({ key: `${side}-${i}-${id}`, id, x: s.x, y: s.y });
    });
  };
  if (split) {
    place('left', left ?? []);
    place('right', right ?? []);
  } else {
    place('whole', whole ?? []);
  }
  return out;
}

export function PizzaArt({ whole, left, right, split = false, size = 120, animate = false, idle = false, focus }: PizzaArtProps) {
  const marks = marksFor(whole, left, right, split);
  const MarkWrap = animate ? motion.g : 'g';
  const spin = idle && !split; // don't rotate a half/half pie

  return (
    <svg width={size} height={size} viewBox="0 0 200 200" className="pizza-art" aria-hidden="true">
      <defs>
        <radialGradient id="crust" cx="50%" cy="42%" r="62%">
          <stop offset="70%" stopColor="#eabf6a" />
          <stop offset="100%" stopColor="#c6853a" />
        </radialGradient>
        <radialGradient id="cheese" cx="50%" cy="42%" r="60%">
          <stop offset="0%" stopColor="#f7dd92" />
          <stop offset="100%" stopColor="#ecbe5d" />
        </radialGradient>
      </defs>

      <motion.g
        animate={spin ? { rotate: 360 } : undefined}
        transition={spin ? { duration: 90, ease: 'linear', repeat: Infinity } : undefined}
        style={{ transformOrigin: '100px 100px' }}
      >
        <circle cx={C} cy={C} r="94" fill="url(#crust)" stroke="#a96d2c" strokeWidth="2" />
        <circle cx={C} cy={C} r="80" fill="#cf5a2b" />
        <circle cx={C} cy={C} r="77" fill="url(#cheese)" />
        {/* sauce flecks */}
        <g fill="#d8642f" opacity="0.5">
          <circle cx="72" cy="78" r="2.5" /><circle cx="128" cy="70" r="2" /><circle cx="116" cy="126" r="2.6" /><circle cx="78" cy="124" r="2" />
        </g>

        {split && <line x1={C} y1="24" x2={C} y2="176" stroke="#caa15c" strokeWidth="2.5" strokeDasharray="4 4" />}

        <AnimatePresence>
          {marks.map((m, i) =>
            animate ? (
              <motion.g
                key={m.key}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18, delay: Math.min(i * 0.015, 0.3) }}
                style={{ transformOrigin: `${m.x}px ${m.y}px` }}
              >
                <PieMark id={m.id} x={m.x} y={m.y} />
              </motion.g>
            ) : (
              <MarkWrap key={m.key}>
                <PieMark id={m.id} x={m.x} y={m.y} />
              </MarkWrap>
            )
          )}
        </AnimatePresence>

        {split && focus && (
          <path
            d={focus === 'half_1' ? 'M100 8 A92 92 0 0 1 100 192 Z' : 'M100 8 A92 92 0 0 0 100 192 Z'}
            fill="#fffdf8"
            opacity="0.5"
          />
        )}
      </motion.g>
    </svg>
  );
}
