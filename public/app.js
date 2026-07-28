const MAX_REFS = 6;
const MAX_DIM = 1568; // se redimensiona en el navegador para aligerar la petición

const dropzone = document.getElementById("dropzone");
const fileInput = document.getElementById("fileInput");
const pickFiles = document.getElementById("pickFiles");
const thumbs = document.getElementById("thumbs");
const promptEl = document.getElementById("prompt");
const countEl = document.getElementById("count");
const aspectEl = document.getElementById("aspectRatio");
const enhanceLabel = document.getElementById("enhanceLabel");
const enhanceEl = document.getElementById("enhance");
const generateBtn = document.getElementById("generate");
const statusEl = document.getElementById("status");
const resultsPanel = document.getElementById("resultsPanel");
const finalPromptEl = document.getElementById("finalPrompt");
const gallery = document.getElementById("gallery");

/** @type {string[]} data URLs de las imágenes de referencia */
let referenceImages = [];

// Mostrar el toggle de Claude solo si el servidor lo tiene configurado
fetch("/api/status")
  .then((r) => r.json())
  .then((s) => {
    if (s.claudeConfigured) enhanceLabel.hidden = false;
    if (!s.geminiConfigured) {
      setStatus("⚠️ El servidor no tiene GEMINI_API_KEY configurada. Revisa el archivo .env.", "error");
    }
  })
  .catch(() => {});

// --- Carga de imágenes de referencia ---

pickFiles.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("click", (e) => {
  if (e.target === dropzone || e.target.tagName === "P") fileInput.click();
});
fileInput.addEventListener("change", () => addFiles(fileInput.files));

["dragenter", "dragover"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  })
);
["dragleave", "drop"].forEach((ev) =>
  dropzone.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
  })
);
dropzone.addEventListener("drop", (e) => addFiles(e.dataTransfer.files));

async function addFiles(fileList) {
  const files = Array.from(fileList).filter((f) => f.type.startsWith("image/"));
  for (const file of files) {
    if (referenceImages.length >= MAX_REFS) {
      setStatus(`Máximo ${MAX_REFS} imágenes de referencia.`, "error");
      break;
    }
    try {
      const dataUrl = await resizeToDataUrl(file);
      referenceImages.push(dataUrl);
    } catch {
      setStatus(`No se pudo leer "${file.name}".`, "error");
    }
  }
  fileInput.value = "";
  renderThumbs();
}

function resizeToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      let { width, height } = img;
      const scale = Math.min(1, MAX_DIM / Math.max(width, height));
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL("image/jpeg", 0.9));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("imagen inválida"));
    };
    img.src = url;
  });
}

function renderThumbs() {
  thumbs.innerHTML = "";
  referenceImages.forEach((src, i) => {
    const div = document.createElement("div");
    div.className = "thumb";
    const img = document.createElement("img");
    img.src = src;
    img.alt = `Referencia ${i + 1}`;
    const btn = document.createElement("button");
    btn.textContent = "✕";
    btn.title = "Quitar";
    btn.addEventListener("click", () => {
      referenceImages.splice(i, 1);
      renderThumbs();
    });
    div.append(img, btn);
    thumbs.appendChild(div);
  });
}

// --- Generación ---

generateBtn.addEventListener("click", async () => {
  const prompt = promptEl.value.trim();
  if (!prompt) {
    setStatus("Escribe un prompt antes de generar.", "error");
    promptEl.focus();
    return;
  }

  generateBtn.disabled = true;
  setStatus("Generando imágenes… esto puede tardar hasta un minuto.", "");
  statusEl.classList.add("loading");

  try {
    const res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prompt,
        referenceImages,
        count: parseInt(countEl.value, 10),
        aspectRatio: aspectEl.value,
        enhanceWithClaude: !enhanceLabel.hidden && enhanceEl.checked,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);

    renderResults(data);
    setStatus(`✅ ${data.images.length} imagen(es) generada(s).`, "ok");
  } catch (err) {
    setStatus(`❌ ${err.message}`, "error");
  } finally {
    statusEl.classList.remove("loading");
    generateBtn.disabled = false;
  }
});

function renderResults({ images, finalPrompt, enhanced }) {
  resultsPanel.hidden = false;
  gallery.innerHTML = "";

  if (enhanced && finalPrompt) {
    finalPromptEl.hidden = false;
    finalPromptEl.textContent = `Prompt mejorado por Claude:\n${finalPrompt}`;
  } else {
    finalPromptEl.hidden = true;
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  images.forEach((src, i) => {
    const fig = document.createElement("figure");
    const img = document.createElement("img");
    img.src = src;
    img.alt = `Imagen generada ${i + 1}`;
    const cap = document.createElement("figcaption");
    const link = document.createElement("a");
    link.href = src;
    link.download = `kino-${stamp}-${i + 1}.png`;
    link.textContent = "⬇ Descargar";
    cap.appendChild(link);
    fig.append(img, cap);
    gallery.appendChild(fig);
  });

  resultsPanel.scrollIntoView({ behavior: "smooth" });
}

function setStatus(msg, kind) {
  statusEl.hidden = !msg;
  statusEl.textContent = msg;
  statusEl.className = `status ${kind || ""}`.trim();
}
