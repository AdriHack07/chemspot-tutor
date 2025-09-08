import chemdb from '@/lib/chemdb.json';

export type RGB = [number, number, number];
export type InorgEntry = { type?: 'ppt'|'observation'|'no-reaction'; color?: string; rgb?: RGB; notes?: string[] } | any;

export const DB = chemdb as {
  inorganic: Record<string, Record<string, InorgEntry>>;
  organic: Record<string, any>;
  aliases?: Record<string, string[]>;
  colorVocab?: string[];
  intrinsicColors?: Record<string, string>;
};

// Hard, explicit map for named colors → approximate RGB (tune as you like)
const NAME_TO_RGB: Record<string, RGB> = {
  white: [255,255,255], 'off-white':[248,248,244], cream:[245,236,200],
  yellow:[255,230,0], 'gold-yellow':[255,204,0], orange:[255,165,0],
  'brick-red':[178,34,34], brown:[120,72,0], black:[0,0,0], grey:[128,128,128],
  gray:[128,128,128], green:[0,128,0], blue:[0,102,204], 'deep-blue':[0,51,153],
  violet:[138,43,226], purple:[128,0,128], pink:[255,105,180], red:[220,0,0],
  cyan:[0,180,200]
};

// Placeholder value to ignore
const PLACEHOLDER = 'color';

export function isValidColorName(c?: string): c is string {
  if (!c) return false;
  if (c === PLACEHOLDER) return false;
  // if vocab exists, prefer it; otherwise accept mapped names
  if (DB.colorVocab?.length) return DB.colorVocab.includes(c) && c !== PLACEHOLDER;
  return c in NAME_TO_RGB;
}

export function colorNameToRGB(name?: string): RGB | null {
  if (!isValidColorName(name)) return null;
  return NAME_TO_RGB[name] ?? null;
}

export function readOutcomeRGB(entry?: InorgEntry): RGB | null {
  if (!entry) return null;
  if (Array.isArray(entry.rgb) && entry.rgb.length === 3) return entry.rgb as RGB; // if ever present
  if (isValidColorName(entry.color)) return colorNameToRGB(entry.color);
  return null;
}
