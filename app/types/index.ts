export type ModelOption = 'nano/z-image-turbo' | 'nano/hidream' | 'nano/chroma';

export interface ImageGeneration {
  id: string;
  prompt: string;
  model: ModelOption;
  width: number;
  height: number;
  timestamp: number;
  imageData: string; // base64 encoded image
}

export interface OllamaResponse {
  response?: string;
  done?: boolean;
  image?: string; // base64 encoded image
  error?: string;
  completed?: number;
  total?: number;
}

export interface GenerateImageParams {
  prompt: string;
  model: ModelOption;
  width: number;
  height: number;
}

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'error';
}
