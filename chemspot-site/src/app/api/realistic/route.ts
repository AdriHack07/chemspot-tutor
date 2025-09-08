/* Realistic Olympiad spot test: pick N solutions (salts/molecules/acids/bases)
   — each as a (cation, anion) pair that does NOT react internally —
   then build an upper-triangular grid of outcomes for every mixture. */

import { NextResponse } from 'next/server';
import { DB } from '@/lib/db';

// Helpers
type InorgEntry = { type: 'ppt'|'observation'|'no-reaction'; color?: string; notes?: string[]; eq?: string };
type Sol = { cation: string; anion: string; label: string; intrinsic?: string };

const ALL_CATIONS = Object.keys(DB.inorganic);
const ALL_ANIONS  = Array.from(new Set(
  Object.values(DB.inorganic).flatMap(obj => Object.keys(obj))
)).filter(a => a !== 'selbst' && a !== 'flamme'); // just in case

function reacts(cat: string, an: string): InorgEntry | undefined {
  return DB.inorganic[cat]?.[an];
}

// pick salts: choose cation, then an anion that does NOT react (missing or explicit no-reaction)
function pickSolutions(n: number): Sol[] {
  const usedAnions = new Set<string>();
  const sols: Sol[] = [];
  const cats = [...ALL_CATIONS];

  // slight weighting toward more reactive cations so the grid is informative
  const weights = cats.map(c => Object.values(DB.inorganic[c] || {}).length || 1);

  while (sols.length < n && cats.length) {
    // weighted pick
    const total = weights.reduce((a,b)=>a+b,0);
    let r = Math.random()*total, idx = 0;
    while (idx < weights.length && (r -= weights[idx]) > 0) idx++;

    const cat = cats.splice(idx,1)[0];
    const catMap = DB.inorganic[cat] || {};
    const forbidden = new Set(Object.keys(catMap).filter(k => k!=='selbst' && k!=='flamme'));
    const candidates = ALL_ANIONS.filter(a => !usedAnions.has(a) && !forbidden.has(a));

    // also allow explicit “no-reaction” entries as non-reactive internal salts
    const explicitNoReact = Object.entries(catMap)
      .filter(([a, e]) => (e as InorgEntry)?.type === 'no-reaction' && !usedAnions.has(a))
      .map(([a]) => a);

    const pool = [...candidates, ...explicitNoReact];
    if (!pool.length) continue;

    const an = pool[Math.floor(Math.random()*pool.length)];
    usedAnions.add(an);

    // intrinsic color (if provided in DB.intrinsicColors as “Salt(aq)” or ion(aq))
    const key1 = `${cat}${an}(aq)`;
    const key2 = `${cat}${an}`;
    const key3 = `${cat}(aq)`;
    const intrinsic = DB.intrinsicColors?.[key1] || DB.intrinsicColors?.[key2] || DB.intrinsicColors?.[key3];

    sols.push({ cation: cat, anion: an, label: `P${sols.length+1}`, intrinsic });
  }

  if (sols.length < n) throw new Error('Could not generate enough non-reactive internal salts.');
  return sols;
}

function outcome(a: Sol, b: Sol): InorgEntry | undefined {
  // mix every pair both ways: cation_a with anion_b, and cation_b with anion_a
  const e1 = reacts(a.cation, b.anion);
  const e2 = reacts(b.cation, a.anion);
  // prefer a colored outcome if any
  const prefer = (e?: InorgEntry) => (e && e.type !== 'no-reaction' && e.color) ? 2 :
                                      (e && e.type !== 'no-reaction') ? 1 : 0;
  if ((prefer(e1) > prefer(e2)) || (!e2 && e1)) return e1;
  if ((prefer(e2) > prefer(e1)) || (!e1 && e2)) return e2;
  // merge if both colored and same color; otherwise return one; undefined means “no visible result”
  return e1 || e2;
}

export const runtime = 'edge';

export async function POST(req: Request) {
  try {
    const { n = 7 } = await req.json().catch(()=>({}));
    const N = Math.min(Math.max(parseInt(String(n)||'7',10)||7,5), 9);
    const sols = pickSolutions(N);

    // build upper-triangular grid
    const grid: Array<Array<{ type: string; color?: string } | null>> = [];
    for (let i=0;i<N;i++){
      const row: Array<{ type: string; color?: string } | null> = [];
      for (let j=0;j<N;j++){
        if (j<i) row.push(null);
        else if (i===j) row.push(sols[i].intrinsic ? { type: 'intrinsic', color: sols[i].intrinsic } : null);
        else {
          const e = outcome(sols[i], sols[j]);
          if (!e) row.push(null);
          else row.push({ type: e.type, color: e.color });
        }
      }
      grid.push(row);
    }

    return NextResponse.json({ solutions: sols, grid });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'realistic failed' }, { status: 500 });
  }
}
