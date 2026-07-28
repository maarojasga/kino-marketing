import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateImages } from "./lib/gemini.js";
import { enhancePrompt, claudeAvailable } from "./lib/claude.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Las imágenes de referencia viajan en base64 dentro del JSON
app.use(express.json({ limit: "50mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/status", (_req, res) => {
  res.json({
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    claudeConfigured: claudeAvailable(),
  });
});

app.post("/api/generate", async (req, res) => {
  try {
    const {
      prompt,
      referenceImages = [],
      count = 1,
      aspectRatio = "1:1",
      enhanceWithClaude = false,
    } = req.body || {};

    if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
      return res.status(400).json({ error: "El prompt es obligatorio." });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "Falta configurar GEMINI_API_KEY en el archivo .env del servidor.",
      });
    }
    if (referenceImages.length > 6) {
      return res
        .status(400)
        .json({ error: "Máximo 6 imágenes de referencia por solicitud." });
    }

    const numImages = Math.min(Math.max(parseInt(count, 10) || 1, 1), 4);

    let finalPrompt = prompt.trim();
    let enhanced = false;
    if (enhanceWithClaude && claudeAvailable()) {
      try {
        finalPrompt = await enhancePrompt(prompt.trim(), referenceImages);
        enhanced = true;
      } catch (err) {
        console.warn("Mejora de prompt con Claude falló, se usa el prompt original:", err.message);
      }
    }

    const images = await generateImages({
      prompt: finalPrompt,
      referenceImages,
      count: numImages,
      aspectRatio,
    });

    if (images.length === 0) {
      return res.status(502).json({
        error:
          "El modelo no devolvió imágenes. Intenta reformular el prompt o usar menos referencias.",
      });
    }

    res.json({ images, finalPrompt, enhanced });
  } catch (err) {
    console.error("Error en /api/generate:", err);
    res.status(500).json({ error: err.message || "Error interno del servidor." });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Generador de imágenes escuchando en http://localhost:${PORT}`);
  if (!process.env.GEMINI_API_KEY) {
    console.warn("⚠️  GEMINI_API_KEY no está configurada — la generación fallará hasta configurarla.");
  }
  if (!claudeAvailable()) {
    console.log("ℹ️  ANTHROPIC_API_KEY no configurada — la mejora de prompts con Claude estará desactivada (opcional).");
  }
});
