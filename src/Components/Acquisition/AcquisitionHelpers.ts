// src/Components/AcquisitionHelpers.ts

export type FilterTag = { label: string; value: string };

/* ===================== Drive / Images ===================== */

export function extractDriveId(link: string): string | null {
  try {
    if (!link) return null;

    if (link.includes("lh3.googleusercontent.com/d/")) {
      const m = link.match(/lh3\.googleusercontent\.com\/d\/([^=\/#]+)/);
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
  return id ? `https://lh3.googleusercontent.com/d/${id}=w640-h360-n` : link;
}

export function fullImageUrl(link: string): string {
  const id = extractDriveId(link);
  // Use direct lh3 image URL so it can be rendered inside <img> without HTML wrapper
  // Higher resolution to look good in the main panel
  return id ? `https://lh3.googleusercontent.com/d/${id}=w1920-h1080-n` : link;
}

export function getDrivePreviewUrl(link: string | null): string | null {
  if (!link) return null;
  const id = extractDriveId(link);
  if (!id) return null;
  return `https://drive.google.com/file/d/${id}/preview?vq=hd1080`;
}

export function getDriveThumbUrl(link: string | null): string | null {
  if (!link) return null;
  return thumbUrl(link);
}

export function getDriveImageUrl(link: string | null): string | null {
  if (!link) return null;
  return fullImageUrl(link);
}

/* ===================== AcqId label ===================== */

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

export function formatAcqLabel(acqId?: string | null): string {
  if (!acqId) return "";
  return formatAcqIdLabel(acqId);
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

/* ===================== Parse filter tags (string) ===================== */

export function parseFilterTags(raw: string): string[] {
  if (!raw) return [];
  let qs = raw.trim();

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
  const ignore = new Set(["page", "per_page", "acq_id"]);
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

/* ===================== Parse filter tags for Acquisition ===================== */

export function parseFilterTagsFromSearch(search: string): FilterTag[] {
  const tags = parseFilterTags(search || "");
  return tags.map((s) => {
    const idx = s.indexOf(":");
    if (idx === -1) {
      return { label: s.trim(), value: "" };
    }
    return {
      label: s.slice(0, idx).trim(),
      value: s.slice(idx + 1).trim(),
    };
  });
}

/* ===================== Download order ===================== */

export const EXT_DOWNLOAD_ORDER = ["avi", "mp4", "csv", "mf4", "blf"];
