"use client";

import { useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { getCodeColor } from "@/lib/config";

type Mode = "weekly" | "cumulative";
type CoderMeta = { id: number; name: string; total: number };
type CodeMeta = { id: number | string; name: string; color?: string };
type RunData = {
  overall?: { kappa: number };
  label: string;
  params: { startDate: string; endDate: string; dimension: string; seed?: number; coderIds?: number[]; batchIds?: number[] };
  coders: CoderMeta[];
  codes: CodeMeta[];
  batches?: { batchId: number; batchName: string; coderIds: number[] }[];
  agreementTimeline?: {
    stepDays: number;
    rangeStart?: string;
    rangeEnd?: string;
    windows: Record<string, { overall: TimelineData; code: TimelineData; coder: TimelineData; cumulative: TimelineData; cumulativeOverall: TimelineData }>;
  };
};
type TimelinePoint = { date: string; value: number; n: number; totalN?: number; startDate?: string; endDate?: string };
type TimelineSeries = { id: string; name: string; color: string; points: TimelinePoint[] };
type TimelineData = { series: TimelineSeries[]; windowDays: number; error?: string };

const MODES: { key: Mode; label: string }[] = [
  { key: "cumulative", label: "Cumulative" },
  { key: "weekly", label: "Weekly" },
];

const OVERALL_SERIES_ID = "__overall__";
const GCK_PAPER_URL = "https://journals.sagepub.com/doi/10.1177/0013164488484007";

function fmt(n: number) {
  return n.toLocaleString();
}

function meanAgreement(points: TimelinePoint[]) {
  const avg = d3.mean(points, (p) => p.value);
  return avg === undefined ? null : avg;
}

function codingCountForSeries(points: TimelinePoint[], mode: Mode) {
  if (points.length === 0) return 0;
  if (mode === "cumulative") return points[points.length - 1]?.n ?? 0;
  return d3.sum(points, (point) => point.n);
}

function agreementLabel(value: number) {
  if (value < 0) return { label: "Poor agreement", color: "#991b1b", bg: "#fef2f2" };
  if (value <= 0.2) return { label: "Slight agreement", color: "#9a3412", bg: "#fff7ed" };
  if (value <= 0.4) return { label: "Fair agreement", color: "#92400e", bg: "#fffbeb" };
  if (value <= 0.6) return { label: "Moderate agreement", color: "#1d4ed8", bg: "#eff6ff" };
  if (value <= 0.8) return { label: "Substantial agreement", color: "#166534", bg: "#f0fdf4" };
  return { label: "Almost perfect", color: "#065f46", bg: "#ecfdf5" };
}

const AGREEMENT_BANDS = [
  { min: -0.2, max: 0, label: "Poor", fill: "#fef2f2" },
  { min: 0, max: 0.2, label: "Slight", fill: "#fff7ed" },
  { min: 0.2, max: 0.4, label: "Fair", fill: "#fffbeb" },
  { min: 0.4, max: 0.6, label: "Moderate", fill: "#eff6ff" },
  { min: 0.6, max: 0.8, label: "Substantial", fill: "#f0fdf4" },
  { min: 0.8, max: 1.0, label: "Almost perfect", fill: "#ecfdf5" },
];

const parseDate = d3.utcParse("%Y-%m-%d");
const formatTick = d3.utcFormat("%b %y");
const FALLBACK_DATE = new Date("2000-01-01T00:00:00Z");
const displayDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function addUtcDays(date: string, days: number) {
  const next = new Date(`${date}T00:00:00Z`);
  next.setUTCDate(next.getUTCDate() + days);
  return next.toISOString().split("T")[0];
}

function formatDisplayDate(date: string) {
  const parsed = parseDate(date);
  return parsed ? displayDateFormatter.format(parsed) : date;
}

function formatDisplayRange(startDate: string, endDate: string) {
  return `${formatDisplayDate(startDate)} to ${formatDisplayDate(endDate)}`;
}

function isUnknownSeries(name: string) {
  return name.trim().toLowerCase() === "unknown";
}

function toggleSet<T>(set: Set<T>, value: T) {
  const next = new Set(set);
  if (next.has(value)) next.delete(value);
  else next.add(value);
  return next;
}

function FilterMenu<T extends string | number>({
  label,
  items,
  selected,
  onChange,
}: {
  label: string;
  items: { id: T; name: string; color?: string }[];
  selected: Set<T>;
  onChange: (next: Set<T>) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = selected.size > 0;
  const display = selected.size === 0
    ? `All ${label}`
    : selected.size === 1
      ? items.find((item) => selected.has(item.id))?.name ?? `1 ${label.slice(0, -1)}`
      : `${selected.size} ${label}`;

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.34rem 0.7rem",
          borderRadius: 7,
          border: `1px solid ${active ? "#4f46e5" : "#e5e7eb"}`,
          background: active ? "#eef2ff" : "white",
          color: active ? "#4f46e5" : "#64748b",
          fontSize: "0.82rem",
          fontWeight: active ? 650 : 500,
          cursor: "pointer",
          fontFamily: "inherit",
        }}
      >
        {display}
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            transition: "transform 0.2s ease",
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            color: "#94a3b8"
          }}
        >
          <polyline points="6 9 12 15 18 9"></polyline>
        </svg>
      </button>
      {open && (
        <div style={{
          position: "absolute",
          top: "calc(100% + 5px)",
          left: 0,
          zIndex: 20,
          width: 240,
          maxHeight: 280,
          overflowY: "auto",
          background: "white",
          border: "1px solid #e5e7eb",
          borderRadius: 10,
          boxShadow: "0 12px 30px rgba(15,23,42,0.14)",
        }}>
          <div
            onClick={() => onChange(new Set())}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.45rem",
              padding: "0.5rem 0.75rem",
              borderBottom: "1px solid #f1f5f9",
              cursor: "pointer",
              background: selected.size === 0 ? "#f8fafc" : "white",
              fontSize: "0.84rem",
              color: "#334155",
              fontWeight: 650,
            }}
          >
            <input type="checkbox" readOnly checked={selected.size === 0} style={{ accentColor: "#4f46e5" }} />
            All {label}
          </div>
          {items.map((item) => {
            const checked = selected.size === 0 || selected.has(item.id);
            return (
              <div
                key={String(item.id)}
                onClick={() => onChange(toggleSet(selected, item.id))}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.45rem",
                  padding: "0.42rem 0.75rem",
                  cursor: "pointer",
                  background: checked ? "#f8fafc" : "white",
                  fontSize: "0.83rem",
                  color: "#334155",
                }}
              >
                <input type="checkbox" readOnly checked={checked} style={{ accentColor: item.color ?? "#4f46e5" }} />
                {item.color && <span style={{ width: 9, height: 9, borderRadius: 999, background: item.color, flexShrink: 0 }} />}
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function SourceInfoButton({ href }: { href: string }) {
  const [hovered, setHovered] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const showTooltip = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      const tooltipWidth = 240;
      const viewportPadding = 12;
      setTooltipPos({
        top: rect.top - 12,
        left: Math.min(
          Math.max(rect.right - tooltipWidth, viewportPadding),
          window.innerWidth - tooltipWidth - viewportPadding,
        ),
      });
    }
    setHovered(true);
  };

  const hideTooltip = () => {
    setHovered(false);
  };

  return (
    <div
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
    >
      <button
        ref={buttonRef}
        aria-label="Paper source information"
        style={{
          width: 22,
          height: 22,
          borderRadius: "50%",
          border: "1px solid #dbe2ea",
          background: hovered ? "#eef2ff" : "white",
          color: hovered ? "#4f46e5" : "#94a3b8",
          fontSize: "0.78rem",
          fontWeight: 700,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "inherit",
          transition: "all 0.15s ease",
          flexShrink: 0,
        }}
      >
        i
      </button>

      {hovered && (
        <div
          style={{
            position: "fixed",
            top: tooltipPos ? tooltipPos.top : 0,
            left: tooltipPos ? tooltipPos.left : 0,
            transform: "translateY(-100%)",
            zIndex: 1200,
            width: 240,
            background: "#0f172a",
            color: "white",
            borderRadius: 10,
            padding: "0.75rem 0.85rem",
            boxShadow: "0 12px 30px rgba(15,23,42,0.28)",
            fontSize: "0.82rem",
            lineHeight: 1.5,
            textAlign: "left",
          }}
        >
          <div style={{ color: "#cbd5e1", marginBottom: 8 }}>
            Figueroa, A., Ghosh, S., & Aragon, C. (2023, July). Generalized Cohen’s kappa: a novel inter-rater reliability metric for non-mutually exclusive categories. In International Conference on Human-Computer Interaction (pp. 19-34). Cham: Springer Nature Switzerland.
          </div>
        </div>
      )}
    </div>
  );
}

function AgreementLineChart({
  data,
  mode,
  highlightedSeriesId,
  rangeStart,
  overallTimeline,
}: {
  data: TimelineData;
  mode: Mode;
  highlightedSeriesId: string | null;
  rangeStart?: string;
  overallTimeline?: TimelineData | null;
}) {
  const [hover, setHover] = useState<{ x: number; y: number; rawDate: string; date: string; totalN: number; overallKappa: number | null; entries: { name: string; color: string; value: number | null; n: number; totalN?: number }[] } | null>(null);
  const series = data.series.filter((s) => s.points.length > 0);
  const orderedSeries = series;
  const overallSeries = overallTimeline?.series?.[0] ?? null;
  const dates = [
    ...series.flatMap((s) => s.points.map((p) => parseDate(p.date) ?? FALLBACK_DATE)),
    ...(overallSeries?.points.map((p) => parseDate(p.date) ?? FALLBACK_DATE) ?? []),
  ];
  const width = 1360;
  const height = 560;
  const pad = { top: 28, right: 132, bottom: 58, left: 96 };
  const chartW = width - pad.left - pad.right;
  const chartH = height - pad.top - pad.bottom;

  const extent = d3.extent(dates) as [Date | undefined, Date | undefined];
  const domainStart = extent[0] ?? FALLBACK_DATE;
  const domainEnd = extent[1] ?? FALLBACK_DATE;
  const x = d3.scaleUtc()
    .domain([domainStart, domainEnd < domainStart ? domainStart : domainEnd])
    .range([pad.left, pad.left + chartW]);
  const y = d3.scaleLinear().domain([-0.2, 1]).range([pad.top + chartH, pad.top]);
  const line = d3.line<TimelinePoint>()
    .x((p) => x(parseDate(p.date) ?? FALLBACK_DATE))
    .y((p) => y(p.value))
    .curve(d3.curveMonotoneX);
  const ticks = x.ticks(8);
  const yTicks = y.ticks(7);
  const hasOverallOnly = series.length === 0 && (overallSeries?.points.length ?? 0) > 0;

  if (series.length === 0 && !hasOverallOnly) {
    return (
      <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "0.92rem" }}>
        No agreement timeline points for this filter. Try a wider date range or fewer filters.
      </div>
    );
  }

  const handleMove = (event: React.MouseEvent<SVGSVGElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * width;
    const date = x.invert(svgX);
    const nearestOverall = overallSeries
      ? d3.least(overallSeries.points, (p) => Math.abs((parseDate(p.date) ?? FALLBACK_DATE).getTime() - date.getTime()))
      : null;
    const entries = orderedSeries
      .map((s) => {
        const nearest = d3.least(s.points, (p) => Math.abs((parseDate(p.date) ?? FALLBACK_DATE).getTime() - date.getTime()));
        return nearest ? { name: s.name, color: s.color, value: nearest.value, n: nearest.n, totalN: nearest.totalN, date: nearest.date, startDate: nearest.startDate, endDate: nearest.endDate } : null;
      })
      .filter(Boolean) as { name: string; color: string; value: number; n: number; totalN?: number; date: string; startDate?: string; endDate?: string }[];
    if (entries.length === 0 && !nearestOverall) return;
    const dateLabel = entries[0]?.date ?? nearestOverall?.date;
    if (!dateLabel) return;
    const hoveredPoint = entries.find((entry) => entry.date === dateLabel);
    const tooltipStart = mode === "cumulative"
      ? (rangeStart ?? hoveredPoint?.startDate ?? nearestOverall?.startDate ?? dateLabel)
      : (hoveredPoint?.startDate ?? nearestOverall?.startDate ?? dateLabel);
    const tooltipEnd = mode === "cumulative"
      ? dateLabel
      : (hoveredPoint?.endDate ?? nearestOverall?.endDate ?? addUtcDays(dateLabel, 6));
    const matchingEntries = orderedSeries.map((seriesItem) => {
      const point = seriesItem.points.find((entry) => entry.date === dateLabel);
      return {
        name: seriesItem.name,
        color: seriesItem.color,
        value: point?.value ?? null,
        n: point?.n ?? 0,
        totalN: point?.totalN,
      };
    });
    setHover({
      x: event.clientX,
      y: event.clientY,
      rawDate: dateLabel,
      date: formatDisplayRange(tooltipStart, tooltipEnd),
      totalN: matchingEntries.find((entry) => entry.totalN !== undefined)?.totalN ?? entries[0]?.totalN ?? nearestOverall?.totalN ?? entries[0]?.n ?? nearestOverall?.n ?? 0,
      overallKappa: overallSeries?.points.find((point) => point.date === dateLabel)?.value ?? nearestOverall?.value ?? null,
      entries: matchingEntries,
    });
  };

  return (
    <div style={{ height: `${height}px`, position: "relative", width: "100%", maxWidth: 1480, margin: "0 auto" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        style={{ display: "block" }}
      >
        {AGREEMENT_BANDS.map((band) => (
          <g key={band.label}>
            <rect
              x={pad.left}
              y={y(band.max)}
              width={chartW}
              height={Math.max(y(band.min) - y(band.max), 0)}
              fill={band.fill}
              opacity={0.9}
            />
            <text
              x={pad.left + chartW + 16}
              y={(y(band.max) + y(band.min)) / 2}
              dominantBaseline="middle"
              fontSize={12}
              fill="#475569"
              fontWeight={700}
            >
              <tspan x={pad.left + chartW + 16} dy="-0.35em">{band.label}</tspan>
              <tspan x={pad.left + chartW + 16} dy="1.2em" fontSize={11} fill="#64748b" fontWeight={600}>
                {band.min.toFixed(1)}-{band.max.toFixed(1)}
              </tspan>
            </text>
          </g>
        ))}
        <rect x={pad.left} y={pad.top} width={chartW} height={chartH} rx={14} fill="none" stroke="#dbe4ee" />
        {yTicks.map((tick) => (
          <g key={tick}>
            <line x1={pad.left} x2={pad.left + chartW} y1={y(tick)} y2={y(tick)} stroke={tick === 0 ? "#cbd5e1" : "#e2e8f0"} strokeDasharray={tick === 0 ? "0" : "3 4"} />
            <text x={pad.left - 10} y={y(tick)} textAnchor="end" dominantBaseline="middle" fontSize={12} fill="#64748b">{tick.toFixed(1)}</text>
          </g>
        ))}
        {ticks.map((tick) => (
          <g key={tick.toISOString()}>
            <line x1={x(tick)} x2={x(tick)} y1={pad.top} y2={pad.top + chartH} stroke="#eef2f7" />
            <text x={x(tick)} y={height - 16} textAnchor="middle" fontSize={12} fill="#64748b">
              {formatTick(tick)}
            </text>
          </g>
        ))}
        {overallSeries && overallSeries.points.length > 0 && (
          <g>
            <path
              d={line(overallSeries.points) ?? ""}
              fill="none"
              stroke="#475569"
              strokeWidth={highlightedSeriesId === OVERALL_SERIES_ID ? 3.8 : 2.4}
              strokeDasharray="6 5"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={highlightedSeriesId === null ? 0.95 : highlightedSeriesId === OVERALL_SERIES_ID ? 1 : 0.22}
            />

          </g>
        )}
        {orderedSeries.map((s) => (
          <path
            key={s.id}
            d={line(s.points) ?? ""}
            fill="none"
            stroke={s.color}
            strokeWidth={highlightedSeriesId === s.id ? 3.6 : 2}
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={highlightedSeriesId === null ? 0.86 : highlightedSeriesId === s.id ? 0.98 : 0.16}
          />
        ))}
        {orderedSeries.flatMap((s) =>
          s.points.map((p) => {
            const isHoveredWeek = hover?.rawDate === p.date;
            const isHighlighted = highlightedSeriesId === null || highlightedSeriesId === s.id;
            return (
              <circle
                key={`${s.id}-${p.date}-dot`}
                cx={x(parseDate(p.date) ?? FALLBACK_DATE)}
                cy={y(p.value)}
                r={isHoveredWeek ? (isHighlighted ? 6 : 5) : 2.5}
                fill={s.color}
                stroke={isHoveredWeek ? "white" : "rgba(255,255,255,0.7)"}
                strokeWidth={isHoveredWeek ? 2.2 : 1}
                opacity={highlightedSeriesId === null ? 0.92 : highlightedSeriesId === s.id ? 1 : 0.45}
              />
            );
          })
        )}
        {hover && (
          <>
            <line
              x1={x(parseDate(hover.rawDate) ?? FALLBACK_DATE)}
              x2={x(parseDate(hover.rawDate) ?? FALLBACK_DATE)}
              y1={pad.top}
              y2={pad.top + chartH}
              stroke="#94a3b8"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
          </>
        )}
        <text x={30} y={pad.top + chartH / 2} transform={`rotate(-90 30 ${pad.top + chartH / 2})`} textAnchor="middle" fontSize={15} fill="#505a69" fontWeight={700}>
          Agreement (kappa)
        </text>
      </svg>

      {hover && (
        <div style={{
          position: "fixed",
          left: hover.x + 14,
          top: hover.y - 18,
          zIndex: 1000,
          background: "#0f172a",
          color: "white",
          borderRadius: 9,
          padding: "0.7rem 0.8rem",
          boxShadow: "0 14px 30px rgba(15,23,42,0.3)",
          pointerEvents: "none",
          minWidth: 320,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.9rem", marginBottom: 5 }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 750 }}>{hover.date}</div>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.78rem" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", color: "#94a3b8", fontWeight: 700, padding: "0.15rem 0 0.35rem" }}>Series</th>
                <th style={{ textAlign: "right", color: "#94a3b8", fontWeight: 700, padding: "0.15rem 0 0.35rem" }}>Codings</th>
                <th style={{ textAlign: "right", color: "#94a3b8", fontWeight: 700, padding: "0.15rem 0 0.35rem" }}>Kappa</th>
              </tr>
            </thead>
            <tbody>
              {hover.entries.map((entry) => (
                <tr key={entry.name} style={{ borderTop: "1px solid rgba(148,163,184,0.14)" }}>
                  <td style={{ padding: "0.32rem 0.6rem 0.32rem 0", color: "#cbd5e1" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <span style={{ width: 8, height: 8, borderRadius: 999, background: entry.color, flexShrink: 0 }} />
                      <span>{entry.name}</span>
                    </span>
                  </td>
                  <td style={{ padding: "0.32rem 0 0.32rem 0.6rem", textAlign: "right", color: entry.value === null ? "#94a3b8" : "#cbd5e1", whiteSpace: "nowrap" }}>
                    {entry.value === null ? "No codings" : fmt(entry.n)}
                  </td>
                  <td style={{ padding: "0.32rem 0.6rem", textAlign: "right", fontWeight: 800, color: entry.value === null ? "#94a3b8" : "white", whiteSpace: "nowrap" }}>
                    {entry.value === null ? "n/a" : entry.value.toFixed(3)}
                  </td>
                  
                </tr>
              ))}
              {hover.overallKappa !== null && (
                <tr style={{ borderTop: "1px solid rgba(226,232,240,0.4)" }}>
                  <td style={{ padding: "0.42rem 0.6rem 0.32rem 0", color: "#e2e8f0" }}>
                    <span style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
                      <span style={{ width: 16, height: 0, borderTop: "2px dashed #94a3b8", flexShrink: 0 }} />
                      <span>Overall</span>
                    </span>
                  </td>
                  <td style={{ padding: "0.42rem 0 0.32rem 0.6rem", textAlign: "right", color: "#cbd5e1", whiteSpace: "nowrap" }}>
                    {fmt(hover.totalN)}
                  </td>
                  <td style={{ padding: "0.42rem 0.6rem 0.32rem", textAlign: "right", color: "#e2e8f0", whiteSpace: "nowrap", fontWeight: 800 }}>
                    {hover.overallKappa.toFixed(3)}
                  </td>
                  
                </tr>
              )}
            </tbody>
          </table>
          {hover.overallKappa !== null && (
            <div style={{ marginTop: 8, paddingTop: 7, borderTop: "1px solid rgba(148,163,184,0.16)", fontSize: "0.75rem", color: "#94a3b8" }}>
              Overall agreement: <span style={{ color: "#e2e8f0", fontWeight: 700 }}>{agreementLabel(hover.overallKappa).label}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function AgreementTimeline({ initialRunData }: { initialRunData: RunData }) {
  const runData = initialRunData;
  const [mode, setMode] = useState<Mode>("cumulative");
  const [selectedMeasureIds, setSelectedMeasureIds] = useState<Set<string>>(new Set());
  const weeklyBinDays = 7;
  const [highlightedSeriesId, setHighlightedSeriesId] = useState<string | null>(null);


  const weeklyTimeline = useMemo(() => {
    if (!runData?.agreementTimeline) return null;
    return runData.agreementTimeline.windows[String(weeklyBinDays)]?.code ?? null;
  }, [runData, weeklyBinDays]);
  const weeklyOverallTimeline = useMemo(() => {
    if (!runData?.agreementTimeline) return null;
    return runData.agreementTimeline.windows[String(weeklyBinDays)]?.overall ?? null;
  }, [runData, weeklyBinDays]);
  const cumulativeTimeline = useMemo(() => {
    if (!runData?.agreementTimeline) return null;
    return runData.agreementTimeline.windows[String(weeklyBinDays)]?.cumulative ?? null;
  }, [runData, weeklyBinDays]);
  const cumulativeOverallTimeline = useMemo(() => {
    if (!runData?.agreementTimeline) return null;
    return runData.agreementTimeline.windows[String(weeklyBinDays)]?.cumulativeOverall ?? null;
  }, [runData, weeklyBinDays]);

  const derivedError = useMemo(() => {
    if (!runData) return null;
    if (!runData.agreementTimeline) {
      return "This run does not include precomputed agreement timelines. Generate it again in Settings to use this view.";
    }
    if (!runData.agreementTimeline.windows[String(weeklyBinDays)]) {
      return "This run does not include weekly Saturday-Friday agreement bins. Generate it again in Settings to use this view.";
    }
    if (mode === "cumulative" && !runData.agreementTimeline.windows[String(weeklyBinDays)]?.cumulative) {
      return "This run does not include cumulative agreement data. Generate it again in Settings to use this view.";
    }
    return null;
  }, [runData, weeklyBinDays, mode]);

  const allSeries = useMemo(() => {
    const sourceTimeline = mode === "cumulative" ? cumulativeTimeline : weeklyTimeline;
    if (!sourceTimeline) return [];
    const codeMetaById = new Map((runData?.codes ?? []).map((code) => [String(code.id), code]));
    return sourceTimeline.series
      .filter((series) => !isUnknownSeries(series.name))
      .map((series) => {
        const codeMeta = codeMetaById.get(String(series.id));
        return {
          ...series,
          color: getCodeColor(codeMeta?.name ?? series.name, codeMeta?.color ?? series.color),
        };
      });
  }, [weeklyTimeline, cumulativeTimeline, mode, runData?.codes]);

  const timeline = useMemo(() => {
    const sourceTimeline = mode === "cumulative" ? cumulativeTimeline : weeklyTimeline;
    if (!sourceTimeline) return null;
    const filteredSeries = selectedMeasureIds.size > 0
      ? allSeries.filter((series) => selectedMeasureIds.has(String(series.id)))
      : allSeries;
    return {
      ...sourceTimeline,
      series: filteredSeries,
    };
  }, [weeklyTimeline, cumulativeTimeline, mode, allSeries, selectedMeasureIds]);
  const overallTimeline = mode === "cumulative" ? cumulativeOverallTimeline : weeklyOverallTimeline;
  const filteredOverallTimeline = useMemo(() => {
    if (!overallTimeline) return null;
    if (selectedMeasureIds.size === 0 || selectedMeasureIds.has(OVERALL_SERIES_ID)) return overallTimeline;
    return null;
  }, [overallTimeline, selectedMeasureIds]);

  const visibleSeries = useMemo(() => {
    return [...allSeries].sort((a, b) => {
      const aValue = mode === "cumulative"
        ? (a.points.length > 0 ? a.points[a.points.length - 1].value : Number.NEGATIVE_INFINITY)
        : (meanAgreement(a.points) ?? Number.NEGATIVE_INFINITY);
      const bValue = mode === "cumulative"
        ? (b.points.length > 0 ? b.points[b.points.length - 1].value : Number.NEGATIVE_INFINITY)
        : (meanAgreement(b.points) ?? Number.NEGATIVE_INFINITY);
      return bValue - aValue;
    });
  }, [allSeries, mode]);
  const overallKappa = runData.overall?.kappa ?? null;
  const completedBatchOverallKappa = useMemo(() => {
    const points = cumulativeOverallTimeline?.series?.[0]?.points ?? [];
    return points.length > 0 ? points[points.length - 1].value : null;
  }, [cumulativeOverallTimeline]);
  const overallSummaryValue = useMemo(() => {
    return completedBatchOverallKappa ?? overallKappa;
  }, [completedBatchOverallKappa, overallKappa]);
  const overallCodingCount = useMemo(() => {
    const points = overallTimeline?.series?.[0]?.points ?? [];
    return codingCountForSeries(points, mode);
  }, [overallTimeline, mode]);
  const overallMeta = overallSummaryValue === null ? null : agreementLabel(overallSummaryValue);
  const error = derivedError;
  const hasMeasureSelection = selectedMeasureIds.size > 0;

  const toggleMeasure = (id: string) => {
    setSelectedMeasureIds((current) => toggleSet(current, id));
  };

  const resetMeasureSelection = () => {
    setSelectedMeasureIds(new Set());
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ height: "100vh", padding: "1.75rem 2rem 1.75rem", boxSizing: "border-box", overflow: "hidden" }}>
        <div style={{ height: "100%", minHeight: 0, maxWidth: 1720, margin: "0 auto", display: "grid", gridTemplateColumns: "minmax(0, 1fr) 320px", gap: "1.5rem", alignItems: "stretch" }}>
          <section style={{ minHeight: 0, background: "white", border: "1px solid #e5e7eb", borderRadius: 18, boxShadow: "0 10px 30px rgba(15,23,42,0.05)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "1.35rem 1.5rem 0.9rem", borderBottom: "1px solid #eef2f7" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: "1.65rem", color: "#0f172a", fontWeight: 650 }}>
                    {mode === "weekly" ? "Weekly agreement by emotion" : "Cumulative agreement by emotion"}
                  </h1>
                  <div style={{ fontSize: "0.9rem", color: "#64748b", marginTop: 8 }}>
                    {runData && ` Analysis range: ${formatDisplayRange(runData.params.startDate, runData.params.endDate)}.`} · Hover over the chart to get detailed information.
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  
                  <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden", background: "#fff" }}>
                    {MODES.map((item) => (
                      <button
                        key={item.key}
                        onClick={() => setMode(item.key)}
                        style={{
                          padding: "0.42rem 0.9rem",
                          border: 0,
                          background: mode === item.key ? "#4f46e5" : "white",
                          color: mode === item.key ? "white" : "#64748b",
                          fontSize: "0.84rem",
                          fontWeight: mode === item.key ? 750 : 600,
                          cursor: "pointer",
                          fontFamily: "inherit",
                        }}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                  
                </div>
                
              </div>
            </div>

            <div style={{ flex: 1, minHeight: 0, padding: "1rem 1.5rem 1.25rem", display: "flex", flexDirection: "column" }}>
              {error && <div style={{ padding: "0.2rem 0.2rem 1rem", color: "#dc2626", fontSize: "0.92rem" }}>{error}</div>}
              <div style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {timeline && !error && (
                  <AgreementLineChart
                    data={timeline}
                    mode={mode}
                    highlightedSeriesId={highlightedSeriesId}
                    rangeStart={runData.params.startDate}
                    overallTimeline={filteredOverallTimeline}
                  />
                )}
              </div>
            </div>
            <div
              style={{
                borderTop: "1px solid #eef2f7",
                fontSize: "0.9rem",
                color: "#64748b",
                marginTop: 8,
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: "0.55rem",
                flexWrap: "wrap",
                padding: "0.9rem 1.2rem 1rem",
                lineHeight: 1.5,
              }}
            >
              <span style={{ textAlign: "right" }}>Agreement calculated using Generalized Cohen&apos;s Kappa</span>
              <SourceInfoButton href={GCK_PAPER_URL} />
            </div>

            
          </section>
          <aside style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 18, padding: "1.25rem", minHeight: 0, height: "100%", overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 10px 30px rgba(15,23,42,0.05)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "1rem", marginBottom: "0.9rem" }}>
              <div>
                <div style={{ fontSize: "0.98rem", fontWeight: 800, color: "#0f172a" }}>Measures</div>
                <div style={{ marginTop: 5, fontSize: "0.82rem", lineHeight: 1.5, color: "#64748b" }}>
                  Hover to highlight, click to filter.
                </div>
              </div>
              <button
                onClick={resetMeasureSelection}
                disabled={!hasMeasureSelection}
                style={{
                  padding: "0.38rem 0.68rem",
                  borderRadius: 8,
                  border: "1px solid #dbe2ea",
                  background: hasMeasureSelection ? "white" : "#f8fafc",
                  color: hasMeasureSelection ? "#475569" : "#94a3b8",
                  fontSize: "0.78rem",
                  fontWeight: 700,
                  cursor: hasMeasureSelection ? "pointer" : "default",
                  fontFamily: "inherit",
                  flexShrink: 0,
                }}
              >
                Reset
              </button>
            </div>
            {overallMeta && overallSummaryValue !== null && (
              <div
                onMouseEnter={() => setHighlightedSeriesId(OVERALL_SERIES_ID)}
                onMouseLeave={() => setHighlightedSeriesId((current) => current === OVERALL_SERIES_ID ? null : current)}
                onClick={() => toggleMeasure(OVERALL_SERIES_ID)}
                style={{
                  marginBottom: "0.45rem",
                  padding: "0.5rem 0.8rem",
                  borderRadius: 8,
                  background: selectedMeasureIds.has(OVERALL_SERIES_ID) ? "#eef2ff" : highlightedSeriesId === OVERALL_SERIES_ID ? "#f8fafc" : overallMeta.bg,
                  border: selectedMeasureIds.has(OVERALL_SERIES_ID) ? "1px solid #4f46e5" : highlightedSeriesId === OVERALL_SERIES_ID ? "1px solid #cbd5e1" : "1px solid #e2e8f0",
                  cursor: "pointer",
                  transition: "border-color 0.12s, background 0.12s, opacity 0.12s",
                  opacity: highlightedSeriesId === null || highlightedSeriesId === OVERALL_SERIES_ID || selectedMeasureIds.has(OVERALL_SERIES_ID) ? 1 : hasMeasureSelection ? 0.52 : 0.5,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", minWidth: 0, fontSize: "0.78rem", color: "#475569", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                    <span style={{ width: 18, height: 0, borderTop: "2px dashed #475569", flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Overall Kappa</span>
                  </div>
                  <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", whiteSpace: "nowrap", paddingLeft: "0.25rem", flexShrink: 0 }}>
                    {fmt(overallCodingCount)} texts
                  </span>
                </div>
                <div style={{ fontSize: "0.88rem", marginTop: 6 }}>
                  <span style={{ color: overallMeta.color, fontWeight: 800 }}>
                    k={overallSummaryValue.toFixed(3)}
                  </span>
                  <span style={{ color: "#64748b" }}>
                    {" · "}{overallMeta.label}
                  </span>
                </div>
              </div>
            )}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: "0.45rem", paddingRight: "0.1rem" }}>
              {visibleSeries.map((series) => {
                const summaryValue = mode === "cumulative"
                  ? (series.points.length > 0 ? series.points[series.points.length - 1].value : null)
                  : meanAgreement(series.points);
                const codingCount = codingCountForSeries(series.points, mode);
                const meta = summaryValue === null ? null : agreementLabel(summaryValue);
                const isSelected = selectedMeasureIds.has(String(series.id));
                const isHighlighted = highlightedSeriesId === series.id;
                return (
                  <div
                    key={series.id}
                    onMouseEnter={() => setHighlightedSeriesId(series.id)}
                    onMouseLeave={() => setHighlightedSeriesId((current) => current === series.id ? null : current)}
                    onClick={() => toggleMeasure(String(series.id))}
                    style={{
                      border: isSelected ? `1px solid ${series.color}` : isHighlighted ? `1px solid ${series.color}` : "1px solid #f1f5f9",
                      borderRadius: 8,
                      padding: "0.7rem 0.95rem",
                      background: isSelected ? "#f8fafc" : isHighlighted ? "#fbfdff" : "white",
                      cursor: "pointer",
                      transition: "border-color 0.12s, background 0.12s, opacity 0.12s",
                      opacity: isSelected || highlightedSeriesId === null || isHighlighted ? 1 : hasMeasureSelection ? 0.52 : 0.5,
                      boxShadow: isSelected ? `inset 0 0 0 1px ${series.color}22` : "none",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", minWidth: 0, fontSize: "0.84rem", fontWeight: 700, color: "#334155" }}>
                        <span style={{ width: 10, height: 10, borderRadius: 999, background: series.color, flexShrink: 0 }} />
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{series.name}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexShrink: 0 }}>
                        <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "#64748b", whiteSpace: "nowrap", paddingLeft: "0.25rem" }}>
                          {fmt(codingCount)} texts
                        </span>
                        {isSelected && (
                          <span style={{ fontSize: "0.68rem", fontWeight: 800, color: series.color, textTransform: "uppercase", letterSpacing: "0.04em", flexShrink: 0 }}>
                            Selected
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontSize: "0.76rem", marginTop: 6, lineHeight: 1.45 }}>
                      <span style={{ color: meta?.color ?? "#64748b", fontWeight: 700 }}>
                        {mode === "cumulative" ? "k=" : "avg k="}{summaryValue === null ? "n/a" : summaryValue.toFixed(3)}
                      </span>
                      <span style={{ color: "#64748b" }}>
                        {" · "}{meta?.label ?? "No interpretation"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
