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
  const VERSION = "1.0.9-FINAL";
  console.log(`--- SISTEMA DE ESCALADA ${VERSION} ---`);
  
  const rawKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
  const apiKey = rawKey.trim().replace(/["']/g, "");
  
  if (!apiKey || !apiKey.startsWith("AIza")) {
    throw new Error("Error: No se detecta la clave de API. Revisa la configuración en Vercel y haz Redeploy.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // Usamos el modelo que sabemos que es compatible con tu cuenta.
  // IMPORTANTE: Google limita este modelo a 20 peticiones/día en la versión gratuita.
  const modelName = "gemini-3-flash-preview";
  
  try {
    console.log(`[${VERSION}] Solicitando ruta a: ${modelName}`);
    
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
              (System: ${VERSION})
              
              WALL SPECIFICATIONS:
              - Width: ${width}m | Height: ${height}m.
              - Climber: 1.75m.
              - Holds: 8-12 for vertical, 12-18 for transversal.
              - IGNORE SCREW HOLES. Only select colored holds.
              
              Return JSON following the Itinerary interface.`,
            },
          ],
        },
      ],
      config: {
        systemInstruction: "You are an expert climbing route setter. Identify colored holds. NEVER select screw holes. Design logical routes for a 1.75m climber.",
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
      throw new Error("LÍMITE DE 20 PETICIONES ALCANZADO. Google limita este modelo gratuito a 20 usos al día. SOLUCIÓN: Crea una nueva API KEY en Google AI Studio o espera a mañana.");
    }
    if (e.message?.includes('404')) {
      throw new Error("ERROR DE MODELO (404). Google ha cambiado el nombre del modelo. Por favor, contacta con soporte o intenta de nuevo en unos minutos.");
    }
    
    throw e;
  }
}
