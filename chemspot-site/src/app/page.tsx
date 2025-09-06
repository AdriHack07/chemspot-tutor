
'use client';
import { useEffect, useRef, useState } from 'react';

interface Msg { role: 'user'|'assistant'; content: string }

export default function Page(){
  const [history,setHistory]=useState<Msg[]>([]);
  const [input,setInput]=useState('');
  const [loading,setLoading]=useState(false);
  const [matrix,setMatrix]=useState<{labels:string[],table:string[][]}|null>(null);

  const scroller = useRef<HTMLDivElement>(null);
  useEffect(()=>{ scroller.current?.scrollTo({top:scroller.current.scrollHeight, behavior:'smooth'}) }, [history]);

  async function send(){
    if(!input.trim()||loading) return;
    const user = input.trim();
    setInput('');
    setHistory(h=>[...h,{role:'user',content:user}]);
    setLoading(true);
    const res = await fetch('/api/chat',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({history, user})});
    const data = await res.json();
    setHistory(h=>[...h,{role:'assistant',content:data.text || '(no response)'}]);
    setLoading(false);
  }

  async function startMatrix(){
    const res = await fetch('/api/matrix',{method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({count:6})});
    const data = await res.json();
    setMatrix(data);
    setHistory(h=>[...h,{role:'assistant', content: renderMatrixMarkdown(data)}]);
  }

  function renderMatrixMarkdown(data: any){
    const header = [''].concat(data.labels).join('\t');
    const rows = data.labels.map((l: string, i: number)=> [l].concat(data.table[i]).join('\t')).join('\n');
    return `**Reaction matrix**\n${header}\n${rows}\n\nGive an identification with reasoning.`;
  }

  return (
    <main className="mx-auto max-w-3xl min-h-dvh p-4 flex flex-col">
      <header className="mb-4 rounded-2xl bg-gradient-to-br from-emerald-100 to-cyan-100 p-4">
        <h1 className="text-2xl font-bold">ChemSpot Tutor</h1>
        <p className="text-sm text-neutral-700">Austrian Chemistry Olympiad — spot-test practice</p>
      </header>
      <div ref={scroller} className="flex-1 space-y-3 overflow-y-auto rounded-2xl bg-white p-3 shadow-sm">
        {history.map((m,i)=> (
          <div key={i} className={m.role==='user'?'flex justify-end':'flex justify-start'}>
            <div className={(m.role==='user'?'bg-neutral-900 text-white':'bg-neutral-100 text-neutral-900') + ' whitespace-pre-wrap rounded-2xl p-3 text-sm shadow-sm'} dangerouslySetInnerHTML={{__html:md(m.content)}} />
          </div>
        ))}
        {loading && <div className="flex justify-start"><div className="animate-pulse rounded-2xl bg-neutral-100 p-3 text-sm text-neutral-500 shadow-sm">Thinking…</div></div>}
      </div>
      <footer className="mt-4 flex gap-2">
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=> e.key==='Enter' && !e.shiftKey ? (e.preventDefault(), send()) : null} placeholder="Ask for a spot test or paste your answer…" className="flex-1 rounded-2xl border border-neutral-300 bg-white px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-400" />
        <button onClick={send} disabled={loading} className="rounded-2xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50">Send</button>
        <button onClick={startMatrix} className="rounded-2xl bg-neutral-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90">Realistic mode</button>
      </footer>
      <p className="mt-2 text-center text-xs text-neutral-500">Do not expose your API key in client code</p>
    </main>
  )
}

function md(s: string){
  return s
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/\*\*(.*?)\*\*/g,'<strong>$1</strong>')
    .replace(/\t/g,'\u00a0\u00a0\u00a0')
    .replace(/\n/g,'<br/>');

}
