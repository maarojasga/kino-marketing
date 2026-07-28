/**
 * SKILL: Creador de contenido visual de marketing.
 *
 * Toda la experiencia de dirección de arte y marketing vive aquí.
 * El usuario solo aporta el TEMA; esta skill lo convierte en un prompt
 * completo de generación de imágenes.
 */

export const SKILL = {
  nombre: "contenido-marketing",
  descripcion:
    "Convierte un tema simple en un prompt profesional de generación de imágenes de marketing.",

  // Instrucciones que definen la experiencia de la skill.
  instrucciones: `Eres un director de arte senior especializado en contenido visual para redes sociales y marketing digital.

Tu trabajo: a partir de un TEMA breve dado por el usuario, construir un prompt completo y profesional para un modelo de generación de imágenes.

Reglas de la skill:
1. COMPOSICIÓN: define encuadre, punto focal claro, jerarquía visual y espacio negativo para posible texto superpuesto.
2. ESTILO: fotografía o ilustración de alta calidad comercial; iluminación cuidada; colores cohesivos. Evita estética genérica de "imagen de stock".
3. MARCA: si hay imágenes de referencia, extrae y respeta su paleta de colores, iluminación, tratamiento fotográfico y tono general. Nunca inventes logotipos, marcas ni textos que no se pidan explícitamente.
4. FORMATO: adapta la composición al aspect ratio solicitado (vertical para historias → sujeto centrado con aire arriba/abajo; horizontal → composición en tercios).
5. CONTENIDO: la imagen debe comunicar el tema de forma inmediata y atractiva para redes sociales, sin recargarla.
6. TEXTO EN IMAGEN: por defecto NO incluyas texto dentro de la imagen, salvo que el tema lo pida explícitamente (ej: "con el texto '20% OFF'").

Formato de salida: responde ÚNICAMENTE con el prompt final de generación (un párrafo detallado), sin explicaciones, sin preámbulos, sin comillas.`,

  /**
   * Plantilla determinista de respaldo: se usa cuando Claude no está
   * configurado. Construye un prompt sólido a partir del tema.
   */
  construirPrompt(tema, { aspectRatio = "1:1", hayReferencias = false } = {}) {
    const formato = {
      "1:1": "composición cuadrada equilibrada, sujeto centrado con espacio negativo alrededor",
      "4:5": "composición vertical para feed, sujeto protagonista con aire en la parte superior",
      "9:16": "composición vertical de pantalla completa estilo historia/reel, punto focal centrado y espacio libre arriba y abajo para superponer texto",
      "16:9": "composición horizontal en regla de tercios, con profundidad de campo",
      "3:4": "composición vertical tipo retrato, sujeto destacado",
    }[aspectRatio] || "composición equilibrada con punto focal claro";

    const referencia = hayReferencias
      ? " Sigue fielmente la paleta de colores, la iluminación y el estilo visual de las imágenes de referencia proporcionadas, manteniendo coherencia de marca."
      : "";

    return (
      `Imagen profesional de marketing para redes sociales sobre: ${tema}. ` +
      `Fotografía comercial de alta calidad, iluminación cuidada y atractiva, colores cohesivos y modernos, ${formato}. ` +
      `Estética premium y llamativa, sin texto dentro de la imagen, sin logotipos ni marcas inventadas.` +
      referencia
    );
  },
};
