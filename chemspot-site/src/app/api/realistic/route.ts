// src/app/api/realistic/route.ts
import { NextResponse } from 'next/server';
import { DB } from '@/lib/db';

type RGB = [number, number, number];
type InorgEntry = { type?: 'ppt'|'observation'|'no-reaction'; color?: string; rgb?: RGB; notes?: string[] } | any;
type Sol = { cation: string; anion: string; label: string; intrinsicRgb?: RGB };

export const runtime = 'edge';

// --- helpers: DB readers that tolerate different shapes ---
const ALL_CATIONS = Object.keys(DB.inorganic);
const ALL_ANIONS  = Array.from(new Set(Object.values(DB.inorganic).flatMap(o => Object.keys(o))))
  .filter(a => a !== 'selbst' && a !== 'flamme');

function readRgb(entry: InorgEntry | undefined): RGB | null {
  if (!entry) return null;
  // common shapes: { rgb: [r,g,b] }  or { color: 'name' } or legacy [ [r,g,b], ... ]
  if (Array.isArray(entry?.rgb) && entry.rgb.length === 3) return entry.rgb as RGB;
  if (Array.isArray(entry) && Array.isArray(entry[0]) && entry[0].length === 3) return entry[0] as RGB;
  return null;
}
function intrinsicRgb(cation: string): RGB | null {
  const self = DB.inorganic[cation]?.['selbst'];
  return readRgb(self);
}
function reacts(cation: string, anion: string): { rgb: RGB | null } | null {
  const e = DB.inorganic[cation]?.[anion] as InorgEntry | undefined;
  if (!e) return null;
  return { rgb: readRgb(e) };
}
function isWhite(rgb: RGB | null): boolean {
  if (!rgb) return false; // null means we don’t know; treat as not-white (won’t count as colored unless rgb exists)
  const [r,g,b] = rgb;
  // strict white; tweak threshold if your DB encodes "almost white"
  return r === 255 && g === 255 && b === 255;
}
function isColored(rgb: RGB | null): boolean {
  // “colored” means a visible, non-white result (black, yellow, brown, etc. all count)
  return !!rgb && !isWhite(rgb);
}

// prefer the more colorful outcome if only one side yields color
function outcome(a: Sol, b: Sol): { rgb: RGB | null } | null {
  const e1 = reacts(a.cation, b.anion);
  const e2 = reacts(b.cation, a.anion);
  if (!e1 && !e2) return null;
  if (e1 && !e2) return e1;
  if (e2 && !e1) return e2;
  // both exist → prefer colored, otherwise just return first
  if (isColored(e1!.rgb) && !isColored(e2!.rgb)) return e1!;
  if (isColored(e2!.rgb) && !isColored(e1!.rgb)) return e2!;
  return e1!;
}

// --- solution set generation with color coverage constraints ---
function pickSolutions(n: number): Sol[] {
  const sols: Sol[] = [];
  const pool = [...ALL_CATIONS];

  // weight by how many colored outcomes the cation tends to produce
  const colorWeight = (c: string) => {
    const m = DB.inorganic[c] || {};
    let k = 0;
    for (const an of Object.keys(m)) {
      if (an === 'selbst' || an === 'flamme') continue;
      if (isColored(readRgb(m[an]))) k++;
    }
    return Math.max(k, 1);
  };
  const weights = pool.map(colorWeight);

  const usedAnions = new Set<string>();
  while (sols.length < n && pool.length) {
    // weighted pick of cation
    const total = weights.reduce((a,b)=>a+b,0);
    let r = Math.random()*total, idx = 0;
    while (idx < weights.length && (r -= weights[idx]) > 0) idx++;
    const cation = pool.splice(idx,1)[0];
    weights.splice(idx,1);

    const forbid = new Set(Object.keys(DB.inorganic[cation] || {})); // avoid internal reaction when possible
    const candidates = ALL_ANIONS.filter(a => !usedAnions.has(a) && !forbid.has(a));
    // allow explicit no-reaction entries as internal-safe, too
    const explicitNoReact = Object.entries(DB.inorganic[cation] || {})
      .filter(([a,e]) => a!=='selbst' && a!=='flamme' && readRgb(e as any) === null) // null rgb ~ “no color known”
      .map(([a]) => a);

    const poolAnions = [...candidates, ...explicitNoReact];
    if (!poolAnions.length) continue;
    const anion = poolAnions[Math.floor(Math.random()*poolAnions.length)];

    usedAnions.add(anion);
    sols.push({ cation, anion, label: `P${sols.length+1}`, intrinsicRgb: intrinsicRgb(cation) || undefined });
  }
  if (sols.length < n) throw new Error('Could not generate enough salts without internal reaction.');
  return sols;
}

function buildGrid(sols: Sol[]) {
  const N = sols.length;
  const grid: Array<Array<{ rgb?: RGB } | null>> = [];
  for (let i=0;i<N;i++){
    const row: Array<{ rgb?: RGB } | null> = [];
    for (let j=0;j<N;j++){
      if (j<i) row.push(null);
      else if (i===j) row.push(sols[i].intrinsicRgb ? { rgb: sols[i].intrinsicRgb } : null);
      else {
        const e = outcome(sols[i], sols[j]);
        row.push(e ? { rgb: e.rgb || undefined } : null);
      }
    }
    grid.push(row);
  }
  return grid;
}

function colorStats(grid: Array<Array<{ rgb?: RGB } | null>>) {
  let colored = 0;
  const bucket = new Set<string>();
  for (const row of grid) for (const cell of row) {
    if (cell?.rgb && isColored(cell.rgb)) {
      colored++;
      const [r,g,b] = cell.rgb;
      // quantize to merge very similar shades
      const key = `${Math.round(r/24)}-${Math.round(g/24)}-${Math.round(b/24)}`;
      bucket.add(key);
    }
  }
  return { coloredCount: colored, distinct: bucket.size };
}

export async function POST(req: Request) {
  try {
    const { n = 7, minColored = undefined } = await req.json().catch(()=>({}));
    const N = Math.min(Math.max(parseInt(String(n)||'7',10)||7,5), 9);

    // coverage targets: at least 25% of upper-triangle cells colored, min 6 cells, min 4 distinct colors
    const upperCells = (N*(N-1))/2;
    let target = typeof minColored === 'number' ? minColored : Math.max(6, Math.ceil(0.25*upperCells));
    let minDistinct = 4;

    // attempt loop with graceful relaxation
    let tries = 0, best: { solutions: Sol[], grid: Array<Array<{rgb?: RGB} | null>>, stats: {coloredCount:number; distinct:number} } | null = null;
    while (tries++ < 120) {
      const sols = pickSolutions(N);
      const grid = buildGrid(sols);
      const stats = colorStats(grid);
      if (!best || stats.coloredCount > best.stats.coloredCount) best = { solutions: sols, grid, stats };
      if (stats.coloredCount >= target && stats.distinct >= minDistinct) {
        return NextResponse.json({ solutions: sols, grid, stats });
      }
      // Gradually relax after many tries
      if (tries === 60) { target = Math.max(5, Math.floor(target*0.8)); }
      if (tries === 90) { minDistinct = Math.max(3, minDistinct-1); }
    }

    // fallback to the best we saw
    if (best) return NextResponse.json({ solutions: best.solutions, grid: best.grid, stats: best.stats, note: 'Used best-available set after search.' });
    throw new Error('Failed to construct a colorful grid.');
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'realistic failed' }, { status: 500 });
  }
}
