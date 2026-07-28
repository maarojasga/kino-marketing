/**
 * Análisis del manual de marca (PDF):
 * extrae un perfil de marca en texto que la skill inyecta en cada generación.
 * Usa Claude si está configurado; si no, Gemini (modelo de texto).
 */
import Anthropic from "@anthropic-ai/sdk";
import { claudeAvailable } from "./claude.js";

const EXTRACTION_PROMPT = `Analiza este manual de marca y extrae un PERFIL DE MARCA compacto en español con:
- Nombre de la marca y a qué se dedica (si aparece)
- Paleta de colores: códigos exactos (hex/RGB/Pantone) si aparecen; si no, descríbelos con precisión
- Tipografías y su uso
- Descripción del logotipo y sus variantes permitidas
- Estilo visual general y tono de comunicación
- Reglas importantes (usos incorrectos, márgenes, fondos permitidos)

Responde SOLO con el perfil, en viñetas concisas, sin preámbulos. Máximo 300 palabras.`;

function parsePdfDataUrl(dataUrl) {
  const match = /^data:application\/pdf;base64,(.+)$/s.exec(dataUrl);
  if (!match) throw new Error("El manual de marca debe ser un PDF.");
  return match[1];
}

async function extractWithClaude(pdfBase64) {
  const client = new Anthropic();
  const response = await client.messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    output_config: { effort: "low" },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: { type: "base64", media_type: "application/pdf", data: pdfBase64 },
          },
          { type: "text", text: EXTRACTION_PROMPT },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude declinó analizar este documento.");
  }
  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
  if (!text) throw new Error("No se pudo extraer el perfil de marca.");
  return text;
}

async function extractWithGemini(pdfBase64) {
  const model = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": process.env.GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { inline_data: { mime_type: "application/pdf", data: pdfBase64 } },
              { text: EXTRACTION_PROMPT },
            ],
          },
        ],
      }),
    }
  );
  if (!res.ok) {
    throw new Error(`Gemini no pudo analizar el PDF (${res.status}).`);
  }
  const data = await res.json();
  const text = (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("\n")
    .trim();
  if (!text) throw new Error("No se pudo extraer el perfil de marca.");
  return text;
}

export async function extractBrandProfile(pdfDataUrl) {
  const pdfBase64 = parsePdfDataUrl(pdfDataUrl);
  if (claudeAvailable()) {
    try {
      return await extractWithClaude(pdfBase64);
    } catch (err) {
      console.warn("Claude falló analizando el manual, se intenta con Gemini:", err.message);
    }
  }
  if (process.env.GEMINI_API_KEY) {
    return extractWithGemini(pdfBase64);
  }
  throw new Error(
    "Se necesita ANTHROPIC_API_KEY o GEMINI_API_KEY configurada para analizar el manual de marca."
  );
}
