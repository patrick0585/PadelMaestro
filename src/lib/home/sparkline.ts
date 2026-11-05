export interface SparklineBox {
  width: number;
  height: number;
  padX: number;
  padTop: number;
  padBottom: number;
}

export interface Sparkline {
  points: { x: number; y: number; value: number }[];
  line: string;
  area: string;
}

const r = (n: number) => Math.round(n * 10) / 10;

export function sparkline(values: number[], box: SparklineBox): Sparkline {
  if (values.length === 0) return { points: [], line: "", area: "" };
  const min = Math.min(...values);
  const max = Math.max(...values);
  const innerW = box.width - 2 * box.padX;
  const innerH = box.height - box.padTop - box.padBottom;
  const points = values.map((value, i) => ({
    x: r(values.length === 1 ? box.width / 2 : box.padX + (i * innerW) / (values.length - 1)),
    y: r(max === min ? box.padTop + innerH / 2 : box.padTop + (1 - (value - min) / (max - min)) * innerH),
    value,
  }));
  let line = `M${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const cx = r((a.x + b.x) / 2);
    line += ` C${cx} ${a.y} ${cx} ${b.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1];
  const area = `${line} L${last.x} ${box.height} L${points[0].x} ${box.height}Z`;
  return { points, line, area };
}
