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

// ✅ UK league database (precisa existir no projeto web)
const LEAGUE_RAW = import.meta.glob("../league_csvs/*.csv", {
  as: "raw",
  eager: true,
}) as Record<string, string>;

// ----------------------------------------------------
// small helpers
// ----------------------------------------------------
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

function pickByFilename(globMap: Record<string, string>, filename: string) {
  const keys = Object.keys(globMap);
  const hit = keys.find((p) => (p.split("/").pop() || p).toLowerCase() === filename.toLowerCase());
  if (!hit) return null;
  return { path: hit, raw: globMap[hit] };
}

function weightFromRank(rank: number | null): number {
  if (rank == null || rank <= 0) return 0;
  return 1 / rank;
}

// read numeric from Row safely
function getNum(r: Row | null | undefined, k: string): number | null {
  if (!r) return null;
  const v = r[k];
  if (v == null) return null;
  const s = String(v).trim().replace(",", ".");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

// ----------------------------------------------------
// Confidence from CV% (já vem pronto do CSV)
// ----------------------------------------------------
const CV_VERDE_MAX = 35.0;
const CV_AMARELO_MAX = 60.0;

type ConfTone = "green" | "yellow" | "red" | "gray";

function confidenceFromCv(cv: number | null): { pct: number | null; tone: ConfTone; label: string } {
  if (cv == null || !Number.isFinite(cv)) return { pct: null, tone: "gray", label: "sem dados" };

  const cap = 120;
  const clamped = Math.max(0, Math.min(cap, cv));
  const pct = Math.round(100 - (clamped / cap) * 100);

  const tone: ConfTone = cv <= CV_VERDE_MAX ? "green" : cv <= CV_AMARELO_MAX ? "yellow" : "red";
  const label = tone === "green" ? "confiança alta" : tone === "yellow" ? "confiança média" : "confiança baixa";
  return { pct, tone, label };
}

// ----------------------------------------------------
// New: metrics come ready from panels.csv
// ----------------------------------------------------
type MetricRead = {
  mean: number | null;
  std: number | null;
  cv: number | null;
  n: number | null;
};

function readMetric(panelAny: Row, prefix: string, statKey: string): MetricRead {
  const mean = getNum(panelAny, `${prefix}_${statKey}_mean`);
  const std = getNum(panelAny, `${prefix}_${statKey}_std`);
  const cv = getNum(panelAny, `${prefix}_${statKey}_cv_pct`);
  const nRaw = getNum(panelAny, `${prefix}_${statKey}_n`);
  const n = nRaw == null ? null : Math.round(nRaw);
  return { mean, std, cv, n };
}

// Mandante (baseline HOME)
const HOME_STAT_MAP = {
  gf: "FTHG",
  shots: "HS",
  shotsOn: "HST",
  corners: "HC",
  fouls: "HF",
  yellows: "HY",
  reds: "HR",
} as const;

// Visitante (baseline AWAY)
const AWAY_STAT_MAP = {
  gf: "FTAG",
  shots: "AS",
  shotsOn: "AST",
  corners: "AC",
  fouls: "AF",
  yellows: "AY",
  reds: "AR",
} as const;

type StatBundle = {
  base: MetricRead;
  sim: MetricRead;
};

type SideStats = {
  nBaseMatches: number | null;
  nSimMatches: number | null;

  gf: StatBundle;
  shots: StatBundle;
  shotsOn: StatBundle;
  corners: StatBundle;
  fouls: StatBundle;
  yellows: StatBundle;
  reds: StatBundle;
};

function buildSideStatsFromPanels(panelAny: Row, side: "home" | "away"): SideStats {
  const map = side === "home" ? HOME_STAT_MAP : AWAY_STAT_MAP;
  const basePrefix = side === "home" ? "base_home" : "base_away";

  // counts (fixture-wide)
  const nBaseMatches =
    side === "home" ? getNum(panelAny, "base_home_n_matches") : getNum(panelAny, "base_away_n_matches");
  const nSimMatches = getNum(panelAny, "sim_n_matches");

  const mk = (k: keyof typeof map): StatBundle => {
    const statKey = map[k];
    return {
      base: readMetric(panelAny, basePrefix, statKey),
      // Stage 6: sim_fd_{STAT}_mean...
      sim: readMetric(panelAny, "sim", `fd_${statKey}`),
    };
  };

  return {
    nBaseMatches: nBaseMatches == null ? null : Math.round(nBaseMatches),
    nSimMatches: nSimMatches == null ? null : Math.round(nSimMatches),

    gf: mk("gf"),
    shots: mk("shots"),
    shotsOn: mk("shotsOn"),
    corners: mk("corners"),
    fouls: mk("fouls"),
    yellows: mk("yellows"),
    reds: mk("reds"),
  };
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

function tryFloat(x: unknown): number | null {
  if (x == null) return null;
  const s = String(x).trim().replace(",", ".");
  if (!s) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

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
// UK database helpers (schema + matching)
// ----------------------------------------------------
function normalizeSpaces(s: string) {
  return s.replace(/\s+/g, " ").trim();
}

function canonTeamName(name: unknown): string {
  let s = name == null ? "" : String(name);
  s = s.replace("\ufeff", "").trim();
  s = s.replace(/×/g, "x");
  s = normalizeSpaces(s);

  // remove accents
  s = s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");

  s = s.toLowerCase();
  s = s.replace(/_/g, " ");
  s = s.replace(/&/g, "and");
  s = s.replace(/[^\w\s]/g, " ");
  s = normalizeSpaces(s);

  const drop = new Set(["fc", "cf", "sc", "ac", "afc", "cfc", "club", "clube", "de", "da", "do", "dos", "das", "the", "futebol", "football"]);
  const toks = s.split(" ").filter((t) => t && !drop.has(t));
  return toks.join(" ");
}

// Similaridade simples (Dice bigram) + bônus substring
function nameSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;

  if (a.includes(b) || b.includes(a)) {
    const small = Math.min(a.length, b.length);
    const big = Math.max(a.length, b.length);
    return 0.9 + 0.1 * (small / big);
  }

  const bigrams = (s: string) => {
    const out: string[] = [];
    for (let i = 0; i < s.length - 1; i++) out.push(s.slice(i, i + 2));
    return out;
  };

  const A = bigrams(a);
  const B = bigrams(b);
  if (!A.length || !B.length) return 0;

  const m = new Map<string, number>();
  for (const x of A) m.set(x, (m.get(x) ?? 0) + 1);

  let inter = 0;
  for (const y of B) {
    const c = m.get(y) ?? 0;
    if (c > 0) {
      inter++;
      m.set(y, c - 1);
    }
  }
  return (2 * inter) / (A.length + B.length);
}

function bestMatchName(targetRaw: string, candidatesCanon: string[]) {
  const t = canonTeamName(targetRaw);
  let best = "";
  let bestScore = -1;

  for (const c of candidatesCanon) {
    const sc = nameSimilarity(t, c);
    if (sc > bestScore) {
      bestScore = sc;
      best = c;
    }
  }
  return { targetCanon: t, bestCanon: best, score: bestScore };
}

function guessLeagueSchema(fdRows: Row[]) {
  if (!fdRows.length) {
    return { dateCol: "Date", homeCol: "HomeTeam", awayCol: "AwayTeam", hint: "empty" };
  }

  const cols = new Set(Object.keys(fdRows[0] || {}));
  if (cols.has("Date") && cols.has("HomeTeam") && cols.has("AwayTeam")) {
    return { dateCol: "Date", homeCol: "HomeTeam", awayCol: "AwayTeam", hint: "data.co.uk classic" };
  }
  if (cols.has("Date") && cols.has("Home") && cols.has("Away")) {
    return { dateCol: "Date", homeCol: "Home", awayCol: "Away", hint: "generic Home/Away" };
  }

  // heuristic
  const lower = (x: string) => x.toLowerCase();
  const dateCandidates = [...cols].filter((c) => ["date", "matchdate", "data"].includes(lower(c)));
  const homeCandidates = [...cols].filter((c) => ["hometeam", "home", "mandante"].includes(lower(c)));
  const awayCandidates = [...cols].filter((c) => ["awayteam", "away", "visitante"].includes(lower(c)));

  if (dateCandidates.length && homeCandidates.length && awayCandidates.length) {
    return { dateCol: dateCandidates[0], homeCol: homeCandidates[0], awayCol: awayCandidates[0], hint: "heuristic columns" };
  }

  const all = [...cols];
  return { dateCol: all[0] || "Date", homeCol: all[1] || "HomeTeam", awayCol: all[2] || "AwayTeam", hint: "fallback" };
}

function isoDateOnly(x: unknown): string {
  const s = normalizeSpaces(x == null ? "" : String(x));
  if (!s) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [dd, mm, yyyy] = s.split("/");
    return `${yyyy}-${mm}-${dd}`;
  }

  if (s.includes("T") && /^\d{4}-\d{2}-\d{2}T/.test(s)) return s.split("T")[0];

  return s;
}

// ----------------------------------------------------
// UK -> EnrichedPick converter (para "Últimos 10 jogos")
// ----------------------------------------------------
function scoreFromUkRow(r: Row): string {
  const hg = tryInt(r["FTHG"]);
  const ag = tryInt(r["FTAG"]);
  if (hg == null || ag == null) return "";
  return `${hg}-${ag}`;
}

function ukToPick(r: Row, rank: number, homeCol: string, awayCol: string, dateCol: string, perspective: "HOME" | "AWAY"): EnrichedPick {
  const date_prev = isoDateOnly(r[dateCol] ?? "");
  const home_prev = String(r[homeCol] ?? "").trim();
  const away_prev = String(r[awayCol] ?? "").trim();

  if (perspective === "HOME") {
    return {
      rank,
      w: 0,
      date_prev,
      home_prev,
      away_prev,
      score_prev: scoreFromUkRow(r),

      gf: tryFloat(r["FTHG"]),
      corners_for: tryFloat(r["HC"]),
      yellows_for: tryFloat(r["HY"]),
      reds_for: tryFloat(r["HR"]),
      fouls_for: tryFloat(r["HF"]),
      shots_for: tryFloat(r["HS"]),
      shots_on_for: tryFloat(r["HST"]),

      fd_found: true,
      fd_reason: "",
    };
  }

  return {
    rank,
    w: 0,
    date_prev,
    home_prev,
    away_prev,
    score_prev: scoreFromUkRow(r),

    gf: tryFloat(r["FTAG"]),
    corners_for: tryFloat(r["AC"]),
    yellows_for: tryFloat(r["AY"]),
    reds_for: tryFloat(r["AR"]),
    fouls_for: tryFloat(r["AF"]),
    shots_for: tryFloat(r["AS"]),
    shots_on_for: tryFloat(r["AST"]),

    fd_found: true,
    fd_reason: "",
  };
}

// ----------------------------------------------------
// UI bits
// ----------------------------------------------------
function Pill({ children, cls }: { children: React.ReactNode; cls?: string }) {
  return (
    <span className={["rounded-full border px-3 py-1 text-[11px] font-black shadow-sm", cls || "border-white/10 bg-white/5"].join(" ")}>
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
        tone === "home" ? "border-blue-400/30 bg-blue-500/15 text-blue-200" : "border-red-400/30 bg-red-500/15 text-red-200",
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



function StatRowDual({ label, base, sim }: { label: string; base: MetricRead; sim: MetricRead }) {
  const baseConf = confidenceFromCv(base.cv);
  const simConf = confidenceFromCv(sim.cv);

  return (
    <div className="flex flex-col gap-2 border-b border-white/5 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs font-black opacity-95">{label}</div>

            <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-black opacity-75">Geral (âncora)</span>
            <ConfBadge pct={baseConf.pct} tone={baseConf.tone} label={baseConf.label} />

            <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-black opacity-75">Similares (TOP-12)</span>
            <ConfBadge pct={simConf.pct} tone={simConf.tone} label={simConf.label} />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] uppercase tracking-wide opacity-60">Geral (âncora)</div>
          <div className="text-base font-black tabular-nums">{fmtNum(base.mean, 2)}</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="text-[10px] uppercase tracking-wide opacity-60">Similares (TOP-12)</div>
          <div className="text-base font-black tabular-nums">{fmtNum(sim.mean, 2)}</div>
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
// Similar games: Mobile accordion; Desktop table
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
  labelTop = "Top",
}: {
  rows: EnrichedPick[];
  tone: "home" | "away";
  defaultOpenIndex?: number | null;
  labelTop?: string;
}) {
  const [openIdx, setOpenIdx] = useState<number | null>(defaultOpenIndex ?? null);
  const boxTone = tone === "home" ? "border-blue-400/20 bg-blue-500/5" : "border-red-400/20 bg-red-500/5";

  return (
    <div className={["rounded-2xl border p-3 md:hidden", boxTone].join(" ")}>
      <div className="mt-3 grid gap-2">
        {rows.map((p, i) => {
          const ok = p.fd_found;
          const isOpen = openIdx === i;
          const dtPrev = fmtDateBrOnly(p.date_prev || "");

          return (
            <div key={i} className="rounded-2xl border border-white/10 bg-black/25 overflow-hidden">
              <button type="button" onClick={() => setOpenIdx(isOpen ? null : i)} className="w-full text-left px-3 py-3 hover:bg-white/5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-black tabular-nums">
                        {labelTop} #{p.rank ?? i + 1}
                      </span>
                      <span className="text-xs opacity-70 whitespace-nowrap">{dtPrev || "—"}</span>
                      <span className="text-xs font-black tabular-nums opacity-80">{p.w ? `w ${fmtNum(p.w, 3)}` : ""}</span>
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
                    <span className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[10px] font-black opacity-80">{isOpen ? "−" : "+"}</span>
                  </div>
                </div>
              </button>

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

function DesktopSimilarTable({ rows, labelTop = "Top" }: { rows: EnrichedPick[]; labelTop?: string }) {
  return (
    <div className="hidden md:block mt-3 overflow-x-auto rounded-2xl border border-white/10 bg-black/25">
      <table className="min-w-[900px] w-full text-left text-[12px]">
        <thead className="sticky top-0 bg-black/50 backdrop-blur">
          <tr className="border-b border-white/10 text-[11px] uppercase tracking-wide opacity-70">
            <th className="px-3 py-2">{labelTop}</th>
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
                <td className="px-3 py-2 font-black tabular-nums">
                  {labelTop} #{p.rank ?? i + 1}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{dtPrev || "—"}</td>
                <td className="px-3 py-2">
                  <div className="min-w-0">
                    <div className="font-bold break-words">
                      {p.home_prev || "—"} <span className="opacity-60">×</span> {p.away_prev || "—"}
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 font-black tabular-nums">{p.score_prev || "—"}</td>
                <td className="px-3 py-2 font-black tabular-nums">{p.w ? fmtNum(p.w, 3) : "—"}</td>

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
  labelTop = "Top",
}: {
  title: string;
  subtitle: string;
  tone: "home" | "away";
  rows: EnrichedPick[];
  labelTop?: string;
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

      <MobileSimilarAccordion rows={rows} tone={tone} defaultOpenIndex={null} labelTop={labelTop} />
      <DesktopSimilarTable rows={rows} labelTop={labelTop} />
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

  const panelAny = useMemo(() => (panelsRows?.[0] || ({} as Row)), [panelsRows]);

  const meta = useMemo(() => {
    const r0 = panelsRows?.[0] || enrichedRows?.[0] || ({} as Row);
    return {
      fixture_id: String(r0["fixture_id"] || id).trim(),
      competition: String(r0["competition"] || "").trim(),
      utcDate_fixture: String(r0["utcDate_fixture"] || r0["utcDate"] || "").trim(),
      matchday_fixture: String(r0["matchday_fixture"] || r0["matchday"] || "").trim(),
      date_fixture: String(r0["date_fixture"] || "").trim(),
    };
  }, [enrichedRows, panelsRows, id]);

  const panelInfo = useMemo(() => {
    const homeRow = panelsRows.find((r) => String(r["side"] || "").toUpperCase() === "HOME");
    const awayRow = panelsRows.find((r) => String(r["side"] || "").toUpperCase() === "AWAY");

    const r0 = panelsRows?.[0] || ({} as Row);

    return {
      homeName: String(homeRow?.["team_name"] || "").trim(),
      awayName: String(awayRow?.["team_name"] || "").trim(),
      homePos: homeRow ? tryInt(homeRow["pos"]) : null,
      awayPos: awayRow ? tryInt(awayRow["pos"]) : null,
      homePts: homeRow ? tryInt(homeRow["pts"]) : null,
      awayPts: awayRow ? tryInt(awayRow["pts"]) : null,

      // ✅ optional UK bridge from pipeline
      ukSourceFile: String(r0["uk_source_file"] || "").trim(),
      anchorHomeMappedCanon: String(r0["anchor_home_mapped_canon"] || "").trim(),
      anchorAwayMappedCanon: String(r0["anchor_away_mapped_canon"] || "").trim(),
      anchorMapScoreHome: getNum(r0, "anchor_map_score_home"),
      anchorMapScoreAway: getNum(r0, "anchor_map_score_away"),
    };
  }, [panelsRows]);

  // Similar rows kept for table/accordion
  const picksHomeAll = useMemo(() => enrichedRows.map(pickHomePerspective), [enrichedRows]);
  const picksAwayAll = useMemo(() => enrichedRows.map(pickAwayPerspective), [enrichedRows]);

  // ✅ New stats (baseline + similares) come from panels.csv
  const homeStats = useMemo(() => buildSideStatsFromPanels(panelAny, "home"), [panelAny]);
  const awayStats = useMemo(() => buildSideStatsFromPanels(panelAny, "away"), [panelAny]);

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [id]);

  const dt = meta.utcDate_fixture ? fmtDateBrOnly(meta.utcDate_fixture) : meta.date_fixture ? fmtDateBrOnly(meta.date_fixture) : "";

  const homeTitle = panelInfo.homeName || "Time da Casa";
  const awayTitle = panelInfo.awayName || "Time Visitante";

  // "ok" if we have baseline/sim metrics or at least enriched rows
  const hasBaselineOrSim =
    (homeStats.nBaseMatches != null && homeStats.nBaseMatches > 0) ||
    (awayStats.nBaseMatches != null && awayStats.nBaseMatches > 0) ||
    (homeStats.nSimMatches != null && homeStats.nSimMatches > 0);

  const okData = enrichedRows.length > 0 || panelsRows.length > 0 || hasBaselineOrSim;

  // ----------------------------------------------------
  // ✅ UK: load league file (from panels.csv)
  // ----------------------------------------------------
  const ukFile = useMemo(() => {
    if (!panelInfo.ukSourceFile) return null;
    return pickByFilename(LEAGUE_RAW, panelInfo.ukSourceFile);
  }, [panelInfo.ukSourceFile]);

  const ukRows = useMemo(() => (ukFile ? (parseCsv(ukFile.raw) as Row[]) : []), [ukFile]);

  const ukSchema = useMemo(() => guessLeagueSchema(ukRows), [ukRows]);

  const fixtureDateIso = useMemo(() => {
    const d = meta.date_fixture || (meta.utcDate_fixture ? isoDateOnly(meta.utcDate_fixture) : "");
    return isoDateOnly(d);
  }, [meta.date_fixture, meta.utcDate_fixture]);

  // candidates list (canon) from uk file
  const ukCandidatesCanon = useMemo(() => {
    if (!ukRows.length) return [];
    const set = new Set<string>();
    for (const r of ukRows) {
      set.add(canonTeamName(r[ukSchema.homeCol]));
      set.add(canonTeamName(r[ukSchema.awayCol]));
    }
    return [...set].filter(Boolean);
  }, [ukRows, ukSchema.homeCol, ukSchema.awayCol]);

  const anchorCanon = useMemo(() => {
    const homeAuto = bestMatchName(homeTitle, ukCandidatesCanon);
    const awayAuto = bestMatchName(awayTitle, ukCandidatesCanon);

    return {
      homeCanon: panelInfo.anchorHomeMappedCanon || homeAuto.bestCanon,
      awayCanon: panelInfo.anchorAwayMappedCanon || awayAuto.bestCanon,
      homeScore: panelInfo.anchorHomeMappedCanon ? (panelInfo.anchorMapScoreHome ?? null) : homeAuto.score,
      awayScore: panelInfo.anchorAwayMappedCanon ? (panelInfo.anchorMapScoreAway ?? null) : awayAuto.score,
    };
  }, [
    panelInfo.anchorHomeMappedCanon,
    panelInfo.anchorAwayMappedCanon,
    panelInfo.anchorMapScoreHome,
    panelInfo.anchorMapScoreAway,
    homeTitle,
    awayTitle,
    ukCandidatesCanon,
  ]);

  function takeLast10AnchorGames(side: "HOME" | "AWAY") {
    if (!ukRows.length) return [];

    const dateCol = ukSchema.dateCol;
    const homeCol = ukSchema.homeCol;
    const awayCol = ukSchema.awayCol;

    const anchor = side === "HOME" ? anchorCanon.homeCanon : anchorCanon.awayCanon;

    const filtered = ukRows
      .map((r) => ({ r, d: isoDateOnly(r[dateCol]) }))
      .filter(({ d }) => {
        if (!d) return false;
        if (!fixtureDateIso) return true;
        return d < fixtureDateIso;
      })
      .filter(({ r }) => {
        const hc = canonTeamName(r[homeCol]);
        const ac = canonTeamName(r[awayCol]);
        return side === "HOME" ? hc === anchor : ac === anchor;
      })
      .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : 0))
      .slice(0, 10);

    return filtered.map(({ r }, idx) => ukToPick(r, idx + 1, homeCol, awayCol, dateCol, side));
  }

  const last10HomeAsHome = useMemo(
    () => takeLast10AnchorGames("HOME"),
    [ukRows, ukSchema.dateCol, ukSchema.homeCol, ukSchema.awayCol, fixtureDateIso, anchorCanon.homeCanon]
  );
  const last10AwayAsAway = useMemo(
    () => takeLast10AnchorGames("AWAY"),
    [ukRows, ukSchema.dateCol, ukSchema.homeCol, ukSchema.awayCol, fixtureDateIso, anchorCanon.awayCanon]
  );

  const showUkWarning = panelInfo.ukSourceFile && !ukFile;
  const showUkEmpty = ukFile && ukRows.length === 0;

  return (
    <div className="min-h-screen flex flex-col bg-zinc-900 text-zinc-100">
      <main className="flex-1">
        <div className="mx-auto max-w-[1400px] p-3 md:p-4">
          {/* top actions */}
          <div className="flex items-center justify-between gap-3">
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
                linear-gradient(180deg,rgba(255,255,255,0.10),rgba(0,0,0,0.18))]
            p-3 sm:p-4 md:p-6 shadow-2xl"
          >
            <div className="flex flex-col items-center text-center">
              <div className="text-[11px] font-bold uppercase tracking-wide opacity-75">
                Pré-jogo com base nos TOP-12 similares + média geral (âncora)
              </div>

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
                      <div className="mt-0.5 text-[10px] text-blue-200/80 font-bold tabular-nums">{panelInfo.homePts} pts</div>
                    )}
                  </div>

                  <div className="mt-2 text-[16px] sm:text-xl md:text-2xl font-black leading-tight break-words">{homeTitle}</div>
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
                      <div className="mt-0.5 text-[10px] text-red-200/80 font-bold tabular-nums">{panelInfo.awayPts} pts</div>
                    )}
                  </div>

                  <div className="mt-2 text-[16px] sm:text-xl md:text-2xl font-black leading-tight break-words">{awayTitle}</div>
                </div>
              </div>


            </div>
          </div>

          {!okData && (
            <div className="mt-4 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
              Não encontrei dados para esse ID.
              <div className="mt-1 text-xs opacity-80">
                Dica: o arquivo precisa conter exatamente <b>__ID{meta.fixture_id}__</b> no nome, ou ter <b>fixture_id</b> dentro do CSV.
              </div>
            </div>
          )}

          {/* MAIN stats (âncora vs similares + confiança %) */}
          {okData && (
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <SectionCard
                tone="home"
                title={
                  <span>
                    Perfil do Mandante 🔵 <span className="text-blue-100 font-black">— {homeTitle}</span>
                  </span>
                }
              >
                <div className="grid gap-3">
                  <MetricGroup title="Ataque (a favor)">
                    <StatRowDual label="Gols" base={homeStats.gf.base} sim={homeStats.gf.sim} />
                    <StatRowDual label="Chutes" base={homeStats.shots.base} sim={homeStats.shots.sim} />
                    <StatRowDual label="Chutes no alvo" base={homeStats.shotsOn.base} sim={homeStats.shotsOn.sim} />
                  </MetricGroup>

                  <MetricGroup title="Bolas paradas (a favor)">
                    <StatRowDual label="Escanteios" base={homeStats.corners.base} sim={homeStats.corners.sim} />
                  </MetricGroup>

                  <MetricGroup title="Disciplina (a favor)">
                    <StatRowDual label="Faltas" base={homeStats.fouls.base} sim={homeStats.fouls.sim} />
                    <StatRowDual label="Amarelos" base={homeStats.yellows.base} sim={homeStats.yellows.sim} />
                    <StatRowDual label="Vermelhos" base={homeStats.reds.base} sim={homeStats.reds.sim} />
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
              >
                <div className="grid gap-3">
                  <MetricGroup title="Ataque (a favor)">
                    <StatRowDual label="Gols" base={awayStats.gf.base} sim={awayStats.gf.sim} />
                    <StatRowDual label="Chutes" base={awayStats.shots.base} sim={awayStats.shots.sim} />
                    <StatRowDual label="Chutes no alvo" base={awayStats.shotsOn.base} sim={awayStats.shotsOn.sim} />
                  </MetricGroup>

                  <MetricGroup title="Bolas paradas (a favor)">
                    <StatRowDual label="Escanteios" base={awayStats.corners.base} sim={awayStats.corners.sim} />
                  </MetricGroup>

                  <MetricGroup title="Disciplina (a favor)">
                    <StatRowDual label="Faltas" base={awayStats.fouls.base} sim={awayStats.fouls.sim} />
                    <StatRowDual label="Amarelos" base={awayStats.yellows.base} sim={awayStats.yellows.sim} />
                    <StatRowDual label="Vermelhos" base={awayStats.reds.base} sim={awayStats.reds.sim} />
                  </MetricGroup>
                </div>
              </SectionCard>
            </div>
          )}

          {/* ✅ UK warnings */}
          {showUkWarning && (
            <div className="mt-4 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm">
              Achei <b>uk_source_file="{panelInfo.ukSourceFile}"</b> no panels, mas não encontrei esse CSV em <b>src/league_csvs</b>.
              <div className="mt-1 text-xs opacity-80">Coloque o arquivo dentro do projeto web para o Vite conseguir bundlar via import.meta.glob().</div>
            </div>
          )}
          {showUkEmpty && (
            <div className="mt-4 rounded-2xl border border-yellow-500/30 bg-yellow-500/10 p-4 text-sm">
              O arquivo <b>{panelInfo.ukSourceFile}</b> foi carregado, mas veio vazio.
            </div>
          )}

          {/* ✅ NOVO: Últimos 10 jogos das âncoras (ANTES do TOP-12) */}
          {(last10HomeAsHome.length > 0 || last10AwayAsAway.length > 0) && (
            <details className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 overflow-hidden" open>
              <summary className="cursor-pointer text-sm font-black">Ver últimos 10 jogos das âncoras (UK) 🧷</summary>

              <div className="mt-3 grid gap-3">
                <SimilarSection
                  tone="home"
                  title={`Últimos 10 do Mandante como MANDANTE 🔵 【 ${homeTitle.toUpperCase()} 】`}
                  subtitle={
                    panelInfo.ukSourceFile
                      ? `match: "${anchorCanon.homeCanon}" | score: ${fmtNum(anchorCanon.homeScore, 3)} | arquivo: ${panelInfo.ukSourceFile}`
                      : `match: "${anchorCanon.homeCanon}" | score: ${fmtNum(anchorCanon.homeScore, 3)}`
                  }
                  rows={last10HomeAsHome}
                  labelTop="Jogo"
                />

                <SimilarSection
                  tone="away"
                  title={`Últimos 10 do Visitante como VISITANTE 🔴 【 ${awayTitle.toUpperCase()} 】`}
                  subtitle={
                    panelInfo.ukSourceFile
                      ? `match: "${anchorCanon.awayCanon}" | score: ${fmtNum(anchorCanon.awayScore, 3)} | arquivo: ${panelInfo.ukSourceFile}`
                      : `match: "${anchorCanon.awayCanon}" | score: ${fmtNum(anchorCanon.awayScore, 3)}`
                  }
                  rows={last10AwayAsAway}
                  labelTop="Jogo"
                />
              </div>

              <div className="mt-3 text-[11px] opacity-70">
                Nota: isso vem do <b>UK database</b> ({panelInfo.ukSourceFile || "—"}). No mobile, expande só o jogo que quiser; no desktop, tabela completa.
              </div>
            </details>
          )}

          {/* Similar games (TOP-12) */}
          {enrichedRows.length > 0 && (
            <details className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 overflow-hidden">
              <summary className="cursor-pointer text-sm font-black">Ver jogos similares usados (TOP) 📚</summary>

              <div className="mt-3 grid gap-3">
                <SimilarSection
                  tone="home"
                  title={`Tabela dos similares — Perspectiva do Mandante 🔵 【 ${homeTitle.toUpperCase()} 】`}
                  subtitle=""
                  rows={picksHomeAll}
                  labelTop="Top"
                />

                <SimilarSection
                  tone="away"
                  title={`Tabela dos similares — Perspectiva do Visitante (A*) 🔴 【 ${awayTitle.toUpperCase()} 】`}
                  subtitle=""
                  rows={picksAwayAll}
                  labelTop="Top"
                />
              </div>

              <div className="mt-3 text-[11px] opacity-70">
                Nota: no <b>mobile</b> você expande só o jogo que quiser. No <b>desktop</b> a tabela completa fica disponível.
              </div>

              <div className="mt-2 text-[11px] opacity-70">
                Obs: os cards de perfil acima usam a média geral (âncora) e a média dos similares vindas do <b>panels.csv</b> (já calculadas pelo pipeline).
              </div>
            </details>
          )}

          {/* Fallback hint if enriched missing */}
          {enrichedRows.length === 0 && (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm">
              Não encontrei <b>__top12_enriched.csv</b> para esse ID em <b>src/top12_enriched_out</b>.
              <div className="mt-1 text-xs opacity-80">
                A página ainda funciona com baseline/sim via <b>__panels.csv</b>, mas a seção de “similares usados” (TOP-12) fica indisponível.
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
