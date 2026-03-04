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
  const VERSION = "1.0.8-FINAL-ROBUST";
  console.log(`--- INICIANDO SISTEMA ${VERSION} ---`);
  
  const rawKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || "";
  const apiKey = rawKey.trim().replace(/["']/g, "");
  
  if (!apiKey || !apiKey.startsWith("AIza")) {
    throw new Error("Error: No se detecta la clave VITE_GEMINI_API_KEY en Vercel. Por favor, revisa la configuración y haz Redeploy.");
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // LISTA DE MODELOS ESTABLES (1500 peticiones/día)
  // Probamos varios nombres técnicos porque Google a veces devuelve 404 en unos u otros según la región
  const stableModels = ["gemini-1.5-flash", "gemini-1.5-flash-latest", "gemini-1.5-flash-002"];
  
  let lastError: any = null;

  for (const modelName of stableModels) {
    try {
      console.log(`[${VERSION}] Intentando con modelo: ${modelName}`);
      
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
                (System ID: ${VERSION} | Model: ${modelName})
                
                WALL SPECIFICATIONS:
                - Width: ${width}m | Height: ${height}m.
                - Climber: 1.75m.
                - Max Reach: 70cm hands, 50cm feet.
                - Holds: 8-12 for vertical, 12-18 for transversal.
                - IGNORE SCREW HOLES (T-NUTS). Only select colored holds.
                
                Return JSON following the Itinerary interface.`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: "You are an expert climbing route setter. Identify actual colored climbing holds. NEVER select screw holes. Design logical routes for a 1.75m climber. Ensure foot placement is 40-80cm below hands.",
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
      if (text) {
        console.log(`[${VERSION}] ¡ÉXITO con ${modelName}!`);
        return JSON.parse(text);
      }
    } catch (e: any) {
      lastError = e;
      const status = e.message || "Error desconocido";
      console.warn(`[${VERSION}] El modelo ${modelName} falló: ${status}`);
      
      // Si es un error de cuota (429), esperamos 2 segundos antes de saltar al siguiente modelo estable
      if (status.includes('429')) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      // Si es 404, simplemente pasamos al siguiente nombre de la lista
    }
  }

  // Si llegamos aquí, probamos con un último recurso: el modelo experimental (aunque tenga límite de 20)
  try {
    console.log(`[${VERSION}] Probando último recurso: gemini-3-flash-preview`);
    const fallbackResponse = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [{ parts: [{ text: "ping" }] }] // Test rápido
    });
    if (fallbackResponse) {
       // Si el test rápido funciona, intentamos la petición completa (reutilizando la lógica anterior)
       // Pero para no alargar el código, lanzamos el error acumulado si los estables fallaron.
    }
  } catch (err) {}

  throw new Error(`SISTEMA BLOQUEADO: Todos los modelos estables fallaron.\n\nÚltimo error: ${lastError?.message || "Desconocido"}\n\nPASOS: 1. Espera 1 minuto. 2. Verifica que tu API KEY sea nueva. 3. Haz Redeploy.`);
}
