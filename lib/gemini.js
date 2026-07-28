import { SKILL } from "./skill.js";
import { envolverPrompt, lineaReferencias } from "./identidadVisual.js";

// Gemini 3 Pro Image ("Nano Banana Pro"): mejor calidad, mejor renderizado de
// texto y hasta 14 imágenes de referencia. Configurable por si se prefiere
// gemini-3.1-flash-image-preview (más rápido/barato) u otro modelo.
const IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image-preview";
const TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || "gemini-2.5-flash";
const IMAGE_SIZE = process.env.GEMINI_IMAGE_SIZE || "2K"; // "1K" | "2K" | "4K"
const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const API_URL = `${API_BASE}/${IMAGE_MODEL}:generateContent`;

const VALID_ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "2:3", "3:2", "5:4", "4:5", "21:9"];
const VALID_IMAGE_SIZES = ["1K", "2K", "4K"];

export function geminiAvailable() {
  return Boolean(process.env.GEMINI_API_KEY);
}

function warn(...args) {
  console.warn("[Kino/gemini]", ...args);
}

async function callGemini(model, body) {
  const res = await fetch(`${API_BASE}/${model}:generateContent`, {
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
    warn(`${model} respondió ${res.status}: ${message}`);
    throw new Error(message);
  }
  return res.json();
}

/** Config de imagen (aspect ratio + resolución) para generateContent. */
function buildImageConfig(aspectRatio) {
  const config = {};
  if (VALID_ASPECT_RATIOS.includes(aspectRatio)) config.aspectRatio = aspectRatio;
  if (VALID_IMAGE_SIZES.includes(IMAGE_SIZE)) config.imageSize = IMAGE_SIZE;
  return Object.keys(config).length > 0 ? config : null;
}

function textFromResponse(data) {
  return (data?.candidates?.[0]?.content?.parts || [])
    .map((p) => p.text || "")
    .join("\n")
    .trim();
}

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

  const instruction = envolverPrompt(prompt, referenceImages.length);
  parts.push({ text: instruction });

  const body = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseModalities: ["IMAGE", "TEXT"],
    },
  };
  const imageConfig = buildImageConfig(aspectRatio);
  if (imageConfig) body.generationConfig.imageConfig = imageConfig;

  const data = await callGemini(IMAGE_MODEL, body);
  const outParts = data?.candidates?.[0]?.content?.parts || [];
  const images = [];
  for (const part of outParts) {
    const inline = part.inlineData || part.inline_data;
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || "image/png";
      images.push(`data:${mime};base64,${inline.data}`);
    }
  }

  // La API respondió 200 pero sin ninguna imagen: esto NO lanza error, así
  // que sin este log quedaría completamente silencioso. Casos típicos:
  // bloqueo de seguridad, el modelo solo devolvió texto, o se cortó por
  // límite de tokens.
  if (images.length === 0) {
    const blockReason = data?.promptFeedback?.blockReason;
    const finishReason = data?.candidates?.[0]?.finishReason;
    const textOut = textFromResponse(data);
    warn(
      `${IMAGE_MODEL} respondió sin imagen.`,
      blockReason ? `blockReason=${blockReason}` : "",
      finishReason ? `finishReason=${finishReason}` : "",
      textOut ? `texto devuelto: "${textOut.slice(0, 300)}"` : "(sin texto ni imagen en la respuesta)"
    );
  }

  return images;
}

/**
 * Genera `count` imágenes en paralelo con el mismo prompt. Cada llamada
 * produce normalmente una imagen; se lanzan `count` solicitudes simultáneas.
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

// ============ Skill: construcción de prompts (modelo de texto) ============

/**
 * Ejecuta la skill de marketing con Gemini: analiza referencias + perfil de
 * marca y devuelve un array de prompts de generación (1 para imagen suelta,
 * N para carrusel).
 */
export async function buildPrompts({
  tema,
  tipo = "imagen",
  numSlides = 3,
  aspectRatio = "1:1",
  referenceImages = [],
  brandProfile = null,
  modo = "general",
  items = [],
  onProgress = () => {},
}) {
  onProgress("Kino está diseñando el contenido…");
  const parts = [];

  for (const ref of referenceImages.slice(0, 10)) {
    parts.push(dataUrlToPart(ref));
  }

  const numPrompts = tipo === "carrusel" ? numSlides : 1;

  const lineas = [
    SKILL.instrucciones,
    "",
    `TEMA: ${tema}`,
    `TIPO: ${tipo === "carrusel" ? `carrusel de ${numSlides} slides` : "imagen suelta"}`,
    `FORMATO (aspect ratio): ${aspectRatio}`,
    `MODO: ${modo === "control" ? "CONTROL (usa exactamente los textos indicados)" : "GENERAL (tú decides los textos)"}`,
    `Imágenes de referencia adjuntas: ${lineaReferencias(parts.length)}`,
  ];

  if (brandProfile) {
    lineas.push(`PERFIL DE MARCA (respétalo estrictamente):\n${brandProfile}`);
  }

  if (modo === "control" && items.length > 0) {
    lineas.push("ESPECIFICACIONES POR IMAGEN:");
    items.slice(0, numPrompts).forEach((item, i) => {
      lineas.push(
        `- Imagen ${i + 1}: texto exacto: ${item.texto ? `"${item.texto}"` : "(sin texto)"}${
          item.descripcion ? ` · mostrar: ${item.descripcion}` : ""
        }`
      );
    });
  }

  lineas.push(`\nDevuelve exactamente ${numPrompts} prompt(s) en el campo "prompts".`);
  parts.push({ text: lineas.join("\n") });

  const data = await callGemini(TEXT_MODEL, {
    contents: [{ role: "user", parts }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: {
        type: "OBJECT",
        properties: {
          prompts: {
            type: "ARRAY",
            items: { type: "STRING" },
            description: "Un prompt de generación de imagen por cada imagen/slide solicitada, en orden.",
          },
        },
        required: ["prompts"],
      },
    },
  });

  const parsed = JSON.parse(textFromResponse(data));
  const prompts = (parsed.prompts || []).filter((p) => typeof p === "string" && p.trim());
  if (prompts.length === 0) throw new Error("Gemini no devolvió prompts.");

  // Ajustar la cantidad exacta
  while (prompts.length < numPrompts) prompts.push(prompts[prompts.length - 1]);
  return prompts.slice(0, numPrompts);
}

// ============ Manual de marca (PDF → perfil) ============

const EXTRACTION_PROMPT = `Analiza este manual de marca y extrae un PERFIL DE MARCA compacto en español con:
- Nombre de la marca y a qué se dedica (si aparece)
- Paleta de colores: códigos exactos (hex/RGB/Pantone) si aparecen; si no, descríbelos con precisión
- Tipografías y su uso
- Descripción del logotipo y sus variantes permitidas
- Estilo visual general y tono de comunicación
- Reglas importantes (usos incorrectos, márgenes, fondos permitidos)

Responde SOLO con el perfil, en viñetas concisas, sin preámbulos. Máximo 300 palabras.`;

/** Analiza el manual de marca (PDF en base64) y devuelve el perfil en texto. */
export async function extractBrandProfilePdf(pdfBase64) {
  const buffer = Buffer.from(pdfBase64, "base64");

  // PDFs pequeños van embebidos; los grandes se suben vía Files API
  // (las peticiones con datos embebidos están limitadas a ~20 MB).
  let pdfPart;
  let uploadedName = null;
  if (buffer.length > INLINE_PDF_LIMIT) {
    const file = await uploadPdfToGemini(buffer);
    uploadedName = file.name;
    pdfPart = { file_data: { mime_type: "application/pdf", file_uri: file.uri } };
  } else {
    pdfPart = { inline_data: { mime_type: "application/pdf", data: pdfBase64 } };
  }

  try {
    const data = await callGemini(TEXT_MODEL, {
      contents: [{ role: "user", parts: [pdfPart, { text: EXTRACTION_PROMPT }] }],
    });
    const text = textFromResponse(data);
    if (!text) throw new Error("No se pudo extraer el perfil de marca.");
    return text;
  } finally {
    if (uploadedName) deleteGeminiFile(uploadedName);
  }
}

// ============ Files API de Gemini (PDFs grandes) ============

const INLINE_PDF_LIMIT = 15 * 1024 * 1024; // sobre este tamaño se usa la Files API

/** Sube un PDF a la Files API de Gemini y espera a que esté listo. */
async function uploadPdfToGemini(buffer) {
  const startRes = await fetch("https://generativelanguage.googleapis.com/upload/v1beta/files", {
    method: "POST",
    headers: {
      "x-goog-api-key": process.env.GEMINI_API_KEY,
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(buffer.length),
      "X-Goog-Upload-Header-Content-Type": "application/pdf",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: "manual-de-marca.pdf" } }),
  });
  const uploadUrl = startRes.headers.get("x-goog-upload-url");
  if (!startRes.ok || !uploadUrl) {
    throw new Error(`No se pudo iniciar la subida del PDF a Gemini (${startRes.status}).`);
  }

  const upRes = await fetch(uploadUrl, {
    method: "POST",
    headers: {
      "X-Goog-Upload-Command": "upload, finalize",
      "X-Goog-Upload-Offset": "0",
    },
    body: buffer,
  });
  if (!upRes.ok) {
    throw new Error(`Falló la subida del PDF a Gemini (${upRes.status}).`);
  }
  let { file } = await upRes.json();

  // Los PDFs pueden quedar en PROCESSING unos segundos
  const deadline = Date.now() + 120_000;
  while (file?.state === "PROCESSING" && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 2000));
    const poll = await fetch(`https://generativelanguage.googleapis.com/v1beta/${file.name}`, {
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY },
    });
    if (poll.ok) file = await poll.json();
  }
  if (file?.state !== "ACTIVE") {
    throw new Error("Gemini no terminó de procesar el PDF. Inténtalo de nuevo.");
  }
  return file;
}

async function deleteGeminiFile(name) {
  try {
    await fetch(`https://generativelanguage.googleapis.com/v1beta/${name}`, {
      method: "DELETE",
      headers: { "x-goog-api-key": process.env.GEMINI_API_KEY },
    });
  } catch {
    // limpieza best-effort; los archivos expiran solos a las 48 h
  }
}

// ============ Primitivas para la skill correctora de ortografía ============

/**
 * Edita una imagen existente con una instrucción (misma llamada del modelo
 * de imagen, usando la imagen como base). Devuelve la imagen editada o null.
 */
export async function editImage({ imageDataUrl, instruction, aspectRatio = "1:1" }) {
  const body = {
    contents: [
      { role: "user", parts: [dataUrlToPart(imageDataUrl), { text: instruction }] },
    ],
    generationConfig: { responseModalities: ["IMAGE", "TEXT"] },
  };
  const imageConfig = buildImageConfig(aspectRatio);
  if (imageConfig) body.generationConfig.imageConfig = imageConfig;
  const data = await callGemini(IMAGE_MODEL, body);
  for (const part of data?.candidates?.[0]?.content?.parts || []) {
    const inline = part.inlineData || part.inline_data;
    if (inline?.data) {
      const mime = inline.mimeType || inline.mime_type || "image/png";
      return `data:${mime};base64,${inline.data}`;
    }
  }
  warn(`${IMAGE_MODEL} (edición) respondió sin imagen; se conserva la versión anterior.`);
  return null;
}

/**
 * Revisión ESTRICTA de ortografía: transcribe todo el texto visible y lo
 * verifica en su idioma (español o inglés). Devuelve errores con corrección.
 * Nunca lanza: si el chequeo falla, no bloquea la generación.
 */
export async function strictSpellCheck(imageDataUrl, expectedText = null) {
  const prompt = [
    "Eres un corrector ortográfico profesional. Analiza esta imagen de marketing.",
    "PASO 1 — TRANSCRIBE: lista CADA texto visible en la imagen, letra por letra, exactamente como aparece (incluye titulares, botones, cifras y textos pequeños).",
    "PASO 2 — VERIFICA cada texto transcrito: detecta su idioma (español o inglés) y revisa ortografía, tildes, gramática, letras cambiadas, repetidas o faltantes, y palabras deformadas — errores típicos de imágenes generadas por IA (ej.: \"Inscrébte\" en vez de \"Inscríbete\", \"Regsitrate\" en vez de \"Regístrate\").",
    expectedText
      ? `PASO 3 — El texto principal debía decir EXACTAMENTE: "${expectedText}". Verifica que aparece tal cual, carácter por carácter.`
      : "",
    "Sé ESTRICTO: si una palabra es dudosa o está deformada, márcala como error.",
    'Responde en el JSON pedido: "ok" true SOLO si absolutamente todo el texto es correcto. En "errores", por cada problema indica "visto" (el texto tal como aparece) y "correccion" (cómo debería escribirse). Si la imagen no tiene texto, ok=true.',
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const data = await callGemini(TEXT_MODEL, {
      contents: [
        { role: "user", parts: [dataUrlToPart(imageDataUrl), { text: prompt }] },
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            ok: { type: "BOOLEAN" },
            errores: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  visto: { type: "STRING" },
                  correccion: { type: "STRING" },
                },
                required: ["visto", "correccion"],
              },
            },
          },
          required: ["ok", "errores"],
        },
      },
    });
    const parsed = JSON.parse(textFromResponse(data));
    return { verificada: true, ok: Boolean(parsed.ok), errores: parsed.errores || [] };
  } catch (err) {
    console.warn("Verificación de ortografía falló (no bloquea):", err.message);
    return { verificada: false, ok: true, errores: [] };
  }
}
