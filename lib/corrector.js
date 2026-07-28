/**
 * SKILL CORRECTORA: revisión y corrección de ortografía en imágenes.
 *
 * Cada imagen generada pasa por este ciclo, que NO se rinde hasta agotar
 * las estrategias:
 *
 *   1. REVISAR — transcribe todo el texto visible y lo verifica estrictamente
 *      en su idioma (español o inglés), buscando errores típicos de IA
 *      ("Inscrébte" → "Inscríbete").
 *   2. CORREGIR POR EDICIÓN — pide al modelo editar la imagen arreglando solo
 *      los textos, manteniendo el diseño idéntico (hasta MAX_EDICIONES).
 *   3. CORREGIR POR REGENERACIÓN — si la edición no lo resuelve, regenera la
 *      pieza desde el prompt original con los textos correctos como
 *      instrucción explícita (hasta MAX_REGENERACIONES).
 *   4. Se entrega SIEMPRE la mejor versión conseguida (menos errores);
 *      solo si ninguna estrategia lo logró se marca "⚠ Revisar texto".
 */
import { generateImages, editImage, strictSpellCheck } from "./gemini.js";

const MAX_EDICIONES = 2; // intentos de corrección editando la imagen
const MAX_REGENERACIONES = 2; // intentos regenerando desde el prompt

export const CORRECTOR = {
  nombre: "corrector-ortografia",
  descripcion:
    "Revisa el texto de cada imagen (español o inglés) y lo corrige: primero editando la imagen y, si no basta, regenerándola con el texto correcto.",
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
    `Vuelve a dibujar por completo cada texto corregido: nítido, legible, con la misma ` +
    `tipografía, tamaño y posición que el original, y con ortografía perfecta. ` +
    `No agregues, quites ni cambies nada más en la imagen.`
  );
}

function promptDeRegeneracion(prompt, errores, expectedText) {
  const correcciones = errores.map((e) => `"${e.correccion}"`).join(", ");
  return (
    `${prompt}\n\nMUY IMPORTANTE — ORTOGRAFÍA: en intentos anteriores el texto salió mal escrito. ` +
    `Todos los textos de la imagen deben estar perfectamente escritos en su idioma, letra por letra. ` +
    (expectedText
      ? `El texto principal debe decir EXACTAMENTE: "${expectedText}" (cópialo carácter por carácter). `
      : correcciones
        ? `Los textos correctos son: ${correcciones} (cópialos carácter por carácter). `
        : "") +
    `Usa una tipografía clara y legible para todo el texto. Revisa cada palabra antes de dibujarla.`
  );
}

/** Cantidad de errores de un chequeo, tratando los no verificados como desconocidos. */
function numErrores(check) {
  return check.verificada ? check.errores.length : Number.MAX_SAFE_INTEGER;
}

/**
 * Ciclo revisar → editar → regenerar para una imagen.
 * Devuelve { image, check } con la MEJOR versión conseguida.
 * check = { verificada, ok, errores, intentos }.
 */
export async function revisarYCorregir(
  image,
  { expectedText = null, aspectRatio = "1:1", prompt = null, referenceImages = [] } = {}
) {
  let actual = { image, check: await strictSpellCheck(image, expectedText) };
  let mejor = actual;
  let intentos = 0;

  const adoptarSiMejora = (candidato) => {
    if (!candidato.check.verificada) return false;
    if (candidato.check.ok || numErrores(candidato.check) < numErrores(mejor.check)) {
      mejor = candidato;
      return true;
    }
    return false;
  };

  // --- Fase 1: corrección por edición (mantiene el diseño) ---
  for (let i = 0; i < MAX_EDICIONES && mejor.check.verificada && !mejor.check.ok; i++) {
    intentos++;
    try {
      const editada = await editImage({
        imageDataUrl: actual.image,
        instruction: instruccionDeCorreccion(actual.check.errores, expectedText),
        aspectRatio,
      });
      if (!editada) continue;
      const candidato = { image: editada, check: await strictSpellCheck(editada, expectedText) };
      if (adoptarSiMejora(candidato) || numErrores(candidato.check) <= numErrores(actual.check)) {
        actual = candidato; // seguir editando sobre la mejor versión disponible
      }
    } catch (err) {
      console.warn(`Corrector (edición ${i + 1}) falló:`, err.message);
    }
  }

  // --- Fase 2: si la edición no bastó, regenerar con el texto correcto explícito ---
  if (!mejor.check.ok && prompt) {
    const errores = mejor.check.verificada ? mejor.check.errores : [];
    for (let i = 0; i < MAX_REGENERACIONES && !mejor.check.ok; i++) {
      intentos++;
      try {
        const imgs = await generateImages({
          prompt: promptDeRegeneracion(prompt, errores, expectedText),
          referenceImages,
          count: 1,
          aspectRatio,
        });
        if (imgs.length === 0) continue;
        const candidato = { image: imgs[0], check: await strictSpellCheck(imgs[0], expectedText) };
        adoptarSiMejora(candidato);
      } catch (err) {
        console.warn(`Corrector (regeneración ${i + 1}) falló:`, err.message);
      }
    }
  }

  return { image: mejor.image, check: { ...mejor.check, intentos } };
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
    return revisarYCorregir(imgs[0], { expectedText, aspectRatio, prompt, referenceImages });
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
      prompt: finalPrompt,
      referenceImages: refs,
    });
    slides.push(image);
    verificacion.push(check);
    if (!anchor) anchor = image;
  }
  return { images: slides, verificacion };
}
