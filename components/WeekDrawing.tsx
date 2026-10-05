import type { Drawing } from "@/lib/weekBrief";

/**
 * The week as one line: height is each day's load, and a dot sits on each day with something on (the days are named
 * in the strip under it). Drawn from real numbers (see buildDrawing), in the page's own colors so it follows dark mode.
 */
export default function WeekDrawing({ drawing, description }: { drawing: Drawing; description: string }) {
  const { width, height, path, points } = drawing;
  return (
    <svg className="brief-drawing" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={description} preserveAspectRatio="xMidYMid meet">
      <path d={path} fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {points.map((p) => p.r > 0 && <circle key={p.label} cx={p.x} cy={p.y} r={p.r} fill={p.isToday ? "var(--accent)" : "var(--text)"} />)}
    </svg>
  );
}
