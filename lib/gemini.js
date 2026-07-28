const GEMINI_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-2.5-flash-image";
const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const VALID_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "2:3", "3:2", "5:4", "4:5", "21:9"];

/**
 * Convierte un data URL ("data:image/png;base64,....") en la parte
 * inline_data que espera la API de Gemini.
 */
function dataUrlToPart(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) {
    throw new Error("Imagen de referencia inválida: se espera un data URL base64.");
  }
  return { inline_data: { mime_type: match[1], data: match[2] } };
}

async function generateOne({ prompt, referenceImages, aspectRatio }) {
  const parts = [];

  for (const ref of referenceImages) {
    parts.push(dataUrlToPart(ref));
  }

  const instruction = referenceImages.length
    ? `Usa las imágenes anteriores como referencia de estilo, identidad visual, colores y composición. Genera una nueva imagen de contenido siguiendo esa línea visual.\n\nSolicitud: ${prompt}`
    : prompt;
  parts.push({ text: instruction });

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  };
  if (VALID_ASPECT_RATIOS.includes(aspectRatio)) {
    body.generationConfig.imageConfig = { aspectRatio };
  }

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": process.env.GEMINI_API_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    let message = `Error de la API de Gemini (${res.status})`;
    try {
      const parsed = JSON.parse(text);
      if (parsed?.error?.message) message = `Gemini: ${parsed.error.message}`;
    } catch {
      // se mantiene el mensaje genérico
    }
    throw new Error(message);
  }

  const data = await res.json();
  const outParts = data?.candidates?.[0]?.content?.parts || [];
  const images = [];
  for (const part of outParts) {
    const inline = part.inlineData || part.inline_data;
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || "image/png";
      images.push(`data:${mime};base64,${inline.data}`);
    }
  }
  return images;
}

/**
 * Genera `count` imágenes en paralelo. Cada llamada produce normalmente
 * una imagen; se lanzan `count` solicitudes simultáneas.
 */
export async function generateImages({ prompt, referenceImages = [], count = 1, aspectRatio = "1:1" }) {
  const attempts = Array.from({ length: count }, () =>
    generateOne({ prompt, referenceImages, aspectRatio })
  );
  const settled = await Promise.allSettled(attempts);

  const images = settled
    .filter((r) => r.status === "fulfilled")
    .flatMap((r) => r.value);

  if (images.length === 0) {
    const firstError = settled.find((r) => r.status === "rejected");
    if (firstError) throw firstError.reason;
  }
  return images;
}
