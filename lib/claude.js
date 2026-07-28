import Anthropic from "@anthropic-ai/sdk";
import { SKILL } from "./skill.js";

let client = null;

export function claudeAvailable() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

function getClient() {
  if (!client) client = new Anthropic();
  return client;
}

// La experiencia de marketing vive en la skill, no aquí.
const SYSTEM_PROMPT = SKILL.instrucciones;

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
 * Aplica la skill de marketing: analiza las imágenes de referencia y
 * convierte el TEMA del usuario en un prompt de generación completo.
 */
export async function enhancePrompt(tema, referenceImages = [], { aspectRatio = "1:1" } = {}) {
  const content = [];

  for (const ref of referenceImages.slice(0, 6)) {
    const block = dataUrlToImageBlock(ref);
    if (block) content.push(block);
  }

  content.push({
    type: "text",
    text: `TEMA: ${tema}\nFormato de la imagen (aspect ratio): ${aspectRatio}\nImágenes de referencia adjuntas: ${content.length > 0 ? "sí" : "no"}`,
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
