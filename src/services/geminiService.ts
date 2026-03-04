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
  // Forzamos el uso de la nueva clave proporcionada con .trim()
  const apiKey = "AIzaSyAtSwcb5cIRAKiZZ5G49iEF3QYO-f5yk5o".trim();
  const ai = new GoogleGenAI({ apiKey });
  
  // Usamos gemini-3-flash-preview que es mucho más rápido para análisis de imágenes y JSON
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
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
            - HUMAN REACH CONSTRAINTS (MANDATORY):
                * Maximum Distance (ANY consecutive holds): 0.7 meters (70cm).
                * Maximum Foot-to-Foot Distance: 0.6 meters (60cm).
                * Maximum Hand-to-Hand Distance: 0.7 meters (70cm).
                * Foot-to-Hand Distance: Feet MUST be between 0.3m and 0.7m below the hands.
            - This is a BOULDER wall for students. The climber needs VERY close points of contact.
            - If a move looks longer than 70cm, it is FORBIDDEN.
            
            ROUTE ORIENTATION:
            - If the request specifies 'vertical', the route should start at the bottom and finish at the top.
            - If the request specifies 'transversal', the route should travel horizontally across the ${width}m width, maintaining a relatively consistent height.
            
            INSTRUCTIONS:
            1. Identify specific colored climbing holds (presas). 
               - CRITICAL: DO NOT select the small black screw holes (t-nuts).
               - ONLY select actual climbing holds with color and volume.
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
      systemInstruction: "You are an expert climbing route setter. Your task is to identify actual climbing holds in images. You must NEVER select the small, dark, circular screw holes (t-nuts) that form a grid on the wall. Only select objects that are clearly climbing holds with color and volume.",
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
  if (!text) {
    throw new Error("La IA no devolvió ninguna respuesta. Inténtalo de nuevo.");
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Error parsing JSON:", text);
    throw new Error("La respuesta de la IA no es un JSON válido.");
  }
}
