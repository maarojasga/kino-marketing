/**
 * SKILL: Identidad visual desde referencias.
 *
 * Cuando el usuario aporta imágenes de referencia (grupo de ejemplos y/o
 * referencias puntuales), esta skill obliga a que la paleta de colores y la
 * tipografía de esas imágenes se usen sí o sí en cada pieza generada — no
 * son una sugerencia de estilo, son un requisito. Centraliza aquí el texto
 * de esa regla para que la skill de contenido (lib/skill.js) y las llamadas
 * directas a Gemini (lib/gemini.js) lo compartan en vez de repetirlo.
 */

export const IDENTIDAD_VISUAL = {
  nombre: "identidad-visual",
  descripcion:
    "Obliga a que la paleta de colores y la tipografía de las imágenes de referencia se repliquen sí o sí en cada generación, en vez de tratarlas como sugerencia.",
};

/** Bloque de reglas para las instrucciones de la skill de contenido (texto). */
export function reglaInstrucciones() {
  return `3b. IMÁGENES DE REFERENCIA — OBLIGATORIO cuando existen, sin excepciones:
   - La PALETA DE COLORES y la TIPOGRAFÍA de las imágenes de referencia NO son sugerencias: son requisitos obligatorios que toda pieza generada debe cumplir sí o sí, sin importar el tema pedido.
   - PRIMERO analiza las imágenes adjuntas y extrae: (a) paleta de colores exacta — entre 3 y 5 colores dominantes con su valor hex aproximado; (b) tipografía — familia aproximada (serif/sans-serif/display), peso y carácter (geométrica, humanista, condensada, etc.); (c) estilo visual (fotografía/ilustración/diseño plano), tratamiento de luz y patrones de composición.
   - ESCRIBE esos colores exactos (hex) y esa tipografía DENTRO de cada prompt, de forma literal (ej: "usa exactamente estos colores: #2BC4B6, #9B3F9E, #1B4965; toda tipografía debe ser sans-serif geométrica en negrita, igual a la de las referencias").
   - Cada prompt debe indicar explícitamente que la pieza debe verse como parte del mismo feed/serie que las referencias: mismos colores, misma tipografía, mismo tratamiento.
   - El tema define el CONTENIDO; las referencias definen el ESTILO, la paleta y la tipografía. Nunca uses una paleta o tipografía distinta a la de las referencias, aunque otra combinación te parezca más adecuada para el tema.`;
}

/** Frase corta para la plantilla determinista de respaldo (sin llamada a Gemini). */
export function fraseFallback(hayReferencias) {
  return hayReferencias
    ? " OBLIGATORIO SIN EXCEPCIÓN: usa exactamente la paleta de colores y la tipografía de las imágenes de referencia proporcionadas — no son sugerencias, son requisitos. Sigue también fielmente su iluminación y estilo visual, de modo que la pieza se vea de la misma serie que esas referencias."
    : "";
}

/** Línea para el prompt que arma los prompts vía Gemini (buildPrompts). */
export function lineaReferencias(numReferencias) {
  return numReferencias > 0
    ? `sí (${numReferencias}) — OBLIGATORIO SIN EXCEPCIÓN: extrae la paleta de colores exacta (hex) y la tipografía de estas imágenes y escríbelas literalmente dentro de cada prompt; son requisitos obligatorios, no sugerencias. Las piezas deben verse de la misma serie/feed que las referencias: mismos colores, misma tipografía, mismo estilo.`
    : "no";
}

/**
 * Envuelve el prompt de generación de imagen con la regla obligatoria de
 * paleta/tipografía cuando hay imágenes de referencia adjuntas.
 */
export function envolverPrompt(prompt, numReferencias) {
  if (!numReferencias) return prompt;
  return (
    `REGLA OBLIGATORIA E INNEGOCIABLE: las ${numReferencias} imágenes adjuntas son la referencia real de marca. ` +
    `Identifica su PALETA DE COLORES EXACTA y su TIPOGRAFÍA antes de generar — estos dos elementos son obligatorios, ` +
    `NO sugerencias: úsalos sí o sí en la nueva imagen, sin sustituirlos por otros colores o fuentes aunque te parezcan ` +
    `más apropiados para el tema. También replica su estilo (fotografía/ilustración/diseño gráfico), su tratamiento de ` +
    `luz y su estilo de composición, de forma que la nueva imagen se vea como parte de la misma serie/feed que las ` +
    `referencias. El texto siguiente define ÚNICAMENTE el CONTENIDO de la pieza — nunca un estilo, paleta o tipografía ` +
    `distintos a los de las referencias.\n\n` +
    `Contenido solicitado: ${prompt}`
  );
}
