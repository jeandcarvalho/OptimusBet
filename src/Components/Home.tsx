// Pages/Home.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

import Footer from "../Components/Footer";

import {
  buildFixtureStats,
  confiabBucket,
  confiabilidadeFromCv,
  fmtDateBrOnly,
  fmtNum,
  mean,
  mean2,
  parseCsv,
  tryInt,
  wcvPercent,
  wmean,
  type FixtureStats,
  type Row,
} from "../lib/rodada";

// =====================================================
// ✅ CSVs embutidos (build-time)
// Coloque os CSVs em: src/rodada_csvs/
// =====================================================
const CSV_RAW = import.meta.glob("../rodada_csvs/*.csv", { as: "raw", eager: true }) as Record<string, string>;

// =====================================================
// League keys (expansível)
// =====================================================
type LeagueKey =
  | "PL" // Premier League
  | "PD" // LaLiga
  | "SA" // Serie A (ITA)
  | "BL1" // Bundesliga
  | "FL1" // Ligue 1
  | "DED" // Eredivisie
  | "PPL" // Primeira Liga (POR)
  | "CL" // Champions League
  | "EL" // Europa League
  | "ECL" // Conference League
  | "BSA" // Brasileirão Série A
  | "BR2" // Brasileirão Série B
  | "OTHER";

type Pair = {
  baseKey: string;
  topPath: string;
  panelsPath?: string;
  league: LeagueKey;
};

type FxUI = FixtureStats & {
  league: LeagueKey;
  baseKey: string;
  // ✅ nomes canônicos para exibição e matching
  display_home: string;
  display_away: string;
  // ✅ posições canônicas (robustas)
  home_pos: number | null;
  away_pos: number | null;
};

function leagueFromFilename(file: string): LeagueKey {
  const f = (file || "").trim();

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

  const token = f.split("__")[0]?.toUpperCase() || "";
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

// ✅ cores estáveis por torneio
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

function leaguePillClass(k: LeagueKey): string {
  switch (k) {
    case "PL":
      return "border-emerald-400/30 bg-emerald-400/10 text-emerald-200";
    case "PD":
      return "border-amber-300/30 bg-amber-300/10 text-amber-200";
    case "SA":
      return "border-sky-300/30 bg-sky-300/10 text-sky-200";
    case "BL1":
      return "border-red-400/30 bg-red-400/10 text-red-200";
    case "FL1":
      return "border-indigo-300/30 bg-indigo-300/10 text-indigo-200";
    case "DED":
      return "border-orange-300/30 bg-orange-300/10 text-orange-200";
    case "PPL":
      return "border-lime-300/30 bg-lime-300/10 text-lime-200";
    case "CL":
      return "border-violet-300/30 bg-violet-300/10 text-violet-200";
    case "EL":
      return "border-orange-400/30 bg-orange-400/10 text-orange-200";
    case "ECL":
      return "border-teal-300/30 bg-teal-300/10 text-teal-200";
    case "BSA":
      return "border-green-400/30 bg-green-400/10 text-green-200";
    case "BR2":
      return "border-yellow-300/30 bg-yellow-300/10 text-yellow-200";
    default:
      return "border-white/10 bg-white/5 text-zinc-200";
  }
}

// =====================================================
// Parsing pairs from glob
// =====================================================
function buildPairsFromGlob(rawMap: Record<string, string>): Pair[] {
  const keys = Object.keys(rawMap);
  const buckets = new Map<string, { topPath?: string; panelsPath?: string; league: LeagueKey }>();

  for (const p of keys) {
    const file = p.split("/").pop() || p;

    const isTop = file.includes("__top") && file.endsWith(".csv"); // "__top.csv" ou "__top12.csv"
    const isPanels = file.endsWith("__panels.csv");
    if (!isTop && !isPanels) continue;

    const league = leagueFromFilename(file);

    let base = file;
    if (isPanels) {
      base = file.replace("__panels.csv", "");
    } else {
      const idx = file.lastIndexOf("__top");
      base = idx >= 0 ? file.slice(0, idx) : file.replace(".csv", "");
    }

    const rec = buckets.get(base) || { league };
    if (rec.league === "OTHER" && league !== "OTHER") rec.league = league;

    if (isPanels) rec.panelsPath = p;
    if (isTop) rec.topPath = p;

    buckets.set(base, rec);
  }

  const out: Pair[] = [];
  for (const [baseKey, v] of buckets.entries()) {
    if (!v.topPath) continue;
    out.push({ baseKey, topPath: v.topPath, panelsPath: v.panelsPath, league: v.league });
  }
  return out;
}

function stripFixturePrefix(teamOrLabel: string): string {
  let s = (teamOrLabel || "").trim();
  if (!s) return s;

  s = s.replace(/^MD\s*\d+\s*[-–—•|]?\s*\d{4}-\d{2}-\d{2}\s*[-–—•|]?\s*/i, "").trim();
  s = s.replace(/^\d{4}-\d{2}-\d{2}\s*[-–—•|]?\s*/i, "").trim();

  return s;
}

function looksDirtyTeamName(s: string): boolean {
  const t = (s || "").trim();
  if (!t) return true;
  if (/^MD\s*\d+/i.test(t)) return true;
  if (/\d{4}-\d{2}-\d{2}/.test(t)) return true;
  return /histSeason/i.test(t) || /ID\d+/i.test(t) || t.includes("__") || t.includes("_vs_");
}

function titleFromBaseKey(baseKey: string): { home: string; away: string } | null {
  const m = baseKey.match(/__([^_].*?)_vs_(.*?)__/);
  if (!m) return null;

  const home = (m[1] || "").replace(/_/g, " ").trim();
  const away = (m[2] || "").replace(/_/g, " ").trim();

  if (!home || !away) return null;
  return { home, away };
}

function fmtDateTimeBrPretty(iso: string): string {
  const s = (iso || "").trim();
  if (!s) return "";

  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return fmtDateBrOnly(s) || s;

  const date = new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(d);

  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);

  return `${date} • ${time}`;
}

function stableId(fx: FixtureStats & { baseKey?: string }): string {
  return fx.meta.fixture_id || `${fx.meta.home_name}-${fx.meta.away_name}-${fx.meta.utcDate_fixture}-${fx.baseKey || ""}`;
}

// =====================================================
// ✅ Team name canonicalization
// =====================================================
function normTeam(s: string): string {
  return (s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function collectTeamCandidates(topRows: Array<Record<string, string>>): string[] {
  const cols = ["home_prev", "away_prev", "target_team", "opponent", "home", "away", "home_fixture", "away_fixture"];
  const out: string[] = [];
  for (const r of topRows || []) for (const c of cols) if ((r?.[c] || "").trim()) out.push((r?.[c] || "").trim());
  return out;
}

function pickDisplayName(seed: string, topRows: Array<Record<string, string>>): string {
  const seedN = normTeam(seed);
  if (!seedN) return seed;

  const cand = collectTeamCandidates(topRows);
  const freq = new Map<string, { original: string; count: number; bestLen: number }>();

  for (const s of cand) {
    const n = normTeam(s);
    if (!n || n !== seedN) continue;

    const rec = freq.get(n);
    if (!rec) freq.set(n, { original: s, count: 1, bestLen: s.length });
    else {
      rec.count += 1;
      if (s.length > rec.bestLen) {
        rec.original = s;
        rec.bestLen = s.length;
      }
    }
  }

  return freq.get(seedN)?.original || seed;
}

function estimatePosRobust(topRows: Array<Record<string, string>>, teamName: string): number | null {
  const tn = normTeam(teamName);
  if (!tn) return null;

  const pos: number[] = [];
  for (const r of topRows || []) {
    const target = normTeam(r["target_team"] || "");
    const opp = normTeam(r["opponent"] || "");

    if (target && target === tn) {
      const p = tryInt(r["target_pos_then"]);
      if (p != null) pos.push(p);
    }
    if (opp && opp === tn) {
      const p = tryInt(r["opponent_pos_then"]);
      if (p != null) pos.push(p);
    }
  }

  if (!pos.length) return null;

  const counts = new Map<number, number>();
  for (const p of pos) counts.set(p, (counts.get(p) || 0) + 1);

  let bestPos = pos[0];
  let bestCount = -1;
  for (const [p, c] of counts.entries()) {
    if (c > bestCount || (c === bestCount && p < bestPos)) {
      bestPos = p;
      bestCount = c;
    }
  }
  return bestPos;
}

function resolveCanonicalNames(fx: FixtureStats & { baseKey: string }): { home: string; away: string } {
  const fallback = titleFromBaseKey(fx.baseKey);

  const metaHomeClean = stripFixturePrefix(fx.meta.home_name || "");
  const metaAwayClean = stripFixturePrefix(fx.meta.away_name || "");

  const seedHome = !looksDirtyTeamName(metaHomeClean) ? metaHomeClean : fallback?.home || metaHomeClean || fx.meta.home_name;
  const seedAway = !looksDirtyTeamName(metaAwayClean) ? metaAwayClean : fallback?.away || metaAwayClean || fx.meta.away_name;

  const home = pickDisplayName(seedHome, fx.top_rows);
  const away = pickDisplayName(seedAway, fx.top_rows);

  return { home, away };
}

// =====================================================
// ✅ POSIÇÃO ATUAL (panels.csv)
// =====================================================
function currentPosFromPanels(panelsRows: Row[] | undefined): { home_pos: number | null; away_pos: number | null } {
  if (!panelsRows?.length) return { home_pos: null, away_pos: null };

  const homeRow = panelsRows.find((r) => String(r["side"] || "").toUpperCase() === "HOME");
  const awayRow = panelsRows.find((r) => String(r["side"] || "").toUpperCase() === "AWAY");

  const home_pos = homeRow ? tryInt(String(homeRow["pos"] ?? "")) : null;
  const away_pos = awayRow ? tryInt(String(awayRow["pos"] ?? "")) : null;

  return { home_pos, away_pos };
}

// =====================================================
// Home
// =====================================================
const Home: React.FC = () => {
  const navigate = useNavigate();

  const [fixtures, setFixtures] = useState<FxUI[]>([]);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [q, setQ] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [leagueOn, setLeagueOn] = useState<Record<string, boolean>>({});
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const pairs = buildPairsFromGlob(CSV_RAW);
        if (!pairs.length) throw new Error("Não encontrei CSVs em src/rodada_csvs/. Confere o caminho e nomes.");

        const out: FxUI[] = [];

        for (const pair of pairs) {
          const topRaw = CSV_RAW[pair.topPath];
          const topRows = parseCsv(topRaw);

          let panelsRows: Row[] | undefined;
          if (pair.panelsPath && CSV_RAW[pair.panelsPath]) panelsRows = parseCsv(CSV_RAW[pair.panelsPath]);

          const fx0 = buildFixtureStats(topRows, panelsRows, pair.baseKey) as FixtureStats & { baseKey?: string };
          const fx = { ...fx0, baseKey: pair.baseKey };

          const canon = resolveCanonicalNames(fx);

          const { home_pos: homePosNow, away_pos: awayPosNow } = currentPosFromPanels(panelsRows);

          const home_pos = homePosNow ?? estimatePosRobust(fx.top_rows, canon.home);
          const away_pos = awayPosNow ?? estimatePosRobust(fx.top_rows, canon.away);

          out.push({
            ...(fx as FixtureStats),
            league: pair.league,
            baseKey: pair.baseKey,
            display_home: canon.home,
            display_away: canon.away,
            home_pos,
            away_pos,
          });
        }

        out.sort((a, b) => {
          const ad = a.meta.utcDate_fixture || "";
          const bd = b.meta.utcDate_fixture || "";
          const amd = tryInt(a.meta.matchday_fixture) ?? 1e9;
          const bmd = tryInt(b.meta.matchday_fixture) ?? 1e9;
          return (
            ad.localeCompare(bd) ||
            amd - bmd ||
            (a.meta.competition || "").localeCompare(b.meta.competition || "") ||
            a.display_home.localeCompare(b.display_home)
          );
        });

        const lmap: Record<string, boolean> = {};
        const vis: Record<string, boolean> = {};
        for (const fx of out) {
          lmap[fx.league] = lmap[fx.league] ?? true;
          vis[stableId(fx)] = true;
        }

        setFixtures(out);
        setVisible(vis);
        setLeagueOn(lmap);
      } catch (e: any) {
        setErr(e?.message || "Erro desconhecido");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const leagueKeys = useMemo(() => {
    const ks = Array.from(new Set(fixtures.map((f) => f.league)));
    const order: LeagueKey[] = ["PL", "PD", "SA", "BL1", "FL1", "DED", "PPL", "CL", "EL", "ECL", "BSA", "BR2", "OTHER"];
    ks.sort((a, b) => order.indexOf(a as LeagueKey) - order.indexOf(b as LeagueKey));
    return ks as LeagueKey[];
  }, [fixtures]);

  const filtered = useMemo(() => {
    const qq = normTeam(q.trim());
    return fixtures.filter((fx) => {
      if (leagueOn[fx.league] === false) return false;
      if (!qq) return true;
      const t = normTeam(`${fx.display_home} ${fx.display_away} ${fx.meta.competition} ${fx.league}`);
      return t.includes(qq);
    });
  }, [fixtures, q, leagueOn]);

  const toggleLeague = (k: LeagueKey) => setLeagueOn((m) => ({ ...m, [k]: !(m[k] ?? true) }));

  const openFixture = (fx: FxUI) => {
    const id = (fx?.meta?.fixture_id || stableId(fx)).toString();
    navigate(`/fixture/${encodeURIComponent(id)}`);
  };

  return (
    <div className="min-h-screen flex flex-col bg-zinc-900 text-zinc-100">
      <main className="flex-1">
        <div className="mx-auto max-w-[1700px] p-3 md:p-4">
          {/* Mobile top bar */}
          <div className="sticky top-0 z-30 mb-3 rounded-2xl border border-white/10 bg-zinc-950/75 backdrop-blur px-3 py-3 md:hidden">
            <div className="flex items-center justify-between gap-3">
              <div className="text-sm font-black">Painel da Rodada 🎯</div>
              <div className="flex gap-2">
                <button
                  onClick={() => setFiltersOpen(true)}
                  className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold"
                >
                  Filtros
                </button>
              </div>
            </div>

            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="filtrar jogos..."
              className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
            />
          </div>

          {/* Mobile drawer */}
          {filtersOpen && (
            <div className="fixed inset-0 z-40 md:hidden">
              <div className="absolute inset-0 bg-black/60" onClick={() => setFiltersOpen(false)} />
              <div className="absolute right-0 top-0 h-full w-[88%] max-w-[420px] border-l border-white/10 bg-zinc-950 p-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-black">Filtros</div>
                  <button
                    onClick={() => setFiltersOpen(false)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold"
                  >
                    Fechar
                  </button>
                </div>

                <div className="mt-4">
                  <div className="text-xs font-bold uppercase tracking-wide opacity-80">Campeonatos</div>
                  <div className="mt-3 flex flex-col gap-2">
                    {leagueKeys.map((k) => (
                      <button
                        key={k}
                        onClick={() => toggleLeague(k)}
                        className={[
                          "flex items-center justify-between rounded-xl border px-3 py-2 text-sm",
                          leagueOn[k] ?? true ? leaguePillClass(k) : "border-white/10 bg-white/5 text-zinc-200 opacity-80",
                        ].join(" ")}
                      >
                        <div className="flex items-center gap-2">
                          <span className={["h-2.5 w-2.5 rounded-full", leagueDotClass(k)].join(" ")} />
                          <span className="font-bold">{leagueLabel(k)}</span>
                        </div>
                        <span className="text-xs font-black">{leagueOn[k] ?? true ? "ON" : "OFF"}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-5 text-xs font-bold uppercase tracking-wide opacity-80">Jogos</div>
                <div className="mt-3 flex flex-col gap-2 max-h-[60vh] overflow-auto pr-1">
                  {filtered.map((fx) => {
                    const id = stableId(fx);
                    const title = `${fx.display_home} × ${fx.display_away}`.trim();

                    return (
                      <label key={id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
                        <input
                          type="checkbox"
                          checked={visible[id] ?? true}
                          onChange={(e) => setVisible((v) => ({ ...v, [id]: e.target.checked }))}
                          className="scale-110"
                        />
                        <span className={["h-2.5 w-2.5 rounded-full", leagueDotClass(fx.league)].join(" ")} />
                        <span className="opacity-90">{title}</span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-[380px_1fr] md:gap-4">
            {/* Desktop sidebar */}
            <aside className="hidden md:sticky md:top-4 md:block md:h-[calc(100vh-2rem)] md:overflow-auto rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-black/20 p-4 shadow-2xl">
              <div className="text-sm font-black">Painel da Rodada 🎯</div>

              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="filtrar jogos..."
                className="mt-3 w-full rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none"
              />

              <div className="mt-4">
                <div className="text-xs font-bold uppercase tracking-wide opacity-80">Campeonatos</div>
                <div className="mt-3 grid grid-cols-1 gap-2">
                  {leagueKeys.map((k) => (
                    <button
                      key={k}
                      onClick={() => toggleLeague(k)}
                      className={[
                        "flex items-center justify-between rounded-xl border px-3 py-2 text-sm",
                        leagueOn[k] ?? true ? leaguePillClass(k) : "border-white/10 bg-white/5 text-zinc-200 opacity-80",
                      ].join(" ")}
                    >
                      <div className="flex items-center gap-2">
                        <span className={["h-2.5 w-2.5 rounded-full", leagueDotClass(k)].join(" ")} />
                        <span className="font-bold">{leagueLabel(k)}</span>
                      </div>
                      <span className="text-xs font-black">{leagueOn[k] ?? true ? "ON" : "OFF"}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {filtered.map((fx) => {
                  const id = stableId(fx);
                  const title = `${fx.display_home} × ${fx.display_away}`.trim();
                  return (
                    <label key={id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-xs">
                      <input
                        type="checkbox"
                        checked={visible[id] ?? true}
                        onChange={(e) => setVisible((v) => ({ ...v, [id]: e.target.checked }))}
                        className="scale-110"
                      />
                      <span className={["h-2.5 w-2.5 rounded-full", leagueDotClass(fx.league)].join(" ")} />
                      <span className="opacity-90">{title}</span>
                    </label>
                  );
                })}
                {!filtered.length && <div className="text-xs opacity-70">Nenhum jogo encontrado.</div>}
              </div>
            </aside>

            {/* Content */}
            <section className="flex flex-col gap-3 md:gap-4">
              {loading && <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm opacity-90">Carregando CSVs…</div>}
              {err && (
                <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-4 text-sm">
                  Erro: {err}
                </div>
              )}

              {fixtures.map((fx, idx) => {
                if ((leagueOn[fx.league] ?? true) === false) return null;

                const qq = normTeam(q.trim());
                if (qq) {
                  const t = normTeam(`${fx.display_home} ${fx.display_away} ${fx.meta.competition} ${fx.league}`);
                  if (!t.includes(qq)) return null;
                }

                const id = stableId(fx);
                if (!(visible[id] ?? true)) return null;

                const homeName = fx.display_home;
                const awayName = fx.display_away;

                const dtPretty = fmtDateTimeBrPretty(fx.meta.utcDate_fixture);

                const n = fx.w.length;

                const casa_gf_w = wmean(fx.casa_gf, fx.w);
                const casa_ga_w = wmean(fx.casa_ga, fx.w);
                const vis_gf_w = wmean(fx.vis_gf, fx.w);
                const vis_ga_w = wmean(fx.vis_ga, fx.w);

                const casa_gf_m = mean(fx.casa_gf);
                const casa_ga_m = mean(fx.casa_ga);

                const casa_cv_total = mean2(wcvPercent(fx.casa_gf, fx.w), wcvPercent(fx.casa_ga, fx.w));
                const vis_cv_total = mean2(wcvPercent(fx.vis_gf, fx.w), wcvPercent(fx.vis_ga, fx.w));
                const cv_jogo = mean2(casa_cv_total, vis_cv_total);

                const confiab = confiabilidadeFromCv(cv_jogo);
                const { label: confiabLabel, cls: confiabCls } = confiabBucket(confiab);

                const pred_mand = casa_gf_w != null && vis_ga_w != null ? (casa_gf_w + vis_ga_w) / 2 : null;
                const pred_vis = vis_gf_w != null && casa_ga_w != null ? (vis_gf_w + casa_ga_w) / 2 : null;
                const total_prev = pred_mand != null && pred_vis != null ? pred_mand + pred_vis : null;

                const home_pos = fx.home_pos;
                const away_pos = fx.away_pos;

                return (
                  <div
                    key={`${id}-${idx}`}
                    className="rounded-2xl border border-white/10 bg-[radial-gradient(1200px_240px_at_12%_0%,rgba(47,125,255,0.10),transparent_60%),radial-gradient(900px_220px_at_88%_0%,rgba(255,59,59,0.08),transparent_58%),linear-gradient(180deg,rgba(255,255,255,0.08),rgba(0,0,0,0.30))] p-3 sm:p-4 shadow-2xl"
                  >
                    {/* header */}
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-3">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={["h-2.5 w-2.5 rounded-full", leagueDotClass(fx.league)].join(" ")} />
                          <span className={["rounded-full border px-2.5 py-1 text-[11px] font-black", leaguePillClass(fx.league)].join(" ")}>
                            {leagueLabel(fx.league)}
                          </span>
                        </div>

                        <div className="mt-2 text-lg font-black leading-tight">
                          {homeName} × {awayName}
                        </div>

                        <div className="mt-1 text-xs opacity-75">MD {fx.meta.matchday_fixture} • {dtPretty}</div>
                      </div>

                      <div className="flex flex-wrap gap-2 sm:justify-end">
                        <div className="self-start rounded-full border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] sm:text-xs">
                          Amostras do TOP: <b>{n}</b>
                        </div>

                        {/* ✅ Botão por jogo */}
                        <button
                          onClick={() => openFixture(fx)}
                          className="self-start rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] sm:text-xs font-black hover:bg-white/10"
                        >
                          Abrir jogo ↗
                        </button>
                      </div>
                    </div>

                    {/* master */}
                    <div className="mt-3 rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-black/20 p-3 sm:p-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="text-[11px] font-bold uppercase tracking-wide opacity-85">Placar Previsto ✨</div>

                        <div className="flex items-center gap-2 text-xs">
                          <span className="opacity-80">Confiabilidade</span>
                          <span
                            className={[
                              "rounded-full border px-3 py-1 font-black",
                              confiabCls === "conf-bom" && "border-emerald-400/30 bg-emerald-400/15",
                              confiabCls === "conf-medio" && "border-yellow-300/30 bg-yellow-300/15",
                              confiabCls === "conf-ruim" && "border-red-400/30 bg-red-400/15",
                              confiabCls === "conf-na" && "border-white/10 bg-white/5 opacity-80",
                            ].filter(Boolean).join(" ")}
                          >
                            {confiabLabel}
                          </span>
                        </div>
                      </div>

                      {/* ✅ MOBILE-FIRST: nomes em cima (wrap), score central */}
                      <div className="mt-3">
                        {/* Names row */}
                        <div className="grid grid-cols-2 gap-3 items-start">
                          {/* HOME */}
                          <div className="text-left min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[11px] opacity-70">Casa</span>
                              {home_pos != null && <PosBadge pos={home_pos} />}
                            </div>
                            <div className="mt-1 font-black leading-snug whitespace-normal break-words text-sm sm:text-base">
                              {homeName}
                            </div>
                          </div>

                          {/* AWAY */}
                          <div className="text-right min-w-0">
                            <div className="flex items-center justify-end gap-2">
                              {away_pos != null && <PosBadge pos={away_pos} />}
                              <span className="text-[11px] opacity-70">Fora</span>
                            </div>
                            <div className="mt-1 font-black leading-snug whitespace-normal break-words text-sm sm:text-base">
                              {awayName}
                            </div>
                          </div>
                        </div>

                        {/* Score row */}
                        <div className="mt-3 flex flex-col items-center justify-center">
                          <div className="flex items-baseline justify-center gap-2 tabular-nums">
                            <span className="text-2xl sm:text-3xl font-black">{fmtNum(pred_mand, 2)}</span>
                            <span className="text-base sm:text-lg font-black opacity-80">×</span>
                            <span className="text-2xl sm:text-3xl font-black">{fmtNum(pred_vis, 2)}</span>
                          </div>
                          <div className="mt-1 text-[11px] opacity-70 text-center">
                            Total: <b>{fmtNum(total_prev, 2)}</b>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* médias */}
                    <div className="mt-3 rounded-2xl border border-white/10 border-dashed bg-black/25 p-3 sm:p-4">
                      <div className="text-[11px] font-bold uppercase tracking-wide opacity-85">Média Simples</div>

                      <div className="mt-3 grid gap-3 md:grid-cols-1">

                        <StatBox title="Média Simples" gf={fmtNum(casa_gf_m, 2)} ga={fmtNum(casa_ga_m, 2)} />
                      </div>
                    </div>

                    {/* TOP-12 (mobile cards + desktop table) */}
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm opacity-90">Ver TOP-12 usado (históricos)</summary>

                      <div className="mt-3">
                        {/* ✅ MOBILE: cards */}
                        <div className="flex flex-col gap-2 md:hidden">
                          {fx.top_rows.slice(0, 12).map((r: Record<string, string>, i: number) => {
                            const dtPrev = fmtDateBrOnly(r["utcDate_prev"] || "");
                            const homePrev = r["home_prev"] || "";
                            const awayPrev = r["away_prev"] || "";
                            const scorePrev = r["score_fulltime_prev"] || "";

                            const target = r["target_team"] || "";
                            const opp = r["opponent"] || "";
                            const tp = tryInt(r["target_pos_then"]);
                            const op = tryInt(r["opponent_pos_then"]);

                            let homePosThen: number | null = null;
                            let awayPosThen: number | null = null;

                            const nTarget = normTeam(target);
                            const nOpp = normTeam(opp);
                            const nHomePrev = normTeam(homePrev);
                            const nAwayPrev = normTeam(awayPrev);

                            if (nTarget === nHomePrev) {
                              homePosThen = tp;
                              awayPosThen = op;
                            } else if (nTarget === nAwayPrev) {
                              homePosThen = op;
                              awayPosThen = tp;
                            } else {
                              if (nOpp === nHomePrev) {
                                homePosThen = op;
                                awayPosThen = tp;
                              } else if (nOpp === nAwayPrev) {
                                homePosThen = tp;
                                awayPosThen = op;
                              }
                            }

                            return (
                              <div key={i} className="rounded-2xl border border-white/10 bg-black/20 p-3">
                                <div className="flex items-center justify-between gap-3">
                                  <div className="text-xs opacity-80">
                                    <span className="font-black">#{r["rank"] || i + 1}</span>
                                    <span className="mx-2 opacity-40">•</span>
                                    <span className="whitespace-nowrap">{dtPrev}</span>
                                  </div>
                                  <div className="tabular-nums font-black text-sm">{scorePrev}</div>
                                </div>

                                <div className="mt-2 grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <span className="whitespace-normal break-words font-bold">{homePrev}</span>
                                      {homePosThen != null && <PosBadge small pos={homePosThen} />}
                                    </div>
                                  </div>

                                  <div className="text-xs font-black opacity-60">×</div>

                                  <div className="min-w-0 text-right">
                                    <div className="flex items-center justify-end gap-2 min-w-0">
                                      {awayPosThen != null && <PosBadge small pos={awayPosThen} />}
                                      <span className="whitespace-normal break-words font-bold">{awayPrev}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}

                          {!fx.top_rows.length && (
                            <div className="rounded-2xl border border-white/10 bg-black/20 p-4 text-center text-xs opacity-70">
                              Sem linhas no TOP.
                            </div>
                          )}
                        </div>

                        {/* ✅ DESKTOP: tabela */}
                        <div className="hidden md:block overflow-auto rounded-2xl border border-white/10 bg-black/20">
                          <table className="min-w-[760px] w-full text-xs">
                            <thead className="sticky top-0 bg-zinc-950/90 backdrop-blur border-b border-white/10">
                              <tr>
                                <th className="p-3 text-right">#</th>
                                <th className="p-3 whitespace-nowrap">Data</th>
                                <th className="p-3">Mandante</th>
                                <th className="p-3">Visitante</th>
                                <th className="p-3 text-right">Placar</th>
                              </tr>
                            </thead>
                            <tbody>
                              {fx.top_rows.slice(0, 12).map((r: Record<string, string>, i: number) => {
                                const dtPrev = fmtDateBrOnly(r["utcDate_prev"] || "");
                                const homePrev = r["home_prev"] || "";
                                const awayPrev = r["away_prev"] || "";
                                const scorePrev = r["score_fulltime_prev"] || "";

                                const target = r["target_team"] || "";
                                const opp = r["opponent"] || "";
                                const tp = tryInt(r["target_pos_then"]);
                                const op = tryInt(r["opponent_pos_then"]);

                                let homePosThen: number | null = null;
                                let awayPosThen: number | null = null;

                                const nTarget = normTeam(target);
                                const nOpp = normTeam(opp);
                                const nHomePrev = normTeam(homePrev);
                                const nAwayPrev = normTeam(awayPrev);

                                if (nTarget === nHomePrev) {
                                  homePosThen = tp;
                                  awayPosThen = op;
                                } else if (nTarget === nAwayPrev) {
                                  homePosThen = op;
                                  awayPosThen = tp;
                                } else {
                                  if (nOpp === nHomePrev) {
                                    homePosThen = op;
                                    awayPosThen = tp;
                                  } else if (nOpp === nAwayPrev) {
                                    homePosThen = tp;
                                    awayPosThen = op;
                                  }
                                }

                                return (
                                  <tr key={i} className="border-b border-white/5">
                                    <td className="p-3 text-right tabular-nums opacity-85">{r["rank"] || i + 1}</td>
                                    <td className="p-3 whitespace-nowrap opacity-85">{dtPrev}</td>
                                    <td className="p-3">
                                      {homePrev} {homePosThen != null && <PosBadge small pos={homePosThen} />}
                                    </td>
                                    <td className="p-3">
                                      {awayPrev} {awayPosThen != null && <PosBadge small pos={awayPosThen} />}
                                    </td>
                                    <td className="p-3 text-right tabular-nums font-black">{scorePrev}</td>
                                  </tr>
                                );
                              })}

                              {!fx.top_rows.length && (
                                <tr>
                                  <td colSpan={5} className="p-4 text-center text-xs opacity-70">
                                    Sem linhas no TOP.
                                  </td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </details>
                  </div>
                );
              })}
            </section>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Home;

// =====================================================
// UI helpers
// =====================================================
function PosBadge({ pos, small }: { pos: number; small?: boolean }) {
  return (
    <span
      className={[
        "inline-flex items-center rounded-full border border-white/10 bg-white/5 font-black shadow-lg",
        small ? "px-2 py-[2px] text-[11px] opacity-90" : "px-2 py-[2px] text-[11px] sm:px-2.5 sm:py-1 sm:text-xs",
      ].join(" ")}
    >
      #{pos}
    </span>
  );
}

function StatBox({  gf, ga }: { title: string; gf: string; ga: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
    

      {/* ✅ centralizado no mobile e no desktop */}
      <div className="mt-3 flex flex-col items-center justify-center gap-2 border-b border-white/10 pb-3">
        <div className="flex items-baseline gap-2 font-black tabular-nums justify-center">
          <span className="text-blue-400">{gf}</span>
          <span className="opacity-70">/</span>
          <span className="text-red-400">{ga}</span>
        </div>

        <div className="text-[11px] opacity-70 text-center">
          <span className="text-blue-400 font-bold">Gols Casa</span> •{" "}
          <span className="text-red-400 font-bold">Gols Visitante</span>
        </div>
      </div>

    </div>
  );
}
