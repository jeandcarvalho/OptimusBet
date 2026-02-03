// src/Pages/Fixture.tsx
import React, { useEffect, useMemo, useState } from "react";

import { useNavigate, useParams } from "react-router-dom";


import { parseCsv, fmtDateBrOnly, fmtNum, tryInt, type Row } from "../lib/rodada";

// ✅ build-time CSVs
const ENRICH_RAW = import.meta.glob("../top12_enriched_out/*__top12_enriched.csv", {
  as: "raw",
  eager: true,
}) as Record<string, string>;

const PANELS_RAW = import.meta.glob("../rodada_csvs/*__panels.csv", {
  as: "raw",
  eager: true,
}) as Record<string, string>;

// ----------------------------------------------------
// small helpers
// ----------------------------------------------------
function tryFloat(x: unknown): number | null {
  if (x == null) return null;
  const s = String(x).trim().replace(",", ".");
  if (!s) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

function pickByFixtureId(globMap: Record<string, string>, id: string) {
  const needle = `__ID${id}__`;
  const keys = Object.keys(globMap);

  // 1) match rápido por filename
  const byName = keys.find((p) => (p.split("/").pop() || p).includes(needle));
  if (byName) return { path: byName, raw: globMap[byName] };

  // 2) fallback lendo fixture_id (robusto)
  for (const p of keys) {
    const rows = parseCsv(globMap[p]);
    const hit = rows?.some((r) => String(r["fixture_id"] || "").trim() === String(id).trim());
    if (hit) return { path: p, raw: globMap[p] };
  }

  return null;
}

function weightFromRank(rank: number | null): number {
  if (rank == null || rank <= 0) return 0;
  return 1 / rank; // Top1 = 1.0, Top2 = 0.5, Top3 = 0.333...
}

// ----------------------------------------------------
// Confidence (variância / CV)
// ----------------------------------------------------
const CV_VERDE_MAX = 35.0;
const CV_AMARELO_MAX = 60.0;
const EPS = 1e-6;

function varianceWeighted(values: Array<number | null>, weights: number[]): number | null {
  let sw = 0;
  let mean = 0;

  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const w = weights[i] ?? 0;
    if (v == null || w <= 0) continue;
    mean += v * w;
    sw += w;
  }
  if (sw <= 0) return null;
  mean /= sw;

  let varSum = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const w = weights[i] ?? 0;
    if (v == null || w <= 0) continue;
    const d = v - mean;
    varSum += w * d * d;
  }
  return varSum / sw;
}

function cvPercent(values: Array<number | null>, weights: number[]): number | null {
  const v = varianceWeighted(values, weights);
  if (v == null) return null;

  let sw = 0;
  let mean = 0;
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    const w = weights[i] ?? 0;
    if (x == null || w <= 0) continue;
    mean += x * w;
    sw += w;
  }
  if (sw <= 0) return null;
  mean /= sw;

  const sd = Math.sqrt(Math.max(0, v));

  if (Math.abs(mean) < EPS) {
    return sd < EPS ? 0 : 999;
  }

  return (sd / Math.abs(mean)) * 100.0;
}

type ConfTone = "green" | "yellow" | "red" | "gray";

function confidenceFromCv(cv: number | null): { pct: number | null; tone: ConfTone; label: string } {
  if (cv == null || !Number.isFinite(cv)) return { pct: null, tone: "gray", label: "sem dados" };

  const cap = 120;
  const clamped = Math.max(0, Math.min(cap, cv));
  const pct = Math.round(100 - (clamped / cap) * 100);

  const tone: ConfTone = cv <= CV_VERDE_MAX ? "green" : cv <= CV_AMARELO_MAX ? "yellow" : "red";
  const label = tone === "green" ? "confiança alta" : tone === "yellow" ? " confiança média " : " confiança baixa";
  return { pct, tone, label };
}

// ----------------------------------------------------
// Enriched row -> picks por PERSPECTIVA (SÓ “A FAVOR”)
// ----------------------------------------------------
type EnrichedPick = {
  rank: number | null;
  w: number;

  date_prev: string;
  home_prev: string;
  away_prev: string;
  score_prev: string;

  gf: number | null;
  corners_for: number | null;
  yellows_for: number | null;
  reds_for: number | null;
  fouls_for: number | null;
  shots_for: number | null;
  shots_on_for: number | null;

  fd_found: boolean;
  fd_reason: string;
};

function basePick(r: Row) {
  const rank = tryInt(r["rank"]);
  const w = weightFromRank(rank);

  const fd_found = String(r["fd_found"] || "").toLowerCase() === "true";
  const fd_reason = String(r["fd_reason"] || "").trim();

  return {
    rank,
    w,
    date_prev: String(r["utcDate_prev"] || r["date_prev"] || "").trim(),
    home_prev: String(r["home_prev"] || "").trim(),
    away_prev: String(r["away_prev"] || "").trim(),
    score_prev: String(r["score_fulltime_prev"] || "").trim(),
    fd_found,
    fd_reason,
  };
}

function pickHomePerspective(r: Row): EnrichedPick {
  const b = basePick(r);
  return {
    ...b,
    gf: tryFloat(r["fd_FTHG"]),
    corners_for: tryFloat(r["fd_HC"]),
    yellows_for: tryFloat(r["fd_HY"]),
    reds_for: tryFloat(r["fd_HR"]),
    fouls_for: tryFloat(r["fd_HF"]),
    shots_for: tryFloat(r["fd_HS"]),
    shots_on_for: tryFloat(r["fd_HST"]),
  };
}

function pickAwayPerspective(r: Row): EnrichedPick {
  const b = basePick(r);
  return {
    ...b,
    gf: tryFloat(r["fd_FTAG"]),
    corners_for: tryFloat(r["fd_AC"]),
    yellows_for: tryFloat(r["fd_AY"]),
    reds_for: tryFloat(r["fd_AR"]),
    fouls_for: tryFloat(r["fd_AF"]),
    shots_for: tryFloat(r["fd_AS"]),
    shots_on_for: tryFloat(r["fd_AST"]),
  };
}

// ----------------------------------------------------
// Means
// ----------------------------------------------------
function meanSimple(values: Array<number | null>): number | null {
  let s = 0;
  let n = 0;
  for (const v of values) {
    if (v == null) continue;
    s += v;
    n += 1;
  }
  return n ? s / n : null;
}

function meanWeighted(values: Array<number | null>, weights: number[]): number | null {
  let sw = 0;
  let s = 0;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    const w = weights[i] ?? 0;
    if (v == null || w <= 0) continue;
    s += v * w;
    sw += w;
  }
  return sw > 0 ? s / sw : null;
}

// ----------------------------------------------------
// UI bits
// ----------------------------------------------------
function Pill({ children, cls }: { children: React.ReactNode; cls?: string }) {
  return (
    <span
      className={[
        "rounded-full border px-3 py-1 text-[11px] font-black shadow-sm",
        cls || "border-white/10 bg-white/5",
      ].join(" ")}
    >
      {children}
    </span>
  );
}

function BigPos({ pos, tone }: { pos: number | null; tone: "home" | "away" }) {
  if (pos == null) return null;
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-black tabular-nums",
        tone === "home"
          ? "border-blue-400/30 bg-blue-500/15 text-blue-200"
          : "border-red-400/30 bg-red-500/15 text-red-200",
      ].join(" ")}
    >
      #{pos}
    </span>
  );
}

function ConfBadge({ pct, tone, label }: { pct: number | null; tone: ConfTone; label: string }) {
  const cls =
    tone === "green"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : tone === "yellow"
      ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-200"
      : tone === "red"
      ? "border-red-400/30 bg-red-400/10 text-red-200"
      : "border-white/10 bg-white/5 text-white/70";

  return (
    <span className={["inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-black", cls].join(" ")}>
      <span>{pct == null ? "—" : `${pct}%`}</span>
      <span className="opacity-75">{label}</span>
    </span>
  );
}

function StatRow({
  label,
  simple,
  weighted,
  conf,
}: {
  label: string;
  simple: number | null;
  weighted: number | null;
  conf: { pct: number | null; tone: ConfTone; label: string };
}) {
  return (
    <div className="flex flex-col gap-2 border-b border-white/5 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="text-xs font-black opacity-95">{label}</div>
          <ConfBadge pct={conf.pct} tone={conf.tone} label={conf.label} />
        </div>
      </div>

      <div className="flex items-end justify-between gap-4 tabular-nums sm:justify-end">
        <div className="text-left sm:text-right">
          <div className="text-[10px] uppercase tracking-wide opacity-60">simples</div>
          <div className="text-base font-black">{fmtNum(simple, 2)}</div>
        </div>
        <div className="text-left sm:text-right">
          <div className="text-[10px] uppercase tracking-wide opacity-60">ponderada</div>
          <div className="text-base font-black">{fmtNum(weighted, 2)}</div>
        </div>
      </div>
    </div>
  );
}

function SectionCard({
  title,
  subtitle,
  children,
  tone,
}: {
  title: React.ReactNode;
  subtitle?: string;
  children: React.ReactNode;
  tone: "home" | "away" | "neutral";
}) {
  const toneBg =
    tone === "home"
      ? "bg-[radial-gradient(1000px_3260px_at_20%_0%,rgba(47,125,255,0.24),transparent_92%),linear-gradient(180deg,rgba(255,255,255,0.12),rgba(0,0,0,0.30))]"
      : tone === "away"
      ? "bg-[radial-gradient(1000px_3260px_at_80%_0%,rgba(255,59,59,0.20),transparent_92%),linear-gradient(180deg,rgba(255,255,255,0.12),rgba(0,0,0,0.30))]"
      : "bg-[linear-gradient(180deg,rgba(255,255,255,0.10),rgba(0,0,0,0.28))]";

  return (
    <div className={["rounded-2xl border border-white/10 p-4 shadow-2xl", toneBg].join(" ")}>
      <div className="min-w-0">
        <div className="text-sm font-black">{title}</div>
        {subtitle && <div className="mt-1 text-xs opacity-70">{subtitle}</div>}
      </div>
      <div className="mt-3 rounded-2xl border border-white/10 bg-black/25 p-3">{children}</div>
    </div>
  );
}

function MetricGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
      <div className="text-[11px] font-black uppercase tracking-wide opacity-80">{title}</div>
      <div className="mt-2">{children}</div>
    </div>
  );
}

// ----------------------------------------------------
// Similar games: Mobile = accordion per jogo; Desktop = tabela
// ----------------------------------------------------
function StatusChip({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="rounded-full border border-emerald-400/25 bg-emerald-400/10 px-2 py-1 text-[10px] font-black text-emerald-200">
      OK
    </span>
  ) : (
    <span className="rounded-full border border-red-400/25 bg-red-400/10 px-2 py-1 text-[10px] font-black text-red-200">
      SEM MATCH
    </span>
  );
}

function MobileSimilarAccordion({
  rows,
  tone,
  defaultOpenIndex,
}: {
  rows: EnrichedPick[];
  tone: "home" | "away";
  defaultOpenIndex?: number | null;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(defaultOpenIndex ?? null);

  const boxTone =
    tone === "home" ? "border-blue-400/20 bg-blue-500/5" : "border-red-400/20 bg-red-500/5";

  return (
    <div className={["rounded-2xl border p-3 md:hidden", boxTone].join(" ")}>
      <div className="mt-3 grid gap-2">
        {rows.map((p, i) => {
          const ok = p.fd_found;
          const isOpen = openIdx === i;
          const dtPrev = fmtDateBrOnly(p.date_prev || "");

          return (
            <div key={i} className="rounded-2xl border border-white/10 bg-black/25 overflow-hidden">
              {/* HEADER compact (sempre visível) */}
              <button
                type="button"
                onClick={() => setOpenIdx(isOpen ? null : i)}
                className="w-full text-left px-3 py-3 hover:bg-white/5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black tabular-nums">#{p.rank ?? i + 1}</span>
                      <span className="text-xs opacity-70 whitespace-nowrap">{dtPrev || "—"}</span>
                      <span className="text-xs font-black tabular-nums opacity-80">w {fmtNum(p.w, 3)}</span>
                      <StatusChip ok={ok} />
                    </div>

                    <div className="mt-1 text-[12px] font-bold break-words">
                      {p.home_prev || "—"} <span className="opacity-60">×</span> {p.away_prev || "—"}
                    </div>

                    <div className="mt-0.5 text-[11px] opacity-70">
                      placar: <span className="font-black tabular-nums opacity-90">{p.score_prev || "—"}</span>
                    </div>
                  </div>

                  <div className="shrink-0 pt-1">
                    <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-black opacity-80">
                      {isOpen ? "−" : "+"}
                    </span>
                  </div>
                </div>
              </button>

              {/* BODY (só quando aberto) */}
              {isOpen && (
                <div className="border-t border-white/10 px-3 py-3">
                  {!ok && (
                    <div className="mb-3 text-[11px] text-red-200 opacity-90 break-words">
                      {p.fd_reason ? `Motivo: ${p.fd_reason}` : "Sem match no Football-Data."}
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2 text-[12px]">
                    <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                      <div className="text-[10px] uppercase tracking-wide opacity-60">Gols</div>
                      <div className="font-black tabular-nums">{fmtNum(p.gf, 2)}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                      <div className="text-[10px] uppercase tracking-wide opacity-60">Esc</div>
                      <div className="font-black tabular-nums">{fmtNum(p.corners_for, 2)}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                      <div className="text-[10px] uppercase tracking-wide opacity-60">Am</div>
                      <div className="font-black tabular-nums">{fmtNum(p.yellows_for, 2)}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                      <div className="text-[10px] uppercase tracking-wide opacity-60">Vm</div>
                      <div className="font-black tabular-nums">{fmtNum(p.reds_for, 2)}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                      <div className="text-[10px] uppercase tracking-wide opacity-60">Faltas</div>
                      <div className="font-black tabular-nums">{fmtNum(p.fouls_for, 2)}</div>
                    </div>
                    <div className="rounded-xl border border-white/10 bg-black/20 p-2">
                      <div className="text-[10px] uppercase tracking-wide opacity-60">Chutes</div>
                      <div className="font-black tabular-nums">{fmtNum(p.shots_for, 2)}</div>
                    </div>
                    <div className="col-span-2 rounded-xl border border-white/10 bg-black/20 p-2">
                      <div className="text-[10px] uppercase tracking-wide opacity-60">No alvo</div>
                      <div className="font-black tabular-nums">{fmtNum(p.shots_on_for, 2)}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DesktopSimilarTable({ rows }: { rows: EnrichedPick[] }) {
  return (
    <div className="hidden md:block mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-black/25">
      <table className="min-w-[900px] w-full text-left text-[12px]">
        <thead className="sticky top-0 bg-black/50 backdrop-blur">
          <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide opacity-70">
            <th className="px-3 py-2">Top</th>
            <th className="px-3 py-2">Data</th>
            <th className="px-3 py-2">Jogo</th>
            <th className="px-3 py-2">Placar</th>
            <th className="px-3 py-2">Peso</th>
            <th className="px-3 py-2">Gols</th>
            <th className="px-3 py-2">Esc</th>
            <th className="px-3 py-2">Am</th>
            <th className="px-3 py-2">Vm</th>
            <th className="px-3 py-2">Faltas</th>
            <th className="px-3 py-2">Chutes</th>
            <th className="px-3 py-2">No alvo</th>
            <th className="px-3 py-2">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const dtPrev = fmtDateBrOnly(p.date_prev || "");
            const ok = p.fd_found;

            return (
              <tr key={i} className="border-b border-white/5 last:border-b-0">
                <td className="px-3 py-2 font-black tabular-nums">#{p.rank ?? i + 1}</td>
                <td className="px-3 py-2 whitespace-nowrap">{dtPrev || "—"}</td>
                <td className="px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-bold break-words">
                      {p.home_prev || "—"} <span className="opacity-60">×</span> {p.away_prev || "—"}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 font-black tabular-nums">{p.score_prev || "—"}</td>
                <td className="px-3 py-2 font-black tabular-nums">{fmtNum(p.w, 3)}</td>

                <td className="px-3 py-2 tabular-nums">{fmtNum(p.gf, 2)}</td>
                <td className="px-3 py-2 tabular-nums">{fmtNum(p.corners_for, 2)}</td>
                <td className="px-3 py-2 tabular-nums">{fmtNum(p.yellows_for, 2)}</td>
                <td className="px-3 py-2 tabular-nums">{fmtNum(p.reds_for, 2)}</td>
                <td className="px-3 py-2 tabular-nums">{fmtNum(p.fouls_for, 2)}</td>
                <td className="px-3 py-2 tabular-nums">{fmtNum(p.shots_for, 2)}</td>
                <td className="px-3 py-2 tabular-nums">{fmtNum(p.shots_on_for, 2)}</td>

                <td className="px-3 py-2">
                  <StatusChip ok={ok} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function SimilarSection({
  title,
  subtitle,
  tone,
  rows,
}: {
  title: string;
  subtitle: string;
  tone: "home" | "away";
  rows: EnrichedPick[];
}) {
  const toneCls = tone === "home" ? "border-blue-400/20 bg-blue-500/5" : "border-red-400/20 bg-red-500/5";

  return (
    <div className={["rounded-2xl border p-3", toneCls].join(" ")}>
      <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-black">{title}</div>
          <div className="text-[11px] opacity-70 mb-1">{subtitle}</div>
        </div>
      </div>

      {/* Mobile: accordion por jogo (tudo fechado) */}
      <MobileSimilarAccordion rows={rows} tone={tone} defaultOpenIndex={null} />

      {/* Desktop: tabela bonita */}
      <DesktopSimilarTable rows={rows} />
    </div>
  );
}

// ----------------------------------------------------
// Page
// ----------------------------------------------------
export default function Fixture() {
  const navigate = useNavigate();
  const { id = "" } = useParams();

  const enrichedFile = useMemo(() => pickByFixtureId(ENRICH_RAW, id), [id]);
  const panelsFile = useMemo(() => pickByFixtureId(PANELS_RAW, id), [id]);

  const enrichedRows = useMemo(() => (enrichedFile ? (parseCsv(enrichedFile.raw) as Row[]) : []), [enrichedFile]);
  const panelsRows = useMemo(() => (panelsFile ? (parseCsv(panelsFile.raw) as Row[]) : []), [panelsFile]);

  const meta = useMemo(() => {
    const r0 = enrichedRows?.[0] || panelsRows?.[0] || ({} as Row);
    return {
      fixture_id: String(r0["fixture_id"] || id).trim(),
      competition: String(r0["competition"] || "").trim(),
      utcDate_fixture: String(r0["utcDate_fixture"] || r0["utcDate"] || "").trim(),
      matchday_fixture: String(r0["matchday_fixture"] || r0["matchday"] || "").trim(),
    };
  }, [enrichedRows, panelsRows, id]);

  const panelInfo = useMemo(() => {
    const homeRow = panelsRows.find((r) => String(r["side"] || "").toUpperCase() === "HOME");
    const awayRow = panelsRows.find((r) => String(r["side"] || "").toUpperCase() === "AWAY");
    return {
      homeName: String(homeRow?.["team_name"] || "").trim(),
      awayName: String(awayRow?.["team_name"] || "").trim(),
      homePos: homeRow ? tryInt(homeRow["pos"]) : null,
      awayPos: awayRow ? tryInt(awayRow["pos"]) : null,
      homePts: homeRow ? tryInt(homeRow["pts"]) : null,
      awayPts: awayRow ? tryInt(awayRow["pts"]) : null,
    };
  }, [panelsRows]);

  const picksHomeAll = useMemo(() => enrichedRows.map(pickHomePerspective), [enrichedRows]);
  const picksAwayAll = useMemo(() => enrichedRows.map(pickAwayPerspective), [enrichedRows]);

  const picksHomeValid = useMemo(() => picksHomeAll.filter((p) => p.fd_found), [picksHomeAll]);
  const picksAwayValid = useMemo(() => picksAwayAll.filter((p) => p.fd_found), [picksAwayAll]);

  function buildStats(picks: EnrichedPick[]) {
    const w = picks.map((p) => p.w);

    const gf = picks.map((p) => p.gf);
    const cf = picks.map((p) => p.corners_for);
    const yf = picks.map((p) => p.yellows_for);
    const rf = picks.map((p) => p.reds_for);
    const ff = picks.map((p) => p.fouls_for);
    const sf = picks.map((p) => p.shots_for);
    const sotf = picks.map((p) => p.shots_on_for);

    return {
      nRows: picks.length,

      gf: { s: meanSimple(gf), w: meanWeighted(gf, w), conf: confidenceFromCv(cvPercent(gf, w)) },
      corners: { s: meanSimple(cf), w: meanWeighted(cf, w), conf: confidenceFromCv(cvPercent(cf, w)) },
      yellows: { s: meanSimple(yf), w: meanWeighted(yf, w), conf: confidenceFromCv(cvPercent(yf, w)) },
      reds: { s: meanSimple(rf), w: meanWeighted(rf, w), conf: confidenceFromCv(cvPercent(rf, w)) },
      fouls: { s: meanSimple(ff), w: meanWeighted(ff, w), conf: confidenceFromCv(cvPercent(ff, w)) },
      shots: { s: meanSimple(sf), w: meanWeighted(sf, w), conf: confidenceFromCv(cvPercent(sf, w)) },
      shotsOn: { s: meanSimple(sotf), w: meanWeighted(sotf, w), conf: confidenceFromCv(cvPercent(sotf, w)) },
    };
  }

  useEffect(() => {
    // volta pro topo ao abrir a página / trocar o ID
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [id]);

  const homeStats = useMemo(() => buildStats(picksHomeValid), [picksHomeValid]);
  const awayStats = useMemo(() => buildStats(picksAwayValid), [picksAwayValid]);

  const dt = meta.utcDate_fixture ? fmtDateBrOnly(meta.utcDate_fixture) : "";
  const okEnriched = picksHomeValid.length > 0 || picksAwayValid.length > 0;

  const homeTitle = panelInfo.homeName || "Time da Casa";
  const awayTitle = panelInfo.awayName || "Time Visitante";

  return (
    <div className="min-h-screen flex flex-col bg-zinc-900 text-zinc-100">
      <main className="flex-1">
        <div className="mx-auto max-w-[1400px] p-3 md:p-4">
          {/* top actions */}
          <div className="flex items-center justify-between gap-3">
            {/* ✅ BOTÃO VOLTAR */}
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black hover:bg-white/10"
            >
              ← Voltar
            </button>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Pill cls="border-white/10 bg-zinc-950/40">ID {meta.fixture_id}</Pill>
              {meta.competition && <Pill cls="border-white/10 bg-zinc-950/40">{meta.competition}</Pill>}
              {meta.matchday_fixture && <Pill cls="border-white/10 bg-zinc-950/40">MD {meta.matchday_fixture}</Pill>}
              {dt && <Pill cls="border-white/10 bg-zinc-950/40">{dt}</Pill>}
            </div>
          </div>

          {/* HERO header */}
          <div
            className="mt-4 rounded-2xl border border-white/10 overflow-x-hidden
            bg-[radial-gradient(1100px_280px_at_20%_0%,rgba(47,125,255,0.26),transparent_62%),
                radial-gradient(1100px_280px_at_80%_0%,rgba(255,59,59,0.28),transparent_62%),
                linear-gradient(180deg,rgba(255,255,255,0.10),rgba(0,0,0,0.18))

            p-3 sm:p-4 md:p-6 shadow-2xl"
          >
            <div className="flex flex-col items-center text-center">
              <div className="text-[11px] font-bold uppercase tracking-wide opacity-75">
                Pré-jogo com base nos TOP-12 similares
              </div>

              {/* CONFRONTO */}
              <div className="mt-2 w-full min-w-0 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:gap-3">
                {/* CASA */}
                <div className="min-w-0 text-left">
                  <div
                    className="inline-flex max-w-full min-w-0 flex-col rounded-2xl
                    border border-blue-400/30
                    bg-[linear-gradient(180deg,rgba(59,130,246,0.25),rgba(59,130,246,0.10))]
                    px-2 py-1.5 sm:px-3 sm:py-2"
                  >
                    <div className="inline-flex items-center gap-2">
                      <span className="text-[11px] font-black text-blue-200 shrink-0">CASA</span>
                      <BigPos pos={panelInfo.homePos} tone="home" />
                    </div>

                    {panelInfo.homePts != null && (
                      <div className="mt-0.5 text-[10px] text-blue-200/80 font-bold tabular-nums">
                        {panelInfo.homePts} pts
                      </div>
                    )}
                  </div>

                  <div className="mt-2 text-[16px] sm:text-xl md:text-2xl font-black leading-tight break-words">
                    {homeTitle}
                  </div>
                </div>

                {/* VS */}
                <div className="flex flex-col items-center justify-center">
                  <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5">
                    <div className="text-xs font-black opacity-80">×</div>
                  </div>
                </div>

                {/* FORA */}
                <div className="min-w-0 text-right">
                  <div
                    className="inline-flex max-w-full min-w-0 flex-col items-end rounded-2xl
                    border border-red-400/30
                    bg-[linear-gradient(180deg,rgba(239,68,68,0.28),rgba(239,68,68,0.12))]
                    px-2 py-1.5 sm:px-3 sm:py-2"
                  >
                    <div className="inline-flex items-center gap-2">
                      <BigPos pos={panelInfo.awayPos} tone="away" />
                      <span className="text-[11px] font-black text-red-200 shrink-0">FORA</span>
                    </div>

                    {panelInfo.awayPts != null && (
                      <div className="mt-0.5 text-[10px] text-red-200/80 font-bold tabular-nums">
                        {panelInfo.awayPts} pts
                      </div>
                    )}
                  </div>

                  <div className="mt-2 text-[16px] sm:text-xl md:text-2xl font-black leading-tight break-words">
                    {awayTitle}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {!okEnriched && (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
              Não encontrei dados enriquecidos para esse ID dentro de <b>src/top12_enriched_out</b>.
              <div className="mt-1 text-xs opacity-80">
                Dica: o arquivo precisa conter exatamente <b>__ID{meta.fixture_id}__</b> no nome, ou ter{" "}
                <b>fixture_id</b> dentro do CSV.
              </div>
            </div>
          )}

          {/* MAIN stats */}
          {okEnriched && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <SectionCard
                tone="home"
                title={
                  <span>
                    Perfil do Mandante 🔵 <span className="text-blue-100 font-black">— {homeTitle}</span>
                  </span>
                }
                subtitle={""}
              >
                <div className="grid gap-3">
                  <MetricGroup title="Ataque (a favor)">
                    <StatRow label="Gols" simple={homeStats.gf.s} weighted={homeStats.gf.w} conf={homeStats.gf.conf} />
                    <StatRow
                      label="Chutes"
                      simple={homeStats.shots.s}
                      weighted={homeStats.shots.w}
                      conf={homeStats.shots.conf}
                    />
                    <StatRow
                      label="Chutes no alvo"
                      simple={homeStats.shotsOn.s}
                      weighted={homeStats.shotsOn.w}
                      conf={homeStats.shotsOn.conf}
                    />
                  </MetricGroup>

                  <MetricGroup title="Bolas paradas (a favor)">
                    <StatRow
                      label="Escanteios"
                      simple={homeStats.corners.s}
                      weighted={homeStats.corners.w}
                      conf={homeStats.corners.conf}
                    />
                  </MetricGroup>

                  <MetricGroup title="Disciplina (a favor)">
                    <StatRow
                      label="Faltas"
                      simple={homeStats.fouls.s}
                      weighted={homeStats.fouls.w}
                      conf={homeStats.fouls.conf}
                    />
                    <StatRow
                      label="Amarelos"
                      simple={homeStats.yellows.s}
                      weighted={homeStats.yellows.w}
                      conf={homeStats.yellows.conf}
                    />
                    <StatRow
                      label="Vermelhos"
                      simple={homeStats.reds.s}
                      weighted={homeStats.reds.w}
                      conf={homeStats.reds.conf}
                    />
                  </MetricGroup>
                </div>
              </SectionCard>

              <SectionCard
                tone="away"
                title={
                  <span>
                    Perfil do Visitante 🔴 <span className="text-red-100 font-black">— {awayTitle}</span>
                  </span>
                }
                subtitle={""}
              >
                <div className="grid gap-3">
                  <MetricGroup title="Ataque (a favor)">
                    <StatRow label="Gols" simple={awayStats.gf.s} weighted={awayStats.gf.w} conf={awayStats.gf.conf} />
                    <StatRow
                      label="Chutes"
                      simple={awayStats.shots.s}
                      weighted={awayStats.shots.w}
                      conf={awayStats.shots.conf}
                    />
                    <StatRow
                      label="Chutes no alvo"
                      simple={awayStats.shotsOn.s}
                      weighted={awayStats.shotsOn.w}
                      conf={awayStats.shotsOn.conf}
                    />
                  </MetricGroup>

                  <MetricGroup title="Bolas paradas (a favor)">
                    <StatRow
                      label="Escanteios"
                      simple={awayStats.corners.s}
                      weighted={awayStats.corners.w}
                      conf={awayStats.corners.conf}
                    />
                  </MetricGroup>

                  <MetricGroup title="Disciplina (a favor)">
                    <StatRow
                      label="Faltas"
                      simple={awayStats.fouls.s}
                      weighted={awayStats.fouls.w}
                      conf={awayStats.fouls.conf}
                    />
                    <StatRow
                      label="Amarelos"
                      simple={awayStats.yellows.s}
                      weighted={awayStats.yellows.w}
                      conf={awayStats.yellows.conf}
                    />
                    <StatRow
                      label="Vermelhos"
                      simple={awayStats.reds.s}
                      weighted={awayStats.reds.w}
                      conf={awayStats.reds.conf}
                    />
                  </MetricGroup>
                </div>
              </SectionCard>
            </div>
          )}

          {/* Similar games (TOP-12): web = tabela; mobile = accordion por jogo */}
          {enrichedRows.length > 0 && (
            <details className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 overflow-hidden">
              <summary className="cursor-pointer text-sm font-black">Ver jogos similares usados (TOP) 📚</summary>

              <div className="mt-3 grid gap-3">
                <SimilarSection
                  tone="home"
                  title={`Tabela dos similares — Perspectiva do Mandante 🔵 【 ${homeTitle.toUpperCase()} 】`}
                  subtitle=""
                  rows={picksHomeAll}
                />

                <SimilarSection
                  tone="away"
                  title={`Tabela dos similares — Perspectiva do Visitante (A*) 🔴 【 ${awayTitle.toUpperCase()} 】`}
                  subtitle=""
                  rows={picksAwayAll}
                />
              </div>

              <div className="mt-3 text-[11px] opacity-70">
                Nota: no <b>mobile</b> você expande só o jogo que quiser. No <b>desktop</b> a tabela completa fica disponível.
              </div>
            </details>
          )}
        </div>
      </main>

    </div>
  );
}
