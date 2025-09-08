/* Quiz generator:
   - mode: 'pair-to-color'  -> choose (cation, anion) and ask for color (or 'no reaction' trap)
   - mode: 'color-to-reactions' -> choose a color; user must list ALL reactions producing it */

import { NextResponse } from 'next/server';
import { DB, isValidColorName } from '@/lib/db';

type InorgEntry = { type: 'ppt'|'observation'|'no-reaction'; color?: string; notes?: string[]; eq?: string };

export const runtime = 'edge';

function allPairs() {
  const pairs: Array<{ cation: string; anion: string; e: InorgEntry }> = [];
  for (const cation of Object.keys(DB.inorganic)) {
    for (const [anion, e] of Object.entries(DB.inorganic[cation] || {})) {
      if (anion === 'selbst' || anion === 'flamme') continue;
      if (e && (e as InorgEntry).type) pairs.push({ cation, anion, e: e as InorgEntry });
    }
  }
  return pairs;
}

const PAIRS = allPairs();

export async function POST(req: Request) {
  try {
    const { mode = 'pair-to-color', traps = true } = await req.json();

    if (mode === 'pair-to-color') {
      // pick a color pair OR a trap (no-reaction)
      const colored = PAIRS.filter(p => p.e.type !== 'no-reaction' && isValidColorName(p.e.color));
      const noReact = PAIRS.filter(p => p.e.type === 'no-reaction');

      const pickTrap = traps && Math.random() < 0.3 && noReact.length;
      const Q = pickTrap
        ? noReact[Math.floor(Math.random()*noReact.length)]
        : colored[Math.floor(Math.random()*colored.length)];

      return NextResponse.json({
        mode,
        prompt: `What happens when ${Q.cation} mixes with ${Q.anion}?`,
        expected: (Q.e.type === 'no-reaction') ? { type: 'no-reaction' } : { type: Q.e.type, color: Q.e.color },
        grading: { accept: ['no reaction','no-reaction','none','—'], colorMustMatch: !!Q.e.color }
      });
    }

    if (mode === 'color-to-reactions') {
      // pick a color that has at least 1 reaction
      const byColor = new Map<string, Array<{ cation: string; anion: string; e: InorgEntry }>>();
      for (const p of PAIRS) {
if (p.e.type !== 'no-reaction' && isValidColorName(p.e.color)) {
          const key = p.e.color;
          if (!byColor.has(key)) byColor.set(key, []);
          byColor.get(key)!.push(p);
        }
      }
      const colors = Array.from(byColor.keys());
      const color = colors[Math.floor(Math.random()*colors.length)];
      const answers = byColor.get(color)!.map(p => `${p.cation} + ${p.anion}`);

      return NextResponse.json({
        mode,
        prompt: `List ALL reactions that give the color: ${color}.`,
        color,
        answers,                         // full set for grading
        note: 'Semi-correct if you miss any combinations.'
      });
    }

    return NextResponse.json({ error: 'Unknown mode' }, { status: 400 });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'quiz failed' }, { status: 500 });
  }
}
