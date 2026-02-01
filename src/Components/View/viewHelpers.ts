// src/Components/viewHelpers.ts
// Helpers e tipos compartilhados do View / AcqPanel

/* ===================== Types ===================== */

export type LinkDoc = {
  acq_id: string;
  sec: number | null;
  link: string;
  ext?: string;
};

export type PageInfo = {
  page: number;
  per_page: number;
  has_more: boolean;
  total?: number;
  total_pages?: number;
};

export type Counts = { matched_acq_ids: number; matched_seconds: number };

export type Group = {
  acq_id: string;
  photos: LinkDoc[];
};

/* ===================== Config ===================== */

export const API_DEFAULT_BASE = "https://carcara-web-api.onrender.com";
export const API_SEARCH_PATH = "/api/search";
export const PANELS_PER_PAGE = 15;

/* ===================== Drive / Imagens ===================== */

export function extractDriveId(link: string): string | null {
  try {
    if (!link) return null;

    if (link.includes("lh3.googleusercontent.com/d/")) {
      const m = link.match(/lh3\.googleusercontent\.com\/d\/([^=\/?#]+)/);
      return m?.[1] ?? null;
    }

    const patterns = [
      /\/file\/d\/([^/]+)\//,
      /\/d\/([^/]+)\//,
      /[?&]id=([^&]+)/,
      /\/uc\?[^#]*\bid=([^&]+)/i,
    ];

    for (const re of patterns) {
      const m = link.match(re);
      if (m?.[1]) return m[1];
    }
    return null;
  } catch {
    return null;
  }
}

export function thumbUrl(link: string): string {
  const id = extractDriveId(link);
  return id ? `https://lh3.googleusercontent.com/d/${id}=w1200-h800-n` : link;
}

export function previewUrl(link: string): string {
  return link.includes("/preview") ? link : link.replace("/view", "/preview");
}

export function fullImageUrl(link: string): string {
  const id = extractDriveId(link);
  return id ? `https://drive.google.com/uc?export=view&id=${id}` : link;
}

/** Format acq_id like 20240129141515 => 29/01/2024 14:15 */
export function formatAcqIdLabel(acq_id: string): string {
  const digits = acq_id.replace(/\D/g, "");
  if (digits.length < 12) return acq_id;

  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);
  const hour = digits.slice(8, 10);
  const minute = digits.slice(10, 12);

  return `${day}/${month}/${year} ${hour}:${minute}`;
}

/** Format seconds like 86 => "1m 26s" */
export function formatSecLabel(sec: number | null | undefined): string {
  if (sec == null || !Number.isFinite(sec)) return "-";
  if (sec < 60) return `${sec}s`;
  const minutes = Math.floor(sec / 60);
  const seconds = sec % 60;
  return `${minutes}m ${seconds}s`;
}

/* ===================== Unique by Second & limit for UI ===================== */

export function uniqueBySecond(photos: LinkDoc[]): LinkDoc[] {
  const seen = new Set<number>();
  const out: LinkDoc[] = [];
  for (const p of photos) {
    const s = (p.sec ?? -1) as number;
    if (!seen.has(s)) {
      seen.add(s);
      out.push(p);
    }
  }
  return out;
}

export function limitPhotosUniform(photos: LinkDoc[], max = 5): LinkDoc[] {
  if (photos.length <= max) return photos;
  const step = photos.length / max;
  const result: LinkDoc[] = [];
  for (let i = 0; i < max; i++) {
    result.push(photos[Math.floor(i * step)]);
  }
  return result;
}

/* ================================================================
   coerceResponse: monta lista de imagens genérica
   ================================================================ */

export function coerceResponse(json: any): {
  counts: Counts;
  page_info: PageInfo;
  images: LinkDoc[];
} {
  let images: LinkDoc[] = [];

  // caso antigo: documents
  if (json && Array.isArray(json.documents)) {
    images = json.documents
      .filter((d: any) => d?.link)
      .map((d: any) => ({
        acq_id: String(d.acq_id ?? d.acq_id_raw ?? ""),
        sec: d.sec ?? null,
        link: d.link,
        ext: d.ext,
      }));

    return {
      counts: json.counts || {
        matched_acq_ids:
          json.matched_acq_ids ?? new Set(images.map((i) => i.acq_id)).size,
        matched_seconds: json.total_hits ?? images.length,
      },
      page_info: json.page_info || {
        page: json.page ?? 1,
        per_page: json.per_page ?? 100,
        has_more: json.has_more ?? false,
      },
      images,
    };
  }

  // novo formato: items
  if (json && Array.isArray(json.items)) {
    for (const it of json.items) {
      const acq_id = String(it.acq_id ?? it.acq_id_raw ?? "");
      const sec = it.sec ?? null;

      // formato BIG antigo: { acq_id, sec, links:[{ext,link}, ...] }
      if (Array.isArray(it.links)) {
        for (const l of it.links) {
          if (!l?.link) continue;
          images.push({
            acq_id,
            sec,
            link: l.link,
            ext: l.ext,
          });
        }
      }

      // novo formato BIG enxuto: { acq_id, sec, link }
      if (typeof it.link === "string" && it.link) {
        images.push({
          acq_id,
          sec,
          link: it.link,
        });
      }

      // formato antigo: links.per_second.photo[..]
      if (it.links?.per_second?.photo) {
        for (const ph of it.links.per_second.photo) {
          if (!ph?.url) continue;
          images.push({
            acq_id,
            sec: ph.sec ?? null,
            link: ph.url,
          });
        }
      }
    }

    const counts: Counts =
      json.counts ||
      ({
        matched_acq_ids:
          json.matched_acq_ids ?? new Set(images.map((i) => i.acq_id)).size,
        matched_seconds: json.total_hits ?? images.length,
      } as Counts);

    const page_info: PageInfo =
      json.page_info || {
        page: json.page ?? 1,
        per_page: json.per_page ?? 100,
        has_more: json.has_more ?? false,
        total: counts.matched_acq_ids,
        total_pages: json.total_pages,
      };

    return { counts, page_info, images };
  }

  // fallback genérico
  const docs = json?.documents || json?.results || json?.images || [];
  images = Array.isArray(docs)
    ? docs
        .filter((d: any) => d?.link)
        .map((d: any) => ({
          acq_id: String(d.acq_id ?? d.acq_id_raw ?? ""),
          sec: d.sec ?? null,
          link: d.link,
          ext: d.ext,
        }))
    : [];

  const counts: Counts =
    json.counts ||
    ({
      matched_acq_ids:
        json.matched_acq_ids ?? new Set(images.map((i) => i.acq_id)).size,
      matched_seconds: json.total_hits ?? images.length,
    } as Counts);

  const page_info: PageInfo =
    json.page_info || {
      page: json.page ?? 1,
      per_page: json.per_page ?? 100,
      has_more: json.has_more ?? false,
    };

  return { counts, page_info, images };
}

/* ===================== URL Builder ===================== */

export function buildSearchUrlFlexible(
  input: string,
  page: number,
  per_page: number,
): string {
  const ensure = (u: URL) => {
    u.searchParams.set("page", String(page));
    u.searchParams.set("per_page", String(per_page));
    return u.toString();
  };

  const trimmed = (input || "").trim();

  // 1) full URL (http/https)
  if (trimmed.startsWith("http")) {
    const urlObj = new URL(trimmed);

    // se for /api/search direto
    if (urlObj.pathname.includes("/api/")) return ensure(urlObj);

    // se for /#/search ou /#/View
    if (
      urlObj.hash.startsWith("#/search") ||
      urlObj.hash.startsWith("#/View") ||
      urlObj.hash.startsWith("#/view")
    ) {
      const api = new URL(API_DEFAULT_BASE + API_SEARCH_PATH);
      const hash = urlObj.hash;
      const q = hash.indexOf("?");
      if (q >= 0) {
        const params = hash.slice(q + 1);
        if (params) {
          new URLSearchParams(params).forEach((v, k) =>
            api.searchParams.append(k, v),
          );
        }
      }
      return ensure(api);
    }

    // qualquer outra URL → só garante paginação
    return ensure(urlObj);
  }

  // 2) só o hash do SPA, tipo "#/search?..." ou "#/View?..."
  if (
    trimmed.startsWith("#/search") ||
    trimmed.startsWith("#/View") ||
    trimmed.startsWith("#/view")
  ) {
    const api = new URL(API_DEFAULT_BASE + API_SEARCH_PATH);
    const q = trimmed.indexOf("?");
    if (q >= 0) {
      const params = trimmed.slice(q + 1);
      if (params) {
        new URLSearchParams(params).forEach((v, k) =>
          api.searchParams.append(k, v),
        );
      }
    }
    return ensure(api);
  }

  // 3) só parâmetros: "?b.period=day..." ou "b.period=day..."
  if (trimmed.startsWith("?") || trimmed.includes("=")) {
    const u = new URL(API_DEFAULT_BASE + API_SEARCH_PATH);
    const qs = trimmed.startsWith("?") ? trimmed.slice(1) : trimmed;
    if (qs) new URLSearchParams(qs).forEach((v, k) => u.searchParams.append(k, v));
    return ensure(u);
  }

  // 4) vazio ou outra coisa → busca geral sem filtros
  return `${API_DEFAULT_BASE}${API_SEARCH_PATH}?page=${page}&per_page=${per_page}`;
}

/* ===================== Pretty labels for filter tags ===================== */

const KEY_LABELS: Record<string, string> = {
  // Vehicle & Scene
  "b.vehicle": "Vehicle",
  "b.period": "Period",
  "b.condition": "Condition",
  "b.city": "City",
  "b.state": "State",
  "b.country": "Country",

  "l.left": "Left lane availability",
  "l.right": "Right lane availability",

  // Vehicle dynamics
  "c.v": "VehicleSpeed (km/h)",
  "c.swa": "SteeringWheelAngle",
  "c.brakes": "BrakeInfoStatus",

  // Perception (YOLO + SemSeg)
  "y.classes": "YOLO classes",
  "y.rel": "Position vs ego",
  "y.conf": "Confidence",
  "y.dist": "Distance (m)",

  // Environment (SemSeg)
  "s.building": "Building",
  "s.vegetation": "Vegetation",

  // Road context (Overpass)
  "o.highway": "Highway (groups)",
  "o.landuse": "Landuse (groups)",
  "o.lanes": "Lanes",
  "o.maxspeed": "Maxspeed (BR presets)",
  "o.oneway": "Oneway",
  "o.surface": "Surface",
  "o.sidewalk": "Sidewalk",
  "o.cycleway": "Cycleway",
};

const VALUE_LABELS: Record<string, Record<string, string>> = {
  // Vehicle & Scene
  "b.vehicle": {
    Captur: "Captur",
    "DAF CF 410": "DAF CF 410",
    Renegade: "Renegade",
  },
  "b.period": {
    day: "day",
    night: "night",
    dusk: "dusk",
    dawn: "dawn",
  },
  "b.condition": {
    "Clear sky": "Clear sky",
    "Mainly clear": "Mainly clear",
    "Partly cloudy": "Partly cloudy",
    Overcast: "Overcast",
    Fog: "Fog",
    "Fog (rime)": "Fog (rime)",
    "Drizzle: light": "Drizzle: light",
    "Drizzle: moderate": "Drizzle: moderate",
    "Drizzle: dense": "Drizzle: dense",
    "Rain: slight": "Rain: slight",
    "Rain: moderate": "Rain: moderate",
    "Rain: heavy": "Rain: heavy",
  },
  "l.left": {
    DISP: "Left available",
    INDISP: "Left unavailable",
  },
  "l.right": {
    DISP: "Right available",
    INDISP: "Right unavailable",
  },

  // Vehicle dynamics
  "c.swa": {
    STRAIGHT: "Straight",
    L_GENTLE: "Left · Gentle",
    L_MODERATE: "Left · Moderate",
    L_HARD: "Left · Hard",
    R_GENTLE: "Right · Gentle",
    R_MODERATE: "Right · Moderate",
    R_HARD: "Right · Hard",
  },
  "c.brakes": {
    not_pressed: "not_pressed",
    pressed: "pressed",
  },

  // Perception
  "y.classes": {
    car: "car",
    motorcycle: "motorcycle",
    bicycle: "bicycle",
    person: "person",
    heavy: "Heavy vehicles",
  },
  "y.rel": {
    EGO: "Ego lane",
    "L-1": "Left adjacent (L-1)",
    "R+1": "Right adjacent (R+1)",
    "OUT-L": "Outside left (OUT-L)",
    "OUT-R": "Outside right (OUT-R)",
  },
  "y.conf": {
    LOW: "Low %",
    MED: "Medium %",
    HIGH: "High %",
  },

  // Environment (SemSeg)
  "s.building": {
    LOW: "Low %",
    MED: "Medium %",
    HIGH: "High %",
  },
  "s.vegetation": {
    LOW: "Low %",
    MED: "Medium %",
    HIGH: "High %",
  },

  // Road context
  "o.highway": {
    primary: "primary",
    primary_link: "primary_link",
    secondary: "secondary",
    secondary_link: "secondary_link",
    local: "local",
  },
  "o.landuse": {
    residential: "residential",
    commercial: "commercial",
    industrial: "industrial",
    agro: "agro",
  },
  "o.oneway": {
    yes: "yes",
    no: "no",
  },
  "o.surface": {
    paved: "paved",
    unpaved: "unpaved",
  },
  "o.sidewalk": {
    both: "both",
    left: "left",
    right: "right",
    no: "no",
  },
};

function autoPrettyKey(key: string): string {
  if (KEY_LABELS[key]) return KEY_LABELS[key];

  let k = key;
  k = k.replace(/^b\./, "block ");
  k = k.replace(/^c\./, "can ");
  k = k.replace(/^l\./, "lane ");
  k = k.replace(/^o\./, "osm ");
  k = k.replace(/^s\./, "semseg ");
  k = k.replace(/^y\./, "yolo ");

  return k
    .split(/[._]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function prettyValue(key: string, value: string): string {
  const dict = VALUE_LABELS[key];
  if (dict && dict[value] !== undefined) return dict[value];
  return value;
}

/* ===================== Filter tags from query ===================== */

export function parseFilterTags(query: string | null): string[] {
  if (!query) return [];
  let qs = query.trim();

  try {
    if (qs.startsWith("http")) {
      const u = new URL(qs);
      if (u.search) {
        qs = u.search.slice(1);
      } else if (u.hash.includes("?")) {
        qs = u.hash.split("?")[1] ?? "";
      } else {
        qs = "";
      }
    } else if (qs.startsWith("#")) {
      const idx = qs.indexOf("?");
      qs = idx >= 0 ? qs.slice(idx + 1) : "";
    } else if (qs.startsWith("?")) {
      qs = qs.slice(1);
    } else if (!qs.includes("=")) {
      qs = "";
    }
  } catch {
    qs = "";
  }

  if (!qs) return [];
  const params = new URLSearchParams(qs);
  const ignore = new Set(["page", "per_page"]);
  const tags: string[] = [];

  params.forEach((value, key) => {
    if (ignore.has(key)) return;
    if (!value) return;

    const labelKey = autoPrettyKey(key);
    const labelValue = prettyValue(key, value);

    tags.push(`${labelKey}: ${labelValue}`);
  });

  return Array.from(new Set(tags));
}
