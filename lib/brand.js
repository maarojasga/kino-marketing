/**
 * Análisis del manual de marca (PDF) con Gemini:
 * extrae un perfil de marca en texto que la skill usa en cada generación.
 */
import { geminiAvailable, extractBrandProfilePdf } from "./gemini.js";

function parsePdfDataUrl(dataUrl) {
  const match = /^data:application\/pdf;base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new Error("El manual de marca debe ser un PDF.");
  return match[1];
}

export async function extractBrandProfile(pdfDataUrl) {
  if (!geminiAvailable()) {
    throw new Error("Se necesita GEMINI_API_KEY configurada para analizar el manual de marca.");
  }
  return extractBrandProfilePdf(parsePdfDataUrl(pdfDataUrl));
}
