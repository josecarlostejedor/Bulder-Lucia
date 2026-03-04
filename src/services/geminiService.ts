import { GoogleGenAI, Type } from "@google/genai";

export interface Hold {
  id: string;
  x: number; // 0-1000
  y: number; // 0-1000
  color: string;
  type: string;
  role: 'hand' | 'foot' | 'start' | 'finish';
}

export interface BetaStep {
  leftHandHoldId: string;
  rightHandHoldId: string;
  leftFootHoldId: string;
  rightFootHoldId: string;
  description: string;
}

export interface Itinerary {
  name: string;
  difficulty: string;
  description: string;
  holds: Hold[];
  beta: BetaStep[];
}

export async function analyzeWall(imageData: string, prompt: string, width: number, height: number): Promise<Itinerary> {
  const VERSION = "1.1.0-FIXED";
  console.log(`--- SISTEMA DE ESCALADA ${VERSION} ---`);
  
  const rawKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
  const apiKey = rawKey.trim().replace(/["']/g, "");
  
  if (!apiKey || !apiKey.startsWith("AIza")) {
    throw new Error("Error: No se detecta la clave de API. Revisa la configuración en Vercel y haz Redeploy.");
  }

  const ai = new GoogleGenAI({ apiKey });
  const modelName = "gemini-3-flash-preview";
  
  try {
    console.log(`[${VERSION}] Generando ruta lógica con: ${modelName}`);
    
    const response = await ai.models.generateContent({
      model: modelName,
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: imageData.includes(',') ? imageData.split(',')[1] : imageData,
              },
            },
            {
              text: `Analyze this climbing wall image and create a boulder itinerary based on this request: "${prompt}". 
              
              WALL SPECIFICATIONS & COORDINATES:
              - Width: ${width}m | Height: ${height}m.
              - COORDINATE SYSTEM: Use 0-1000 scale. x=0 (left), x=1000 (right), y=0 (top), y=1000 (bottom).
              - TARGET CLIMBER: 1.75m tall.
              
              STRICT HOLD IDENTIFICATION:
              1. IGNORE SCREW HOLES (T-NUTS): Small, flat, black/dark circles in a grid. NEVER select these.
              2. SELECT CLIMBING HOLDS: Colorful objects (red, blue, green, etc.) with 3D volume and shadows.
              
              ERGONOMICS:
              - Max vertical reach: 0.7m.
              - Max foot-to-foot distance: 0.5m.
              - Feet must be 40-80cm below hands.
              - Vertical route (3.5m): 8-12 holds.
              - Transversal route (6.5m): 12-18 holds.
              
              Return JSON following the Itinerary interface.`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: "You are an expert climbing route setter. Identify actual colored climbing holds. NEVER select screw holes. Design logical routes for a 1.75m climber. Ensure coordinates are accurate within the 0-1000 scale.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            name: { type: Type.STRING },
            difficulty: { type: Type.STRING },
            description: { type: Type.STRING },
            holds: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  x: { type: Type.NUMBER },
                  y: { type: Type.NUMBER },
                  color: { type: Type.STRING },
                  type: { type: Type.STRING },
                  role: { type: Type.STRING, enum: ["hand", "foot", "start", "finish"] }
                },
                required: ["id", "x", "y", "color", "type", "role"]
              }
            },
            beta: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  leftHandHoldId: { type: Type.STRING },
                  rightHandHoldId: { type: Type.STRING },
                  leftFootHoldId: { type: Type.STRING },
                  rightFootHoldId: { type: Type.STRING },
                  description: { type: Type.STRING }
                },
                required: ["leftHandHoldId", "rightHandHoldId", "leftFootHoldId", "rightFootHoldId"]
              }
            }
          },
          required: ["name", "difficulty", "description", "holds", "beta"]
        }
      }
    });

    const text = response.text;
    if (text) return JSON.parse(text);
    throw new Error("La IA devolvió una respuesta vacía.");
  } catch (e: any) {
    console.error("Error en analyzeWall:", e);
    if (e.message?.includes('429')) {
      throw new Error("LÍMITE DE CUOTA: Google permite 20 usos/día. Crea una nueva API KEY o espera a mañana.");
    }
    throw e;
  }
}
