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
 * Ejecuta la skill de marketing con Claude: analiza referencias + perfil de
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
}) {
  const content = [];

  for (const ref of referenceImages.slice(0, 6)) {
    const block = dataUrlToImageBlock(ref);
    if (block) content.push(block);
  }

  const numPrompts = tipo === "carrusel" ? numSlides : 1;

  const lineas = [
    `TEMA: ${tema}`,
    `TIPO: ${tipo === "carrusel" ? `carrusel de ${numSlides} slides` : "imagen suelta"}`,
    `FORMATO (aspect ratio): ${aspectRatio}`,
    `MODO: ${modo === "control" ? "CONTROL (usa exactamente los textos indicados)" : "GENERAL (tú decides los textos)"}`,
    `Imágenes de referencia adjuntas: ${content.length > 0 ? "sí" : "no"}`,
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
  content.push({ type: "text", text: lineas.join("\n") });

  const response = await getClient().messages.create({
    model: "claude-opus-5",
    max_tokens: 4096,
    output_config: {
      effort: "low",
      format: {
        type: "json_schema",
        schema: {
          type: "object",
          properties: {
            prompts: {
              type: "array",
              items: { type: "string" },
              description: "Un prompt de generación de imagen por cada imagen/slide solicitada, en orden.",
            },
          },
          required: ["prompts"],
          additionalProperties: false,
        },
      },
    },
    system: SKILL.instrucciones,
    messages: [{ role: "user", content }],
  });

  if (response.stop_reason === "refusal") {
    throw new Error("Claude declinó procesar esta solicitud.");
  }

  const text = response.content.find((b) => b.type === "text")?.text || "";
  const parsed = JSON.parse(text);
  const prompts = (parsed.prompts || []).filter((p) => typeof p === "string" && p.trim());
  if (prompts.length === 0) throw new Error("Claude no devolvió prompts.");

  // Ajustar la cantidad exacta
  while (prompts.length < numPrompts) prompts.push(prompts[prompts.length - 1]);
  return prompts.slice(0, numPrompts);
}
