
import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Medicine, ShortageInsight } from "./types";

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

const GROUPED_MEDICINE_SCHEMA = {
  type: Type.ARRAY,
  items: {
    type: Type.OBJECT,
    properties: {
      genericName: { type: Type.STRING, description: "نام عمومی و ژنریک دارو به فارسی" },
      category: { type: Type.STRING, description: "دسته بندی درمانی (مثلاً آنتی بیوتیک، مسکن، قلبی و...)" },
      variants: {
        type: Type.ARRAY,
        items: {
          type: Type.OBJECT,
          properties: {
            manufacturer: { type: Type.STRING, description: "نام شرکت سازنده" },
            dosage: { type: Type.STRING, description: "دوز" },
            form: { type: Type.STRING, description: "شکل (قرص، شربت، و...)" },
            price: { type: Type.NUMBER, description: "قیمت به ریال" },
            isShortage: { type: Type.BOOLEAN, description: "وضعیت کمبود" }
          },
          required: ["manufacturer", "dosage", "form", "price", "isShortage"]
        }
      }
    },
    required: ["genericName", "category", "variants"]
  }
};

export const syncMedicinesWithAI = async (batchSize: number): Promise<Medicine[]> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `به عنوان یک متخصص فارماکولوژی، لیستی از دقیقاً ${batchSize} داروی ژنریک مختلف و پرمصرف ایران را با تکیه بر منابع دارویاب، تی‌تک و سازمان غذا و دارو تهیه کن. داده‌ها را برای هر نام ژنریک تجمیع کن تا هیچ نام عمومی تکرار نشود. تمام تولیدکنندگان برتر و قیمت‌های جدید را درج کن.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: GROUPED_MEDICINE_SCHEMA,
      },
    });

    const rawData = JSON.parse(response.text || "[]");
    return rawData.map((item: any) => ({
      ...item,
      id: Math.random().toString(36).substr(2, 9),
      lastUpdated: new Date().toISOString()
    }));
  } catch (error) {
    console.error("Sync Error:", error);
    throw error;
  }
};

export const fetchShortageInsights = async (): Promise<ShortageInsight> => {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: "آخرین گزارش‌های رسمی و اخبار یک ماه اخیر درباره علل کمبود دارو در ایران و لیست اقلام بحرانی را جستجو و خلاصه کن.",
      config: { tools: [{ googleSearch: {} }] },
    });
    const text = response.text || "اطلاعاتی یافت نشد.";
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = chunks.filter((c: any) => c.web).map((c: any) => ({ title: c.web.title, uri: c.web.uri }));
    return { text, sources };
  } catch (error) {
    return { text: "خطا در دریافت تحلیل آنلاین.", sources: [] };
  }
};

export const getAIResponse = async (message: string) => {
  const chat = ai.chats.create({
    model: 'gemini-3-pro-preview',
    config: { systemInstruction: "You are PharmaAssistant, a professional pharmacology expert in Iran. Help users with drug questions using Farsi language. Be concise and use official names." }
  });
  const response = await chat.sendMessage({ message });
  return response.text;
};

export const getDeepAnalysis = async (drugName: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-3-pro-preview",
    contents: `تحلیل عمیق فارماکولوژیک برای "${drugName}" شامل تداخلات، موارد منع مصرف و دوزهای استاندارد بر اساس فارماکوپه ایران.`,
    config: { thinkingConfig: { thinkingBudget: 32768 } }
  });
  return response.text;
};

export const generateSpeech = async (text: string) => {
  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: [Modality.AUDIO],
      speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } } },
    },
  });
  return response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
};
