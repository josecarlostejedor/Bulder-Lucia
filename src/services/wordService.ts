import { Document, Packer, Paragraph, TextRun, ImageRun, HeadingLevel, AlignmentType } from "docx";
import { saveAs } from "file-saver";
import { Itinerary } from "./geminiService";

export async function generateWordDocument(
  itinerary: Itinerary, 
  markedImageBase64: string,
  extraData: {
    nombre: string;
    apellidos: string;
    curso: string;
    grupo: string;
    edad: string;
    completed: boolean | null;
    borgScale: number;
    borgLabel: string;
    wallWidth: number;
    wallHeight: number;
  }
) {
  // Remove the data:image/png;base64, prefix
  const imageBuffer = Uint8Array.from(atob(markedImageBase64.split(',')[1]), c => c.charCodeAt(0));

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          new Paragraph({
            text: "Informe de Itinerario de Boulder",
            heading: HeadingLevel.TITLE,
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: "IES Lucía de Medrano",
            heading: HeadingLevel.HEADING_2,
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 },
          }),
          new Paragraph({
            text: "App creada por José Carlos Tejedor",
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          
          new Paragraph({
            text: "________________________________________________________________________________",
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),

          new Paragraph({
            text: "DATOS DEL ESCALADOR",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 200 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Nombre y Apellidos: ", bold: true }),
              new TextRun(`${extraData.nombre} ${extraData.apellidos}`),
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Curso: ", bold: true }),
              new TextRun(extraData.curso),
              new TextRun({ text: " | Grupo: ", bold: true }),
              new TextRun(extraData.grupo),
              new TextRun({ text: " | Edad: ", bold: true }),
              new TextRun(extraData.edad),
            ]
          }),

          new Paragraph({
            text: "Detalles del Itinerario",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Nombre de la vía: `, bold: true }),
              new TextRun(itinerary.name),
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Dificultad: `, bold: true }),
              new TextRun(itinerary.difficulty),
              new TextRun({ text: ` | Dimensiones: `, bold: true }),
              new TextRun(`${extraData.wallWidth}m x ${extraData.wallHeight}m`),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun({ text: `Descripción: `, bold: true }),
              new TextRun(itinerary.description),
            ],
          }),

          new Paragraph({
            text: "Resultado de la Sesión",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "¿Completada?: ", bold: true }),
              new TextRun(extraData.completed === null ? "No registrado" : (extraData.completed ? "SÍ" : "NO")),
            ]
          }),
          new Paragraph({
            children: [
              new TextRun({ text: "Percepción del esfuerzo (Borg): ", bold: true }),
              new TextRun(`${extraData.borgScale} - ${extraData.borgLabel}`),
            ]
          }),

          new Paragraph({
            text: "Mapa de la Ruta",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400 },
          }),
          new Paragraph({
            children: [
              new ImageRun({
                data: imageBuffer,
                transformation: {
                  width: 500,
                  height: 350,
                },
              } as any),
            ],
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: "Secuencia de Movimientos (Beta)",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400 },
          }),
          ...itinerary.beta.map((step, index) => {
            let distanceInfo = "";
            if (index > 0) {
              const prev = itinerary.beta[index - 1];
              const getDist = (id1: string, id2: string) => {
                const h1 = itinerary.holds.find(h => h.id === id1);
                const h2 = itinerary.holds.find(h => h.id === id2);
                if (!h1 || !h2 || id1 === id2) return null;
                const dx = ((h2.x - h1.x) / 1000) * extraData.wallWidth;
                const dy = ((h2.y - h1.y) / 1000) * extraData.wallHeight;
                return Math.sqrt(dx * dx + dy * dy);
              };
              const moves = [];
              const lh = getDist(prev.leftHandHoldId, step.leftHandHoldId);
              const rh = getDist(prev.rightHandHoldId, step.rightHandHoldId);
              const lf = getDist(prev.leftFootHoldId, step.leftFootHoldId);
              const rf = getDist(prev.rightFootHoldId, step.rightFootHoldId);
              if (lh) moves.push(`MI: ${lh.toFixed(2)}m`);
              if (rh) moves.push(`MD: ${rh.toFixed(2)}m`);
              if (lf) moves.push(`PI: ${lf.toFixed(2)}m`);
              if (rf) moves.push(`PD: ${rf.toFixed(2)}m`);
              distanceInfo = moves.length > 0 ? ` (${moves.join(', ')})` : "";
            }

            return new Paragraph({
              children: [
                new TextRun({
                  text: `Paso ${index + 1}: `,
                  bold: true,
                }),
                new TextRun(step.description || "Movimiento"),
                new TextRun({
                  text: distanceInfo,
                  italics: true,
                  color: "666666",
                }),
              ],
              bullet: { level: 0 },
            });
          }),
          new Paragraph({
            text: "Detalle de Presas",
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 400 },
          }),
          ...itinerary.holds.map((hold, index) => 
            new Paragraph({
              children: [
                new TextRun({
                  text: `${index + 1}. [${hold.role.toUpperCase()}] `,
                  bold: true,
                }),
                new TextRun(`${hold.color} ${hold.type}`),
              ],
              bullet: { level: 0 },
            })
          ),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${itinerary.name.replace(/\s+/g, '_')}_itinerario.docx`);
}
