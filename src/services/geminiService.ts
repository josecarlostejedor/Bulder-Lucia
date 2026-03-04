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
  const rawKey = (import.meta as any).env?.VITE_GEMINI_API_KEY || (process as any).env?.VITE_GEMINI_API_KEY || "";
  const apiKey = rawKey.trim().replace(/["']/g, "");
  
  if (!apiKey || !apiKey.startsWith("AIza")) {
    throw new Error(`La aplicación no detecta una clave válida. 
    Detectado: "${apiKey ? apiKey.substring(0, 4) + "..." : "NADA"}". 
    PASOS: 1. Configura VITE_GEMINI_API_KEY en Vercel Settings. 2. Ve a Deployments y haz un REDEPLOY.`);
  }

  const ai = new GoogleGenAI({ apiKey });
  
  // Lista de modelos a intentar en orden de estabilidad/velocidad
  const modelsToTry = ["gemini-flash-latest", "gemini-3-flash-preview"];
  let lastError = null;

  for (const modelName of modelsToTry) {
    try {
      console.log(`Intentando generar ruta con: ${modelName}...`);
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
                
                WALL SPECIFICATIONS & ERGONOMICS (STRICT):
                - Width: ${width} meters | Height: ${height} meters.
                - TARGET CLIMBER: Average height 1.75m.
                - HUMAN REACH CONSTRAINTS (MANDATORY):
                    * Maximum Vertical Distance (between any two consecutive hand holds): 0.7 meters.
                    * Maximum Foot-to-Foot Distance: 0.5 meters (50cm) - MUST be reachable for a 1.75m person.
                    * Maximum Horizontal Spread (between feet): 0.6 meters.
                    * Foot-to-Hand Vertical Distance: Feet MUST be between 0.4m and 0.8m below the hands for stability.
                - ROUTE EFFICIENCY:
                    * A 3.5m vertical route should have between 8 and 12 total holds (including feet).
                    * A 6.5m transversal route should have between 12 and 18 total holds.
                    * NEVER exceed 20 total holds for a 3.5m vertical section.
                    * Use a logical human proportion for a 1.75m climber.
                    * Progression must be FLUID. If a step requires a foot move of more than 0.6m, it is INVALID.
                    * For every hand move, there should usually be a corresponding foot move to maintain balance.
                
                ROUTE ORIENTATION:
                - If 'vertical': Start at bottom, progress directly to top.
                - If 'transversal': Progress across the ${width}m width efficiently.
                
                INSTRUCTIONS:
                1. Identify specific colored climbing holds (presas). 
                   - CRITICAL VISUAL DISTINCTION:
                     * SCREW HOLES (T-NUTS): Small, flat, black/dark circles, flush with the wall, usually in a grid. NEVER SELECT THESE.
                     * CLIMBING HOLDS: Larger, colorful (red, yellow, blue, green, etc.), have 3D volume, cast shadows, and have irregular shapes. ONLY SELECT THESE.
                   - If an object is black and perfectly circular, it is a screw hole. IGNORE IT.
                2. Assign a unique 'id' to each selected hold.
                3. Provide normalized coordinates (x, y) (0-1000). 
                   (x=0 is left, x=1000 is ${width}m right; y=0 is top, y=1000 is ${height}m bottom).
                4. Create a 'beta' sequence:
                   - The 'start' and 'finish' MUST be actual colored holds.
                   - For each step, ensure the distance from the previous hold to the new hold DOES NOT EXCEED 0.7 meters.
                   - Ensure foot holds are always within 0.7m of each other.
                Return the result as a JSON object following the Itinerary interface.`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: "You are an expert climbing route setter. Your task is to identify actual climbing holds in images. You must NEVER, UNDER ANY CIRCUMSTANCES, select the small, dark, circular screw holes (t-nuts) that form a grid on the wall. These are NOT climbing holds. Only select objects that are clearly colored climbing holds with physical volume, 3D texture, and cast shadows. Design routes for a 1.75m tall person with efficient, logical progression. Ensure foot placement is always within 40-80cm below the hands and foot-to-foot distance is no more than 50cm for stability and balance. If a move is too large, it is invalid.",
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
    } catch (e: any) {
      console.warn(`Fallo con el modelo ${modelName}:`, e.message);
      lastError = e;
      // Si es un error 404 (modelo no encontrado), pasamos al siguiente inmediatamente
      // Si es un error 503 o 429, también pasamos al siguiente
    }
  }

  // Si llegamos aquí, todos los modelos han fallado
  throw lastError || new Error("No se pudo obtener una respuesta de los modelos de IA.");
}
