/**
 * SKILL: Creador de contenido visual de marketing.
 *
 * Toda la experiencia de dirección de arte y marketing vive aquí.
 * El usuario solo aporta el TEMA (y opcionalmente textos en modo
 * "control total"); la skill construye los prompts de generación,
 * para imágenes sueltas o carruseles, respetando el manual de marca.
 */

const FORMATOS = {
  "1:1": "composición cuadrada equilibrada, sujeto centrado con espacio negativo alrededor",
  "4:5": "composición vertical para feed, sujeto protagonista con aire en la parte superior",
  "9:16": "composición vertical de pantalla completa estilo historia/reel, punto focal centrado y espacio libre arriba y abajo",
  "16:9": "composición horizontal en regla de tercios, con profundidad de campo",
  "3:4": "composición vertical tipo retrato, sujeto destacado",
};

export const SKILL = {
  nombre: "contenido-marketing",
  descripcion:
    "Convierte un tema simple en prompts profesionales de generación de imágenes o carruseles de marketing.",

  // Instrucciones que definen la experiencia de la skill (las sigue Gemini).
  instrucciones: `Eres un director de arte senior especializado en contenido visual para redes sociales y marketing digital.

Tu trabajo: a partir de un TEMA breve, construir prompts completos y profesionales para un modelo de generación de imágenes.

Reglas de la skill:
1. COMPOSICIÓN: encuadre claro, punto focal, jerarquía visual y espacio negativo.
2. ESTILO: calidad comercial premium; iluminación cuidada; colores cohesivos. Evita estética genérica de "imagen de stock".
3. MARCA: si se proporciona un PERFIL DE MARCA, respétalo estrictamente (paleta exacta, tipografía, tono). Nunca inventes logotipos ni marcas.
3b. IMÁGENES DE REFERENCIA — OBLIGATORIO cuando existen, sin excepciones:
   - La PALETA DE COLORES y la TIPOGRAFÍA de las imágenes de referencia NO son sugerencias: son requisitos obligatorios que toda pieza generada debe cumplir sí o sí, sin importar el tema pedido.
   - PRIMERO analiza las imágenes adjuntas y extrae: (a) paleta de colores exacta — entre 3 y 5 colores dominantes con su valor hex aproximado; (b) tipografía — familia aproximada (serif/sans-serif/display), peso y carácter (geométrica, humanista, condensada, etc.); (c) estilo visual (fotografía/ilustración/diseño plano), tratamiento de luz y patrones de composición.
   - ESCRIBE esos colores exactos (hex) y esa tipografía DENTRO de cada prompt, de forma literal (ej: "usa exactamente estos colores: #2BC4B6, #9B3F9E, #1B4965; toda tipografía debe ser sans-serif geométrica en negrita, igual a la de las referencias").
   - Cada prompt debe indicar explícitamente que la pieza debe verse como parte del mismo feed/serie que las referencias: mismos colores, misma tipografía, mismo tratamiento.
   - El tema define el CONTENIDO; las referencias definen el ESTILO, la paleta y la tipografía. Nunca uses una paleta o tipografía distinta a la de las referencias, aunque otra combinación te parezca más adecuada para el tema.
4. FORMATO: adapta la composición al aspect ratio solicitado.
5. TEXTOS — según el modo:
   - Modo GENERAL: tú decides; puedes incluir textos cortos y llamativos en la imagen si suman (titulares, cifras), bien integrados en el diseño.
   - Modo CONTROL: incluye EXACTAMENTE los textos indicados para cada imagen (literal, sin cambiar ni una letra) y nada más de texto. Si una imagen no tiene texto indicado, no incluyas texto.
6. IDIOMA Y ORTOGRAFÍA (obligatorio):
   - Detecta el idioma del usuario (español o inglés) a partir del TEMA y de los textos que haya escrito; todo el copy que decidas va en ESE idioma.
   - Antes de incluir cualquier texto en un prompt, revísalo: ortografía, tildes, mayúsculas y gramática impecables en su idioma. Cero errores.
   - En cada prompt que lleve texto, escribe el texto entre comillas e indica que debe reproducirse en la imagen EXACTAMENTE como está escrito, sin errores ortográficos ni letras deformadas.
7. CARRUSELES: diseña una secuencia coherente con arco narrativo — slide 1 es la portada/gancho, las intermedias desarrollan el tema, la última cierra con llamado a la acción. Todas las slides comparten paleta, estilo, iluminación y tratamiento para verse como una sola pieza.

Formato de salida: devuelve un prompt detallado (un párrafo) por cada imagen solicitada, en el JSON pedido, sin explicaciones.`,

  /**
   * Plantilla determinista de respaldo (si la llamada a Gemini falla).
   * Devuelve SIEMPRE un array de prompts (1 para imagen suelta, N para carrusel).
   */
  construirPrompts(tema, opciones = {}) {
    const {
      tipo = "imagen", // "imagen" | "carrusel"
      numSlides = 3,
      aspectRatio = "1:1",
      hayReferencias = false,
      brandProfile = null,
      modo = "general", // "general" | "control"
      items = [], // modo control: [{ texto, descripcion }]
    } = opciones;

    const formato = FORMATOS[aspectRatio] || "composición equilibrada con punto focal claro";
    const marca = brandProfile
      ? ` Respeta estrictamente este perfil de marca: ${brandProfile.replace(/\s+/g, " ").slice(0, 900)}.`
      : "";
    const referencia = hayReferencias
      ? " OBLIGATORIO SIN EXCEPCIÓN: usa exactamente la paleta de colores y la tipografía de las imágenes de referencia proporcionadas — no son sugerencias, son requisitos. Sigue también fielmente su iluminación y estilo visual, de modo que la pieza se vea de la misma serie que esas referencias."
      : "";

    const base = (descripcion, texto) => {
      const cuerpo = descripcion ? `${tema}. ${descripcion}` : tema;
      const textoInstr =
        modo === "control"
          ? texto
            ? ` Incluye dentro de la imagen, de forma protagonista y legible, EXACTAMENTE este texto: "${texto}" (literal, ortografía perfecta), sin ningún otro texto.`
            : " No incluyas ningún texto dentro de la imagen."
          : " Puedes incluir un texto corto y llamativo en el idioma del tema (español o inglés), bien integrado al diseño y con ortografía perfecta, si aporta al mensaje.";
      return (
        `Imagen profesional de marketing para redes sociales sobre: ${cuerpo}. ` +
        `Calidad comercial premium, iluminación cuidada, colores cohesivos, ${formato}.` +
        textoInstr +
        ` Sin logotipos ni marcas inventadas.` +
        marca +
        referencia
      );
    };

    if (tipo !== "carrusel") {
      const item = items[0] || {};
      return [base(item.descripcion ? `Mostrar: ${item.descripcion}` : "", item.texto)];
    }

    // Carrusel: arco narrativo simple
    const prompts = [];
    for (let i = 0; i < numSlides; i++) {
      const item = items[i] || {};
      let rol;
      if (i === 0) rol = "PORTADA del carrusel: impactante, gancho visual fuerte que invite a deslizar";
      else if (i === numSlides - 1) rol = "CIERRE del carrusel: llamado a la acción claro";
      else rol = `Slide ${i + 1} de desarrollo: continúa la narrativa visual del carrusel`;
      const descripcion = item.descripcion
        ? `${rol}. Mostrar: ${item.descripcion}`
        : rol;
      prompts.push(
        base(descripcion, item.texto) +
          ` Es la slide ${i + 1} de un carrusel de ${numSlides}: mantén exactamente la misma paleta, estilo e iluminación que el resto de la serie.`
      );
    }
    return prompts;
  },
};
