'use client';

import { useEffect, useRef, useState } from 'react';

// ---------- shared ----------
function cls(...s: (string|false|undefined)[]) { return s.filter(Boolean).join(' '); }
type Msg = { role: 'user'|'assistant', content: string };

function markdown(s: string) {
  return s
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/\*\*(.*?)\*\*/g,"<strong>$1</strong>")
    .replace(/\*(.*?)\*/g,"<em>$1</em>")
    .replace(/`(.*?)`/g, "<code class='px-1 py-0.5 rounded bg-neutral-200'>$1</code>")
    .replace(/\n/g,"<br/>");
}
function sanitize(html: string) { return html; }

// ---------- TABS ----------
type Tab = 'chat'|'realistic'|'quiz';

export default function Page() {
  const [tab, setTab] = useState<Tab>('chat');

  return (
    <main className="mx-auto flex min-h-dvh max-w-4xl flex-col p-4">
      <header className="mb-4 rounded-2xl bg-gradient-to-br from-emerald-100 to-cyan-100 p-4">
        <h1 className="text-2xl font-bold">ChemSpot Tutor</h1>
        <p className="text-sm text-neutral-700">Spot-test trainer • Chat • Realistic grid • Quizzes</p>
      </header>

      <nav className="mb-3 flex gap-2">
        <button onClick={()=>setTab('chat')}
          className={cls('rounded-full px-3 py-1 text-sm', tab==='chat' ? 'bg-neutral-900 text-white' : 'bg-white border')}>
          Ask-the-Tutor (Chat)
        </button>
        <button onClick={()=>setTab('realistic')}
          className={cls('rounded-full px-3 py-1 text-sm', tab==='realistic' ? 'bg-neutral-900 text-white' : 'bg-white border')}>
          Realistic spot test
        </button>
        <button onClick={()=>setTab('quiz')}
          className={cls('rounded-full px-3 py-1 text-sm', tab==='quiz' ? 'bg-neutral-900 text-white' : 'bg-white border')}>
          Quiz mode
        </button>
      </nav>

      {tab==='chat' && <ChatPane />}
      {tab==='realistic' && <RealisticPane />}
      {tab==='quiz' && <QuizPane />}
      <p className="mt-3 text-center text-xs text-neutral-500">No secrets in client • All AI calls on server</p>
    </main>
  );
}

// ---------- CHAT ----------
function ChatPane() {
  const [history, setHistory] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  useEffect(()=>{ scroller.current?.scrollTo({top: scroller.current.scrollHeight, behavior:'smooth'}); }, [history]);

  async function send() {
    if (!input.trim() || loading) return;
    const user = input.trim();
    setInput('');
    setHistory(h=>[...h, {role:'user', content:user}]);
    setLoading(true);
    try {
      const res = await fetch('/api/chat', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ history, user }) });
      const data = await res.json();
      setHistory(h=>[...h, {role:'assistant', content: data?.text || '(No response)'}]);
    } catch (e:any) {
      setHistory(h=>[...h, {role:'assistant', content:`Error: ${e?.message||e}`}]);
    } finally { setLoading(false); }
  }

  return (
    <>
      <section ref={scroller} className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-white p-3 shadow-sm">
        {history.length===0 && (
          <div className="prose prose-sm mx-auto max-w-none text-center text-neutral-600">
            <p>Ask chemistry spot-test questions or paste your answer for grading.</p>
            <button onClick={()=>setHistory(h=>[...h, {role:'assistant', content: "**Prompt** — Ag⁺ vs Cl⁻: what do you observe? Write equation(s)."}])}
              className="mt-2 rounded-full bg-neutral-900 px-4 py-1.5 text-white hover:opacity-90">Sample prompt</button>
          </div>
        )}
        {history.map((m,i)=>(
          <div key={i} className={m.role==='user' ? 'flex justify-end':'flex justify-start'}>
            <div className={cls('whitespace-pre-wrap rounded-2xl p-3 text-sm shadow-sm',
              m.role==='user' ? 'bg-neutral-900 text-white' : 'bg-neutral-100 text-neutral-900')}
              dangerouslySetInnerHTML={{__html: sanitize(markdown(m.content))}}/>
          </div>
        ))}
        {loading && <div className="flex justify-start"><div className="animate-pulse rounded-2xl bg-neutral-100 p-3 text-sm text-neutral-500 shadow-sm">Thinking…</div></div>}
      </section>
      <footer className="mt-4 flex gap-2">
        <input value={input} onChange={e=>setInput(e.target.value)}
          onKeyDown={e=> e.key==='Enter' && !e.shiftKey ? (e.preventDefault(), send()) : null}
          placeholder="Ask for a spot test or paste your answer…"
          className="flex-1 rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400"/>
        <button onClick={send} className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700">Send</button>
      </footer>
    </>
  );
}

// ---------- REALISTIC ----------
type Cell = { rgb?: [number,number,number] } | null;
type RealisticResp = { solutions: { label:string; cation:string; anion:string; intrinsicRgb?: [number,number,number] }[]; grid: Cell[][]; stats?: { coloredCount:number; distinct:number } };


function swatchRGB(rgb?: [number,number,number]) {
  if (!rgb) return null;
  const [r,g,b] = rgb;
  const bg = `rgb(${r}, ${g}, ${b})`;
  // Pick text color for contrast
  const yiq = (r*299 + g*587 + b*114)/1000;
  const textColor = yiq >= 160 ? '#111' : 'white';
  return (
    <span className="inline-block rounded px-2 py-0.5 text-xs"
          style={{ background: bg, color: textColor }}>
      {r},{g},{b}
    </span>
  );
}


function RealisticPane() {
  const [n, setN] = useState(7);
  const [data, setData] = useState<RealisticResp | null>(null);
  const [guesses, setGuesses] = useState<Record<string,{cation:string; anion:string}>>({}); // label -> guess

  async function gen() {
    const res = await fetch('/api/realistic', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ n }) });
    const d: RealisticResp = await res.json();
    setData(d); setGuesses({});
  }
  function setGuess(label:string, field:'cation'|'anion', v:string){
    setGuesses(g => ({...g, [label]: {...(g[label]||{cation:'',anion:''}), [field]: v}}));
  }

  const graded = (data && Object.fromEntries(data.solutions.map(s=>{
    const g = guesses[s.label]||{cation:'',anion:''};
    const ok = g.cation.trim()===s.cation && g.anion.trim()===s.anion;
    return [s.label, ok];
  }))) || {};

  return (
    <section className="flex-1 rounded-2xl bg-white p-3 shadow-sm">
      <div className="mb-3 flex items-center gap-3">
        <label className="text-sm">Number of pipettes:</label>
        <input type="number" min={5} max={9} value={n} onChange={e=>setN(parseInt(e.target.value||'7',10))}
               className="w-20 rounded border px-2 py-1 text-sm"/>
        <button onClick={gen} className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">Generate set</button>
      </div>

      {!data && <p className="text-sm text-neutral-600">Click “Generate set” to get 5–9 solutions. You’ll see a matrix of mixture outcomes. Guess each pipette’s contents.</p>}

      {data && (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead><tr>
                <th className="p-2"></th>
                {data.solutions.map(s=><th key={s.label} className="p-2">{s.label}</th>)}
              </tr></thead>
              <tbody>
                {data.solutions.map((row,i)=>(
                  <tr key={row.label} className="border-t">
{(row as any).intrinsicRgb && <span className="ml-2">{swatchRGB((row as any).intrinsicRgb)}</span>}
                    {data.grid[i].map((cell,j)=>(
                      <td key={i+'-'+j} className="p-2 align-top">
                        {j<i ? null : (cell
  ? <div className="flex items-center gap-1 text-xs">
      <span>mix</span>
      {cell.rgb ? swatchRGB(cell.rgb) : <span className="text-neutral-400">—</span>}
    </div>
  : <div className="text-xs text-neutral-400">—</div>)}

                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {data.solutions.map(s=>(
              <div key={s.label} className={cls('rounded-xl border p-3', graded[s.label] ? 'border-emerald-400' : 'border-neutral-200')}>
                <div className="mb-2 text-sm font-semibold">{s.label} — guess contents</div>
                <div className="flex gap-2">
                  <input placeholder="Cation (e.g., Ag+)" value={guesses[s.label]?.cation||''}
                         onChange={e=>setGuess(s.label,'cation',e.target.value)} className="flex-1 rounded border px-2 py-1 text-sm"/>
                  <input placeholder="Anion (e.g., Cl-)" value={guesses[s.label]?.anion||''}
                         onChange={e=>setGuess(s.label,'anion',e.target.value)} className="flex-1 rounded border px-2 py-1 text-sm"/>
                </div>
                <div className="mt-2 text-xs">
                  {graded[s.label] ? <span className="text-emerald-600">✔ Correct</span> :
                   (guesses[s.label]?.cation||guesses[s.label]?.anion) ? <span className="text-neutral-500">Keep trying…</span> : null}
                </div>
              </div>
            ))}
          </div>

          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium">Reveal answers</summary>
            <ul className="mt-2 list-disc pl-5 text-sm">
              {data.solutions.map(s=>(
                <li key={s.label}>{s.label}: <strong>{s.cation}</strong> + <strong>{s.anion}</strong></li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}

// ---------- QUIZ ----------
function QuizPane() {
  const [mode, setMode] = useState<'pair-to-color'|'color-to-reactions'>('pair-to-color');
  const [traps, setTraps] = useState(true);
  const [q, setQ] = useState<any>(null);
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<string|null>(null);

  async function newQ() {
    const res = await fetch('/api/quiz', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ mode, traps }) });
    const d = await res.json(); setQ(d); setAnswer(''); setResult(null);
  }

  function grade() {
    if (!q) return;
    if (mode==='pair-to-color') {
      const a = answer.trim().toLowerCase();
      if (q?.expected?.type === 'no-reaction') {
        const ok = q?.grading?.accept?.some((s:string)=>a===s);
        setResult(ok ? 'Correct — no reaction.' : 'Incorrect — expected “no reaction”.');
      } else if (q?.expected?.color) {
        const ok = a === String(q.expected.color).toLowerCase();
        setResult(ok ? 'Correct ✅' : `Incorrect — expected color: ${q.expected.color}`);
      } else {
        setResult('No expected color set.');
      }
    } else {
      // color-to-reactions
      const user = answer.split(',').map((s:string)=>s.trim()).filter(Boolean);
      const must = (q?.answers||[]) as string[];
      const missing = must.filter(x=>!user.includes(x));
      const extras  = user.filter(x=>!must.includes(x));
      setResult(missing.length===0 && extras.length===0
        ? 'Correct (all combinations)! ✅'
        : missing.length===0
          ? `Contains extras not in DB. Expected exactly: ${must.join('; ')}`
          : extras.length===0
            ? `Semi-correct — missing: ${missing.join('; ')}`
            : `Semi-correct — missing: ${missing.join('; ')}; extra: ${extras.join('; ')}`);
    }
  }

  return (
    <section className="flex-1 rounded-2xl bg-white p-3 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="text-sm">Mode:</label>
        <select value={mode} onChange={e=>setMode(e.target.value as any)} className="rounded border px-2 py-1 text-sm">
          <option value="pair-to-color">Pair → Color (with traps)</option>
          <option value="color-to-reactions">Color → Reactions (list ALL)</option>
        </select>
        {mode==='pair-to-color' && (
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={traps} onChange={e=>setTraps(e.target.checked)}/>
            Include traps (no reaction)
          </label>
        )}
        <button onClick={newQ} className="rounded bg-neutral-900 px-3 py-1.5 text-sm text-white">New question</button>
      </div>

      {!q && <p className="text-sm text-neutral-600">Click “New question” to start.</p>}

      {q && (
        <>
          <div className="rounded-lg border bg-neutral-50 p-3 text-sm">
            <strong>Question:</strong> {q.prompt}
            {q.color && <div className="mt-1 text-xs text-neutral-600">Color: {q.color}</div>}
          </div>

          <div className="mt-3 flex gap-2">
            <input value={answer} onChange={e=>setAnswer(e.target.value)}
                   placeholder={mode==='pair-to-color' ? 'e.g., white  /  no reaction'
                               : 'comma-separated: Ag+ + Cl-, Ba2+ + SO4^2-, ...'}
                   className="flex-1 rounded border px-2 py-2 text-sm"/>
            <button onClick={grade} className="rounded bg-emerald-600 px-3 py-2 text-sm text-white">Check</button>
          </div>
          {result && <div className="mt-2 text-sm">{result}</div>}



          )}
        </>
      )}
    </section>
  );
}
