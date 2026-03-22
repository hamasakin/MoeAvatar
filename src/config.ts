/**
 * MoeAvatar Configuration
 * All API and Model settings are managed here.
 */

export const config = {
  // API base URL (e.g., https://api.openai.com)
  apiBaseUrl: (import.meta.env.VITE_API_BASE_URL || 'https://api.openai.com').trim().replace(/\/+$/, ''),
  
  // API Key
  apiKey: (import.meta.env.VITE_API_KEY || '').trim(),
  
  // Model for image analysis (Vision-capable Chat model)
  analysisModel: (import.meta.env.VITE_ANALYSIS_MODEL || 'gpt-4o').trim(),
  
  // Model for style rendering (Image generation model)
  imageModel: (import.meta.env.VITE_IMAGE_MODEL || 'dall-e-3').trim(),
};
