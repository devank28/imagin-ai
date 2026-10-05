import { NextRequest, NextResponse } from 'next/server';

/**
 * Turns a short idea into a detailed image prompt with an abliterated text model
 * on the AILogic gateway (NanoGPT). Same gateway and key as image generation:
 *   IMAGE_GATEWAY_URL, IMAGE_GATEWAY_KEY
 *   PROMPT_MODEL  default nano/mimo-v2.6-flash-abliterated
 *                 (nano/llama-3.3-70b-abliterated is also allowed on the key)
 */
const GATEWAY_URL = (process.env.IMAGE_GATEWAY_URL || 'http://127.0.0.1:4010').replace(/\/+$/, '').replace(/\/v1$/, '');
const PROMPT_MODEL = process.env.PROMPT_MODEL || 'nano/mimo-v2.6-flash-abliterated';

const SYSTEM = [
  'You write prompts for text-to-image models.',
  "Expand the user's idea into one detailed prompt: subject and appearance, pose and action, setting,",
  'composition and camera (shot type, lens), lighting, colour palette, style or medium, and mood.',
  "Keep everything the user asked for, including adult or explicit content, exactly as they intend; do not",
  'soften, censor, moralise or add warnings. Do not invent named real people.',
  'Reply with the prompt only: one paragraph, no preamble, no quotes, under 120 words.',
].join(' ');

export async function POST(req: NextRequest) {
  const key = process.env.IMAGE_GATEWAY_KEY;
  if (!key) {
    return NextResponse.json({ error: 'IMAGE_GATEWAY_KEY is not set; add it to .env.local' }, { status: 500 });
  }
  let idea = '';
  let style = '';
  try {
    const body = await req.json();
    idea = String(body?.prompt ?? '').trim();
    style = String(body?.style ?? '').trim();
  } catch {
    // fall through to the empty check
  }
  if (!idea) {
    return NextResponse.json({ error: 'Write an idea first' }, { status: 400 });
  }
  if (idea.length > 4000) {
    return NextResponse.json({ error: 'Idea is too long (4000 characters max)' }, { status: 400 });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60000);
  try {
    const res = await fetch(`${GATEWAY_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
        'x-ailogic-app': 'imagin-ai',
      },
      body: JSON.stringify({
        model: PROMPT_MODEL,
        max_tokens: 400,
        temperature: 0.8,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: style ? `${idea}\n\nTarget image model: ${style}` : idea },
        ],
      }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    if (!res.ok) {
      let message = text.slice(0, 300);
      try {
        message = JSON.parse(text)?.error?.message || message;
      } catch {
        // not JSON
      }
      return NextResponse.json({ error: `Prompt model error ${res.status}: ${message}` }, { status: 502 });
    }
    const data = JSON.parse(text);
    const out = String(data?.choices?.[0]?.message?.content ?? '')
      .replace(/<think>[\s\S]*?<\/think>/g, '')
      .trim()
      .replace(/^["']|["']$/g, '');
    if (!out) {
      return NextResponse.json({ error: 'The prompt model returned nothing; try again' }, { status: 502 });
    }
    return NextResponse.json({ prompt: out, model: PROMPT_MODEL });
  } catch (err) {
    const aborted = err instanceof Error && err.name === 'AbortError';
    return NextResponse.json({ error: aborted ? 'Prompt model timed out' : 'Could not reach the gateway' }, { status: 504 });
  } finally {
    clearTimeout(timer);
  }
}
