import { GenerateImageParams } from '../types';

/**
 * Image generation through an OpenAI-compatible gateway (the AILogic gateway, a
 * LiteLLM proxy serving NanoGPT image models). Configured by environment:
 *   IMAGE_GATEWAY_URL  base URL, default http://127.0.0.1:4010 (no trailing /v1)
 *   IMAGE_GATEWAY_KEY  bearer key for the gateway
 */
const GATEWAY_URL = (process.env.IMAGE_GATEWAY_URL || 'http://127.0.0.1:4010').replace(/\/+$/, '').replace(/\/v1$/, '');
export const TIMEOUT_MS = 120000; // hosted models answer in 5-20 s; leave room for a queue

export class GatewayError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'GatewayError';
    this.status = status;
  }
}

/** Snap a requested dimension to what the hosted models accept: 256-1536, multiple of 64. */
function snap(n: number): number {
  const v = Number.isFinite(n) ? n : 1024;
  return Math.min(1536, Math.max(256, Math.round(v / 64) * 64));
}

/** Guess the mime type from the first bytes of base64 data (NanoGPT returns JPEG). */
function mimeOf(b64: string): string {
  if (b64.startsWith('/9j/')) return 'image/jpeg';
  if (b64.startsWith('iVBOR')) return 'image/png';
  if (b64.startsWith('UklGR')) return 'image/webp';
  return 'image/png';
}

/**
 * Generates one image and returns it as a data URL. Throws GatewayError on an
 * upstream error, and AbortError on timeout.
 */
export async function generateViaGateway(params: GenerateImageParams, signal?: AbortSignal): Promise<string> {
  const key = process.env.IMAGE_GATEWAY_KEY;
  if (!key) {
    throw new GatewayError('IMAGE_GATEWAY_KEY is not set; add it to .env.local', 500);
  }
  const { prompt, model, width, height } = params;

  const response = await fetch(`${GATEWAY_URL}/v1/images/generations`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      prompt,
      n: 1,
      size: `${snap(width)}x${snap(height)}`,
      response_format: 'b64_json',
    }),
    signal,
  });

  const text = await response.text();
  if (!response.ok) {
    let message = text.slice(0, 300);
    try {
      message = JSON.parse(text)?.error?.message || message;
    } catch {
      // not JSON
    }
    throw new GatewayError(`Image gateway error: ${response.status}. ${message}`, response.status);
  }

  const data = JSON.parse(text) as { data?: { b64_json?: string | null; url?: string | null }[] };
  const item = data.data?.[0];
  if (item?.b64_json) {
    return `data:${mimeOf(item.b64_json)};base64,${item.b64_json}`;
  }
  if (item?.url) {
    // Some models answer with a URL; inline it so the gallery keeps working offline.
    const img = await fetch(item.url, { signal });
    if (!img.ok) throw new GatewayError(`Could not fetch the generated image: ${img.status}`, 502);
    const buf = Buffer.from(await img.arrayBuffer());
    const type = img.headers.get('content-type') || 'image/png';
    return `data:${type};base64,${buf.toString('base64')}`;
  }
  throw new GatewayError('No image data in the gateway response', 502);
}
