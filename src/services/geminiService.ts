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
  // Try to get API key from multiple possible sources for local and Vercel environments
  // In Vite, we use import.meta.env.VITE_...
  // In some environments, process.env might be available
  let apiKey = "";
  
  try {
    apiKey = import.meta.env.VITE_GEMINI_API_KEY || "";
  } catch (e) {
    // Fallback if import.meta.env is not available
  }

  if (!apiKey) {
    try {
      // @ts-ignore
      apiKey = process.env.GEMINI_API_KEY || "";
    } catch (e) {
      // Fallback if process is not defined
    }
  }
  
  if (!apiKey || apiKey === 'undefined' || apiKey === 'null') {
    throw new Error('API_KEY_MISSING: No se ha encontrado la clave API de Gemini. En Vercel, asegúrate de haber añadido VITE_GEMINI_API_KEY en Environment Variables y haber hecho un REDEPLOY.');
  }

  const ai = new GoogleGenAI({ apiKey });
  
  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
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
                * Maximum Reach (Hands): 0.7 meters (70cm). NEVER exceed this distance between consecutive hand holds.
                * Maximum Reach (Feet): 0.6 meters.
                * Foot-to-Hand Distance: Feet MUST be between 0.3m and 0.8m below the hands to maintain balance.
            - This is a BOULDER wall with small holds. The climber needs frequent, close points of contact.
            - Use these dimensions to ensure every move is physically possible for a human climber without over-stretching.
            
            ROUTE ORIENTATION:
            - If the request specifies 'vertical', the route should start at the bottom and finish at the top.
            - If the request specifies 'transversal', the route should travel horizontally across the 6.5m width (e.g., from left to right or right to left), maintaining a relatively consistent height or using the full width of the wall.
            
            INSTRUCTIONS:
            1. Identify specific colored climbing holds (presas). 
               - CRITICAL FORBIDDEN ACTION: DO NOT select the small black screw holes (agujeros de tornillos).
               - ONLY select actual climbing holds which are larger, have distinct colors, and show physical volume/shadows.
               - Every coordinate (x, y) MUST be the exact center of a visible colored hold.
            2. Assign a unique 'id' to each selected hold.
            3. Provide normalized coordinates (x, y) for the center of each colored hold (0-1000). 
               (x=0 is left, x=1000 is 6.5m right; y=0 is top, y=1000 is 3.5m bottom).
            4. Create a 'beta' sequence: a series of steps showing how a climber moves.
               - The 'start' and 'finish' (top) roles MUST be assigned to actual colored holds identified in step 1. NEVER place a start or finish marker on empty wall space.
               - For each step, ensure the distance from the previous hold to the new hold DOES NOT EXCEED 0.7 meters.
               - Ensure there are always foot holds available that allow the climber to reach the next hand hold within the 0.7m limit.
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

  return JSON.parse(response.text || "{}");
}
