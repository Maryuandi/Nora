const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const lerp = (a: string, b: string, t: number) => {
  const [x, y] = [hex(a), hex(b)];
  return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * t)).join(",")})`;
};

export const FREQ_GRADIENT = "linear-gradient(90deg,#b8bcc8,#2f399f)";
export const PERF_GRADIENT = "linear-gradient(90deg,#2a9d78,#e5a100,#d64545)";

export const freqColor = (t: number) => lerp("#b8bcc8", "#2f399f", t);
export const perfColor = (t: number) => (t < 0.5 ? lerp("#2a9d78", "#e5a100", t * 2) : lerp("#e5a100", "#d64545", (t - 0.5) * 2));
