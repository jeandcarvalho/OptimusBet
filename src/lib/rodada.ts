// src/lib/rodada.ts
export const CV_VERDE_MAX = 35.0;
export const CV_AMARELO_MAX = 60.0;
export const EPS = 1e-6;

export type Row = Record<string, string>;

export type FixtureMeta = {
  competition?: string;
  fixture_id?: string;
  utcDate_fixture?: string;
  matchday_fixture?: string;
  home_name?: string;
  away_name?: string;
};

export type FixtureStats = {
  meta: Required<FixtureMeta>;
  casa_gf: number[];
  casa_ga: number[];
  vis_gf: number[];
  vis_ga: number[];
  w: number[];
  top_rows: Row[];
};

export function tryFloat(x: unknown): number | null {
  if (x == null) return null;
  const s = String(x).trim().replace(",", ".");
  if (!s) return null;
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

export function tryInt(x: unknown): number | null {
  const f = tryFloat(x);
  if (f == null) return null;
  const v = Math.trunc(f);
  return Number.isFinite(v) ? v : null;
}

const scoreRe = /^\s*(\d+)\s*-\s*(\d+)\s*$/;

export function parseScore(score: string): [number, number] | null {
  if (!score) return null;
  const m = scoreRe.exec(score);
  if (!m) return null;
  return [Number(m[1]), Number(m[2])];
}

export function wFromDelta(deltaVal: number | null): number {
  if (deltaVal == null) return 0;
  return 1 / (deltaVal + EPS);
}

export function mean(xs: number[]): number | null {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

export function wmean(xs: number[], ws: number[]): number | null {
  if (!xs.length || xs.length !== ws.length) return null;
  const sw = ws.reduce((a, b) => a + b, 0);
  if (sw <= 0) return null;
  let acc = 0;
  for (let i = 0; i < xs.length; i++) acc += xs[i] * ws[i];
  return acc / sw;
}

export function wvarPop(xs: number[], ws: number[]): number | null {
  const m = wmean(xs, ws);
  if (m == null) return null;
  const sw = ws.reduce((a, b) => a + b, 0);
  if (sw <= 0) return null;
  let acc = 0;
  for (let i = 0; i < xs.length; i++) acc += ws[i] * (xs[i] - m) ** 2;
  return acc / sw;
}

export function wcvPercent(xs: number[], ws: number[]): number | null {
  const m = wmean(xs, ws);
  const v = wvarPop(xs, ws);
  if (m == null || v == null) return null;
  if (Math.abs(m) < 1e-12) return null;
  return (Math.sqrt(v) / Math.abs(m)) * 100;
}

export function mean2(a: number | null, b: number | null): number | null {
  if (a == null && b == null) return null;
  if (a == null) return b;
  if (b == null) return a;
  return (a + b) / 2;
}

export function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

export function confiabilidadeFromCv(cv: number | null): number | null {
  if (cv == null) return null;
  return clamp(100 - cv, 0, 100);
}

export function confiabBucket(confiab: number | null): { label: string; cls: string } {
  if (confiab == null) return { label: "N/A", cls: "conf-na" };
  const CONF_BOM_MIN = 100 - CV_VERDE_MAX; // 65
  const CONF_MEDIO_MIN = 100 - CV_AMARELO_MAX; // 40
  if (confiab >= CONF_BOM_MIN) return { label: `${confiab.toFixed(1)}%`, cls: "conf-bom" };
  if (confiab >= CONF_MEDIO_MIN) return { label: `${confiab.toFixed(1)}%`, cls: "conf-medio" };
  return { label: `${confiab.toFixed(1)}%`, cls: "conf-ruim" };
}

export function fmtNum(x: number | null, nd = 2): string {
  if (x == null) return "";
  return x.toFixed(nd);
}

export function fmtDateBrOnly(s: string): string {
  const t = (s || "").trim();
  if (!t) return "";

  // ISO Z
  if (t.includes("T")) {
    const iso = t.endsWith("Z") ? t.replace("Z", "+00:00") : t;
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      return new Intl.DateTimeFormat("pt-BR").format(d);
    }
  }

  // YYYY-MM-DD HH:MM or YYYY-MM-DD
  if (t.length >= 10 && t[4] === "-" && t[7] === "-") {
    const [y, m, d] = t.slice(0, 10).split("-");
    return `${d}/${m}/${y}`;
  }

  return t;
}

export function normTeamName(x: string): string {
  return (x || "").trim().toLowerCase();
}

export function estimateTeamPosFromTop(topRows: Row[], teamName: string): number | null {
  const t = normTeamName(teamName);
  if (!t) return null;
  const count = new Map<number, number>();

  for (const r of topRows) {
    const target = normTeamName(r["target_team"] || "");
    const opp = normTeamName(r["opponent"] || "");
    const tp = tryInt(r["target_pos_then"]);
    const op = tryInt(r["opponent_pos_then"]);

    if (target && target === t && tp != null) {
      count.set(tp, (count.get(tp) || 0) + 1);
    } else if (opp && opp === t && op != null) {
      count.set(op, (count.get(op) || 0) + 1);
    }
  }

  let best: number | null = null;
  let bestC = -1;
  for (const [k, v] of count.entries()) {
    if (v > bestC) {
      bestC = v;
      best = k;
    }
  }
  return best;
}

/** CSV minimalista (compatível com utf-8-sig via trim do BOM) */
export function parseCsv(text: string): Row[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter(l => l.trim().length);
  if (!lines.length) return [];
  const header = splitCsvLine(lines[0]).map(h => h.trim());
  const rows: Row[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const r: Row = {};
    for (let j = 0; j < header.length; j++) {
      r[header[j]] = (cols[j] ?? "").trim();
    }
    rows.push(r);
  }
  return rows;
}

/** Split CSV com suporte básico a aspas */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQ = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      // "" dentro de aspas => "
      if (inQ && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQ = !inQ;
      }
    } else if (ch === "," && !inQ) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

export function parseMetaFromPanels(panelsRows: Row[]): FixtureMeta {
  const r0 = panelsRows[0] || {};
  const meta: FixtureMeta = {
    competition: r0["competition"] || "",
    fixture_id: r0["fixture_id"] || "",
    utcDate_fixture: r0["utcDate"] || r0["utcDate_fixture"] || "",
    matchday_fixture: r0["matchday"] || r0["matchday_fixture"] || "",
  };

  let home = "";
  let away = "";
  for (const r of panelsRows) {
    const side = (r["side"] || "").toUpperCase().trim();
    if (side === "HOME") home = r["team_name"] || home;
    if (side === "AWAY") away = r["team_name"] || away;
  }
  meta.home_name = home;
  meta.away_name = away;
  return meta;
}

export function parseMetaFromTop(topRows: Row[]): FixtureMeta {
  const r0 = topRows[0] || {};
  return {
    competition: r0["competition"] || "",
    fixture_id: r0["fixture_id"] || "",
    utcDate_fixture: r0["utcDate_fixture"] || "",
    matchday_fixture: r0["matchday_fixture"] || "",
  };
}

export function inferTeamsFromBase(base: string): { home: string; away: string } {
  // tenta "...__HOME_vs_AWAY"
  const m = /__([^_].*?)_vs_(.*?)$/.exec(base);
  if (!m) return { home: "", away: "" };
  return { home: m[1].replace(/_/g, " "), away: m[2].replace(/_/g, " ") };
}

export function buildFixtureStats(topRows: Row[], panelsRows?: Row[], baseName?: string): FixtureStats {
  let meta: FixtureMeta = {};
  if (panelsRows && panelsRows.length) meta = parseMetaFromPanels(panelsRows);
  else meta = parseMetaFromTop(topRows);

  if ((!meta.home_name || !meta.away_name) && baseName) {
    const t = inferTeamsFromBase(baseName);
    meta.home_name ||= t.home;
    meta.away_name ||= t.away;
  }

  const casa_gf: number[] = [];
  const casa_ga: number[] = [];
  const vis_gf: number[] = [];
  const vis_ga: number[] = [];
  const w: number[] = [];

  for (const r of topRows) {
    const score = r["score_fulltime_prev"] || r["score_fulltime"] || "";
    const sc = parseScore(score);
    if (!sc) continue;
    const [hg, ag] = sc;

    const deltaVal = tryFloat(r["delta_total_val"]);
    const ww = wFromDelta(deltaVal);
    if (ww <= 0) continue;

    casa_gf.push(hg);
    casa_ga.push(ag);
    vis_gf.push(ag);
    vis_ga.push(hg);
    w.push(ww);
  }

  const full: Required<FixtureMeta> = {
    competition: meta.competition || "",
    fixture_id: meta.fixture_id || "",
    utcDate_fixture: meta.utcDate_fixture || "",
    matchday_fixture: meta.matchday_fixture || "",
    home_name: meta.home_name || "",
    away_name: meta.away_name || "",
  };

  return { meta: full, casa_gf, casa_ga, vis_gf, vis_ga, w, top_rows: topRows };
}
