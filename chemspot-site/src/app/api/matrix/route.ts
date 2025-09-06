
import { DB } from '@/lib/db';

export const runtime = 'edge';

function outcome(a: string, b: string) {
  const A = DB.inorganic[a]; const B = DB.inorganic[b];
  // We treat mixing as checking both directions for any 'ppt' entries
  const hits: string[] = [];
  if (A && B) {
    for (const [partner, e] of Object.entries(A)) {
      if (partner === b && (e as any).type) hits.push(`${(e as any).type}${(e as any).color ? ' — ' + (e as any).color : ''}`);
    }
    for (const [partner, e] of Object.entries(B)) {
      if (partner === a && (e as any).type) hits.push(`${(e as any).type}${(e as any).color ? ' — ' + (e as any).color : ''}`);
    }
  }
  return hits[0] || 'no reaction';
}

export async function POST(req: Request) {
  try {
    const { count = 6 } = await req.json().catch(()=>({}));
    const keys = Object.keys(DB.inorganic);
    const n = Math.min(Math.max(5, count), Math.min(9, keys.length));
    const chosen: string[] = [];
    while (chosen.length < n) {
      const k = keys[Math.floor(Math.random()*keys.length)];
      if (!chosen.includes(k)) chosen.push(k);
    }
    const table: string[][] = [];
    for (let i=0;i<n;i++){
      const row: string[] = [];
      for (let j=0;j<n;j++){
        if (i===j) row.push('—');
        else row.push(outcome(chosen[i], chosen[j]));
      }
      table.push(row);
    }
    return new Response(JSON.stringify({ labels: chosen, table }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
