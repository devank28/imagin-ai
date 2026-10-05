'use server';

import { GenerateImageParams } from '../types';
import { generateViaGateway, TIMEOUT_MS } from './gateway';
import { handleImageGenerationError } from './errorHandler';

export async function generateImage(
  params: GenerateImageParams
): Promise<{ success: boolean; imageData?: string; error?: string }> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const imageData = await generateViaGateway(params, controller.signal);
    return { success: true, imageData };
  } catch (error) {
    return handleImageGenerationError(error);
  } finally {
    clearTimeout(timeoutId);
  }
}
