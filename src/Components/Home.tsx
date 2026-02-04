// src/Pages/Home.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { parseCsv, fmtDateBrOnly, tryInt, type Row } from "../lib/rodada";

// ✅ build-time CSVs
const PANELS_RAW = import.meta.glob("../rodada_csvs/*__panels.csv", {
  as: "raw",
  eager: true,
}) as Record<string, string>;

// ----------------------------------------------------
// leagues from filename prefix (PL__, PD__, etc.)
// ----------------------------------------------------
type LeagueKey =
  | "PL"
  | "PD"
  | "SA"
  | "BL1"
  | "FL1"
  | "DED"
  | "PPL"
  | "CL"
  | "EL"
  | "ECL"
  | "BSA"
  | "BR2"
  | "OTHER";

function leagueFromFilename(file: string): LeagueKey {
  const f = (file || "").trim().toUpperCase();

  const prefixes: Array<[string, LeagueKey]> = [
    ["PL__", "PL"],
    ["PD__", "PD"],
    ["SA__", "SA"],
    ["BL1__", "BL1"],
    ["FL1__", "FL1"],
    ["DED__", "DED"],
    ["PPL__", "PPL"],
    ["CL__", "CL"],
    ["EL__", "EL"],
    ["ECL__", "ECL"],
    ["BSA__", "BSA"],
    ["BR2__", "BR2"],
  ];

  for (const [p, k] of prefixes) if (f.startsWith(p)) return k;

  const token = f.split("__")[0] || "";
  const map: Record<string, LeagueKey> = {
    PL: "PL",
    PD: "PD",
    SA: "SA",
    BL1: "BL1",
    FL1: "FL1",
    DED: "DED",
    PPL: "PPL",
    CL: "CL",
    EL: "EL",
    ECL: "ECL",
    BSA: "BSA",
    BR2: "BR2",
  };
  return map[token] || "OTHER";
}

function leagueLabel(k: LeagueKey): string {
  switch (k) {
    case "PL":
      return "Premier League";
    case "PD":
      return "LaLiga";
    case "SA":
      return "Serie A";
    case "BL1":
      return "Bundesliga";
    case "FL1":
      return "Ligue 1";
    case "DED":
      return "Eredivisie";
    case "PPL":
      return "Primeira Liga";
    case "CL":
      return "UEFA Champions League";
    case "EL":
      return "UEFA Europa League";
    case "ECL":
      return "UEFA Conference League";
    case "BSA":
      return "Brasileirão Série A";
    case "BR2":
      return "Brasileirão Série B";
    default:
      return "Outros";
  }
}

function leagueDotClass(k: LeagueKey): string {
  switch (k) {
    case "PL":
      return "bg-emerald-400";
    case "PD":
      return "bg-amber-300";
    case "SA":
      return "bg-sky-300";
    case "BL1":
      return "bg-red-400";
    case "FL1":
      return "bg-indigo-300";
    case "DED":
      return "bg-orange-300";
    case "PPL":
      return "bg-lime-300";
    case "CL":
      return "bg-violet-300";
    case "EL":
      return "bg-orange-400";
    case "ECL":
      return "bg-teal-300";
    case "BSA":
      return "bg-green-400";
    case "BR2":
      return "bg-yellow-300";
    default:
      return "bg-zinc-300";
  }
}

function leaguePillClass(k: LeagueKey, on: boolean): string {
  const base =
    "rounded-full border px-3 py-1 text-[11px] font-black inline-flex items-center gap-2 transition";
  if (!on) return `${base} border-white/10 bg-white/5 text-zinc-200 opacity-80 hover:opacity-100`;
  // ON
  const tone =
    k === "PL"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-200"
      : k === "PD"
      ? "border-amber-300/30 bg-amber-300/10 text-amber-200"
      : k === "SA"
      ? "border-sky-300/30 bg-sky-300/10 text-sky-200"
      : k === "BL1"
      ? "border-red-400/30 bg-red-400/10 text-red-200"
      : k === "FL1"
      ? "border-indigo-300/30 bg-indigo-300/10 text-indigo-200"
      : k === "DED"
      ? "border-orange-300/30 bg-orange-300/10 text-orange-200"
      : k === "PPL"
      ? "border-lime-300/30 bg-lime-300/10 text-lime-200"
      : k === "CL"
      ? "border-violet-300/30 bg-violet-300/10 text-violet-200"
      : k === "EL"
      ? "border-orange-400/30 bg-orange-400/10 text-orange-200"
      : k === "ECL"
      ? "border-teal-300/30 bg-teal-300/10 text-teal-200"
      : k === "BSA"
      ? "border-green-400/30 bg-green-400/10 text-green-200"
      : k === "BR2"
      ? "border-yellow-300/30 bg-yellow-300/10 text-yellow-200"
      : "border-white/20 bg-white/10 text-zinc-100";
  return `${base} ${tone}`;
}

function keyFromPanelFilename(path: string): string {
  const file = path.split("/").pop() || path;
  return file.replace(/\.CSV$/i, "").replace(/\.csv$/i, "");
}

function parseCsvListParam(v: string | null): string[] {
  if (!v) return [];
  return v
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function toCsvListParam(items: string[]): string | null {
  const xs = (items || []).map((s) => String(s).trim()).filter(Boolean);
  return xs.length ? xs.join(",") : null;
}

function emptyBoolMap(keys: string[]): Record<string, boolean> {
  const m: Record<string, boolean> = {};
  for (const k of keys) m[k] = false;
  return m;
}

function timeFromUtcDate(utc: string): string {
  // handles: "2026-02-10T20:00:00Z" or with offset
  if (!utc) return "";
  const s = String(utc).trim();
  const m = s.match(/T(\d{2}):(\d{2})/);
  if (!m) return "";
  return `${m[1]}:${m[2]}`;
}

type GameUI = {
  key: string;
  league: LeagueKey;

  fixture_id: string;
  competition: string;
  matchday: string;

  utcDate: string;
  dateBr: string;
  timeHHMM: string;

  homeName: string;
  awayName: string;

  homePos: number | null;
  awayPos: number | null;

  homePts: number | null;
  awayPts: number | null;
};

// ----------------------------------------------------
// UI bits
// ----------------------------------------------------
function Pill({ children, cls }: { children: React.ReactNode; cls?: string }) {
  return (
    <span className={["rounded-full border px-3 py-1 text-[11px] font-black", cls || "border-white/10 bg-white/5"].join(" ")}>
      {children}
    </span>
  );
}

function BigTag({
  label,
  tone,
  sub,
}: {
  label: string;
  tone: "home" | "away";
  sub?: React.ReactNode;
}) {
  const cls =
    tone === "home"
      ? "border-blue-400/35 bg-[linear-gradient(180deg,rgba(59,130,246,0.32),rgba(59,130,246,0.12))] text-blue-100"
      : "border-red-400/35 bg-[linear-gradient(180deg,rgba(239,68,68,0.32),rgba(239,68,68,0.12))] text-red-100";

  return (
    <div className={["inline-flex flex-col rounded-2xl border px-3 py-2", cls].join(" ")}>
      <div className="text-[11px] font-black tracking-wide">{label}</div>
      {sub && <div className="mt-0.5 text-[10px] font-bold opacity-80">{sub}</div>}
    </div>
  );
}

function PosPill({ pos, tone }: { pos: number | null; tone: "home" | "away" }) {
  if (pos == null) return <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-black opacity-70">—</span>;
  const cls =
    tone === "home"
      ? "border-blue-400/30 bg-blue-500/15 text-blue-200"
      : "border-red-400/30 bg-red-500/15 text-red-200";
  return <span className={["rounded-full border px-2 py-1 text-[10px] font-black tabular-nums", cls].join(" ")}>#{pos}</span>;
}

function PtsPill({ pts, tone }: { pts: number | null; tone: "home" | "away" }) {
  if (pts == null) return <span className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] font-black opacity-70">— pts</span>;
  const cls =
    tone === "home"
      ? "border-blue-400/20 bg-blue-500/10 text-blue-100"
      : "border-red-400/20 bg-red-500/10 text-red-100";
  return <span className={["rounded-full border px-2 py-1 text-[10px] font-black tabular-nums", cls].join(" ")}>{pts} pts</span>;
}

// ----------------------------------------------------
// Page
// ----------------------------------------------------
export default function Home() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [games, setGames] = useState<GameUI[]>([]);
  const [leagueOn, setLeagueOn] = useState<Record<string, boolean>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const hydratedRef = useRef(false);

  useEffect(() => {
    try {
      setLoading(true);
      setErr(null);

      const paths = Object.keys(PANELS_RAW);
      if (!paths.length) throw new Error("Não encontrei __panels.csv em src/rodada_csvs/.");

      const out: GameUI[] = [];

      for (const p of paths) {
        const file = p.split("/").pop() || p;
        const league = leagueFromFilename(file);
        const key = keyFromPanelFilename(p);

        const rows = parseCsv(PANELS_RAW[p]) as Row[];
        const panelAny = (rows?.[0] || ({} as Row)) as Row;

        const homeRow = rows.find((r) => String(r["side"] || "").toUpperCase() === "HOME");
        const awayRow = rows.find((r) => String(r["side"] || "").toUpperCase() === "AWAY");

        const fixture_id = String(panelAny["fixture_id"] || "").trim() || key;
        const competition = String(panelAny["competition"] || "").trim();
        const matchday = String(panelAny["matchday_fixture"] || panelAny["matchday"] || "").trim();

        const utcDate = String(panelAny["utcDate_fixture"] || panelAny["utcDate"] || "").trim();
        const dateBr = utcDate ? fmtDateBrOnly(utcDate) : "";
        const timeHHMM = utcDate ? timeFromUtcDate(utcDate) : "";

        const homeName = String(homeRow?.["team_name"] || "").trim();
        const awayName = String(awayRow?.["team_name"] || "").trim();

        const homePos = homeRow ? tryInt(homeRow["pos"]) : null;
        const awayPos = awayRow ? tryInt(awayRow["pos"]) : null;

        const homePts = homeRow ? tryInt(homeRow["pts"]) : null;
        const awayPts = awayRow ? tryInt(awayRow["pts"]) : null;

        out.push({
          key,
          league,
          fixture_id,
          competition,
          matchday,
          utcDate,
          dateBr,
          timeHHMM,
          homeName,
          awayName,
          homePos,
          awayPos,
          homePts,
          awayPts,
        });
      }

      out.sort((a, b) => {
        const ad = a.utcDate || "";
        const bd = b.utcDate || "";
        const amd = tryInt(a.matchday) ?? 1e9;
        const bmd = tryInt(b.matchday) ?? 1e9;
        return ad.localeCompare(bd) || amd - bmd || a.homeName.localeCompare(b.homeName);
      });

      const leaguesPresent = Array.from(new Set(out.map((g) => g.league)));

      // URL hydrate
      const qUrl = (searchParams.get("q") || "").trim();
      const lUrl = parseCsvListParam(searchParams.get("l"));
      const gUrl = parseCsvListParam(searchParams.get("g"));

      const lmap: Record<string, boolean> = emptyBoolMap(leaguesPresent);
      const vis: Record<string, boolean> = {};

      for (const lk of lUrl) lmap[lk] = true;

      const selectedSet = new Set(gUrl);
      for (const g of out) vis[g.key] = selectedSet.has(g.key);

      // default: se URL vazia, liga tudo ON e jogo sem seleção (mostra todos)
      if (!lUrl.length && !gUrl.length && !qUrl) {
        for (const lk of leaguesPresent) lmap[lk] = true;
        for (const g of out) vis[g.key] = true;
      }

      setGames(out);
      setLeagueOn(lmap);
      setVisible(vis);
      setQ(qUrl);

      hydratedRef.current = true;
    } catch (e: any) {
      setErr(e?.message || "Erro desconhecido");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const leagueKeys = useMemo(() => {
    const ks = Array.from(new Set(games.map((g) => g.league)));
    const order: LeagueKey[] = ["PL", "PD", "SA", "BL1", "FL1", "DED", "PPL", "CL", "EL", "ECL", "BSA", "BR2", "OTHER"];
    ks.sort((a, b) => order.indexOf(a as LeagueKey) - order.indexOf(b as LeagueKey));
    return ks as LeagueKey[];
  }, [games]);


  const filteredList = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return games.filter((g) => {
      if ((leagueOn[g.league] ?? false) === false) return false;
      if ((visible[g.key] ?? false) === false) return false;
      if (!qq) return true;
      const t = `${g.homeName} ${g.awayName} ${g.competition} ${g.league}`.toLowerCase();
      return t.includes(qq);
    });
  }, [games, leagueOn, visible, q]);

  // sync -> URL
  useEffect(() => {
    if (!hydratedRef.current) return;

    const leaguesOnNow = leagueKeys.filter((k) => leagueOn[k] === true);
    const gamesOnNow = games.filter((g) => visible[g.key] === true).map((g) => g.key);

    const next: Record<string, string> = {};
    const qTrim = q.trim();
    if (qTrim) next.q = qTrim;

    const l = toCsvListParam(leaguesOnNow);
    if (l) next.l = l;

    const gg = toCsvListParam(gamesOnNow);
    if (gg) next.g = gg;

    const cur = searchParams.toString();
    const nxt = new URLSearchParams(next).toString();
    if (cur !== nxt) setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, leagueOn, visible, games, leagueKeys]);

  const toggleLeague = (k: LeagueKey) => setLeagueOn((m) => ({ ...m, [k]: !(m[k] ?? false) }));
  const toggleGame = (key: string, on: boolean) => setVisible((v) => ({ ...v, [key]: on }));

  const setAllGames = (on: boolean) => {
    setVisible((prev) => {
      const out: Record<string, boolean> = {};
      for (const k of Object.keys(prev)) out[k] = on;
      return out;
    });
  };

  const clearFilters = () => {
    setQ("");
    // keep leagues ON by default, games ON by default
    setLeagueOn((prev) => {
      const out: Record<string, boolean> = {};
      for (const k of Object.keys(prev)) out[k] = true;
      return out;
    });
    setAllGames(true);
    setSearchParams({}, { replace: true });
  };

  // mobile drawer scroll-lock
  useEffect(() => {
    if (!filtersOpen) return;
    const html = document.documentElement;
    const body = document.body;
    const prevOverflow = body.style.overflow;
    const prevPaddingRight = body.style.paddingRight;

    const scrollbarW = window.innerWidth - html.clientWidth;
    body.style.overflow = "hidden";
    if (scrollbarW > 0) body.style.paddingRight = `${scrollbarW}px`;

    return () => {
      body.style.overflow = prevOverflow;
      body.style.paddingRight = prevPaddingRight;
    };
  }, [filtersOpen]);

  const openFixture = (id: string) => navigate(`/fixture/${encodeURIComponent(String(id))}`);

  return (
    <div className="min-h-screen flex flex-col bg-zinc-900 text-zinc-100">
      <main className="flex-1">
        <div className="mx-auto max-w-[1500px] p-3 md:p-4">
          {/* TOP header */}
          <div className="rounded-2xl border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(0,0,0,0.35))] p-4 shadow-2xl">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="text-sm font-black">Agenda de jogos ⚽</div>
                <div className="mt-1 text-xs opacity-70">Somente informações do jogo (casa/fora, posição, pontos, data e hora).</div>
              </div>

              <div className="flex flex-wrap gap-2 justify-end">
                <button
                  onClick={() => setFiltersOpen(true)}
                  className="md:hidden rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black hover:bg-white/10"
                >
                  Filtros
                </button>
                <button
                  onClick={clearFilters}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black hover:bg-white/10"
                >
                  Reset
                </button>
              </div>
            </div>

            {/* search */}
            <div className="mt-3">
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="buscar time / liga…"
                className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm outline-none focus:border-white/20"
              />
            </div>

            {/* league pills */}
            <div className="mt-3 flex flex-wrap gap-2">
              {leagueKeys.map((k) => (
                <button key={k} onClick={() => toggleLeague(k)} className={leaguePillClass(k, leagueOn[k] ?? false)}>
                  <span className={["h-2.5 w-2.5 rounded-full", leagueDotClass(k)].join(" ")} />
                  {leagueLabel(k)}
                </button>
              ))}
            </div>
          </div>

          {/* Mobile drawer */}
          {filtersOpen && (
            <div className="fixed inset-0 z-40 md:hidden">
              <div className="absolute inset-0 bg-black/60" onClick={() => setFiltersOpen(false)} />
              <div className="absolute right-0 top-0 h-full w-[88%] max-w-[440px] border-l border-white/10 bg-zinc-950 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-black">Filtros</div>
                  <button
                    onClick={() => setFiltersOpen(false)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black hover:bg-white/10"
                  >
                    Fechar
                  </button>
                </div>

                <div className="mt-4">
                  <div className="text-xs font-bold uppercase tracking-wide opacity-80">Mostrar jogos</div>
                  <div className="mt-2 flex gap-2">
                    <button
                      onClick={() => setAllGames(true)}
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black hover:bg-white/10"
                    >
                      Tudo ✅
                    </button>
                    <button
                      onClick={() => setAllGames(false)}
                      className="flex-1 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-black hover:bg-white/10"
                    >
                      Nada ⛔
                    </button>
                  </div>
                </div>

                <div className="mt-5 h-[calc(100vh-180px)] overflow-y-auto overscroll-contain pr-1 [-webkit-overflow-scrolling:touch]">
                  <div className="text-xs font-bold uppercase tracking-wide opacity-80">Jogos</div>
                  <div className="mt-2 flex flex-col gap-2">
                    {games.map((g) => {
                      const title = `${g.homeName} × ${g.awayName}`.trim();
                      return (
                        <label key={g.key} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
                          <input type="checkbox" checked={visible[g.key] ?? false} onChange={(e) => toggleGame(g.key, e.target.checked)} />
                          <span className={["h-2.5 w-2.5 rounded-full", leagueDotClass(g.league)].join(" ")} />
                          <span className="opacity-90">{title}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* status */}
          {loading && (
            <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm opacity-90">
              Carregando jogos…
            </div>
          )}
          {err && (
            <div className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
              Erro: {err}
            </div>
          )}

          {/* GRID */}
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            {filteredList.map((g) => {
              const titleHome = g.homeName || "—";
              const titleAway = g.awayName || "—";

              const whenLabel = g.dateBr ? `${g.dateBr}${g.timeHHMM ? ` • ${g.timeHHMM}` : ""}` : "—";

              return (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => openFixture(g.fixture_id)}
                  className="text-left rounded-2xl border border-white/10 overflow-hidden shadow-2xl
                  bg-[radial-gradient(1000px_220px_at_18%_0%,rgba(59,130,246,0.18),transparent_62%),
                      radial-gradient(900px_220px_at_82%_0%,rgba(239,68,68,0.16),transparent_60%),
                      linear-gradient(180deg,rgba(255,255,255,0.08),rgba(0,0,0,0.32))] hover:border-white/20 transition"
                >
                  {/* top meta strip */}
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 bg-black/25 px-3 py-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={["h-2.5 w-2.5 rounded-full", leagueDotClass(g.league)].join(" ")} />
                      <Pill cls="border-white/10 bg-black/20">{leagueLabel(g.league)}</Pill>
                      {g.matchday && <Pill cls="border-white/10 bg-black/20">MD {g.matchday}</Pill>}
                      {g.competition && <Pill cls="border-white/10 bg-black/20">{g.competition}</Pill>}
                    </div>

                    <div className="flex items-center gap-2">
                      <Pill cls="border-white/10 bg-black/20">{whenLabel}</Pill>
                    </div>
                  </div>

                  {/* HERO center (centralizado como você queria) */}
                  <div className="p-4">
                    <div className="flex flex-col items-center text-center">
                      <div className="text-[11px] font-bold uppercase tracking-wide opacity-75">Próximo jogo</div>

                      <div className="mt-3 w-full grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
                        {/* HOME */}
                        <div className="min-w-0 text-left">
                          <BigTag
                            tone="home"
                            label="CASA 🔵"
                            sub={
                              <span className="inline-flex items-center gap-2">
                                <PosPill pos={g.homePos} tone="home" />
                                <PtsPill pts={g.homePts} tone="home" />
                              </span>
                            }
                          />
                          <div className="mt-2 text-[16px] sm:text-xl font-black leading-tight break-words">{titleHome}</div>
                        </div>

                        {/* VS */}
                        <div className="flex flex-col items-center justify-center">
                          <div className="rounded-full border border-white/10 bg-black/30 px-3 py-1.5">
                            <div className="text-xs font-black opacity-80">×</div>
                          </div>

                          <div className="mt-2 rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[10px] font-black opacity-80">
                            ID {g.fixture_id}
                          </div>
                        </div>

                        {/* AWAY */}
                        <div className="min-w-0 text-right">
                          <BigTag
                            tone="away"
                            label="FORA 🔴"
                            sub={
                              <span className="inline-flex items-center justify-end gap-2">
                                <PtsPill pts={g.awayPts} tone="away" />
                                <PosPill pos={g.awayPos} tone="away" />
                              </span>
                            }
                          />
                          <div className="mt-2 text-[16px] sm:text-xl font-black leading-tight break-words">{titleAway}</div>
                        </div>
                      </div>

                      <div className="mt-4 text-[11px] opacity-70">
                        Clique para abrir o jogo e ver detalhes completos.
                      </div>
                    </div>
                  </div>
                </button>
              );
            })}

            {!loading && !err && filteredList.length === 0 && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm opacity-80">
                Nada pra mostrar com esses filtros. (tenta ativar ligas ou dar Reset)
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
