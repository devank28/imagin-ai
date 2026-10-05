import { NextRequest } from 'next/server';
import { generateViaGateway, TIMEOUT_MS } from '../../../utils/gateway';
import { handleImageGenerationError } from '../../../utils/errorHandler';

/**
 * Same newline-delimited protocol the UI already speaks: progress messages, then
 * one {type:'complete'}. The hosted gateway reports no step progress, so the
 * stream carries a start marker and the result.
 */
export async function POST(request: NextRequest) {
  let params;
  try {
    params = await request.json();
  } catch {
    return new Response(JSON.stringify({ success: false, error: 'Malformed request' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const { prompt, model, width, height } = params;
  const encoder = new TextEncoder();
  const send = (c: ReadableStreamDefaultController, msg: object) =>
    c.enqueue(encoder.encode(JSON.stringify(msg) + '\n'));

  const stream = new ReadableStream({
    async start(controller) {
      send(controller, { type: 'progress', progress: 5, completed: 0, total: 1 });
      const abort = new AbortController();
      const timeoutId = setTimeout(() => abort.abort(), TIMEOUT_MS);
      try {
        const imageData = await generateViaGateway({ prompt, model, width, height }, abort.signal);
        send(controller, { type: 'progress', progress: 100, completed: 1, total: 1 });
        send(controller, { type: 'complete', success: true, imageData });
      } catch (error) {
        const { error: message } = handleImageGenerationError(error);
        send(controller, { type: 'complete', success: false, error: message });
      } finally {
        clearTimeout(timeoutId);
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}
