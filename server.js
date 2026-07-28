import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPrompts, geminiAvailable } from "./lib/gemini.js";
import { generarImagenesVerificadas, generarSecuenciaVerificada } from "./lib/corrector.js";
import { SKILL } from "./lib/skill.js";
import { extractBrandProfile } from "./lib/brand.js";
import { store } from "./lib/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Logs de terminal: cada línea con hora + prefijo, para poder seguir el
// rastro de una generación completa (params → progreso → resultado/error).
function log(...args) {
  console.log(`[Kino ${new Date().toLocaleTimeString("es")}]`, ...args);
}
function logError(...args) {
  console.error(`[Kino ${new Date().toLocaleTimeString("es")}] ✗`, ...args);
}

// Imágenes y PDFs viajan en base64 dentro del JSON
// (un PDF de 50 MB ocupa ~67 MB en base64, más margen)
app.use(express.json({ limit: "120mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (_req, res) => {
  const brand = store.getBrand();
  res.json({
    geminiConfigured: geminiAvailable(),
    brand: brand ? { fileName: brand.fileName, updatedAt: brand.updatedAt } : null,
  });
});

// --- Manual de marca ---

app.post("/api/brand-manual", async (req, res) => {
  try {
    const { fileName, pdf } = req.body || {};
    if (!pdf) return res.status(400).json({ error: "Falta el PDF del manual de marca." });

    const sizeMB = ((pdf.length * 3) / 4 / 1024 / 1024).toFixed(1);
    log(`Manual de marca: analizando "${fileName || "manual.pdf"}" (~${sizeMB} MB)…`);

    const profile = await extractBrandProfile(pdf);
    const brand = store.setBrand({ fileName: fileName || "manual.pdf", profile });
    log(`Manual de marca: perfil extraído (${profile.length} caracteres).`);
    res.json({ fileName: brand.fileName, profile: brand.profile, updatedAt: brand.updatedAt });
  } catch (err) {
    logError("Analizando manual de marca:", err);
    res.status(500).json({ error: err.message || "No se pudo analizar el manual." });
  }
});

app.get("/api/brand-manual", (_req, res) => {
  const brand = store.getBrand();
  if (!brand) return res.status(404).json({ error: "No hay manual de marca cargado." });
  res.json(brand);
});

app.delete("/api/brand-manual", (_req, res) => {
  store.clearBrand();
  log("Manual de marca eliminado.");
  res.json({ ok: true });
});

// --- Grupos de ejemplos (categorías) ---

app.get("/api/groups", (_req, res) => {
  res.json({ groups: store.listGroups() });
});

app.post("/api/groups", (req, res) => {
  const { name, images } = req.body || {};
  if (!name || typeof name !== "string" || !name.trim()) {
    return res.status(400).json({ error: "El grupo necesita un nombre." });
  }
  if (!Array.isArray(images) || images.length === 0) {
    return res.status(400).json({ error: "El grupo necesita al menos una imagen." });
  }
  if (images.length > 10) {
    return res.status(400).json({ error: "Máximo 10 imágenes por grupo." });
  }
  const group = store.addGroup(name.trim(), images);
  log(`Grupo creado: "${group.name}" (${images.length} imagen(es)).`);
  res.json(group);
});

app.delete("/api/groups/:id", (req, res) => {
  const ok = store.deleteGroup(req.params.id);
  if (!ok) return res.status(404).json({ error: "Grupo no encontrado." });
  log(`Grupo eliminado: ${req.params.id}`);
  res.json({ ok: true });
});

// --- Generación ---

app.post("/api/generate", async (req, res) => {
  const {
    tema,
    tipo = "imagen", // "imagen" | "carrusel"
    count = 1, // imágenes sueltas: variaciones
    numSlides = 3, // carrusel: nº de slides
    aspectRatio = "1:1",
    groupId = null, // categoría de ejemplos a usar
    modo = "general", // "general" | "control"
    items = [], // modo control: [{ texto, descripcion }]
    referenceImages = [], // referencias adicionales puntuales (opcional)
  } = req.body || {};

  log(
    `POST /api/generate — tema="${(tema || "").slice(0, 60)}" tipo=${tipo} modo=${modo} ` +
      `formato=${aspectRatio} ${tipo === "carrusel" ? `slides=${numSlides}` : `variaciones=${count}`} ` +
      `grupo=${groupId || "ninguno"} refs_sueltas=${referenceImages.length}`
  );

  try {
    if (!tema || typeof tema !== "string" || !tema.trim()) {
      log("Rechazado: falta el tema.");
      return res.status(400).json({ error: "El tema es obligatorio." });
    }
    if (!geminiAvailable()) {
      log("Rechazado: GEMINI_API_KEY no configurada.");
      return res.status(500).json({
        error: "Falta configurar GEMINI_API_KEY en el archivo .env del servidor.",
      });
    }

    // Referencias: grupo elegido + referencias puntuales
    let refs = [...referenceImages];
    if (groupId) {
      const group = store.getGroup(groupId);
      if (!group) {
        log(`Rechazado: el grupo ${groupId} no existe.`);
        return res.status(400).json({ error: "El grupo de ejemplos elegido no existe." });
      }
      refs = [...group.images, ...refs];
      log(`Grupo "${group.name}" aporta ${group.images.length} imagen(es) de referencia.`);
    }
    refs = refs.slice(0, 10);

    const brand = store.getBrand();
    const brandProfile = brand?.profile || null;
    log(
      `Contexto: ${refs.length} imagen(es) de referencia en total, ` +
        `${brandProfile ? "con" : "sin"} perfil de marca.`
    );

    const n = tipo === "carrusel"
      ? Math.min(Math.max(parseInt(numSlides, 10) || 3, 2), 8)
      : Math.min(Math.max(parseInt(count, 10) || 1, 1), 4);

    const skillOptions = {
      tipo,
      numSlides: n,
      aspectRatio,
      referenceImages: refs,
      hayReferencias: refs.length > 0,
      brandProfile,
      modo: modo === "control" ? "control" : "general",
      items: Array.isArray(items) ? items : [],
    };

    // A partir de aquí la respuesta se transmite como NDJSON: una línea de
    // progreso por evento y una línea final "done" (o "error"). Las
    // validaciones de arriba ya respondieron con JSON plano si hacía falta,
    // así que el cliente distingue ambos modos por el Content-Type. El HTTP
    // status queda fijo en 200 desde aquí — una falla real más adelante se
    // reporta como línea "error" dentro del stream, no como status HTTP, así
    // que sigue esta terminal para ver qué pasó de verdad.
    res.writeHead(200, {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache",
      "X-Accel-Buffering": "no",
    });
    const sendProgress = (message) => {
      log(`  · ${message}`);
      res.write(JSON.stringify({ type: "progress", message }) + "\n");
    };

    // La skill construye los prompts con Gemini; si falla, plantilla determinista
    let prompts;
    let enhanced = false;
    try {
      prompts = await buildPrompts({ tema: tema.trim(), ...skillOptions, onProgress: sendProgress });
      enhanced = true;
      log(`Prompts construidos por la skill (Gemini): ${prompts.length}.`);
    } catch (err) {
      logError("Skill con Gemini falló, se usa la plantilla de respaldo:", err.message);
      prompts = SKILL.construirPrompts(tema.trim(), skillOptions);
    }

    // Textos exactos esperados (modo control) para el verificador de ortografía
    const itemsList = Array.isArray(items) ? items : [];
    const expectedTexts =
      modo === "control" ? itemsList.map((it) => (it?.texto || "").trim() || null) : [];

    let images, verificacion;
    if (tipo === "carrusel") {
      ({ images, verificacion } = await generarSecuenciaVerificada({
        prompts,
        referenceImages: refs,
        aspectRatio,
        expectedTexts,
        onProgress: sendProgress,
      }));
    } else {
      ({ images, verificacion } = await generarImagenesVerificadas({
        prompt: prompts[0],
        referenceImages: refs,
        count: n,
        aspectRatio,
        expectedText: expectedTexts[0] || null,
        onProgress: sendProgress,
      }));
    }

    if (!images || images.length === 0) {
      logError("El modelo no devolvió ninguna imagen.");
      res.write(
        JSON.stringify({
          type: "error",
          error: "El modelo no devolvió imágenes. Intenta reformular el tema o usar menos referencias.",
        }) + "\n"
      );
      return res.end();
    }

    const ok = verificacion.filter((v) => v?.ok).length;
    const revisar = verificacion.length - ok;
    log(
      `Listo: ${images.length} imagen(es) generada(s) — ${ok} con texto verificado, ` +
        `${revisar} para revisar.`
    );

    res.write(
      JSON.stringify({
        type: "done",
        images,
        verificacion,
        prompts,
        enhanced,
        tipo,
        usedBrandProfile: Boolean(brandProfile),
      }) + "\n"
    );
    res.end();
  } catch (err) {
    logError("Fallo en /api/generate:", err);
    if (res.headersSent) {
      try {
        res.write(JSON.stringify({ type: "error", error: err.message || "Error interno del servidor." }) + "\n");
      } catch {
        // la conexión ya pudo haberse cerrado
      }
      res.end();
    } else {
      res.status(500).json({ error: err.message || "Error interno del servidor." });
    }
  }
});

app.listen(PORT, () => {
  log(`Generador de imágenes escuchando en http://localhost:${PORT}`);
  log(
    `Modelo de imagen: ${process.env.GEMINI_IMAGE_MODEL || "gemini-3-pro-image-preview"} · ` +
      `resolución: ${process.env.GEMINI_IMAGE_SIZE || "2K"}`
  );
  if (!geminiAvailable()) {
    logError("GEMINI_API_KEY no está configurada — la generación fallará hasta configurarla.");
  }
});
