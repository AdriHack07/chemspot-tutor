
import OpenAI from 'openai';
import { SYSTEM_PROMPT } from '@/lib/prompt';
import { lookupInorganic, listByColor } from '@/lib/db';

export const runtime = 'edge';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: Request) {
  try {
    const { history = [], user, vector_store_id } = await req.json();
    // Primitive heuristic: if the user mentions a color, preload related facts
    const colorMention = (user||'').match(/white|yellow|orange|brick-red|brown|black|grey|green|blue|purple|pink|red|violet/i)?.[0]?.toLowerCase();
    const facts = colorMention ? listByColor(colorMention).slice(0, 40) : [];

    const guard = `You must answer ONLY using the provided facts when relevant. If missing, say "Not in the database". Colors must be names.`;

    const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

    const resp = await client.responses.create({
      model,
      instructions: SYSTEM_PROMPT,
      input: [
        { role: 'system', content: guard },
        { role: 'system', content: JSON.stringify({ facts }) },
        ...history,
        { role: 'user', content: user },
      ],
      tools: vector_store_id ? [{ type: 'file_search', vector_store_ids: [vector_store_id] } as any] : undefined,
      temperature: 0.2,
    });

    const text = resp.output_text ?? '';
    return new Response(JSON.stringify({ text }), { headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Server error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}
