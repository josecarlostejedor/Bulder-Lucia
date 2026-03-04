import React, { useState, useRef, useEffect } from 'react';
import { Upload, Download, Play, Square, RotateCcw, Loader2, Info, ChevronRight, Trash2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { analyzeWall, Itinerary, Hold } from './services/geminiService';
import { generateWordDocument } from './services/wordService';

export default function App() {
  // Estado para la imagen con persistencia en localStorage
  const [image, setImage] = useState<string | null>(() => {
    return localStorage.getItem('ies_lucia_wall_image');
  });
  const [wallWidth, setWallWidth] = useState<number>(6.5);
  const [wallHeight, setWallHeight] = useState<number>(3.5);

  // Función para guardar el muro permanentemente
  const saveAsDefaultWall = () => {
    if (image) {
      localStorage.setItem('ies_lucia_wall_image', image);
      setShowToast("¡Muro guardado como predeterminado!");
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const clearWall = () => {
    if (confirm("¿Estás seguro de que quieres borrar el muro guardado?")) {
      localStorage.removeItem('ies_lucia_wall_image');
      setImage(null);
      setItinerary(null);
      setShowToast("Muro eliminado");
      setTimeout(() => setShowToast(null), 3000);
    }
  };

  const [climberData, setClimberData] = useState({
    nombre: '',
    apellidos: '',
    curso: '1º ESO',
    grupo: '1',
    edad: '12'
  });
  const [loading, setLoading] = useState(false);
  const [showToast, setShowToast] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState('Iniciación');
  const [selectedGrade, setSelectedGrade] = useState('5');
  const [routeType, setRouteType] = useState<'vertical' | 'transversal'>('vertical');
  const [prompt, setPrompt] = useState('Usa presas variadas para una ruta equilibrada');
  const [itinerary, setItinerary] = useState<Itinerary | null>(null);
  const [history, setHistory] = useState<Itinerary[]>([]);
  const [completed, setCompleted] = useState<boolean | null>(null);
  const [borgScale, setBorgScale] = useState<number>(0);

  const borgEmojis: Record<number, string> = {
    0: '😌', 1: '😌', 2: '🙂', 3: '😊', 4: '😐', 
    5: '🤨', 6: '😟', 7: '😫', 8: '😫', 9: '🥵', 10: '💀'
  };

  const borgLabels: Record<number, string> = {
    0: 'Reposo',
    1: 'Muy, muy ligero',
    2: 'Muy ligero',
    3: 'Ligero',
    4: 'Algo pesado',
    5: 'Pesado',
    6: 'Más pesado',
    7: 'Muy pesado',
    8: 'Muy, muy pesado',
    9: 'Máximo',
    10: 'Extremo'
  };

  const difficultyMap: Record<string, string[]> = {
    'Trepada': ['1', '2', '3'],
    'Iniciación': ['4', '4+', '5', '5+', '6a'],
    'Intermedio': ['6a+', '6b', '6b+', '6c', '6c+', '7a'],
    'Alto': ['7a+', '7b', '7b+', '7c', '7c+'],
    'Muy alto': ['8a', '8a+', '8b', '8b+'],
    'Élite': ['8c', '8c+', '9a', '9a+']
  };

  const handleCategoryChange = (cat: string) => {
    setSelectedCategory(cat);
    setSelectedGrade(difficultyMap[cat][0]);
  };

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target?.result as string);
        setItinerary(null);
        setCompleted(null);
        setBorgScale(0);
      };
      reader.readAsDataURL(file);
    }
  };

  const [currentStep, setCurrentStep] = useState<number>(-1);
  const [isAnimating, setIsAnimating] = useState(false);
  const stopAnimationRef = useRef(false);

  const drawStickFigure = (ctx: CanvasRenderingContext2D, step: any, holds: Hold[], canvasWidth: number, canvasHeight: number) => {
    const getHoldPos = (id: string) => {
      const hold = holds.find(h => h.id === id);
      if (!hold) return null;
      return {
        x: (hold.x / 1000) * canvasWidth,
        y: (hold.y / 1000) * canvasHeight
      };
    };

    const lh = getHoldPos(step.leftHandHoldId);
    const rh = getHoldPos(step.rightHandHoldId);
    const lf = getHoldPos(step.leftFootHoldId);
    const rf = getHoldPos(step.rightFootHoldId);

    if (!lh || !rh || !lf || !rf) return;

    // Calculate body parts
    const handsCenter = { x: (lh.x + rh.x) / 2, y: (lh.y + rh.y) / 2 };
    const feetCenter = { x: (lf.x + rf.x) / 2, y: (lf.y + rf.y) / 2 };
    
    // Torso center (hips) - slightly dynamic based on feet
    const hips = { 
      x: feetCenter.x, 
      y: feetCenter.y - (canvasHeight * 0.05) 
    };
    
    // Shoulders - slightly dynamic based on hands
    const shoulders = {
      x: handsCenter.x,
      y: handsCenter.y + (canvasHeight * 0.04)
    };

    // Draw Shadow/Glow first
    ctx.shadowBlur = 20;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(4, canvasWidth / 200);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    
    // Draw Torso
    ctx.beginPath();
    ctx.moveTo(shoulders.x, shoulders.y);
    ctx.lineTo(hips.x, hips.y);
    ctx.stroke();

    // Draw Head
    ctx.beginPath();
    ctx.arc(shoulders.x, shoulders.y - (canvasHeight * 0.02), canvasHeight * 0.015, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.stroke();

    // Draw Arms (with elbows)
    const drawLimb = (start: {x: number, y: number}, end: {x: number, y: number}) => {
      const mid = {
        x: (start.x + end.x) / 2 + (Math.random() * 5 - 2.5),
        y: (start.y + end.y) / 2 + 10
      };
      ctx.beginPath();
      ctx.moveTo(start.x, start.y);
      ctx.quadraticCurveTo(mid.x, mid.y, end.x, end.y);
      ctx.stroke();
    };

    drawLimb(shoulders, lh);
    drawLimb(shoulders, rh);
    drawLimb(hips, lf);
    drawLimb(hips, rf);

    ctx.shadowBlur = 0;
  };

  const drawItinerary = () => {
    if (!canvasRef.current || !image) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0);

      if (itinerary) {
        // Draw all holds
        itinerary.holds.forEach((hold) => {
          const x = (hold.x / 1000) * canvas.width;
          const y = (hold.y / 1000) * canvas.height;
          
          ctx.beginPath();
          ctx.arc(x, y, 25, 0, 2 * Math.PI);
          ctx.lineWidth = 8;
          
          switch (hold.role) {
            case 'start': ctx.strokeStyle = '#22c55e'; break;
            case 'finish': ctx.strokeStyle = '#ef4444'; break;
            case 'hand': ctx.strokeStyle = '#3b82f6'; break;
            case 'foot': ctx.strokeStyle = '#eab308'; break;
          }
          ctx.stroke();
        });

        // Draw stick figure if step is active
        if (currentStep >= 0 && itinerary.beta[currentStep]) {
          drawStickFigure(ctx, itinerary.beta[currentStep], itinerary.holds, canvas.width, canvas.height);
        }
      }
    };
    img.src = image;
  };

  useEffect(() => {
    drawItinerary();
  }, [itinerary, image, currentStep]);

  const playAnimation = async () => {
    if (!itinerary || isAnimating) return;
    setIsAnimating(true);
    stopAnimationRef.current = false;
    for (let i = 0; i < itinerary.beta.length; i++) {
      if (stopAnimationRef.current) break;
      setCurrentStep(i);
      await new Promise(r => setTimeout(r, 1000));
    }
    setIsAnimating(false);
    if (!stopAnimationRef.current) {
      setCurrentStep(-1);
    }
  };

  const stopAnimation = () => {
    stopAnimationRef.current = true;
    setIsAnimating(false);
  };

  const resetAnimation = () => {
    stopAnimation();
    setCurrentStep(-1);
  };

  const handleGenerate = async () => {
    if (!image) return;
    setLoading(true);
    try {
      // Comprimimos la imagen antes de enviarla para evitar bloqueos por tamaño
      const compressedImage = await compressImage(image);
      
      const orientationText = routeType === 'vertical' ? 'vertical (de abajo a arriba)' : 'transversal (travesía de lado a lado)';
      const fullPrompt = `Diseña una ruta de grado ${selectedGrade} (${selectedCategory}) con un recorrido ${orientationText}. ${prompt}. 
      RECUERDA: 
      1. Máxima distancia entre pies 50cm y entre manos 70cm.
      2. Los pies deben estar siempre entre 40cm y 80cm por debajo de las manos.
      3. Usa entre 8-12 presas para rutas verticales (3.5m) y 12-18 para transversales (6.5m).
      4. NO USES los agujeros de los tornillos (pequeños círculos negros planos), solo presas de colores con volumen y sombras.`;
      
      const result = await analyzeWall(compressedImage, fullPrompt, wallWidth, wallHeight);
      setItinerary(result);
      setHistory(prev => [result, ...prev].slice(0, 5));
      setShowToast("¡Itinerario generado con éxito!");
      setTimeout(() => setShowToast(null), 3000);
    } catch (error: any) {
      console.error("Analysis failed:", error);
      let errorMsg = error.message || "Error desconocido al analizar la imagen.";
      
      if (error.message?.includes('API_KEY') || error.message?.includes('API key')) {
        errorMsg = `Error de API KEY: La clave no es válida o no tiene permisos. Verifica en Google AI Studio.\n\nError original: ${error.message}`;
      } else if (error.message?.includes('429')) {
        errorMsg = `Límite de cuota excedido. Por favor, espera un minuto.\n\nError original: ${error.message}`;
      }
      
      alert(`DETALLE DEL ERROR:\n${errorMsg}`);
    } finally {
      setLoading(false);
    }
  };

  // Función para comprimir la imagen y evitar que la IA se bloquee
  const compressImage = (base64Str: string): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = base64Str;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800; // Reducimos más para ganar velocidad máxima
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.7)); // Comprimimos al 70% de calidad
      };
      img.onerror = () => resolve(base64Str); // Si falla, enviamos la original
    });
  };

  const handleDownload = async () => {
    if (!itinerary || !canvasRef.current) return;
    const markedImage = canvasRef.current.toDataURL('image/png');
    await generateWordDocument(itinerary, markedImage, {
      ...climberData,
      completed,
      borgScale,
      borgLabel: borgLabels[borgScale],
      wallWidth,
      wallHeight
    });
  };

  return (
    <div className="min-h-screen bg-[#f5f5f0] text-[#1a1a1a] font-sans p-4 md:p-8">
      <div className="max-w-6xl mx-auto">
        <header className="mb-12 text-center">
          <motion.h1 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-5xl font-serif italic mb-2"
          >
            Boulder Itinerary Generator
          </motion.h1>
          <p className="text-[#5A5A40] uppercase tracking-widest text-sm font-semibold mb-2">
            Diseño de rutas asistido IES Lucía de Medrano • Escala: {wallWidth}m x {wallHeight}m
          </p>
          <p className="text-[#5A5A40]/60 text-xs font-medium italic">
            App creada por Jose Carlos Tejedor • v1.0.7-ULTRA-STABLE
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Controls Panel */}
          <div className="lg:col-span-1 space-y-6">
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-black/5">
              <h2 className="text-xl font-serif mb-4 flex items-center gap-2">
                <Info className="w-5 h-5" /> Configuración
              </h2>
              
              <div className="space-y-6">
                {/* Wall Image and Dimensions */}
                <div className="space-y-3">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5A5A40]">
                    Configuración del Muro
                  </label>
                  <div className="flex flex-col gap-2">
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full flex items-center justify-center gap-2 py-4 border-2 border-dashed border-[#5A5A40]/30 rounded-2xl hover:bg-[#5A5A40]/5 transition-colors"
                    >
                      <Upload className="w-5 h-5" />
                      {image ? 'Cambiar Imagen del Muro' : 'Subir Muro IES Lucía de Medrano'}
                    </button>
                    {image && (
                      <div className="flex gap-2">
                        <button 
                          onClick={saveAsDefaultWall}
                          className="flex-1 py-2 text-[10px] font-bold uppercase tracking-widest text-emerald-700 bg-emerald-50 rounded-xl border border-emerald-200 hover:bg-emerald-100 transition-colors"
                        >
                          Guardar Muro
                        </button>
                        <button 
                          onClick={clearWall}
                          className="p-2 text-red-700 bg-red-50 rounded-xl border border-red-200 hover:bg-red-100 transition-colors"
                          title="Borrar muro guardado"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImageUpload} 
                    className="hidden" 
                    accept="image/*"
                  />
                  
                  {!image?.includes('picsum') && (
                    <div className="grid grid-cols-2 gap-4 mt-2">
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-[#5A5A40]/60 mb-1">Ancho (m)</label>
                        <input 
                          type="number" 
                          value={wallWidth} 
                          onChange={(e) => setWallWidth(Number(e.target.value))}
                          className="w-full p-2 bg-[#f5f5f0] rounded-lg border-none text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold uppercase text-[#5A5A40]/60 mb-1">Alto (m)</label>
                        <input 
                          type="number" 
                          value={wallHeight} 
                          onChange={(e) => setWallHeight(Number(e.target.value))}
                          className="w-full p-2 bg-[#f5f5f0] rounded-lg border-none text-sm"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Climber Data */}
                <div className="space-y-4 pt-4 border-t border-black/5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5A5A40]">
                    Datos del Escalador
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <input 
                      type="text" 
                      placeholder="Nombre"
                      value={climberData.nombre}
                      onChange={(e) => setClimberData({...climberData, nombre: e.target.value})}
                      className="w-full p-3 bg-[#f5f5f0] rounded-xl border-none text-sm"
                    />
                    <input 
                      type="text" 
                      placeholder="Apellidos"
                      value={climberData.apellidos}
                      onChange={(e) => setClimberData({...climberData, apellidos: e.target.value})}
                      className="w-full p-3 bg-[#f5f5f0] rounded-xl border-none text-sm"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <select 
                      value={climberData.curso}
                      onChange={(e) => setClimberData({...climberData, curso: e.target.value})}
                      className="w-full p-3 bg-[#f5f5f0] rounded-xl border-none text-sm appearance-none"
                    >
                      {['1º ESO', '2º ESO', '3º ESO', '4º ESO', '1º BACH', 'FP'].map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <select 
                      value={climberData.grupo}
                      onChange={(e) => setClimberData({...climberData, grupo: e.target.value})}
                      className="w-full p-3 bg-[#f5f5f0] rounded-xl border-none text-sm appearance-none"
                    >
                      {[1, 2, 3, 4, 5, 6, 7].map(g => <option key={g} value={g}>{g}</option>)}
                    </select>
                    <select 
                      value={climberData.edad}
                      onChange={(e) => setClimberData({...climberData, edad: e.target.value})}
                      className="w-full p-3 bg-[#f5f5f0] rounded-xl border-none text-sm appearance-none"
                    >
                      {['12', '13', '14', '15', '16', '17', '18', '>18'].map(a => <option key={a} value={a}>{a}</option>)}
                    </select>
                  </div>
                </div>

                <div className="pt-4 border-t border-black/5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5A5A40] mb-2">
                    Nivel de Dificultad
                  </label>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    {Object.keys(difficultyMap).map((cat) => (
                      <button
                        key={cat}
                        onClick={() => handleCategoryChange(cat)}
                        className={`py-2 px-3 text-xs rounded-xl border transition-all ${
                          selectedCategory === cat 
                            ? 'bg-[#5A5A40] text-white border-[#5A5A40]' 
                            : 'bg-white text-[#5A5A40] border-[#5A5A40]/20 hover:border-[#5A5A40]/50'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  
                  <div className="flex flex-wrap gap-2 p-3 bg-[#f5f5f0] rounded-2xl border border-black/5">
                    {difficultyMap[selectedCategory].map((grade) => (
                      <button
                        key={grade}
                        onClick={() => setSelectedGrade(grade)}
                        className={`w-10 h-10 flex items-center justify-center rounded-full text-sm font-bold transition-all ${
                          selectedGrade === grade
                            ? 'bg-white text-[#5A5A40] shadow-md scale-110'
                            : 'text-[#5A5A40]/40 hover:text-[#5A5A40]'
                        }`}
                      >
                        {grade}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5A5A40] mb-2">
                    Orientación de la Ruta
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setRouteType('vertical')}
                      className={`flex-1 py-3 rounded-xl border font-bold text-xs transition-all ${
                        routeType === 'vertical'
                          ? 'bg-[#5A5A40] text-white border-[#5A5A40]'
                          : 'bg-white text-[#5A5A40] border-[#5A5A40]/20'
                      }`}
                    >
                      Vertical
                    </button>
                    <button
                      onClick={() => setRouteType('transversal')}
                      className={`flex-1 py-3 rounded-xl border font-bold text-xs transition-all ${
                        routeType === 'transversal'
                          ? 'bg-[#5A5A40] text-white border-[#5A5A40]'
                          : 'bg-white text-[#5A5A40] border-[#5A5A40]/20'
                      }`}
                    >
                      Transversal
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-[#5A5A40] mb-2">
                    Preferencias Adicionales
                  </label>
                  <textarea 
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    className="w-full p-4 bg-[#f5f5f0] rounded-2xl border-none focus:ring-2 focus:ring-[#5A5A40] min-h-[80px] text-sm"
                    placeholder="Ej: Solo presas rojas, inicio sentado..."
                  />
                </div>

                <button 
                  onClick={handleGenerate}
                  disabled={!image || loading}
                  className="w-full py-4 bg-[#5A5A40] text-white rounded-full font-semibold flex items-center justify-center gap-2 hover:bg-[#4a4a35] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg"
                >
                  {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Play className="w-5 h-5" />}
                  Generar Itinerario
                </button>
              </div>
            </div>

            {/* Safety Rules */}
            <div className="bg-white rounded-[32px] p-6 shadow-sm border border-black/5">
              <h2 className="text-lg font-serif mb-4 flex items-center gap-2 text-red-800">
                <Info className="w-5 h-5" /> Normas de Seguridad
              </h2>
              <ul className="text-xs space-y-2 text-[#5A5A40]/80 list-disc pl-4">
                <li>No escalar nunca solo.</li>
                <li>Mantener la zona de caída libre de objetos.</li>
                <li>No escalar por encima de la altura permitida.</li>
                <li>Revisar el estado de las presas antes de usarlas.</li>
                <li>Calentar adecuadamente antes de empezar.</li>
              </ul>
            </div>

            {/* History */}
            {history.length > 0 && (
              <div className="bg-white rounded-[32px] p-6 shadow-sm border border-black/5">
                <h2 className="text-lg font-serif mb-4 flex items-center gap-2">
                  <ChevronRight className="w-5 h-5" /> Historial Reciente
                </h2>
                <div className="space-y-3">
                  {history.map((item, idx) => (
                    <button
                      key={idx}
                      onClick={() => setItinerary(item)}
                      className="w-full text-left p-3 rounded-xl hover:bg-black/5 transition-colors border border-transparent hover:border-black/5"
                    >
                      <div className="text-sm font-bold">{item.name}</div>
                      <div className="text-[10px] text-[#5A5A40]/60 uppercase tracking-wider">{item.difficulty}</div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {itinerary && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="bg-white rounded-[32px] p-6 shadow-sm border border-black/5 space-y-6"
              >
                <div>
                  <h3 className="text-2xl font-serif mb-2">{itinerary.name}</h3>
                  <div className="inline-block px-3 py-1 bg-[#5A5A40]/10 text-[#5A5A40] rounded-full text-xs font-bold mb-4">
                    Grado: {itinerary.difficulty}
                  </div>
                  <p className="text-sm text-[#1a1a1a]/70 mb-6 leading-relaxed">
                    {itinerary.description}
                  </p>
                </div>
                
                <div className="flex gap-2">
                  {!isAnimating ? (
                    <button 
                      onClick={playAnimation}
                      className="flex-1 py-3 bg-[#5A5A40] text-white rounded-full font-semibold flex items-center justify-center gap-2 hover:bg-[#4a4a35] transition-all"
                    >
                      <Play className="w-4 h-4" />
                      Ver Solución
                    </button>
                  ) : (
                    <button 
                      onClick={stopAnimation}
                      className="flex-1 py-3 bg-red-800 text-white rounded-full font-semibold flex items-center justify-center gap-2 hover:bg-red-900 transition-all"
                    >
                      <Square className="w-4 h-4" />
                      Detener
                    </button>
                  )}
                  <button 
                    onClick={resetAnimation}
                    className="p-3 bg-black/5 text-[#5A5A40] rounded-full hover:bg-black/10 transition-all"
                    title="Reiniciar"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                </div>

                {itinerary.beta.length > 0 && (
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#5A5A40] mb-2">
                      Pasos de la Beta ({currentStep + 1}/{itinerary.beta.length})
                    </label>
                    <div className="flex items-center gap-2">
                      <button 
                        onClick={() => setCurrentStep(prev => Math.max(-1, prev - 1))}
                        className="p-2 rounded-full hover:bg-black/5"
                      >
                        <ChevronRight className="w-5 h-5 rotate-180" />
                      </button>
                      <div className="flex-1 h-2 bg-black/5 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-[#5A5A40] transition-all duration-300" 
                          style={{ width: `${((currentStep + 1) / itinerary.beta.length) * 100}%` }}
                        />
                      </div>
                      <button 
                        onClick={() => setCurrentStep(prev => Math.min(itinerary.beta.length - 1, prev + 1))}
                        className="p-2 rounded-full hover:bg-black/5"
                      >
                        <ChevronRight className="w-5 h-5" />
                      </button>
                    </div>
                    {currentStep >= 0 && (
                      <div className="mt-3 space-y-2">
                        <p className="text-xs italic text-[#5A5A40]">
                          {itinerary.beta[currentStep].description || "Posición del cuerpo"}
                        </p>
                        {currentStep > 0 && (
                          <div className="flex flex-col gap-1 p-3 bg-[#5A5A40]/5 rounded-xl border border-[#5A5A40]/10">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-[#5A5A40]/60">Análisis de Distancia</span>
                            <div className="text-xs text-[#5A5A40]">
                              {(() => {
                                const prev = itinerary.beta[currentStep - 1];
                                const curr = itinerary.beta[currentStep];
                                const moves = [];
                                
                                const getDist = (id1: string, id2: string) => {
                                  const h1 = itinerary.holds.find(h => h.id === id1);
                                  const h2 = itinerary.holds.find(h => h.id === id2);
                                  if (!h1 || !h2 || id1 === id2) return null;
                                  const dx = ((h2.x - h1.x) / 1000) * wallWidth;
                                  const dy = ((h2.y - h1.y) / 1000) * wallHeight;
                                  return Math.sqrt(dx * dx + dy * dy);
                                };

                                const lh = getDist(prev.leftHandHoldId, curr.leftHandHoldId);
                                const rh = getDist(prev.rightHandHoldId, curr.rightHandHoldId);
                                const lf = getDist(prev.leftFootHoldId, curr.leftFootHoldId);
                                const rf = getDist(prev.rightFootHoldId, curr.rightFootHoldId);

                                if (lh) moves.push(`MI: ${lh.toFixed(2)}m`);
                                if (rh) moves.push(`MD: ${rh.toFixed(2)}m`);
                                if (lf) moves.push(`PI: ${lf.toFixed(2)}m`);
                                if (rf) moves.push(`PD: ${rf.toFixed(2)}m`);

                                return moves.length > 0 ? moves.join(' • ') : 'Cambio de equilibrio';
                              })()}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Post-Climb Feedback */}
                <div className="pt-6 border-t border-black/5 space-y-6">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#5A5A40] mb-3">
                      ¿Has sido capaz de realizar la vía diseñada?
                    </label>
                    <div className="flex gap-2">
                      <button 
                        onClick={() => setCompleted(true)}
                        className={`flex-1 py-2 rounded-xl border text-sm font-bold transition-all ${
                          completed === true ? 'bg-green-500 text-white border-green-500' : 'bg-white text-[#5A5A40] border-black/10'
                        }`}
                      >
                        SÍ
                      </button>
                      <button 
                        onClick={() => setCompleted(false)}
                        className={`flex-1 py-2 rounded-xl border text-sm font-bold transition-all ${
                          completed === false ? 'bg-red-500 text-white border-red-500' : 'bg-white text-[#5A5A40] border-black/10'
                        }`}
                      >
                        NO
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-[#5A5A40] mb-3">
                      Mi sensación según la escala de Borg:
                    </label>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between px-2">
                        <div className="flex items-center gap-2">
                          <span className="text-3xl">{borgEmojis[borgScale]}</span>
                          <span className="text-2xl font-bold text-[#5A5A40]">{borgScale}</span>
                        </div>
                        <span className="text-sm font-medium text-[#5A5A40]/70 italic">{borgLabels[borgScale]}</span>
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="10" 
                        step="1"
                        value={borgScale}
                        onChange={(e) => setBorgScale(Number(e.target.value))}
                        className="w-full h-2 bg-gradient-to-r from-blue-500 via-green-500 via-yellow-500 to-red-500 rounded-lg appearance-none cursor-pointer"
                      />
                      <div className="grid grid-cols-11 text-[8px] text-[#5A5A40]/40 font-bold">
                        {[0,1,2,3,4,5,6,7,8,9,10].map(n => <span key={n} className="text-center">{n}</span>)}
                      </div>
                    </div>
                  </div>
                </div>
                
                <button 
                  onClick={handleDownload}
                  className="w-full py-4 bg-[#5A5A40] text-white rounded-full font-semibold flex items-center justify-center gap-2 hover:bg-[#4a4a35] transition-all shadow-lg"
                >
                  <Download className="w-5 h-5" />
                  Descargar Informe Word
                </button>
              </motion.div>
            )}
          </div>

          {/* Preview Area */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-[40px] p-4 shadow-xl border border-black/5 min-h-[500px] flex items-center justify-center relative overflow-hidden">
              {!image && (
                <div className="text-center text-[#5A5A40]/40">
                  <Upload className="w-16 h-16 mx-auto mb-4 opacity-20" />
                  <p className="font-serif italic text-xl">Sube una foto de tu muro para empezar</p>
                </div>
              )}
              
              <div className={`w-full h-full ${!image ? 'hidden' : 'block'}`}>
                <canvas 
                  ref={canvasRef} 
                  className="w-full h-auto rounded-[32px] shadow-inner"
                />
              </div>

              {loading && (
                <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center z-10">
                  <Loader2 className="w-12 h-12 text-[#5A5A40] animate-spin mb-4" />
                  <p className="font-serif italic text-lg animate-pulse">Analizando presas y trazando ruta...</p>
                </div>
              )}
            </div>

            {/* Legend */}
            {itinerary && (
              <div className="mt-6 flex flex-wrap gap-4 justify-center">
                <LegendItem color="#22c55e" label="Inicio" />
                <LegendItem color="#3b82f6" label="Manos" />
                <LegendItem color="#eab308" label="Pies" />
                <LegendItem color="#ef4444" label="Final" />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      <AnimatePresence>
        {showToast && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#1a1a1a] text-white px-6 py-3 rounded-full shadow-2xl z-50 text-sm font-medium"
          >
            {showToast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-black/5">
      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-xs font-bold uppercase tracking-wider text-[#5A5A40]">{label}</span>
    </div>
  );
}
