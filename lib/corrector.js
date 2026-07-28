/**
 * SKILL CORRECTORA: revisión y corrección de ortografía en imágenes.
 *
 * Cada imagen generada pasa por este ciclo:
 *   1. REVISAR — transcribe todo el texto visible y lo verifica estrictamente
 *      en su idioma (español o inglés), buscando errores típicos de IA
 *      ("Inscrébte" → "Inscríbete").
 *   2. CORREGIR — si hay errores, EDITA la imagen (no la regenera): se pide al
 *      modelo corregir únicamente los textos manteniendo el diseño idéntico.
 *   3. RE-VERIFICAR — repite hasta MAX_INTENTOS; si aún falla, la imagen se
 *      entrega marcada con "⚠ Revisar texto" y el detalle de los errores.
 */
import { generateImages, editImage, strictSpellCheck } from "./gemini.js";

const MAX_INTENTOS = 2; // correcciones por imagen

export const CORRECTOR = {
  nombre: "corrector-ortografia",
  descripcion:
    "Revisa el texto de cada imagen generada (español o inglés) y lo corrige editando la imagen si hace falta.",
};

function instruccionDeCorreccion(errores, expectedText) {
  const lista = errores
    .map((e) => `- Donde dice "${e.visto}" debe decir exactamente "${e.correccion}"`)
    .join("\n");
  return (
    `Edita esta imagen corrigiendo ÚNICAMENTE los textos. Mantén idénticos el diseño, ` +
    `los colores, la composición, las personas y todos los elementos gráficos.\n\n` +
    `Correcciones de texto:\n${lista}\n\n` +
    (expectedText
      ? `El texto principal debe decir EXACTAMENTE: "${expectedText}".\n`
      : "") +
    `El texto corregido debe quedar nítido y legible, con la misma tipografía, tamaño y ` +
    `posición que el original. No agregues, quites ni cambies nada más en la imagen.`
  );
}

/**
 * Ciclo revisar → corregir (edición) → re-verificar para una imagen.
 * Devuelve { image, check } donde check = { verificada, ok, errores, intentos }.
 */
export async function revisarYCorregir(image, { expectedText = null, aspectRatio = "1:1" } = {}) {
  let check = await strictSpellCheck(image, expectedText);
  let intentos = 0;

  while (check.verificada && !check.ok && check.errores.length > 0 && intentos < MAX_INTENTOS) {
    intentos++;
    try {
      const editada = await editImage({
        imageDataUrl: image,
        instruction: instruccionDeCorreccion(check.errores, expectedText),
        aspectRatio,
      });
      if (!editada) break;
      const recheck = await strictSpellCheck(editada, expectedText);
      // Solo adoptar la edición si no empeora (menos o iguales errores)
      if (recheck.ok || recheck.errores.length <= check.errores.length) {
        image = editada;
        check = recheck;
      } else {
        break;
      }
    } catch (err) {
      console.warn(`Corrección de ortografía (intento ${intentos}) falló:`, err.message);
      break;
    }
  }

  return { image, check: { ...check, intentos } };
}

/**
 * Genera `count` variaciones y pasa cada una por la skill correctora.
 * Devuelve { images, verificacion } alineados por índice.
 */
export async function generarImagenesVerificadas({
  prompt,
  referenceImages = [],
  count = 1,
  aspectRatio = "1:1",
  expectedText = null,
}) {
  const attempts = Array.from({ length: count }, async () => {
    const imgs = await generateImages({ prompt, referenceImages, count: 1, aspectRatio });
    if (imgs.length === 0) return null;
    return revisarYCorregir(imgs[0], { expectedText, aspectRatio });
  });
  const settled = await Promise.allSettled(attempts);

  const results = settled
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => r.value);

  if (results.length === 0) {
    const firstError = settled.find((r) => r.status === "rejected");
    if (firstError) throw firstError.reason;
    return { images: [], verificacion: [] };
  }
  return {
    images: results.map((r) => r.image),
    verificacion: results.map((r) => r.check),
  };
}

/**
 * Genera un carrusel slide a slide (con ancla de estilo) y pasa cada slide
 * por la skill correctora. expectedTexts[i] es el texto exacto de la slide i.
 */
export async function generarSecuenciaVerificada({
  prompts,
  referenceImages = [],
  aspectRatio = "1:1",
  expectedTexts = [],
}) {
  const slides = [];
  const verificacion = [];
  let anchor = null;

  for (let i = 0; i < prompts.length; i++) {
    const refs = [...referenceImages.slice(0, 5)];
    if (anchor) refs.push(anchor);

    const finalPrompt = anchor
      ? `${prompts[i]}\n\nLa última imagen adjunta es la slide anterior de este mismo carrusel: replica exactamente su paleta de colores, estilo, iluminación y tratamiento visual.`
      : prompts[i];

    const imgs = await generateImages({
      prompt: finalPrompt,
      referenceImages: refs,
      count: 1,
      aspectRatio,
    });
    if (imgs.length === 0) {
      throw new Error(`El modelo no devolvió imagen para la slide ${slides.length + 1}.`);
    }

    const { image, check } = await revisarYCorregir(imgs[0], {
      expectedText: expectedTexts[i] || null,
      aspectRatio,
    });
    slides.push(image);
    verificacion.push(check);
    if (!anchor) anchor = image;
  }
  return { images: slides, verificacion };
}
