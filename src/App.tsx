/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import { Upload, Image as ImageIcon, Sparkles, Download, RefreshCw, ChevronRight, ChevronLeft, Check, Globe, Maximize2, X, Zap, Search } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { PhotoProvider, PhotoView } from 'react-photo-view';
import 'react-photo-view/dist/react-photo-view.css';
import { config } from './config';

// Helpers
async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function urlToDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function openaiChat(messages: any[], responseFormat?: 'json_object', temperature?: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(`${config.apiBaseUrl}/v1/chat/completions`, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`
      },
      body: JSON.stringify({
        model: config.analysisModel,
        messages,
        temperature: temperature !== undefined ? temperature : 0.7,
        response_format: responseFormat ? { type: responseFormat } : undefined
      })
    });
    
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`API error: ${response.statusText}`);
    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error("Request timed out (60s)");
    throw error;
  }
}

async function geminiGenerateImage(prompt: string, base64Image?: string) {
  const url = `${config.apiBaseUrl}/v1beta/models/${config.imageModel}:generateContent?key=${config.apiKey}`;
  
  const contents: any[] = [
    {
      role: "user",
      parts: [
        { text: prompt }
      ]
    }
  ];

  if (base64Image) {
    // Defensive check for null or non-base64
    const match = base64Image?.match?.(/^data:([^;]+);base64,(.+)$/);
    if (match) {
      contents[0].parts.push({
        inline_data: {
          mime_type: match[1],
          data: match[2]
        }
      });
    }
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        contents,
        generationConfig: {
          responseModalities: ["IMAGE"], // Only request IMAGE to reduce thought noise
          imageConfig: {
            aspectRatio: "1:1",
            imageSize: "1K"
          }
        }
      })
    });

    clearTimeout(timeoutId);
    if (!response.ok) throw new Error(`Gemini Image API error: ${response.statusText}`);
    const data = await response.json();
    
    const parts = data.candidates?.[0]?.content?.parts || [];
    // Support both snake_case and camelCase
    const imagePart = parts.find((p: any) => p.inlineData || p.inline_data);
    const dataPart = parts.find((p: any) => (p.data || p.inlineData || p.inline_data) && !p.thoughtSignature);
    
    const finalPart = imagePart || dataPart;

    if (!finalPart) {
      console.error("Gemini Response Details:", JSON.stringify(data, null, 2));
      throw new Error("No image data found in Gemini response");
    }
    
    const dataObj = finalPart.inlineData || finalPart.inline_data || finalPart;
    const mimeType = dataObj.mimeType || dataObj.mime_type || "image/png";
    const base64Data = dataObj.data;

    if (!base64Data) throw new Error("Image data is empty");

    return `data:${mimeType};base64,${base64Data}`;
  } catch (error: any) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') throw new Error("Image generation timed out (60s)");
    throw error;
  }
}

// Types
interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  label?: string;
}

interface CropOption {
  id: string;
  box: BoundingBox;
  previewUrl: string;
}

const FILTERS = [
  { name: 'Original', en: 'Original', zh: '原图', class: '', filter: 'none' },
  { name: 'Vibrant', en: 'Vibrant', zh: '鲜艳', class: 'saturate-150 contrast-110', filter: 'saturate(1.5) contrast(1.1)' },
  { name: 'Soft Glow', en: 'Soft Glow', zh: '柔光', class: 'brightness-110 contrast-90 saturate-110 blur-[0.5px]', filter: 'brightness(1.1) contrast(0.9) saturate(1.1) blur(0.5px)' },
  { name: 'Retro', en: 'Retro', zh: '复古', class: 'sepia-20 contrast-120 saturate-120', filter: 'sepia(0.2) contrast(1.2) saturate(1.2)' },
  { name: 'Cool', en: 'Cool', zh: '冷色', class: 'hue-rotate-15 saturate-110', filter: 'hue-rotate(15deg) saturate(1.1)' },
  { name: 'B&W', en: 'B&W', zh: '黑白', class: 'grayscale', filter: 'grayscale(1)' },
];

const AI_STYLES = [
  { id: 'cyberpunk', en: 'Cyberpunk', zh: '赛博朋克', prompt: 'Transform this anime character into a cyberpunk style with neon lights and futuristic tech. MAINTAIN THE ORIGINAL COMPOSITION, FRAMING, AND CHARACTER POSE EXACTLY. Do not crop or zoom in.' },
  { id: 'watercolor', en: 'Watercolor', zh: '水彩风', prompt: 'Transform this anime character into a soft watercolor painting style. KEEP THE ORIGINAL FRAMING AND COMPOSITION UNCHANGED. Ensure the full character from the input is visible.' },
  { id: 'ghibli', en: 'Ghibli', zh: '吉卜力', prompt: 'Transform this anime character into Studio Ghibli art style. PRESERVE THE ORIGINAL COMPOSITION AND CHARACTER POSITIONING. Do not change the camera angle or crop.' },
  { id: 'sketch', en: 'Sketch', zh: '素描', prompt: 'Transform this anime character into a detailed pencil sketch. MAINTAIN THE EXACT FRAMING AND COMPOSITION of the original image.' },
  { id: 'oil-painting', en: 'Oil Painting', zh: '油画', prompt: 'Transform this anime character into a classic oil painting. KEEP THE ORIGINAL COMPOSITION AND CHARACTER POSE. Do not crop the image.' },
  { id: 'pixel-art', en: 'Pixel Art', zh: '像素风', prompt: 'Transform this anime character into high-quality pixel art style. MAINTAIN THE ORIGINAL FRAMING AND CHARACTER POSITION.' },
  { id: 'steampunk', en: 'Steampunk', zh: '蒸汽朋克', prompt: 'Transform this anime character into steampunk style with gears and leather. PRESERVE THE ORIGINAL COMPOSITION AND CHARACTER POSE EXACTLY.' },
  { id: 'ink-wash', en: 'Ink Wash', zh: '水墨画', prompt: 'Transform this anime character into a traditional Chinese ink wash painting. MAINTAIN THE ORIGINAL FRAMING AND COMPOSITION.' },
];

const TRANSLATIONS = {
  zh: {
    title: 'MoeAvatar',
    subtitle: '二次元头像生成器',
    uploadTitle: '创建你的完美二次元头像',
    uploadDesc: '上传一张动漫插画，我们将自动为你裁剪最佳头像。',
    clickUpload: '点击上传图片',
    uploadHint: '支持 PNG, JPG 或 WEBP (最大 10MB)',
    analyzing: '正在智能分析角色...',
    chooseTitle: '选择你的头像',
    chooseDesc: '我们检测到了以下 4 个潜在头像区域。',
    customize: '精修头像',
    editTitle: '头像精修',
    stylize: '风格化渲染',
    download: '下载头像',
    back: '返回选择',
    reset: '重置视图',
    zoom: '缩放',
    startOver: '重新开始',
    tipTitle: '预览提示',
    tipDesc: '点击图片可全屏查看。AI 已为您完成裁剪与风格化，您可以直接下载。',
    aiStylize: 'AI 艺术化',
    aiGenerating: 'AI 正在创作...',
    aiError: 'AI 渲染失败，请重试',
    aiMode: '渲染模式',
    aiModeOriginal: '当前渲染',
    aiModePipeline: '管道叠加',
    aiRerender: '重新渲染',
    aiRandom: '随机灵感',
    aiStyleSelect: '选择 AI 风格',
    aiRandomGenerating: '正在寻找灵感...',
    choosePathTitle: '选择处理方式',
    choosePathSubtitle: '请选择您想要如何处理这张图片',
    chooseAvatar: '裁剪头像',
    chooseAvatarDesc: '手动选择并裁剪特定区域作为头像',
    chooseFull: '全图艺术化',
    chooseFullDesc: '直接对整张原图进行 AI 风格化处理',
    backToChoose: '返回模式选择',
    restoreOriginal: '恢复原图',
    footer: '为 ACG 爱好者打造 • MoeAvatar © 2026',
  },
  en: {
    title: 'MoeAvatar',
    subtitle: 'ACG Avatar Generator',
    uploadTitle: 'Create Your Perfect ACG Avatar',
    uploadDesc: 'Upload an anime illustration, and we\'ll help you find the best character crops.',
    clickUpload: 'Click to upload image',
    uploadHint: 'Supports PNG, JPG or WEBP (max. 10MB)',
    analyzing: 'Analyzing characters...',
    chooseTitle: 'Choose Your Avatar',
    chooseDesc: 'We\'ve detected these 4 potential avatars for you.',
    customize: 'Customize Avatar',
    editTitle: 'Avatar Refinement',
    stylize: 'Stylized Rendering',
    download: 'Download Avatar',
    back: 'Back to Selection',
    reset: 'Reset View',
    zoom: 'Zoom',
    startOver: 'Start Over',
    tipTitle: 'Preview Tip',
    tipDesc: 'Click the image to view in full screen. AI has handled cropping and stylization for you.',
    aiStylize: 'AI Artistic',
    aiGenerating: 'AI is creating...',
    aiError: 'AI rendering failed, please try again',
    aiMode: 'Render Mode',
    aiModeOriginal: 'Current',
    aiModePipeline: 'Pipeline',
    aiRerender: 'Re-render',
    aiRandom: 'Randomize',
    aiStyleSelect: 'Select AI Style',
    aiRandomGenerating: 'Finding inspiration...',
    choosePathTitle: 'Choose Your Path',
    choosePathSubtitle: 'How would you like to process this image?',
    chooseAvatar: 'Crop Avatar',
    chooseAvatarDesc: 'Select and crop a specific area for your avatar',
    chooseFull: 'Stylize Full Image',
    chooseFullDesc: 'Apply AI styles to the entire image without cropping',
    backToChoose: 'Back to Mode Select',
    restoreOriginal: 'Restore Original',
    footer: 'Built for ACG fans • MoeAvatar © 2026',
  }
};

export default function App() {
  const [lang, setLang] = useState<'zh' | 'en'>('zh');
  const t = TRANSLATIONS[lang];

  const [image, setImage] = useState<string | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [crops, setCrops] = useState<CropOption[]>([]);
  const [selectedCrop, setSelectedCrop] = useState<CropOption | null>(null);
  const [activeFilter, setActiveFilter] = useState(FILTERS[0]);
  const [activeAiStyle, setActiveAiStyle] = useState<string | null>(null);
  const [aiRenderedImage, setAiRenderedImage] = useState<string | null>(null);
  const [isAiRendering, setIsAiRendering] = useState(false);
  const [aiMode, setAiMode] = useState<'original' | 'pipeline'>('original');
  const [customAiStyles, setCustomAiStyles] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('moe-avatar-custom-styles');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      console.error("Failed to load custom styles from localStorage", e);
      return [];
    }
  });
  
  useEffect(() => {
    try {
      localStorage.setItem('moe-avatar-custom-styles', JSON.stringify(customAiStyles));
    } catch (e) {
      console.error("Failed to save custom styles to localStorage", e);
    }
  }, [customAiStyles]);
  const [isGeneratingRandom, setIsGeneratingRandom] = useState(false);
  const [step, setStep] = useState<'upload' | 'choose' | 'select' | 'edit'>('upload');
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      setImage(url);
      setOriginalImage(url);
      setStep('choose');
    }
  };

  const analyzeImage = async (url: string) => {
    setIsAnalyzing(true);
    try {
      const prompt = "Detect the faces or main characters in this anime/ACG image. Return exactly 4 bounding boxes as a JSON array of objects with ymin, xmin, ymax, xmax (normalized 0-1000). Focus on different headshots, upper body parts, or artistic crops suitable for avatars. If there's only one character, provide 4 different zoom levels or angles. OUTPUT ONLY JSON.";

      const base64Data = await urlToDataUrl(url);
      const text = await openaiChat([
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { 
              type: "image_url", 
              image_url: { url: base64Data } 
            }
          ]
        }
      ], 'json_object');

      let detectedBoxes: BoundingBox[] = JSON.parse(text);
      detectedBoxes = detectedBoxes.slice(0, 4);

      const newCrops: CropOption[] = await Promise.all(detectedBoxes.map(async (box, index) => {
        const previewUrl = await createCropPreview(url, box);
        return { id: `crop-${index}`, box, previewUrl };
      }));

      setCrops(newCrops);
      if (newCrops.length > 0) setSelectedCrop(newCrops[0]);
    } catch (error) {
      console.error("Analysis failed:", error);
      const fallbacks = [
        { ymin: 100, xmin: 100, ymax: 900, xmax: 900 },
        { ymin: 50, xmin: 250, ymax: 550, xmax: 750 },
        { ymin: 200, xmin: 50, ymax: 700, xmax: 550 },
        { ymin: 200, xmin: 450, ymax: 700, xmax: 950 },
      ];
      const newCrops: CropOption[] = await Promise.all(fallbacks.map(async (box, index) => {
        const previewUrl = await createCropPreview(url, box);
        return { id: `fallback-${index}`, box, previewUrl };
      }));
      setCrops(newCrops);
      setSelectedCrop(newCrops[0]);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const createCropPreview = (src: string, box: BoundingBox): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 400;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const x = (box.xmin / 1000) * img.width;
          const y = (box.ymin / 1000) * img.height;
          const w = ((box.xmax - box.xmin) / 1000) * img.width;
          const h = ((box.ymax - box.ymin) / 1000) * img.height;
          const cropSize = Math.max(w, h);
          const centerX = x + w / 2;
          const centerY = y + h / 2;
          ctx.drawImage(img, centerX - cropSize / 2, centerY - cropSize / 2, cropSize, cropSize, 0, 0, size, size);
        }
        resolve(canvas.toDataURL('image/png'));
      };
      img.src = src;
    });
  };

  const generateRandomStyle = async () => {
    if (isGeneratingRandom) return;
    setIsGeneratingRandom(true);
    try {
      const vibes = [
        'Cyberpunk', 'Cyber-organic', 'Neon Graffiti', 'Dreamy Pastel', 'Dark Gothic', 
        'Vaporwave', 'Pixel Art', 'Ukiyo-e', 'Oil Painting', 'Retro 90s Anime', 
        'Futuristic Mecha', 'Mystical Ethereal', 'Pencil Sketch', 'Vibrant Pop Art', 
        'Monochrome Ink', 'Glitch Art', 'Stained Glass', 'Chibi/Kawaii', 'Fantasy RPG', 'Noir Silhouette',
        'Synthwave', 'Steampunk', 'Cyber-Zen', 'Lofi Aesthetic', 'Abstract Geometry'
      ];
      const randomVibe = vibes[Math.floor(Math.random() * vibes.length)];
      
      const prompt = `Generate a unique artistic style for an anime character avatar, inspired by the vibe of "${randomVibe}". 
Return a JSON object with 'en' (English name), 'zh' (Chinese name), and 'prompt' (detailed image transformation prompt). 
The style should be creative and visually distinct. 
IMPORTANT: The prompt MUST include instructions to maintain the original composition, framing, and character pose without changes. 
OUTPUT ONLY JSON.`;
      
      const text = await openaiChat([
        { role: "user", content: prompt }
      ], 'json_object', 1.0);
      
      const styleData = JSON.parse(text || '{}');
      const newStyle = {
        id: `random-${Date.now()}`,
        ...styleData,
        isCustom: true
      };
      
      setCustomAiStyles(prev => [newStyle, ...prev]);
      applyAiStyle(newStyle.id, [newStyle, ...customAiStyles, ...AI_STYLES]);
    } catch (error) {
      console.error("Failed to generate random style:", error);
      alert("Failed to generate style. Please try again.");
    } finally {
      setIsGeneratingRandom(false);
    }
  };

  const deleteCustomStyle = (e: React.MouseEvent, styleId: string) => {
    e.stopPropagation();
    if (activeAiStyle === styleId) {
      setActiveAiStyle(null);
      setAiRenderedImage(null);
    }
    setCustomAiStyles(prev => prev.filter(s => s.id !== styleId));
  };

  const applyAiStyle = async (styleId: string, stylesList = [...customAiStyles, ...AI_STYLES]) => {
    if (isAiRendering || !image) return;
    
    setIsAiRendering(true);
    setActiveAiStyle(styleId);
    
    try {
      const style = stylesList.find(s => s.id === styleId);
      if (!style) return;

      const base64Input = await urlToDataUrl(image);
      // Use standard descriptive prompt for drawing models
      const prompt = `Based on an anime character avatar, please generate a high-quality stylized version in ${style.en} style. ${style.prompt}. The character identity and composition must be preserved.`;

      const base64Data = await geminiGenerateImage(prompt, base64Input);
      
      // Convert result back to Blob URL to keep state light
      const res = await fetch(base64Data);
      const blob = await res.blob();
      const resultUrl = URL.createObjectURL(blob);
      setAiRenderedImage(resultUrl);
    } catch (error) {
      console.error("AI Rendering failed:", error);
      alert(t.aiError);
      setActiveAiStyle(null);
    } finally {
      setIsAiRendering(false);
    }
  };

  const getProcessedImageData = (source: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const size = 800;
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      const img = new Image();
      img.onload = () => {
        if (img.width === 0 || img.height === 0) {
          reject(new Error("Image has no dimensions"));
          return;
        }

        ctx.clearRect(0, 0, size, size);
        const ratio = img.width / img.height;
        let drawW, drawH, drawX, drawY;
        
        if (ratio > 1) {
          drawW = size;
          drawH = size / ratio;
        } else {
          drawH = size;
          drawW = size * ratio;
        }
        
        drawX = (size - drawW) / 2;
        drawY = (size - drawH) / 2;
        
        ctx.drawImage(img, drawX, drawY, drawW, drawH);
        resolve(canvas.toDataURL('image/png'));
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = source;
    });
  };

  useEffect(() => {
    // No-op: Canvas rendering is now handled on-demand during download
  }, [step, selectedCrop, activeFilter, image, originalImage, aiRenderedImage, activeAiStyle, aiMode]);

  const handleDownload = async () => {
    const source = aiRenderedImage || image;
    if (!source) return;
    
    try {
      const processedDataUrl = await getProcessedImageData(source);
      
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = 800;
      tempCanvas.height = 800;
      const tempCtx = tempCanvas.getContext('2d');
      
      if (tempCtx) {
        const img = new Image();
        img.onload = () => {
          tempCtx.filter = (activeFilter as any).filter || 'none';
          tempCtx.drawImage(img, 0, 0);
          
          const dataUrl = tempCanvas.toDataURL('image/png');
          const link = document.createElement('a');
          link.download = `moe-avatar-${Date.now()}.png`;
          link.href = dataUrl;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
        };
        img.src = processedDataUrl;
      }
    } catch (error) {
      console.error("Download failed:", error);
      alert("Failed to prepare download. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-[#F9FAFB] text-[#374151] font-sans selection:bg-[#E5E7EB]">
      {/* Header */}
      <header className="bg-white/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-8 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#F3F4F6] border border-[#E5E7EB] rounded-xl flex items-center justify-center">
              <Sparkles className="w-5 h-5 text-[#6B7280]" />
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-[#111827] leading-none">{t.title}</h1>
              <span className="text-[10px] uppercase tracking-widest text-[#9CA3AF] font-medium">{t.subtitle}</span>
            </div>
          </div>
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setLang(lang === 'zh' ? 'en' : 'zh')}
              className="text-xs font-medium text-[#6B7280] hover:text-[#111827] flex items-center gap-1.5 transition-colors"
            >
              <Globe className="w-3.5 h-3.5" />
              {lang === 'zh' ? 'English' : '中文'}
            </button>
            {step !== 'upload' && (
              <button 
                onClick={() => { setImage(null); setStep('upload'); setCrops([]); }}
                className="text-xs font-medium text-[#6B7280] hover:text-[#111827] flex items-center gap-1.5 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                {t.startOver}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-8 py-16">
        <AnimatePresence mode="wait">
          {step === 'upload' && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="max-w-xl mx-auto"
            >
              <div className="mb-12 text-center">
                <h2 className="text-3xl font-bold text-[#111827] mb-4 tracking-tight">{t.uploadTitle}</h2>
                <p className="text-[#6B7280] leading-relaxed">{t.uploadDesc}</p>
              </div>

              <div 
                onClick={() => fileInputRef.current?.click()}
                className="group relative bg-white border border-[#E5E7EB] rounded-[32px] p-20 transition-all hover:border-[#D1D5DB] hover:shadow-sm cursor-pointer"
              >
                <input type="file" ref={fileInputRef} onChange={handleUpload} className="hidden" accept="image/*" />
                <div className="flex flex-col items-center gap-6">
                  <div className="w-14 h-14 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl flex items-center justify-center group-hover:scale-105 transition-transform">
                    <Upload className="w-6 h-6 text-[#9CA3AF]" />
                  </div>
                  <div className="text-center">
                    <p className="text-base font-semibold text-[#111827] mb-1">{t.clickUpload}</p>
                    <p className="text-xs text-[#9CA3AF]">{t.uploadHint}</p>
                  </div>
                </div>
              </div>

              <div className="mt-16 flex justify-center gap-4 opacity-30 grayscale">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="w-12 h-12 rounded-xl bg-[#E5E7EB] overflow-hidden">
                    <img src={`https://picsum.photos/seed/anime${i}/100/100`} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {step === 'choose' && (
            <motion.div 
              key="choose"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-4xl mx-auto"
            >
              <div className="mb-8">
                <button 
                  onClick={() => { setImage(null); setStep('upload'); }}
                  className="text-xs font-medium text-[#6B7280] hover:text-[#111827] flex items-center gap-1.5 transition-colors"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  {t.startOver}
                </button>
              </div>
              <div className="text-center mb-16">
                <h2 className="text-4xl font-bold text-[#111827] mb-4 tracking-tight">{t.choosePathTitle}</h2>
                <p className="text-[#6B7280] text-lg">{t.choosePathSubtitle}</p>
              </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <button 
                  onClick={() => {
                    setAiMode('original');
                    setStep('select');
                    if (image) analyzeImage(image);
                  }}
                  className="group bg-white border border-[#E5E7EB] rounded-[40px] p-10 text-left transition-all hover:border-[#111827] hover:shadow-2xl hover:-translate-y-1"
                >
                  <div className="w-16 h-16 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl flex items-center justify-center mb-8 group-hover:bg-[#111827] group-hover:text-white transition-colors">
                    <Zap className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-bold text-[#111827] mb-4">{t.chooseAvatar}</h3>
                  <p className="text-[#6B7280] leading-relaxed mb-8">{t.chooseAvatarDesc}</p>
                  <div className="flex items-center gap-2 text-[#111827] font-bold">
                    立即开始 <ChevronRight className="w-5 h-5" />
                  </div>
                </button>

                <button 
                  onClick={() => {
                    setAiMode('original');
                    setAiRenderedImage(null);
                    setActiveAiStyle(null);
                    if (originalImage) {
                      setImage(originalImage);
                      setSelectedCrop({
                        id: 'full-image',
                        box: { ymin: 0, xmin: 0, ymax: 1000, xmax: 1000 },
                        previewUrl: originalImage
                      });
                    }
                    setStep('edit');
                  }}
                  className="group bg-white border border-[#E5E7EB] rounded-[40px] p-10 text-left transition-all hover:border-[#111827] hover:shadow-2xl hover:-translate-y-1"
                >
                  <div className="w-16 h-16 bg-[#F9FAFB] border border-[#E5E7EB] rounded-2xl flex items-center justify-center mb-8 group-hover:bg-[#111827] group-hover:text-white transition-colors">
                    <Sparkles className="w-8 h-8" />
                  </div>
                  <h3 className="text-2xl font-bold text-[#111827] mb-4">{t.chooseFull}</h3>
                  <p className="text-[#6B7280] leading-relaxed mb-8">{t.chooseFullDesc}</p>
                  <div className="flex items-center gap-2 text-[#111827] font-bold">
                    立即开始 <ChevronRight className="w-5 h-5" />
                  </div>
                </button>
              </div>
            </motion.div>
          )}

          {step === 'select' && (
            <motion.div 
              key="select"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-center"
            >
              <div className="lg:col-span-7">
                <div className="relative rounded-[40px] overflow-hidden bg-white border border-[#E5E7EB] shadow-sm aspect-[4/3] flex items-center justify-center p-4">
                  {image && (
                    <img 
                      src={selectedCrop ? selectedCrop.previewUrl : image} 
                      alt="" 
                      className="max-w-full max-h-full object-contain rounded-2xl transition-all duration-300" 
                      referrerPolicy="no-referrer"
                    />
                  )}
                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-[2px] flex flex-col items-center justify-center gap-4">
                      <div className="w-10 h-10 border-2 border-[#E5E7EB] border-t-[#6B7280] rounded-full animate-spin" />
                      <p className="text-xs font-medium text-[#6B7280] tracking-wider uppercase">{t.analyzing}</p>
                    </div>
                  )}
                </div>
              </div>

              <div className="lg:col-span-5 space-y-10">
                <div>
                  <h3 className="text-2xl font-bold text-[#111827] mb-3 tracking-tight">{t.chooseTitle}</h3>
                  <p className="text-sm text-[#6B7280] leading-relaxed">{t.chooseDesc}</p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {crops.map((crop) => (
                    <button
                      key={crop.id}
                      onClick={() => setSelectedCrop(crop)}
                      className={`relative aspect-square rounded-2xl overflow-hidden border transition-all ${
                        selectedCrop?.id === crop.id ? 'border-[#111827] ring-4 ring-[#F3F4F6]' : 'border-[#E5E7EB] hover:border-[#D1D5DB]'
                      }`}
                    >
                      <img src={crop.previewUrl} alt="" className="w-full h-full object-cover" />
                      {selectedCrop?.id === crop.id && (
                        <div className="absolute top-2 right-2 bg-[#111827] text-white p-1 rounded-full">
                          <Check className="w-3 h-3" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                <button 
                  onClick={() => {
                    if (selectedCrop) {
                      setImage(selectedCrop.previewUrl);
                      setStep('edit');
                    }
                  }}
                  disabled={!selectedCrop || isAnalyzing}
                  className="w-full bg-[#111827] text-white py-4 rounded-2xl font-bold hover:bg-black transition-all disabled:opacity-30 flex items-center justify-center gap-2 shadow-lg shadow-black/5"
                >
                  {t.customize}
                  <ChevronRight className="w-4 h-4" />
                </button>

                <button 
                  onClick={() => setStep('choose')}
                  className="w-full bg-white text-[#6B7280] py-4 rounded-2xl font-bold border border-[#E5E7EB] hover:bg-[#F9FAFB] transition-all flex items-center justify-center gap-2"
                >
                  {t.backToChoose}
                </button>
              </div>
            </motion.div>
          )}

          {step === 'edit' && selectedCrop && (
            <motion.div 
              key="edit"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="max-w-5xl mx-auto"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 items-start">
                <div className="lg:col-span-7 space-y-8">
                  <PhotoProvider>
                    <div className="relative w-full aspect-square rounded-[48px] overflow-hidden bg-white border border-[#E5E7EB] shadow-sm group">
                      <PhotoView src={aiRenderedImage || image || ''}>
                        <div className="w-full h-full cursor-zoom-in relative">
                          <img 
                            src={aiRenderedImage || image || ''}
                            alt="Preview"
                            className="w-full h-full object-contain transition-all duration-500"
                            style={{ filter: activeFilter.filter }}
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/5 transition-colors flex items-center justify-center">
                            <div className="p-4 bg-white/90 backdrop-blur rounded-2xl shadow-xl text-[#111827] opacity-0 group-hover:opacity-100 transition-all scale-90 group-hover:scale-100">
                              <Search size={24} />
                            </div>
                          </div>
                        </div>
                      </PhotoView>
                      <div className="absolute inset-0 pointer-events-none border-[12px] border-white rounded-[48px]" />
                    </div>
                  </PhotoProvider>
                  
                  <div className="bg-white p-8 rounded-3xl border border-[#E5E7EB] space-y-4">
                    <p className="text-xs text-[#6B7280] text-center font-medium">{t.tipDesc}</p>
                  </div>
                </div>

                  <div className="lg:col-span-5 space-y-12">
                    <div className="space-y-6">
                      <h3 className="text-xl font-bold text-[#111827] tracking-tight flex items-center gap-2">
                        <Sparkles className="w-5 h-5 text-[#9CA3AF]" />
                        {t.stylize}
                      </h3>
                      <div className="grid grid-cols-3 gap-2">
                        {FILTERS.map((filter) => (
                          <button
                            key={filter.name}
                            onClick={() => {
                              setActiveFilter(filter);
                              setActiveAiStyle(null);
                              setAiRenderedImage(null);
                            }}
                            className={`px-3 py-3 rounded-xl text-[11px] font-bold transition-all border ${
                              activeFilter.name === filter.name && !activeAiStyle
                                ? 'bg-[#111827] text-white border-[#111827] shadow-md shadow-black/10' 
                                : 'bg-white text-[#6B7280] border-[#E5E7EB] hover:border-[#D1D5DB]'
                            }`}
                          >
                            {lang === 'zh' ? filter.zh : filter.en}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-8 p-8 bg-white rounded-[32px] border border-[#E5E7EB] shadow-sm">
                      <div className="flex items-center justify-between">
                        <h3 className="text-lg font-bold text-[#111827] tracking-tight flex items-center gap-2">
                          <Sparkles className="w-5 h-5 text-[#6366F1]" />
                          {t.aiStylize}
                        </h3>
                        <div className="flex bg-[#F3F4F6] p-1 rounded-xl">
                          <button 
                            onClick={() => { setAiMode('original'); setAiRenderedImage(null); setActiveAiStyle(null); }}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${aiMode === 'original' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#9CA3AF]'}`}
                          >
                            {t.aiModeOriginal}
                          </button>
                          <button 
                            onClick={() => { setAiMode('pipeline'); }}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${aiMode === 'pipeline' ? 'bg-white text-[#111827] shadow-sm' : 'text-[#9CA3AF]'}`}
                          >
                            {t.aiModePipeline}
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-3">
                        {AI_STYLES.map((style) => (
                          <button
                            key={style.id}
                            onClick={() => applyAiStyle(style.id)}
                            className={`aspect-square rounded-2xl text-[10px] font-bold flex flex-col items-center justify-center gap-2 transition-all border ${
                              activeAiStyle === style.id 
                                ? 'bg-[#6366F1] text-white border-[#6366F1] ring-4 ring-[#EEF2FF]' 
                                : 'bg-white text-[#6B7280] border-[#EEF2FF] hover:border-[#6366F1]/30'
                            }`}
                          >
                            {lang === 'zh' ? style.zh : style.en}
                          </button>
                        ))}
                      </div>

                      {customAiStyles.length > 0 && (
                        <div className="space-y-4 pt-4 border-t border-[#F3F4F6]">
                          <div className="grid grid-cols-4 gap-3">
                            {customAiStyles.map((style) => (
                              <div key={style.id} className="relative group/item">
                                <button
                                  onClick={() => applyAiStyle(style.id)}
                                  className={`w-full aspect-square rounded-2xl text-[10px] font-bold flex flex-col items-center justify-center gap-2 transition-all border ${
                                    activeAiStyle === style.id 
                                      ? 'bg-[#10B981] text-white border-[#10B981] ring-4 ring-[#ECFDF5]' 
                                      : 'bg-white text-[#6B7280] border-[#ECFDF5] hover:border-[#10B981]/30'
                                  }`}
                                >
                                  {lang === 'zh' ? style.zh : style.en}
                                </button>
                                <button
                                  onClick={(e) => deleteCustomStyle(e, style.id)}
                                  className="absolute -top-1 -right-1 w-5 h-5 bg-[#EF4444] text-white rounded-full flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity shadow-sm hover:bg-red-600 z-10"
                                  title="Delete style"
                                >
                                  <X className="w-3 h-3" />
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="flex gap-4">
                        <button 
                          onClick={generateRandomStyle}
                          disabled={isGeneratingRandom}
                          className="flex-1 py-4 bg-white border-2 border-[#111827] text-[#111827] rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-[#F9FAFB] transition-all disabled:opacity-50"
                        >
                          {isGeneratingRandom ? (
                            <RefreshCw className="w-4 h-4 animate-spin text-[#6366F1]" />
                          ) : (
                            <Zap className="w-4 h-4 text-[#F59E0B]" />
                          )}
                          {isGeneratingRandom ? t.aiRandomGenerating : t.aiRandom}
                        </button>

                        <button 
                          onClick={() => applyAiStyle(activeAiStyle as string)}
                          disabled={!activeAiStyle || isAiRendering}
                          className="flex-1 py-4 bg-[#111827] text-white rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-black transition-all disabled:opacity-30"
                        >
                          {isAiRendering ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                          {isAiRendering ? t.aiGenerating : t.aiRerender}
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => { 
                          if (selectedCrop?.id === 'full-image') {
                            setStep('choose');
                          } else {
                            setStep('select');
                          }
                          setAiRenderedImage(null); 
                          setActiveAiStyle(null); 
                        }}
                        className="py-4 bg-white text-[#6B7280] rounded-2xl font-bold border border-[#E5E7EB] hover:bg-[#F9FAFB] transition-all flex items-center justify-center gap-2"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        {t.back}
                      </button>

                      <button 
                        onClick={handleDownload}
                        className="py-4 bg-[#111827] text-white rounded-2xl font-bold hover:bg-black transition-all flex items-center justify-center gap-2 shadow-lg shadow-black/5"
                      >
                        <Download className="w-4 h-4" />
                        {t.download}
                      </button>
                    </div>
                  </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      <footer className="max-w-5xl mx-auto px-8 py-12 border-t border-[#E5E7EB] mt-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <p className="text-xs font-medium text-[#9CA3AF] tracking-wide uppercase">{t.footer}</p>
          <div className="flex items-center gap-4">
            <a href="#" className="w-8 h-8 rounded-lg bg-[#F3F4F6] flex items-center justify-center text-[#6B7280] hover:bg-[#111827] hover:text-white transition-all">
              <Upload className="w-4 h-4" />
            </a>
            <a href="#" className="w-8 h-8 rounded-lg bg-[#F3F4F6] flex items-center justify-center text-[#6B7280] hover:bg-[#111827] hover:text-white transition-all">
              <Globe className="w-4 h-4" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
