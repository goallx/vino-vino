import { useEffect } from 'react';
import { animate, motion, useMotionValue, useTransform, useReducedMotion } from 'framer-motion';

interface CountUpProps {
  value: number;
  format?: (n: number) => string;
}

/** Animates a number from its previous value to the new one with an ease-out glide. */
export function CountUp({ value, format = (n) => String(Math.round(n)) }: CountUpProps) {
  const mv = useMotionValue(value);
  const reduce = useReducedMotion();
  const text = useTransform(mv, (v) => format(v));

  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const controls = animate(mv, value, { duration: 0.7, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [value, reduce, mv]);

  return <motion.span>{text}</motion.span>;
}
