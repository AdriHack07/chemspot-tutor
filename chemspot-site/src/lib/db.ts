
import chemdb from '@/lib/chemdb.json';

export type InorgEntry = { type: 'ppt'|'observation'|'no-reaction'; color?: string; notes?: string[]; eq?: string };
export type OrgEntry = { type: 'ppt'|'observation'|'decolorization'|'mirror'|'no-reaction'; color?: string; notes?: string[] };

export const DB = chemdb as {
  inorganic: Record<string, Record<string, InorgEntry>>;
  organic: Record<string, Record<string, OrgEntry>>;
  intrinsicColors: Record<string,string>;
  aliases: Record<string,string[]>;
  colorVocab: string[];
};

function aliasFind(token: string): string {
  const t = token.normalize('NFC');
  for (const [key, vals] of Object.entries(DB.aliases||{})) {
    if (key === t) return key;
    if (vals?.some(v => v === t)) return key;
  }
  return token;
}

export function lookupInorganic(cation: string, anion: string): InorgEntry | null {
  const c = DB.inorganic[aliasFind(cation)] || DB.inorganic[cation];
  if (!c) return null;
  const e = c[aliasFind(anion)] || c[anion];
  return e ?? null;
}

export function listByColor(color: string) {
  const res: Array<{cation: string, partner: string, entry: InorgEntry}> = [];
  for (const [cat, m] of Object.entries(DB.inorganic)) {
    for (const [partner, entry] of Object.entries(m)) {
      if ((entry as any).color === color) res.push({ cation: cat, partner, entry: entry as InorgEntry });
    }
  }
  return res;
}

export function randomSolutions(n: number): string[] {
  const keys = Object.keys(DB.inorganic);
  const out = new Set<string>();
  while (out.size < Math.min(n, keys.length)) {
    out.add(keys[Math.floor(Math.random()*keys.length)]);
  }
  return [...out];
}
