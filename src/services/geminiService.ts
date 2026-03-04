import { GoogleGenAI, Type } from "@google/genai";

// ... interfaces Hold, BetaStep, Itinerary ... (se mantienen igual)

export async function analyzeWall(imageData: string, prompt: string, width: number, height: number): Promise<Itinerary> {
  // CLAVE INTEGRADA DIRECTAMENTE PARA EVITAR ERRORES EN VERCEL
  const apiKey = "AIzaSyBE7BjiWhiv3YoZt2EPGuTtR01TNnnEXng";
  const ai = new GoogleGenAI({ apiKey });
  
  // ... resto del código de analyzeWall ...
}
