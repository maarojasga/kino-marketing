import Anthropic from "@anthropic-ai/sdk";

let client = null;

export function claudeAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

const SYSTEM_PROMPT = `Eres un experto en dirección de arte y prompts para modelos de generación de imágenes de marketing.

Recibirás imágenes de ejemplo (referencias de estilo y marca) y una solicitud breve del usuario. Tu tarea:
1. Analiza las referencias: paleta de colores, iluminación, composición, tipografía si aparece, estética general y tono de marca.
2. Reescribe la solicitud como un prompt detallado para un modelo de generación de imágenes, incorporando la estética observada.
3. Conserva fielmente la intención del usuario; no inventes textos ni logotipos que no se pidan.

Responde ÚNICAMENTE con el prompt final, sin explicaciones ni preámbulos.`;

function dataUrlToImageBlock(dataUrl) {
  const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/s.exec(dataUrl);
  if (!match) return null;
  const supported = ["image/jpeg", "image/png", "image/gif", "image/webp"];
  if (!supported.includes(match[1])) return null;
  return {
    type: "image",
    source: { type: "base64", media_type: match[1], data: match[2] },
  };
}

/**
 * Usa Claude para analizar las imágenes de referencia y convertir la
 * solicitud del usuario en un prompt de generación detallado.
 */
export async function enhancePrompt(userPrompt, referenceImages = []) {
  const content = [];

  for (const ref of referenceImages.slice(0, 6)) {
    const block = dataUrlToImageBlock(ref);
    if (block) content.push(block);
  }

  content.push({
    type: "text",
    text: `Solicitud del usuario: ${userPrompt}`,
  });

  const response = await getClient().messages.create({
    model: "claude-opus-5",
    max_tokens: 1024,
    output_config: { effort: "low" },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude declinó procesar esta solicitud.");
  }

  const text = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) throw new Error("Claude no devolvió un prompt.");
  return text;
}
