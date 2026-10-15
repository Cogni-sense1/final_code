export const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const mean = (xs: number[]): number => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : 0);

export function stddev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length);
}

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Median absolute deviation, scaled to be comparable to a standard deviation. */
export function mad(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = median(xs);
  return 1.4826 * median(xs.map((x) => Math.abs(x - m)));
}

/** Least-squares slope of ys against their index. */
export function slope(ys: number[]): number {
  if (ys.length < 3) return 0;
  const mx = (ys.length - 1) / 2;
  const my = mean(ys);
  let num = 0;
  let den = 0;
  ys.forEach((y, i) => {
    num += (i - mx) * (y - my);
    den += (i - mx) ** 2;
  });
  return den ? num / den : 0;
}

export const round = (v: number, dp = 2): number => {
  const f = 10 ** dp;
  return Math.round(v * f) / f;
};

export const finite = (v: number, fallback = 0): number => (Number.isFinite(v) ? v : fallback);
