"use client";

import { useEffect, useState, useMemo, useRef, useCallback } from "react";
import * as d3 from "d3";
import { getCodeColor } from "@/lib/config";

// ── Types ─────────────────────────────────────────────────────────────────────

type PairwiseResult = {
  coder1: number; coder2: number;
  coder1Name: string; coder2Name: string;
  kappa: number; n: number;
  perCodeKappa?: Record<string, number>;
  perCodeCounts?: Record<string, { coder1: number; coder2: number; shared: number }>;
};
type CoderMeta = { id: number; name: string; total: number };
type CodeMeta  = { id: number | string; name: string; color?: string };
type RunData = {
  label: string; createdAt: string;
  params: { startDate: string; endDate: string; minCodings: number; dimension: string };
  coders: CoderMeta[]; codes: CodeMeta[];
  overall: { kappa: number };
  pairwise: PairwiseResult[];
  coderCodeCounts?: Record<string, Record<string, number>>;
  batches?: { batchId: number; batchName: string; coderIds: number[] }[];
};
type Node = d3.SimulationNodeDatum & { id: number; name: string; total: number; r: number };
type Edge = {
  id: string; coder1: number; coder2: number;
  coder1Name: string; coder2Name: string;
  kappa: number; n: number;
  perCodeKappa: Record<string, number>;
  perCodeCounts: Record<string, { coder1: number; coder2: number; shared: number }>;
  source: Node; target: Node;
};
type TooltipState = { x: number; y: number; type: "node" | "edge"; node?: Node; edge?: Edge } | null;
type ExtSVG = SVGSVGElement & {
  __edgeG?: d3.Selection<SVGGElement, unknown, null, undefined>;
  __nodeG?: d3.Selection<SVGGElement, unknown, null, undefined>;
};

// ── Colour helpers ─────────────────────────────────────────────────────────────

const kappaScale = d3.scaleLinear<string>()
  .domain([0, 0.2, 0.4, 0.6, 0.8, 1.0])
  .range(["#ef4444","#f97316","#f59e0b","#84cc16","#10b981","#047857"])
  .clamp(true);
const GCK_PAPER_URL = "https://journals.sagepub.com/doi/10.1177/0013164488484007";
const NONE_FILTER_ID = -1;
const NONE_CODE_ID = "__none__";
const displayDateFormatter = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

function kappaLabel(k: number) {
  if (k < 0)    return "Poor";
  if (k < 0.20) return "Slight";
  if (k < 0.40) return "Fair";
  if (k < 0.60) return "Moderate";
  if (k < 0.80) return "Substantial";
  return "Almost perfect";
}

function resolveCodeColor(code: CodeMeta, idx: number): string {
  const c = getCodeColor(code.name, code.color ?? "");
  if (c !== "#818cf8") return c;
  if (code.color?.startsWith("#") && code.color.length >= 7) return code.color;
  const p = ["#6366f1","#f59e0b","#10b981","#ef4444","#3b82f6","#8b5cf6","#ec4899","#14b8a6"];
  return p[idx % p.length];
}

function fmt(n: number) { return n.toLocaleString(); }

function formatDisplayDate(date: string) {
  const parsed = new Date(`${date}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? date : displayDateFormatter.format(parsed);
}

function formatDisplayRange(startDate: string, endDate: string) {
  return `${formatDisplayDate(startDate)} to ${formatDisplayDate(endDate)}`;
}

function isUnknownCode(name: string) {
  return name.trim().toLowerCase() === "unknown";
}

function setsEqual<T>(a: Set<T>, b: Set<T>) {
  if (a.size !== b.size) return false;
  for (const value of a) if (!b.has(value)) return false;
  return true;
}

function straightPath(sx: number, sy: number, tx: number, ty: number, sr: number, tr: number): string {
  const dx = tx-sx, dy = ty-sy, len = Math.sqrt(dx*dx+dy*dy)||1;
  return `M${(sx+dx/len*sr).toFixed(1)},${(sy+dy/len*sr).toFixed(1)} L${(tx-dx/len*tr).toFixed(1)},${(ty-dy/len*tr).toFixed(1)}`;
}

function weightedCodeKappa(pairs: PairwiseResult[], codes: CodeMeta[]) {
  return codes.map((code, idx) => {
    const cid = String(code.id);
    let sumWK = 0, sumW = 0;
    for (const p of pairs) {
      const k = p.perCodeKappa?.[cid];
      if (k !== undefined) { sumWK += k * p.n; sumW += p.n; }
    }
    return {
      codeId: cid, codeName: code.name, color: resolveCodeColor(code, idx),
      kappa: sumW > 0 ? sumWK / sumW : 0,

    };
  }).sort((a, b) => b.kappa - a.kappa);
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
            padding: "0.8rem 0.9rem",
            borderRadius: 12,
            background: "#0f172a",
            color: "#e2e8f0",
            boxShadow: "0 18px 50px rgba(15, 23, 42, 0.28)",
            fontSize: "0.74rem",
            lineHeight: 1.5,
          }}
        >
          <div style={{ fontWeight: 800, color: "white", marginBottom: 6 }}>Source</div>
          <div>
            Figueroa, A., Ghosh, S., & Aragon, C. (2023, July). Generalized Cohen&apos;s kappa: a novel inter-rater reliability metric for non-mutually exclusive categories. In International Conference on Human-Computer Interaction (pp. 19-34). Cham: Springer Nature Switzerland.
          </div>
          <a
            href={href}
            target="_blank"
            rel="noreferrer"
            style={{
              display: "inline-flex",
              marginTop: 8,
              color: "#93c5fd",
              textDecoration: "none",
              fontWeight: 700,
            }}
          >
            Open paper
          </a>
        </div>
      )}
    </div>
  );
}

// ── Range slider (two handles) ────────────────────────────────────────────────

function RangeSlider({ min, max, low, high, step = 0.05, onChange }: {
  min: number; max: number; low: number; high: number;
  step?: number; onChange: (low: number, high: number) => void;
}) {
  const trackRef  = useRef<HTMLDivElement>(null);
  const dragging  = useRef<"low" | "high" | null>(null);

  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  const fromPct = (p: number) => {
    const raw = min + (p / 100) * (max - min);
    return Math.round(raw / step) * step;
  };

  const onMouseDown = (handle: "low" | "high") => (e: React.MouseEvent) => {
    e.preventDefault();
    dragging.current = handle;

    const move = (me: MouseEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const p    = Math.max(0, Math.min(100, ((me.clientX - rect.left) / rect.width) * 100));
      const v    = Math.max(min, Math.min(max, fromPct(p)));
      if (dragging.current === "low")  onChange(Math.min(v, high - step), high);
      if (dragging.current === "high") onChange(low, Math.max(v, low + step));
    };
    const up = () => {
      dragging.current = null;
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flex: 1, minWidth: 220 }}>
      <span style={{ fontSize: "0.7rem", fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", whiteSpace: "nowrap" }}>κ range</span>

      <div ref={trackRef} style={{ flex: 1, height: 4, background: "#e5e7eb", borderRadius: 2, position: "relative", cursor: "pointer" }}>
        {/* Filled range */}
        <div style={{
          position: "absolute", height: "100%", borderRadius: 2,
          left: `${pct(low)}%`, width: `${pct(high) - pct(low)}%`,
          background: "#4f46e5",
        }} />

        {/* Low handle */}
        <div
          onMouseDown={onMouseDown("low")}
          style={{
            position: "absolute", top: "50%", left: `${pct(low)}%`,
            transform: "translate(-50%, -50%)",
            width: 14, height: 14, borderRadius: "50%",
            background: "white", border: "2px solid #4f46e5",
            cursor: "grab", zIndex: 2,
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        />

        {/* High handle */}
        <div
          onMouseDown={onMouseDown("high")}
          style={{
            position: "absolute", top: "50%", left: `${pct(high)}%`,
            transform: "translate(-50%, -50%)",
            width: 14, height: 14, borderRadius: "50%",
            background: "white", border: "2px solid #4f46e5",
            cursor: "grab", zIndex: 2,
            boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
          }}
        />
      </div>

      <span style={{ fontSize: "0.78rem", fontWeight: 700, color: kappaScale(low), minWidth: 30 }}>{low.toFixed(2)}</span>
      <span style={{ fontSize: "0.7rem", color: "#9ca3af" }}>–</span>
      <span style={{ fontSize: "0.78rem", fontWeight: 700, color: kappaScale(high), minWidth: 30 }}>{high.toFixed(2)}</span>
    </div>
  );
}

// ── D3 Bar chart ──────────────────────────────────────────────────────────────

type BarDatum = { codeId: string; codeName: string; color: string; kappa: number; userTexts?: number; c1n?: number; c2n?: number; c1Name?: string; c2Name?: string };

function KappaBarChart({ bars, title, subtitle, selectedCodes: activeCodes, onCodeClick, referenceKappa }: {
  bars: BarDatum[]; title: string; subtitle: string; selectedCodes?: Set<string>;
  onCodeClick?: (codeId: string) => void;
  referenceKappa?: number;
}) {
  const svgRef      = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || !containerRef.current || !bars.length) return;

    const W   = containerRef.current.clientWidth  || 280;
    const H   = containerRef.current.clientHeight || 400;
    const PAD = { top: 16, right: 52, bottom: 28, left: 134 };
    const cW  = W - PAD.left - PAD.right;
    const cH  = H - PAD.top  - PAD.bottom;

    const svg = d3.select(svgRef.current);
    svg.selectAll("*").remove();
    svg.attr("viewBox", `0 0 ${W} ${H}`).attr("width", W).attr("height", H);

    const g = svg.append("g").attr("transform", `translate(${PAD.left},${PAD.top})`);

    // Scales
    const xDomain: [number, number] = [Math.min(-0.1, d3.min(bars, b => b.kappa) ?? -0.1), 1];
    const x = d3.scaleLinear().domain(xDomain).range([0, cW]).clamp(true);
    const y = d3.scaleBand()
      .domain(bars.map(b => b.codeId))
      .range([0, cH])
      .padding(0.28);

    // Grid lines
    g.append("g").attr("class", "grid")
      .selectAll("line")
      .data(x.ticks(6))
      .join("line")
      .attr("x1", d => x(d)).attr("x2", d => x(d))
      .attr("y1", 0).attr("y2", cH)
      .attr("stroke", "#f1f5f9").attr("stroke-width", 1);

    // Zero line
    g.append("line")
      .attr("x1", x(0)).attr("x2", x(0))
      .attr("y1", 0).attr("y2", cH)
      .attr("stroke", "#cbd5e1").attr("stroke-width", 1.5);

    // Track backgrounds
    g.selectAll<SVGRectElement, BarDatum>("rect.track")
      .data(bars).join("rect").attr("class", "track")
      .attr("x", 0).attr("y", d => y(d.codeId) ?? 0)
      .attr("width", cW).attr("height", y.bandwidth())
      .attr("fill", "#f8fafc").attr("rx", 3);

    // Tooltip div — fixed positioned so it never clips
    let tipDiv = d3.select<HTMLDivElement, unknown>("div.bar-chart-tip");
    if (tipDiv.empty()) {
      tipDiv = d3.select("body").append("div").attr("class", "bar-chart-tip")
        .style("position", "fixed").style("pointer-events", "none")
        .style("background", "#1f2937").style("color", "white")
        .style("border-radius", "6px").style("padding", "0.4rem 0.6rem")
        .style("font-size", "0.72rem").style("font-family", "system-ui, sans-serif")
        .style("box-shadow", "0 4px 12px rgba(0,0,0,0.25)")
        .style("display", "none").style("z-index", "9999");
    }

    // Hover track rects (transparent, full row)
    g.selectAll<SVGRectElement, BarDatum>("rect.hover-track")
      .data(bars).join("rect").attr("class", "hover-track")
      .attr("x", -PAD.left).attr("y", d => (y(d.codeId) ?? 0) - 1)
      .attr("width", W).attr("height", y.bandwidth() + 2)
      .attr("fill", "transparent")
      .style("cursor", "pointer")
      .on("click", (_, d) => { if (onCodeClick) onCodeClick(d.codeId); })
      .on("mouseenter", (event, d) => {
        tipDiv
          .style("display", "block")
          .style("left", `${event.clientX + 14}px`)
          .style("top",  `${event.clientY - 14}px`)
          .html(`<div style="font-weight:700;margin-bottom:3px;color:#e2e8f0">${d.codeName}</div>
                 <div style="display:flex;justify-content:space-between;gap:12px">
                   <span style="color:#94a3b8">κ</span>
                   <span style="font-weight:600;color:${kappaScale(Math.max(0,d.kappa))}">${d.kappa.toFixed(3)} · ${kappaLabel(d.kappa)}</span>
                 </div>
                 ${d.userTexts !== undefined ? `<div style="display:flex;justify-content:space-between;gap:12px;margin-top:2px">
                   <span style="color:#94a3b8">Texts with this code</span>
                   <span style="font-weight:600">${d.userTexts.toLocaleString()}</span>
                 </div>` : ''}
                 ${d.c1Name && d.c1n !== undefined ? `<div style="margin-top:5px;padding-top:5px;border-top:1px solid #374151">
                   <div style="display:flex;justify-content:space-between;gap:12px;margin-bottom:2px">
                     <span style="color:#94a3b8">${d.c1Name.split(' ')[0]}</span>
                     <span style="font-weight:600">${d.c1n.toLocaleString()}</span>
                   </div>
                   ${d.c2Name && d.c2n !== undefined ? `<div style="display:flex;justify-content:space-between;gap:12px">
                     <span style="color:#94a3b8">${d.c2Name.split(' ')[0]}</span>
                     <span style="font-weight:600">${d.c2n.toLocaleString()}</span>
                   </div>` : ''}
                 </div>` : ''}`);
      })
      .on("mousemove", (event) => {
        tipDiv.style("left", `${event.clientX + 14}px`)
              .style("top",  `${event.clientY - 14}px`);
      })
      .on("mouseleave", () => tipDiv.style("display", "none"));

    // Bars
    g.selectAll<SVGRectElement, BarDatum>("rect.bar")
      .data(bars).join("rect").attr("class", "bar")
      .attr("x", d => d.kappa >= 0 ? x(0) : x(d.kappa))
      .attr("y", d => y(d.codeId) ?? 0)
      .attr("width", d => Math.max(Math.abs(x(d.kappa) - x(0)), 2))
      .attr("height", y.bandwidth())
      .attr("fill", d => kappaScale(Math.max(0, d.kappa)))
      .attr("opacity", d => activeCodes && activeCodes.size > 0 && !activeCodes.has(d.codeId) ? 0.2 : 0.9)
      .style("cursor", "pointer")
      .attr("rx", 3)
      .style("pointer-events", "none");

    // Overall-kappa reference line
    if (referenceKappa !== undefined) {
      const xA = x(Math.max(xDomain[0], Math.min(1, referenceKappa)));
      g.append("line")
        .attr("x1", xA).attr("x2", xA)
        .attr("y1", -6).attr("y2", cH)
        .attr("stroke", "#6366f1").attr("stroke-width", 1.5)
        .attr("stroke-dasharray", "4,3").attr("opacity", 0.85);
      const labelX = xA + 3;
      const labelAnchor = labelX + 60 > cW ? "end" : "start";
      g.append("text")
        .attr("x", labelAnchor === "end" ? xA - 3 : xA + 3)
        .attr("y", -1)
        .attr("font-size", 9).attr("fill", "#6366f1")
        .attr("font-family", "system-ui, sans-serif").attr("font-weight", 700)
        .attr("text-anchor", labelAnchor)
        .text(`overall κ ${referenceKappa.toFixed(2)}`);
    }

    // Code color dots
    g.selectAll<SVGCircleElement, BarDatum>("circle.dot")
      .data(bars).join("circle").attr("class", "dot")
      .attr("cx", -12).attr("cy", d => (y(d.codeId) ?? 0) + y.bandwidth() / 2)
      .attr("r", 5).attr("fill", d => d.color);

    // Code name labels
    g.selectAll<SVGTextElement, BarDatum>("text.name")
      .data(bars).join("text").attr("class", "name")
      .attr("x", -20).attr("y", d => (y(d.codeId) ?? 0) + y.bandwidth() / 2)
      .attr("text-anchor", "end").attr("dominant-baseline", "middle")
      .attr("font-size", 11).attr("fill", "#374151")
      .attr("font-family", "system-ui, sans-serif")
      .attr("opacity", d => activeCodes && activeCodes.size > 0 && !activeCodes.has(d.codeId) ? 0.3 : 1)
      .text(d => d.codeName.length > 17 ? d.codeName.slice(0, 16) + "…" : d.codeName);

    // Kappa value labels
    g.selectAll<SVGTextElement, BarDatum>("text.val")
      .data(bars).join("text").attr("class", "val")
      .attr("x", d => x(Math.max(d.kappa, 0)) + 6)
      .attr("y", d => (y(d.codeId) ?? 0) + y.bandwidth() / 2)
      .attr("dominant-baseline", "middle")
      .attr("font-size", 11).attr("font-weight", 600)
      .attr("font-family", "system-ui, sans-serif")
      .attr("fill", d => kappaScale(Math.max(0, d.kappa)))
      .text(d => d.kappa.toFixed(2));

    // X axis
    const xAxis = d3.axisBottom(x).ticks(6).tickSize(4);
    g.append("g").attr("transform", `translate(0,${cH})`).call(xAxis)
      .call(ax => ax.select(".domain").remove())
      .call(ax => ax.selectAll("line").attr("stroke", "#e2e8f0"))
      .call(ax => ax.selectAll("text")
        .attr("font-size", 10).attr("fill", "#9ca3af")
        .attr("font-family", "system-ui, sans-serif"));

  }, [bars, referenceKappa, activeCodes, onCodeClick]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      {/* Header */}
      <div style={{ flexShrink: 0, padding: "1rem 1.25rem 0.75rem", borderBottom: "1px solid #f1f5f9" }}>
        <div style={{ fontSize: "0.82rem", fontWeight: 700, color: "#111827", lineHeight: 1.3 }}>{title}</div>
        <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginTop: 3 }}>{subtitle}</div>
      </div>

      {/* Chart */}
      <div ref={containerRef} style={{ flex: 1, overflow: "hidden", padding: "0.5rem 0.75rem 0.5rem 0.5rem" }}>
        <svg ref={svgRef} style={{ display: "block" }} />
      </div>


    </div>
  );
}

// ── InfoButton ───────────────────────────────────────────────────────────────

function InfoButton() {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button style={{
        width: 28, height: 28, borderRadius: "50%",
        border: "1px solid #e5e7eb", background: hovered ? "#f5f3ff" : "white",
        color: hovered ? "#4f46e5" : "#9ca3af",
        fontSize: "0.8rem", fontWeight: 700, cursor: "pointer",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontFamily: "system-ui, sans-serif", transition: "all 0.15s",
        flexShrink: 0,
      }}>i</button>

      {hovered && (
        <div style={{
          position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 100,
          background: "#1f2937", color: "white", borderRadius: 8,
          padding: "0.75rem 0.875rem", fontSize: "0.75rem",
          boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
          width: 240, fontFamily: "system-ui, sans-serif",
          lineHeight: 1.6,
        }}>
          <div style={{ fontWeight: 700, marginBottom: 8, color: "#e2e8f0" }}>How to use</div>
          {[
            ["Scroll", "Zoom in or out"],
            ["Drag canvas", "Pan the graph"],
            ["Drag node", "Reposition a coder"],
            ["Click node", "Pin coder code breakdown"],
            ["Click edge", "Pin pair code breakdown"],
            ["K range", "Filter visible connections"],
          ].map(([key, desc]) => (
            <div key={key} style={{ display: "flex", gap: "0.5rem", marginBottom: 4 }}>
              <span style={{ color: "#94a3b8", minWidth: 74, flexShrink: 0 }}>{key}</span>
              <span style={{ color: "#d1d5db" }}>{desc}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── StatPill ──────────────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "0.4rem 0.875rem", background: "white", border: "1px solid #e5e7eb", borderRadius: 8 }}>
      <span style={{ fontSize: "0.62rem", color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
      <span style={{ fontSize: "0.95rem", fontWeight: 700, color: color ?? "#111827", marginTop: 1 }}>{value}</span>
    </div>
  );
}

// ── GenericFilterDropdown ─────────────────────────────────────────────────────

function GenericFilterDropdown({ label, items, selected, onChange }: {
  label: string;
  items: { id: number; name: string }[];
  selected: Set<number>;
  onChange: (s: Set<number>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as HTMLElement)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const effectiveNoneMode = selected.has(NONE_FILTER_ID);
  const allMode = selected.size === 0;
  const isChecked = (id: number) => allMode || selected.has(id);
  const isActive = !allMode; // either explicit selection or noneMode

  const toggle = (id: number) => {
    if (allMode) {
      // Create explicit "all except this one" set
      onChange(new Set(items.map(i => i.id).filter(i => i !== id)));
    } else if (effectiveNoneMode) {
      onChange(new Set([id]));
    } else {
      const next = new Set(selected);
      if (next.has(id)) {
        next.delete(id);
        if (next.size === 0) onChange(new Set([NONE_FILTER_ID]));
        else onChange(next);
        return;
      } else {
        next.add(id);
        if (next.size === items.length) { onChange(new Set()); return; }
      }
      onChange(next);
    }
  };

  const displayLabel = effectiveNoneMode ? `No ${label}`
    : selected.size === 0 ? `All ${label}`
    : selected.size === 1 ? (items.find(c => selected.has(c.id))?.name ?? `1 ${label.slice(0,-1)}`)
    : `${selected.size} ${label}`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: "0.35rem",
        padding: "0.3rem 0.7rem", borderRadius: 6,
        border: `1px solid ${isActive ? "#6366f1" : "#e2e8f0"}`,
        background: isActive ? "#eef2ff" : "white",
        color: isActive ? "#4f46e5" : "#6b7280",
        fontSize: "0.75rem", cursor: "pointer", fontFamily: "inherit",
        fontWeight: isActive ? 600 : 400,
      }}>
        {displayLabel} <span style={{ fontSize: "0.6rem", color: "#9ca3af" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
          background: "white", border: "1px solid #e5e7eb", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 200, maxHeight: 260, overflowY: "auto",
        }}>
          <div onClick={() => { onChange(new Set()); }} style={{
            padding: "0.4rem 0.75rem", fontSize: "0.78rem", cursor: "pointer",
            borderBottom: "1px solid #f1f5f9", fontWeight: 500,
            background: allMode ? "#f5f3ff" : "white", color: "#374151",
            display: "flex", alignItems: "center", gap: "0.4rem",
          }}>
            <input type="checkbox" readOnly checked={allMode} style={{ accentColor: "#4f46e5" }} />
            All {label} (default)
          </div>
          <div onClick={() => { onChange(new Set([NONE_FILTER_ID])); }} style={{
            padding: "0.4rem 0.75rem", fontSize: "0.78rem", cursor: "pointer",
            borderBottom: "1px solid #f1f5f9", fontWeight: 500,
            background: effectiveNoneMode ? "#f5f3ff" : "white", color: "#374151",
            display: "flex", alignItems: "center", gap: "0.4rem",
          }}>
            <input type="checkbox" readOnly checked={effectiveNoneMode} style={{ accentColor: "#4f46e5" }} />
            Select none
          </div>
          {items.map(item => (
            <div key={item.id} onClick={() => toggle(item.id)} style={{
              padding: "0.35rem 0.75rem", fontSize: "0.78rem", cursor: "pointer",
              display: "flex", alignItems: "center", gap: "0.4rem",
              background: isChecked(item.id) ? "#f5f3ff" : "white", color: "#374151",
            }}>
              <input type="checkbox" readOnly checked={isChecked(item.id)} style={{ accentColor: "#4f46e5" }} />
              {item.name}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── CodeFilterDropdown ───────────────────────────────────────────────────────

function CodeFilterDropdown({ codes, selected, onChange }: {
  codes: CodeMeta[];
  selected: Set<string>;
  onChange: (s: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const visibleCodes = codes.filter((code) => !isUnknownCode(code.name));
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as HTMLElement)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const effectiveNoneMode = selected.has(NONE_CODE_ID);
  const allMode = selected.size === 0;
  const isChecked = (id: string) => allMode || selected.has(id);
  const isActive = !allMode;

  const toggle = (id: string) => {
    if (allMode) {
      onChange(new Set(visibleCodes.map(c => String(c.id)).filter(i => i !== id)));
    } else if (effectiveNoneMode) {
      onChange(new Set([id]));
    } else {
      const next = new Set(selected);
      if (next.has(id)) {
        next.delete(id);
        if (next.size === 0) onChange(new Set([NONE_CODE_ID]));
        else onChange(next);
        return;
      } else {
        next.add(id);
        if (next.size === visibleCodes.length) { onChange(new Set()); return; }
      }
      onChange(next);
    }
  };

  const displayLabel = effectiveNoneMode ? "No codes"
    : selected.size === 0 ? "All codes"
    : selected.size === 1
      ? (visibleCodes.find(c => selected.has(String(c.id)))?.name ?? "1 code")
      : `${selected.size} codes`;

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)} style={{
        display: "inline-flex", alignItems: "center", gap: "0.35rem",
        padding: "0.3rem 0.7rem", borderRadius: 6,
        border: `1px solid ${isActive ? "#6366f1" : "#e2e8f0"}`,
        background: isActive ? "#eef2ff" : "white",
        color: isActive ? "#4f46e5" : "#6b7280",
        fontSize: "0.75rem", cursor: "pointer", fontFamily: "inherit",
        fontWeight: isActive ? 600 : 400,
      }}>
        {displayLabel}
        <span style={{ fontSize: "0.6rem", color: "#9ca3af" }}>{open ? "▲" : "▼"}</span>
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 50,
          background: "white", border: "1px solid #e5e7eb", borderRadius: 8,
          boxShadow: "0 8px 24px rgba(0,0,0,0.12)", minWidth: 200, maxHeight: 260, overflowY: "auto",
        }}>
          <div onClick={() => { onChange(new Set()); }} style={{
            padding: "0.4rem 0.75rem", fontSize: "0.78rem", cursor: "pointer",
            borderBottom: "1px solid #f1f5f9", fontWeight: 500,
            background: allMode ? "#f5f3ff" : "white", color: "#374151",
            display: "flex", alignItems: "center", gap: "0.4rem",
          }}>
            <input type="checkbox" readOnly checked={allMode} style={{ accentColor: "#4f46e5" }} />
            All codes (default)
          </div>
          <div onClick={() => { onChange(new Set([NONE_CODE_ID])); }} style={{
            padding: "0.4rem 0.75rem", fontSize: "0.78rem", cursor: "pointer",
            borderBottom: "1px solid #f1f5f9", fontWeight: 500,
            background: effectiveNoneMode ? "#f5f3ff" : "white", color: "#374151",
            display: "flex", alignItems: "center", gap: "0.4rem",
          }}>
            <input type="checkbox" readOnly checked={effectiveNoneMode} style={{ accentColor: "#4f46e5" }} />
            Select none
          </div>
          {visibleCodes.map((code, idx) => {
            const id    = String(code.id);
            const color = resolveCodeColor(code, idx);
            return (
              <div key={id} onClick={() => toggle(id)} style={{
                padding: "0.35rem 0.75rem", fontSize: "0.78rem", cursor: "pointer",
                display: "flex", alignItems: "center", gap: "0.5rem",
                background: isChecked(id) ? "#f5f3ff" : "white", color: "#374151",
              }}>
                <input type="checkbox" readOnly checked={isChecked(id)} style={{ accentColor: color }} />
                <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                {code.name}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function CoderNetwork({ initialRunData }: { initialRunData: RunData }) {
  const runData = initialRunData;
  const [kappaLow, setKappaLow] = useState(() => Math.floor(((d3.min(initialRunData.pairwise, p => p.kappa) ?? 0) * 20)) / 20);
  const [kappaHigh, setKappaHigh] = useState(1);
  const [selectedEdge, setSelectedEdge] = useState<Edge | null>(null);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [filteredCoderIds, setFilteredCoderIds] = useState<Set<number>>(new Set());
  const [tooltip,      setTooltip]      = useState<TooltipState>(null);
  const [hoveredNodeId, setHoveredNodeId] = useState<number | null>(null);
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);

  const svgRef          = useRef<SVGSVGElement>(null);
  const containerRef    = useRef<HTMLDivElement>(null);
  const simRef          = useRef<d3.Simulation<Node, d3.SimulationLinkDatum<Node>> | null>(null);
  const selectedNodeRef = useRef<Node | null>(null);
  const selectedEdgeRef = useRef<Edge | null>(null);
  const egoNodeIdsRef   = useRef<Set<number> | null>(null);
  const hoveredNodeIdRef = useRef<number | null>(null);
  const hoveredEdgeIdRef = useRef<string | null>(null);
  const isDragging   = useRef(false);


  const nodes = useMemo((): Node[] => {
    if (!runData) return [];
    const [mn, mx] = d3.extent(runData.coders, c => c.total) as [number, number];
    const r = d3.scaleSqrt().domain([mn ?? 0, mx ?? 1]).range([10, 30]).clamp(true);
    const active = new Set(runData.pairwise.flatMap(p => [p.coder1, p.coder2]));
    return runData.coders.filter(c => active.has(c.id))
      .map(c => ({ id: c.id, name: c.name, total: c.total, r: r(c.total) }));
  }, [runData]);

  // Representative node size values for legend (min, mid, max of actual data)
  const nodeSizeLegend = useMemo(() => {
    if (!nodes.length) return [500, 2000, 5000];
    const totals = nodes.map(n => n.total).sort((a,b) => a-b);
    const mn = totals[0];
    const mx = totals[totals.length - 1];
    const mid = totals[Math.floor(totals.length / 2)];
    return [mn, mid, mx];
  }, [nodes]);

  const allEdges = useMemo((): Edge[] => {
    if (!runData || !nodes.length) return [];
    const nm = new Map(nodes.map(n => [n.id, n]));
    return runData.pairwise
      .filter(p => nm.has(p.coder1) && nm.has(p.coder2))
      .map(p => ({
        id: `${p.coder1}-${p.coder2}`,
        coder1: p.coder1, coder2: p.coder2,
        coder1Name: p.coder1Name, coder2Name: p.coder2Name,
        kappa: p.kappa, n: p.n,
        perCodeKappa: p.perCodeKappa ?? {},
        perCodeCounts: p.perCodeCounts ?? {},
        source: nm.get(p.coder1)!, target: nm.get(p.coder2)!,
      }));
  // effectiveKappa — derived from allEdges + selectedCodes + filteredCoderIds in render
  }, [runData, nodes]);

  // Effective kappa per edge — perCodeKappa if code selected, else overall
  const effectiveEdges = useMemo(() => {
    if (selectedCodes.has(NONE_CODE_ID)) return [];
    return allEdges.map(e => ({
      ...e,
      kappa: selectedCodes.size > 0 ? (e.perCodeKappa[[...selectedCodes][0]] ?? e.kappa) : e.kappa,
    })).filter(e => {
      // Coder filter means "show only these coders"; selected coders with no
      // visible pair are still rendered as isolated nodes via visibleNodeIds.
      if (filteredCoderIds.size > 0 && (!filteredCoderIds.has(e.coder1) || !filteredCoderIds.has(e.coder2))) return false;
      return true;
    });
  }, [allEdges, selectedCodes, filteredCoderIds]);

  // Filter by range (both ends)
  const visibleEdges = useMemo(() =>
    effectiveEdges.filter(e => e.kappa >= kappaLow && e.kappa <= kappaHigh),
    [effectiveEdges, kappaLow, kappaHigh]);

  const visibleNodeIds = useMemo(() => {
    const ids = new Set<number>();
    for (const edge of visibleEdges) {
      ids.add(edge.coder1);
      ids.add(edge.coder2);
    }
    for (const coderId of filteredCoderIds) {
      if (nodes.some((node) => node.id === coderId)) ids.add(coderId);
    }
    return ids;
  }, [visibleEdges, filteredCoderIds, nodes]);

  // When a node is selected: only it + direct neighbors are visible
  const egoNodeIds = useMemo(() => {
    if (!selectedNode) return null;
    const ids = new Set<number>([selectedNode.id]);
    for (const e of visibleEdges) {
      if (e.coder1 === selectedNode.id) ids.add(e.coder2);
      if (e.coder2 === selectedNode.id) ids.add(e.coder1);
    }
    return ids;
  }, [selectedNode, visibleEdges]);

  const displayedEdges = useMemo(() => {
    if (selectedEdge) return [selectedEdge];
    if (selectedNode) return visibleEdges.filter(e => e.coder1 === selectedNode.id || e.coder2 === selectedNode.id);
    return visibleEdges;
  }, [selectedEdge, selectedNode, visibleEdges]);
  const displayedNodeIds = useMemo(() => {
    if (selectedEdge) return new Set<number>([selectedEdge.coder1, selectedEdge.coder2]);
    if (egoNodeIds) return egoNodeIds;
    return visibleNodeIds;
  }, [selectedEdge, egoNodeIds, visibleNodeIds]);
  const displayedNodeCount = displayedNodeIds.size;

  // Keep refs in sync so D3 tick always reads current values
  useEffect(() => { selectedNodeRef.current = selectedNode; }, [selectedNode]);
  useEffect(() => { selectedEdgeRef.current = selectedEdge; }, [selectedEdge]);
  useEffect(() => { egoNodeIdsRef.current   = egoNodeIds;   }, [egoNodeIds]);
  useEffect(() => { hoveredNodeIdRef.current = hoveredNodeId; }, [hoveredNodeId]);
  useEffect(() => { hoveredEdgeIdRef.current = hoveredEdgeId; }, [hoveredEdgeId]);

  // Bar data — priority: edge > node > all visible
  const barData = useMemo(() => {
    if (!runData) return [];

    // Sum coderCodeCounts across a set of coder IDs
    const getTexts = (coderIds: number[]): Record<string, number> => {
      const counts: Record<string, number> = {};
      for (const cid of coderIds) {
        for (const [codeId, n] of Object.entries(runData.coderCodeCounts?.[String(cid)] ?? {})) {
          counts[codeId] = (counts[codeId] ?? 0) + n;
        }
      }
      return counts;
    };

    if (selectedEdge) {
      return runData.codes.filter((code) => !isUnknownCode(code.name)).map((code, idx) => {
        const cid = String(code.id);
        const counts = selectedEdge.perCodeCounts[cid];
        const c1n = counts?.coder1 ?? 0;
        const c2n = counts?.coder2 ?? 0;
        const hasCounts = counts !== undefined;
        return {
          codeId: cid, codeName: code.name,
          color: resolveCodeColor(code, idx),
          kappa: selectedEdge.perCodeKappa[cid] ?? 0,
          userTexts: hasCounts ? counts.shared : undefined,
          c1n: hasCounts ? c1n : undefined,
          c2n: hasCounts ? c2n : undefined,
          c1Name: selectedEdge.coder1Name,
          c2Name: selectedEdge.coder2Name,
        };
      }).sort((a, b) => b.kappa - a.kappa);
    }
    if (selectedNode) {
      const textCounts = getTexts([selectedNode.id]);
      const nodePairs = runData.pairwise.filter(p =>
        (p.coder1 === selectedNode.id || p.coder2 === selectedNode.id) &&
        visibleEdges.some(e => e.id === `${p.coder1}-${p.coder2}`)
      );
      return weightedCodeKappa(nodePairs, runData.codes.filter((code) => !isUnknownCode(code.name))).map(b => ({
        ...b, userTexts: textCounts[b.codeId],
      }));
    }
    // All visible pairs — collect coders, respecting filteredCoderIds
    const coderSet = new Set<number>();
    for (const e of visibleEdges) {
      if (filteredCoderIds.size === 0 || filteredCoderIds.has(e.coder1)) coderSet.add(e.coder1);
      if (filteredCoderIds.size === 0 || filteredCoderIds.has(e.coder2)) coderSet.add(e.coder2);
    }
    const textCounts = getTexts([...coderSet]);
    const visiblePairs = runData.pairwise.filter(p =>
      visibleEdges.some(e => e.id === `${p.coder1}-${p.coder2}`)
    );
    return weightedCodeKappa(visiblePairs, runData.codes.filter((code) => !isUnknownCode(code.name))).map(b => ({
      ...b, userTexts: textCounts[b.codeId],
    }));
  }, [runData, selectedEdge, selectedNode, visibleEdges, filteredCoderIds]);

  const overallReferenceKappa = runData.overall.kappa;

  const [sliderMin, sliderMax] = useMemo(() => {
    if (!allEdges.length) return [-0.2, 1];
    return [
      Math.floor((d3.min(allEdges, e => e.kappa) ?? -0.2) * 20) / 20,
      1,
    ];
  }, [allEdges]);

  // Refs for values needed inside D3 tick — avoids stale closure bugs
  const effectiveEdgesRef = useRef<Edge[]>([]);
  const visibleNodeIdsRef = useRef<Set<number>>(new Set());
  const kappaLowRef       = useRef(kappaLow);
  const kappaHighRef      = useRef(kappaHigh);
  useEffect(() => { effectiveEdgesRef.current = effectiveEdges; }, [effectiveEdges]);
  useEffect(() => { visibleNodeIdsRef.current = visibleNodeIds; }, [visibleNodeIds]);
  useEffect(() => { kappaLowRef.current  = kappaLow;  }, [kappaLow]);
  useEffect(() => { kappaHighRef.current = kappaHigh; }, [kappaHigh]);

  const redrawEdges = useCallback((edgeG: d3.Selection<SVGGElement, unknown, null, undefined>) => {
    // All state read from refs — safe inside D3 tick, always current
    const edges      = effectiveEdgesRef.current;
    const curEgo     = egoNodeIdsRef.current;
    const curSelNode = selectedNodeRef.current;
    const curSelEdge = selectedEdgeRef.current;
    const curHoverEdge = hoveredEdgeIdRef.current;
    const low        = kappaLowRef.current;
    const high       = kappaHighRef.current;
    const nExtent    = d3.extent(edges, e => e.n) as [number, number];
    const ew         = d3.scaleSqrt().domain([nExtent[0] ?? 0, nExtent[1] ?? 1]).range([1, 7]).clamp(true);

    edgeG.selectAll<SVGPathElement, Edge>("path.hit-area")
      .data(edges, d => d.id)
      .join("path")
      .attr("class", "hit-area")
      .attr("fill", "none")
      .attr("stroke", "transparent")
      .attr("stroke-width", d => Math.max(ew(d.n) + 10, 12))
      .attr("d", d => straightPath(
        d.source.x ?? 0, d.source.y ?? 0,
        d.target.x ?? 0, d.target.y ?? 0,
        d.source.r, d.target.r
      ))
      .style("pointer-events", d => {
        const inRange = d.kappa >= low && d.kappa <= high;
        if (!inRange) return "none";
        if (curSelEdge) return d.id === curSelEdge.id ? "stroke" : "none";
        if (curEgo && curSelNode) {
          return (d.coder1 === curSelNode.id || d.coder2 === curSelNode.id) ? "stroke" : "none";
        }
        return "stroke";
      })
      .style("cursor", "pointer")
      .on("mouseenter", (e, d) => {
        if (!isDragging.current) {
          setHoveredEdgeId(d.id);
          setTooltip({ x: e.clientX, y: e.clientY, type: "edge", edge: d });
        }
      })
      .on("mousemove",  (e, d) => {
        if (!isDragging.current) {
          setHoveredEdgeId(d.id);
          setTooltip({ x: e.clientX, y: e.clientY, type: "edge", edge: d });
        }
      })
      .on("mouseleave", () => {
        setHoveredEdgeId(null);
        setTooltip(null);
      })
      .on("click", (_, d) => {
        setSelectedEdge(prev => prev?.id === d.id ? null : d);
        setHoveredEdgeId(d.id);
        setTooltip(null);
      });

    edgeG.selectAll<SVGPathElement, Edge>("path.visible-edge")
      .data(edges, d => d.id)
      .join("path")
      .attr("class", "visible-edge")
      .attr("fill", "none")
      .attr("stroke", d => kappaScale(Math.max(0, d.kappa)))
      .attr("stroke-width", d => curHoverEdge === d.id ? ew(d.n) + 2.5 : ew(d.n))
      .style("transition", "stroke-opacity 0.8s ease, stroke-width 0.5s ease")
      .style("stroke-opacity", d => {
        const inRange = d.kappa >= low && d.kappa <= high;
        if (!inRange) return "0";
        // Edge selection takes priority over node ego filter
        if (curSelEdge) return d.id === curSelEdge.id ? "1" : "0.08";
        if (curHoverEdge) return d.id === curHoverEdge ? "1" : "0.2";
        if (curEgo && curSelNode) {
          return (d.coder1 === curSelNode.id || d.coder2 === curSelNode.id) ? "0.85" : "0";
        }
        return "0.78";
      })
      .style("pointer-events", "none")
      .attr("filter", d => curSelEdge?.id === d.id || curHoverEdge === d.id ? "drop-shadow(0 0 3px rgba(0,0,0,0.25))" : "none")
      .attr("d", d => straightPath(
        d.source.x ?? 0, d.source.y ?? 0,
        d.target.x ?? 0, d.target.y ?? 0,
        d.source.r, d.target.r
      ))
      .attr("stroke-linecap", "round");
  }, []); // stable — reads only from refs

  useEffect(() => {
    if (!svgRef.current || !nodes.length) return;
    const svg = d3.select(svgRef.current);
    const W = containerRef.current?.clientWidth  || 700;
    const H = containerRef.current?.clientHeight || 600;
    svg.selectAll("*").remove();

    const g = svg.append("g");
    svg.call(d3.zoom<SVGSVGElement, unknown>().scaleExtent([0.2, 4])
      .on("zoom", e => g.attr("transform", e.transform)));

    const edgeG = g.append("g").attr("class", "edges");
    const nodeG = g.append("g").attr("class", "nodes");

    const sim = d3.forceSimulation<Node>(nodes)
      .alphaDecay(0.015)
      .force("link", d3.forceLink<Node, Edge>(allEdges)
        .id(d => String(d.id)).distance(110).strength(0.3))
      .force("charge", d3.forceManyBody().strength(-280))
      .force("center",  d3.forceCenter(W / 2, H / 2))
      .force("collision", d3.forceCollide<Node>().radius(d => d.r + 12));

    const nodeSel = nodeG.selectAll<SVGGElement, Node>("g")
      .data(nodes, d => d.id).join("g").style("cursor", "pointer")
      .on("mouseenter", (e, d) => {
        if (!isDragging.current) {
          setHoveredNodeId(d.id);
          setTooltip({ x: e.clientX, y: e.clientY, type: "node", node: d });
        }
      })
      .on("mousemove",  (e, d) => {
        if (!isDragging.current) {
          setHoveredNodeId(d.id);
          setTooltip({ x: e.clientX, y: e.clientY, type: "node", node: d });
        }
      })
      .on("mouseleave", () => {
        setHoveredNodeId(null);
        setTooltip(null);
      })
      .on("click", (_, d) => {
        setSelectedEdge(null);
        setSelectedNode(prev => prev?.id === d.id ? null : d);
        setHoveredNodeId(d.id);
        setTooltip(null);
      })
      .call(d3.drag<SVGGElement, Node>()
        .on("start", (e, d) => { isDragging.current = true; setTooltip(null); if (!e.active) sim.alphaTarget(0.3).restart(); d.fx = d.x; d.fy = d.y; })
        .on("drag",  (e, d) => { d.fx = e.x; d.fy = e.y; })
        .on("end",   (e, d) => { isDragging.current = false; if (!e.active) sim.alphaTarget(0); d.fx = null; d.fy = null; })
      );

    nodeSel.append("circle").attr("r", d => d.r + 3).attr("fill", "rgba(0,0,0,0.05)").attr("cy", 2);
    nodeSel.append("circle").attr("r", d => d.r).attr("fill", "#eef2ff").attr("stroke", "#6366f1").attr("stroke-width", 2);
    nodeSel.append("text")
      .text(d => d.name.split(" ")[0])
      .attr("text-anchor", "middle").attr("dominant-baseline", "central")
      .attr("font-size", d => Math.max(8, Math.min(11, d.r * 0.62)))
      .attr("font-family", "system-ui, sans-serif").attr("font-weight", 600)
      .attr("fill", "#4338ca").attr("pointer-events", "none");

    sim.on("tick", () => {
      nodeSel.attr("transform", d => `translate(${d.x ?? 0},${d.y ?? 0})`);
      redrawEdges(edgeG);
    });

    simRef.current = sim;
    (svgRef.current as ExtSVG).__edgeG = edgeG;
    (svgRef.current as ExtSVG).__nodeG = nodeG;
    return () => { sim.stop(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  useEffect(() => {
    const el = svgRef.current as ExtSVG | null;
    if (el?.__edgeG) redrawEdges(el.__edgeG);
    // Update node highlight
    if (el?.__nodeG) {
      const curEgoH   = egoNodeIdsRef.current;
      const curSelH   = selectedNodeRef.current;
      const curHoverNodeId = hoveredNodeIdRef.current;
      const curVisible = visibleNodeIdsRef.current;
      el.__nodeG.selectAll<SVGGElement, Node>("g").each(function(d) {
        const isSelected = curSelH?.id === d.id;
        const isHovered = curHoverNodeId === d.id;
        const inVisibleSet = curVisible.has(d.id);
        const inEgo = inVisibleSet && (!curEgoH || curEgoH.has(d.id));
        // When an edge is selected, fade nodes not part of that edge
        const curSE = selectedEdgeRef.current;
        const inEdge = !curSE || d.id === curSE.coder1 || d.id === curSE.coder2;
        d3.select(this)
          .attr("display", inEgo ? null : "none")
          .style("transition", "opacity 0.75s ease")
          .style("opacity", inEgo && inEdge ? "1" : inEgo ? "0.12" : "0")
          .style("pointer-events", inEgo ? "auto" : "none");
        d3.select(this).selectAll("circle:not(:first-child)")
          .attr("stroke", isSelected || isHovered ? "#4f46e5" : "#6366f1")
          .attr("stroke-width", isSelected ? 3.5 : isHovered ? 3 : 2)
          .attr("opacity", 1);
        d3.select(this).selectAll("text").attr("opacity", 1);
      });
    }
  }, [allEdges, kappaLow, kappaHigh, selectedEdge, selectedNode, hoveredNodeId, hoveredEdgeId, egoNodeIds, selectedCodes, effectiveEdges, visibleNodeIds, redrawEdges]);

  // When a node is selected, pin it to center and gently restart sim
  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    const W = containerRef.current?.clientWidth  || 700;
    const H = containerRef.current?.clientHeight || 600;

    // Unpin all first
    for (const n of nodes) { n.fx = null; n.fy = null; }

    if (selectedNode) {
      // Pin selected node to center
      const target = nodes.find(n => n.id === selectedNode.id);
      if (target) { target.fx = W / 2; target.fy = H / 2; }
    }

    sim.alphaDecay(0.02).alpha(0.15).restart();
  }, [selectedNode, nodes]);

  const barTitle = selectedEdge
    ? `${selectedEdge.coder1Name} × ${selectedEdge.coder2Name}`
    : selectedNode
    ? selectedNode.name
    : "All visible pairs";
  const barSubtitle = selectedEdge
    ? `κ = ${selectedEdge.kappa.toFixed(3)} · ${kappaLabel(selectedEdge.kappa)} · ${fmt(selectedEdge.n)} co-coded`
    : selectedNode
    ? `Avg κ across ${allEdges.filter(e => e.coder1 === selectedNode.id || e.coder2 === selectedNode.id).length} connections`
    : selectedCodes.size > 0
    ? `Per-code κ · ${[...selectedCodes].map(cid => runData?.codes.find(c => String(c.id) === cid)?.name ?? cid).join(', ')} · ${visibleEdges.length} pairs`
    : `Weighted avg across ${visibleEdges.length} pairs`;

  const handleCoderFilterChange = useCallback((next: Set<number>) => {
    if (!setsEqual(next, filteredCoderIds)) {
      setSelectedEdge(null);
      setSelectedNode(null);
    }
    setFilteredCoderIds(next);
  }, [filteredCoderIds]);

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ height: "100vh", padding: "1.75rem 2rem 1.75rem", boxSizing: "border-box", overflow: "hidden" }}>
        <div style={{ height: "100%", minHeight: 0, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 380px", gap: "1.5rem", alignItems: "stretch" }}>
          <section style={{ minHeight: 0, background: "white", border: "1px solid #e5e7eb", borderRadius: 18, boxShadow: "0 10px 30px rgba(15,23,42,0.05)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <div style={{ padding: "1.35rem 1.5rem 0.9rem", borderBottom: "1px solid #eef2f7" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem", flexWrap: "wrap" }}>
                <div>
                  <h1 style={{ margin: 0, fontSize: "1.65rem", color: "#0f172a", fontWeight: 650 }}>Coder agreement network</h1>
                  <div style={{ fontSize: "0.9rem", color: "#64748b", marginTop: 8 }}>
                    {runData && `Analysis range: ${formatDisplayRange(runData.params.startDate, runData.params.endDate)}.`} Hover a coder or edge to inspect code-level agreement, click to filter.
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <RangeSlider
                    min={sliderMin} max={sliderMax} low={kappaLow} high={kappaHigh}
                    onChange={(l, h) => { setKappaLow(l); setKappaHigh(h); }}
                  />
                  {(selectedEdge || selectedNode || selectedCodes.size > 0 || filteredCoderIds.size > 0) && (
                    <button
                      onClick={() => { setSelectedEdge(null); setSelectedNode(null); setSelectedCodes(new Set()); setFilteredCoderIds(new Set()); }}
                      style={{ padding: "0.38rem 0.75rem", borderRadius: 8, border: "1px solid #dbe2ea", background: "white", fontSize: "0.78rem", color: "#475569", cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}
                    >
                      Reset
                    </button>
                  )}
                </div>
              </div>
              {runData && (
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", paddingTop: "0.65rem", marginTop: "0.35rem", borderTop: "1px solid #f1f5f9" }}>
                  <GenericFilterDropdown
                    label="coders"
                    items={runData.coders.map(c => ({ id: c.id, name: c.name }))}
                    selected={filteredCoderIds}
                    onChange={handleCoderFilterChange}
                  />
                  {runData.codes.length > 0 && (
                    <CodeFilterDropdown
                      codes={runData.codes}
                      selected={selectedCodes}
                      onChange={setSelectedCodes}
                    />
                  )}
                </div>
              )}
            </div>

            <div style={{ flex: 1, minHeight: 0, padding: "1rem 1.15rem 1.2rem", display: "flex", flexDirection: "column" }}>
              <div ref={containerRef} style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden", background: "white", borderRadius: 14, border: "1px solid #e5e7eb" }}>
          
          {!runData && (
            <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "0.5rem", color: "#9ca3af" }}>
              <div style={{ fontSize: "0.875rem", fontWeight: 500 }}>No data found</div>
              <div style={{ fontSize: "0.75rem" }}>Add a newer latest-run.json to update this site</div>
            </div>
          )}

          <div style={{ position: "absolute", top: 12, right: 12, zIndex: 5 }}>
            <InfoButton />
          </div>

          <svg ref={svgRef} width="100%" height="100%" style={{ display: "block", borderRadius: 12 }} />

          {/* In-graph legend — bottom right */}
          {runData && (
            <div style={{
              position: "absolute", bottom: 16, right: 16, zIndex: 4,
              background: "rgba(255,255,255,0.92)", backdropFilter: "blur(4px)",
              border: "1px solid #e5e7eb", borderRadius: 10,
              padding: "0.75rem 0.875rem",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              display: "flex", flexDirection: "column", gap: "0.75rem",
              fontSize: "0.68rem", fontFamily: "system-ui, sans-serif",
            }}>

              {/* Kappa color scale */}
              <div>
                <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.4rem" }}>
                  Agreement (κ)
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                  {([
                    [0,    "< 0.20", "Slight"],
                    [0.2,  "0.20 – 0.40", "Fair"],
                    [0.4,  "0.40 – 0.60", "Moderate"],
                    [0.6,  "0.60 – 0.80", "Substantial"],
                    [0.8,  "> 0.80", "Almost perfect"],
                  ] as [number, string, string][]).map(([v, range, label]) => (
                    <div key={v} style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                      <div style={{ width: 28, height: 3, background: kappaScale(v + 0.1), borderRadius: 2, flexShrink: 0 }} />
                      <span style={{ color: "#6b7280", minWidth: 72 }}>{range}</span>
                      <span style={{ color: "#9ca3af" }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: "#f1f5f9", margin: "0 -0.25rem" }} />

              {/* Node size legend */}
              <div>
                <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.4rem" }}>
                  Node size — texts coded
                </div>
                <div style={{ display: "flex", alignItems: "flex-end", gap: "0.875rem" }}>
                  {([
                    [10, nodeSizeLegend[0]],
                    [18, nodeSizeLegend[1]],
                    [26, nodeSizeLegend[2]],
                  ] as [number, number][]).map(([r, count]) => (
                    <div key={r} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "0.3rem" }}>
                      <div style={{
                        width: r, height: r, borderRadius: "50%",
                        background: "#eef2ff", border: "2px solid #6366f1",
                        flexShrink: 0,
                      }} />
                      <span style={{ color: "#9ca3af", fontSize: "0.65rem" }}>{count >= 1000 ? `${(count/1000).toFixed(1)}k` : count}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: "#f1f5f9", margin: "0 -0.25rem" }} />

              {/* Edge thickness legend */}
              <div>
                <div style={{ fontSize: "0.6rem", fontWeight: 700, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: "0.4rem" }}>
                  Edge thickness — co-coded texts
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                  {([
                    [1, "few"],
                    [3, "some"],
                    [6, "many"],
                  ] as [number, string][]).map(([w, label]) => (
                    <div key={w} style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <div style={{ width: 28, height: w, background: "#94a3b8", borderRadius: 2, flexShrink: 0 }} />
                      <span style={{ color: "#9ca3af" }}>{label}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}
              </div>
            </div>
            <div
              style={{
                borderTop: "1px solid #eef2f7",
                fontSize: "0.9rem",
                color: "#64748b",
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

          <aside style={{ background: "white", border: "1px solid #e5e7eb", borderRadius: 18, padding: "1.25rem", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", boxShadow: "0 10px 30px rgba(15,23,42,0.05)" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.8rem", marginBottom: "0.85rem" }}>
              <div>
                <div style={{ fontSize: "0.98rem", fontWeight: 800, color: "#0f172a" }}>Selection details</div>
                <div style={{ marginTop: 5, fontSize: "0.82rem", lineHeight: 1.5, color: "#64748b" }}>
                  Click a coder or edge to pin its code-level breakdown here. Use the filters above to narrow the network before selecting a node or pair.
                </div>
              </div>
              {runData && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "0.55rem" }}>
                  <StatPill label="Overall κ" value={runData.overall.kappa.toFixed(3)} color={kappaScale(runData.overall.kappa)} />
                  <StatPill label="Coders" value={`${displayedNodeCount} / ${nodes.length}`} />
                  <StatPill label="Visible" value={`${displayedEdges.length} / ${allEdges.length}`} />
                </div>
              )}
            </div>
            <div style={{
              flex: 1, minHeight: 0, background: "white", borderRadius: 12,
              border: `1px solid ${selectedEdge || selectedNode ? "#6366f1" : "#e5e7eb"}`,
              boxShadow: selectedEdge || selectedNode ? "0 0 0 2px rgba(99,102,241,0.12)" : "none",
              transition: "border-color 0.2s, box-shadow 0.2s",
              display: "flex", flexDirection: "column", overflow: "hidden",
            }}>
              {barData.length > 0
                ? <KappaBarChart bars={barData} title={barTitle} subtitle={barSubtitle} selectedCodes={selectedCodes}
                    onCodeClick={cid => setSelectedCodes(prev => {
                      const n = new Set(prev);
                      if (n.has(cid)) n.delete(cid);
                      else n.add(cid);
                      return n;
                    })}
                    referenceKappa={overallReferenceKappa} />
                : <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: "0.86rem", padding: "1.25rem", textAlign: "center" }}>
                    Click an edge or coder to see a per-code agreement breakdown.
                  </div>
              }
            </div>
          </aside>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div style={{ position: "fixed", left: tooltip.x + 14, top: tooltip.y - 14, background: "#1f2937", color: "white", borderRadius: 8, padding: "0.7rem 0.85rem", fontSize: "0.75rem", pointerEvents: "none", zIndex: 1000, boxShadow: "0 8px 20px rgba(0,0,0,0.25)", maxWidth: 320 }}>
          {tooltip.type === "node" && tooltip.node && (() => {
            const counts = runData?.coderCodeCounts?.[String(tooltip.node!.id)] ?? {};
            const codesToShow = selectedCodes.size > 0
              ? runData?.codes.filter(c => selectedCodes.has(String(c.id))) ?? []
              : runData?.codes ?? [];
            const codeEntries = codesToShow
              .map((code, idx) => {
                const realIdx = runData?.codes.indexOf(code) ?? idx;
                const n = counts[String(code.id)] ?? 0;
                return n > 0 ? { name: code.name, color: resolveCodeColor(code, realIdx), n } : null;
              })
              .filter(Boolean) as { name: string; color: string; n: number }[];
            return (
              <>
                <div style={{ fontWeight: 700, marginBottom: 6, fontSize: "0.85rem" }}>{tooltip.node!.name}</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.72rem" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", color: "#94a3b8", fontWeight: 700, padding: "0 0 0.35rem" }}>Series</th>
                      <th style={{ textAlign: "right", color: "#94a3b8", fontWeight: 700, padding: "0 0 0.35rem" }}>Texts</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderTop: "1px solid rgba(148,163,184,0.14)" }}>
                      <td style={{ padding: "0.32rem 0.6rem 0.32rem 0", color: "#e2e8f0", fontWeight: 700 }}>Total</td>
                      <td style={{ padding: "0.32rem 0", textAlign: "right", color: "white", fontWeight: 700 }}>{fmt(tooltip.node!.total)}</td>
                    </tr>
                    {codeEntries.map(e => (
                      <tr key={e.name} style={{ borderTop: "1px solid rgba(148,163,184,0.14)" }}>
                        <td style={{ padding: "0.32rem 0.6rem 0.32rem 0", color: "#cbd5e1" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: e.color, flexShrink: 0 }} />
                            <span>{e.name}</span>
                          </span>
                        </td>
                        <td style={{ padding: "0.32rem 0", textAlign: "right", color: "white", fontWeight: 600 }}>{fmt(e.n)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            );
          })()}
          {tooltip.type === "edge" && tooltip.edge && (() => {
            const edge = tooltip.edge!;
            const codesToShow = selectedCodes.size > 0
              ? runData?.codes.filter(c => selectedCodes.has(String(c.id))) ?? []
              : runData?.codes ?? [];
            const codeEntries = codesToShow
              .map((code) => {
                const cid = String(code.id);
                const realIdx = runData?.codes.indexOf(code) ?? 0;
                const counts = edge.perCodeCounts[cid];
                const c1n = counts?.coder1;
                const c2n = counts?.coder2;
                const shared = counts?.shared;
                const k = edge.perCodeKappa[cid];
                return (k !== undefined || counts !== undefined) ? {
                  name: code.name, color: resolveCodeColor(code, realIdx),
                  k: k ?? 0,
                  c1n, c2n, shared,
                } : null;
              })
              .filter(Boolean) as { name: string; color: string; k: number; c1n?: number; c2n?: number; shared?: number }[];
            return (
              <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "1rem", marginBottom: 6 }}>
                  <div style={{ fontWeight: 700, fontSize: "0.85rem" }}>{edge.coder1Name} × {edge.coder2Name}</div>
                  <div style={{ color: "#cbd5e1", fontSize: "0.72rem", fontWeight: 700 }}>{fmt(edge.n)} total codings</div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.7rem" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", color: "#94a3b8", fontWeight: 700, padding: "0 0 0.35rem" }}>Series</th>
                      <th style={{ textAlign: "right", color: "#94a3b8", fontWeight: 700, padding: "0 0 0.35rem" }}>{edge.coder1Name.split(" ")[0]}</th>
                      <th style={{ textAlign: "right", color: "#94a3b8", fontWeight: 700, padding: "0 0 0.35rem" }}>{edge.coder2Name.split(" ")[0]}</th>
                      <th style={{ textAlign: "right", color: "#94a3b8", fontWeight: 700, padding: "0 0 0.35rem" }}>Kappa</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr style={{ borderTop: "1px solid rgba(226,232,240,0.4)" }}>
                      <td style={{ padding: "0.38rem 0.6rem 0.32rem 0", color: "#e2e8f0" }}>Overall</td>
                      <td style={{ padding: "0.38rem 0.45rem 0.32rem", textAlign: "right", color: "#64748b" }}>—</td>
                      <td style={{ padding: "0.38rem 0.45rem 0.32rem", textAlign: "right", color: "#64748b" }}>—</td>
                      <td style={{ padding: "0.38rem 0 0.32rem 0.45rem", textAlign: "right", color: kappaScale(Math.max(0, edge.kappa)), fontWeight: 700 }}>
                        {edge.kappa.toFixed(3)}
                      </td>
                    </tr>
                    {codeEntries.map(e => (
                      <tr key={e.name} style={{ borderTop: "1px solid rgba(148,163,184,0.14)" }}>
                        <td style={{ padding: "0.32rem 0.6rem 0.32rem 0", color: "#cbd5e1" }}>
                          <span style={{ display: "flex", alignItems: "center", gap: "0.3rem", minWidth: 0 }}>
                            <span style={{ width: 7, height: 7, borderRadius: "50%", background: e.color, flexShrink: 0 }} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{e.name}</span>
                          </span>
                        </td>
                        <td style={{ padding: "0.32rem 0.45rem", textAlign: "right", color: "#cbd5e1" }}>{e.c1n !== undefined ? fmt(e.c1n) : "—"}</td>
                        <td style={{ padding: "0.32rem 0.45rem", textAlign: "right", color: "#cbd5e1" }}>{e.c2n !== undefined ? fmt(e.c2n) : "—"}</td>
                        <td style={{ padding: "0.32rem 0 0.32rem 0.45rem", textAlign: "right", color: kappaScale(Math.max(0, e.k)), fontWeight: 700 }}>{e.k.toFixed(3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}
