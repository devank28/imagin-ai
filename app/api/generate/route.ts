import { NextRequest, NextResponse } from 'next/server';
import { generateViaGateway, GatewayError, TIMEOUT_MS } from '../../utils/gateway';
import { handleImageGenerationError } from '../../utils/errorHandler';

export async function POST(request: NextRequest) {
  try {
    const { prompt, model, width, height } = await request.json();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const imageData = await generateViaGateway({ prompt, model, width, height }, controller.signal);
      return NextResponse.json({ success: true, imageData });
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    const status = error instanceof GatewayError ? error.status : 500;
    return NextResponse.json(handleImageGenerationError(error), { status });
  }
}
