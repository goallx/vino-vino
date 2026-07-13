interface CountUpProps {
  value: number;
  format?: (n: number) => string;
}

/** Lightweight metric display; avoids a per-number animation subscription. */
export function CountUp({ value, format = (n) => String(Math.round(n)) }: CountUpProps) {
  return <span>{format(value)}</span>;
}
