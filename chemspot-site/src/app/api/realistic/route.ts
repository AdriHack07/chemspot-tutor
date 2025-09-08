import { NextResponse } from 'next/server';
import { DB, RGB, readOutcomeRGB, isValidColorName, colorNameToRGB } from '@/lib/db';

type InorgEntry = { type?: 'ppt'|'observation'|'no-reaction'; color?: string; rgb?: RGB; notes?: string[] } | any;
type Sol = { cation: string; anion: string; label: string; intrinsicRgb?: RGB };

export const runtime = 'edge';

const ALL_CATIONS = Object.keys(DB.inorganic);
const ALL_ANIONS  = Array.from(new Set(Object.values(DB.inorganic).flatMap(o => Object.keys(o))))
  .filter(a => a !== 'selbst' && a !== 'flamme');

function intrinsicRgb(cation: string): RGB | null {
  const self = DB.inorganic[cation]?.['selbst'] as InorgEntry | undefined;
  const named = DB.intrinsicColors?.[`${cation}(aq)`];
  return readOutcomeRGB(self) ?? (named ? colorNameToRGB(named) : null);
}

function reacts(cation: string, anion: string): { rgb: RGB | null } | null {
  const e = DB.inorganic[cation]?.[anion] as InorgEntry | undefined;
  if (!e) return null;
  return { rgb: readOutcomeRGB(e) };
}

function isWhite(rgb: RGB | null) {
  if (!rgb) return false;
  const [r,g,b] = rgb;
  return r === 255 && g === 255 && b === 255;
}
function isColored(rgb: RGB | null) {
  return !!rgb && !isWhite(rgb);
}

function outcome(a: Sol, b: Sol): { rgb: RGB | null } | null {
  const e1 = reacts(a.cation, b.anion);
  const e2 = reacts(b.cation, a.anion);
  if (!e1 && !e2) return null;
  if (e1 && !e2) return e1;
  if (e2 && !e1) return e2;
  if (isColored(e1!.rgb) && !isColored(e2!.rgb)) return e1!;
  if (isColored(e2!.rgb) && !isColored(e1!.rgb)) return e2!;
  return e1!;
}

function pickSolutions(n: number): Sol[] {
  const sols: Sol[] = [];
  const pool = [...ALL_CATIONS];
  const weights = pool.map(c => {
    const m = DB.inorganic[c] || {};
    let k = 0;
    for (const [an, e] of Object.entries(m)) {
      if (an === 'selbst' || an === 'flamme') continue;
      if (isColored(readOutcomeRGB(e as any))) k++;
    }
    return Math.max(k, 1);
  });

  const usedAnions = new Set<string>();
  while (sols.length < n && pool.length) {
    // weighted pick of cation
    const total = weights.reduce((a,b)=>a+b,0);
    let r = Math.random()*total, idx = 0;
    while (idx < weights.length && (r -= weights[idx]) > 0) idx++;
    const cation = pool.splice(idx,1)[0];
    weights.splice(idx,1);

    const forbid = new Set(Object.keys(DB.inorganic[cation] || {}));
    const candidates = ALL_ANIONS.filter(a => !usedAnions.has(a) && !forbid.has(a));
    const poolAnions = candidates.length ? candidates : ALL_ANIONS.filter(a => !usedAnions.has(a)); // fallback

    if (!poolAnions.length) continue;
    const anion = poolAnions[Math.floor(Math.random()*poolAnions.length)];
    usedAnions.add(anion);
    sols.push({ cation, anion, label: `P${sols.length+1}`, intrinsicRgb: intrinsicRgb(cation) || undefined });
  }
  if (sols.length < n) throw new Error('Could not generate enough salts.');
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
      const key = `${Math.round(r/24)}-${Math.round(g/24)}-${Math.round(b/24)}`;
      bucket.add(key);
    }
  }
  return { coloredCount: colored, distinct: bucket.size };
}

export async function POST(req: Request) {
  try {
    const { n = 7, minColored } = await req.json().catch(()=>({}));
    const N = Math.min(Math.max(parseInt(String(n)||'7',10)||7,5), 9);
    const upperCells = (N*(N-1))/2;
    let target = typeof minColored === 'number' ? minColored : Math.max(6, Math.ceil(0.25*upperCells));
    let minDistinct = 4;

    let tries = 0, best: any = null;
    while (tries++ < 120) {
      const sols = pickSolutions(N);
      const grid = buildGrid(sols);
      const stats = colorStats(grid);
      if (!best || stats.coloredCount > best.stats.coloredCount) best = { solutions: sols, grid, stats };
      if (stats.coloredCount >= target && stats.distinct >= minDistinct) {
        return NextResponse.json({ solutions: sols, grid, stats });
      }
      if (tries === 60) target = Math.max(5, Math.floor(target*0.8));
      if (tries === 90) minDistinct = Math.max(3, minDistinct-1);
    }
    if (best) return NextResponse.json({ ...best, note: 'Used best-available set after search.' });
    throw new Error('Failed to construct a colorful grid.');
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'realistic failed' }, { status: 500 });
  }
}
