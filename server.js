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

    const profile = await extractBrandProfile(pdf);
    const brand = store.setBrand({ fileName: fileName || "manual.pdf", profile });
    res.json({ fileName: brand.fileName, profile: brand.profile, updatedAt: brand.updatedAt });
  } catch (err) {
    console.error("Error analizando manual de marca:", err);
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
  res.json(group);
});

app.delete("/api/groups/:id", (req, res) => {
  const ok = store.deleteGroup(req.params.id);
  if (!ok) return res.status(404).json({ error: "Grupo no encontrado." });
  res.json({ ok: true });
});

// --- Generación ---

app.post("/api/generate", async (req, res) => {
  try {
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

    if (!tema || typeof tema !== "string" || !tema.trim()) {
      return res.status(400).json({ error: "El tema es obligatorio." });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Falta configurar GEMINI_API_KEY en el archivo .env del servidor.",
      });
    }

    // Referencias: grupo elegido + referencias puntuales
    let refs = [...referenceImages];
    if (groupId) {
      const group = store.getGroup(groupId);
      if (!group) return res.status(400).json({ error: "El grupo de ejemplos elegido no existe." });
      refs = [...group.images, ...refs];
    }
    refs = refs.slice(0, 6);

    const brand = store.getBrand();
    const brandProfile = brand?.profile || null;

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

    // La skill construye los prompts con Gemini; si falla, plantilla determinista
    let prompts;
    let enhanced = false;
    try {
      prompts = await buildPrompts({ tema: tema.trim(), ...skillOptions });
      enhanced = true;
    } catch (err) {
      console.warn("Skill con Gemini falló, se usa la plantilla de respaldo:", err.message);
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
      }));
    } else {
      ({ images, verificacion } = await generarImagenesVerificadas({
        prompt: prompts[0],
        referenceImages: refs,
        count: n,
        aspectRatio,
        expectedText: expectedTexts[0] || null,
      }));
    }

    if (!images || images.length === 0) {
      return res.status(502).json({
        error: "El modelo no devolvió imágenes. Intenta reformular el tema o usar menos referencias.",
      });
    }

    res.json({
      images,
      verificacion,
      prompts,
      enhanced,
      tipo,
      usedBrandProfile: Boolean(brandProfile),
    });
  } catch (err) {
    console.error("Error en /api/generate:", err);
    res.status(500).json({ error: err.message || "Error interno del servidor." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Generador de imágenes escuchando en http://localhost:${PORT}`);
  if (!geminiAvailable()) {
    console.warn("⚠️  GEMINI_API_KEY no está configurada — la generación fallará hasta configurarla.");
  }
});
