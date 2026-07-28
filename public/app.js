const MAX_GROUP_IMAGES = 10;
const MAX_DIM = 1568; // se redimensiona en el navegador para aligerar las peticiones

// Iconos SVG en línea (sin emojis) para contenido generado dinámicamente.
const ICONS = {
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  alertTriangle: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12"/><polyline points="7 10 12 15 17 10"/><path d="M4 19h16"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
};

// --- Referencias a elementos ---
const $ = (id) => document.getElementById(id);

const brandEmpty = $("brandEmpty");
const brandLoaded = $("brandLoaded");
const brandInput = $("brandInput");
const pickBrand = $("pickBrand");
const brandName = $("brandName");
const brandProfile = $("brandProfile");
const deleteBrand = $("deleteBrand");
const brandStatus = $("brandStatus");

const groupName = $("groupName");
const pickGroupFiles = $("pickGroupFiles");
const groupFileInput = $("groupFileInput");
const saveGroup = $("saveGroup");
const groupThumbs = $("groupThumbs");
const groupList = $("groupList");
const groupStatus = $("groupStatus");
const groupSelect = $("groupSelect");

const tipoEl = $("tipo");
const countWrap = $("countWrap");
const countEl = $("count");
const slidesWrap = $("slidesWrap");
const numSlidesEl = $("numSlides");
const aspectEl = $("aspectRatio");
const temaEl = $("tema");
const controlFields = $("controlFields");
const generateBtn = $("generate");
const statusEl = $("status");
const resultsPanel = $("resultsPanel");
const gallery = $("gallery");

/** Imágenes pendientes para el grupo en creación */
let pendingGroupImages = [];

// ============ Utilidades ============

function setStatus(el, msg, kind) {
  el.hidden = !msg;
  el.textContent = msg;
  el.className = `status ${kind || ""}`.trim();
}

/** Estado "en curso": icono giratorio + mensaje, para progreso en vivo. */
function setLoadingStatus(el, msg) {
  setStatus(el, msg, "");
  el.classList.add("loading");
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("no se pudo leer el archivo"));
    reader.readAsDataURL(file);
  });
}

function resizeImageToDataUrl(file) {
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

// ============ Estado inicial ============

async function init() {
  try {
    const s = await fetch("/api/status").then((r) => r.json());
    if (!s.geminiConfigured) {
      setStatus(statusEl, "El servidor no tiene GEMINI_API_KEY configurada. Revisa el archivo .env.", "error");
    }
    if (s.brand) {
      const brand = await fetch("/api/brand-manual").then((r) => r.json());
      showBrand(brand);
    }
  } catch {}
  await refreshGroups();
  renderControlFields();
}
init();

// ============ 1 · Manual de marca ============

pickBrand.addEventListener("click", () => brandInput.click());

brandInput.addEventListener("change", async () => {
  const file = brandInput.files[0];
  brandInput.value = "";
  if (!file) return;
  if (file.type !== "application/pdf") {
    setStatus(brandStatus, "El manual debe ser un PDF.", "error");
    return;
  }
  if (file.size > 50 * 1024 * 1024) {
    setStatus(brandStatus, "El PDF supera 50 MB. Usa una versión más ligera.", "error");
    return;
  }

  setLoadingStatus(brandStatus, "Analizando el manual de marca con IA…");
  pickBrand.disabled = true;

  try {
    const pdf = await fileToDataUrl(file);
    const res = await fetch("/api/brand-manual", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fileName: file.name, pdf }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    showBrand(data);
    setStatus(brandStatus, "Perfil de marca extraído. Se aplicará a todas las generaciones.", "ok");
  } catch (err) {
    setStatus(brandStatus, err.message, "error");
  } finally {
    brandStatus.classList.remove("loading");
    pickBrand.disabled = false;
  }
});

deleteBrand.addEventListener("click", async () => {
  await fetch("/api/brand-manual", { method: "DELETE" });
  brandLoaded.hidden = true;
  brandEmpty.hidden = false;
  setStatus(brandStatus, "Manual eliminado.", "");
});

function showBrand(brand) {
  brandName.textContent = brand.fileName;
  brandProfile.textContent = brand.profile;
  brandEmpty.hidden = true;
  brandLoaded.hidden = false;
}

// ============ 2 · Grupos de ejemplos ============

pickGroupFiles.addEventListener("click", () => groupFileInput.click());

groupFileInput.addEventListener("change", async () => {
  const files = Array.from(groupFileInput.files).filter((f) => f.type.startsWith("image/"));
  groupFileInput.value = "";
  for (const file of files) {
    if (pendingGroupImages.length >= MAX_GROUP_IMAGES) {
      setStatus(groupStatus, `Máximo ${MAX_GROUP_IMAGES} imágenes por grupo.`, "error");
      break;
    }
    try {
      pendingGroupImages.push(await resizeImageToDataUrl(file));
    } catch {
      setStatus(groupStatus, `No se pudo leer "${file.name}".`, "error");
    }
  }
  renderGroupThumbs();
  updateSaveGroupState();
});

groupName.addEventListener("input", updateSaveGroupState);

function updateSaveGroupState() {
  saveGroup.disabled = !(groupName.value.trim() && pendingGroupImages.length > 0);
}

function renderGroupThumbs() {
  groupThumbs.innerHTML = "";
  pendingGroupImages.forEach((src, i) => {
    const div = document.createElement("div");
    div.className = "thumb";
    const img = document.createElement("img");
    img.src = src;
    const btn = document.createElement("button");
    btn.innerHTML = ICONS.x;
    btn.title = "Quitar";
    btn.addEventListener("click", () => {
      pendingGroupImages.splice(i, 1);
      renderGroupThumbs();
      updateSaveGroupState();
    });
    div.append(img, btn);
    groupThumbs.appendChild(div);
  });
}

saveGroup.addEventListener("click", async () => {
  saveGroup.disabled = true;
  try {
    const res = await fetch("/api/groups", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: groupName.value.trim(), images: pendingGroupImages }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || `Error ${res.status}`);
    setStatus(groupStatus, `Grupo "${data.name}" guardado (${data.count} imágenes).`, "ok");
    groupName.value = "";
    pendingGroupImages = [];
    renderGroupThumbs();
    await refreshGroups(data.id);
  } catch (err) {
    setStatus(groupStatus, err.message, "error");
  } finally {
    updateSaveGroupState();
  }
});

async function refreshGroups(selectId) {
  try {
    const { groups } = await fetch("/api/groups").then((r) => r.json());

    // Lista visual
    groupList.innerHTML = "";
    for (const g of groups) {
      const card = document.createElement("div");
      card.className = "group-card";
      if (g.preview) {
        const img = document.createElement("img");
        img.src = g.preview;
        card.appendChild(img);
      }
      const info = document.createElement("div");
      info.innerHTML = `<strong>${escapeHtml(g.name)}</strong><br><small>${g.count} imagen(es)</small>`;
      const del = document.createElement("button");
      del.className = "danger-link";
      del.innerHTML = ICONS.trash + " Eliminar";
      del.addEventListener("click", async () => {
        await fetch(`/api/groups/${g.id}`, { method: "DELETE" });
        refreshGroups();
      });
      card.append(info, del);
      groupList.appendChild(card);
    }

    // Selector de categoría
    const current = selectId || groupSelect.value;
    groupSelect.innerHTML = '<option value="">Sin ejemplos</option>';
    for (const g of groups) {
      const opt = document.createElement("option");
      opt.value = g.id;
      opt.textContent = `${g.name} (${g.count})`;
      groupSelect.appendChild(opt);
    }
    if ([...groupSelect.options].some((o) => o.value === current)) {
      groupSelect.value = current;
    }
  } catch {}
}

function escapeHtml(s) {
  const div = document.createElement("div");
  div.textContent = s;
  return div.innerHTML;
}

// ============ 3 · Crear contenido ============

tipoEl.addEventListener("change", () => {
  const esCarrusel = tipoEl.value === "carrusel";
  countWrap.hidden = esCarrusel;
  slidesWrap.hidden = !esCarrusel;
  renderControlFields();
});
numSlidesEl.addEventListener("change", renderControlFields);
document.querySelectorAll('input[name="modo"]').forEach((radio) =>
  radio.addEventListener("change", renderControlFields)
);

function currentMode() {
  return document.querySelector('input[name="modo"]:checked')?.value || "general";
}

function renderControlFields() {
  const modo = currentMode();
  if (modo !== "control") {
    controlFields.hidden = true;
    controlFields.innerHTML = "";
    return;
  }

  const esCarrusel = tipoEl.value === "carrusel";
  const n = esCarrusel ? parseInt(numSlidesEl.value, 10) : 1;

  // Conservar lo ya escrito al re-renderizar
  const previos = [...controlFields.querySelectorAll(".control-item")].map((item) => ({
    texto: item.querySelector(".ctl-texto").value,
    descripcion: item.querySelector(".ctl-desc").value,
  }));

  controlFields.hidden = false;
  controlFields.innerHTML = "";
  for (let i = 0; i < n; i++) {
    const item = document.createElement("div");
    item.className = "control-item";
    const titulo = esCarrusel ? `Slide ${i + 1}` : "Imagen";
    item.innerHTML = `
      <h3>${titulo}</h3>
      <label>Texto exacto en la imagen <small>(vacío = sin texto)</small>
        <input type="text" class="ctl-texto" maxlength="120" placeholder='Ej: "20% OFF solo hoy"' value="${escapeAttr(previos[i]?.texto || "")}" />
      </label>
      <label>Qué mostrar <small>(opcional)</small>
        <input type="text" class="ctl-desc" maxlength="200" placeholder="Ej: doctora sonriendo en consultorio moderno" value="${escapeAttr(previos[i]?.descripcion || "")}" />
      </label>`;
    controlFields.appendChild(item);
  }
}

function escapeAttr(s) {
  return s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function collectItems() {
  return [...controlFields.querySelectorAll(".control-item")].map((item) => ({
    texto: item.querySelector(".ctl-texto").value.trim(),
    descripcion: item.querySelector(".ctl-desc").value.trim(),
  }));
}

// ============ Generación ============

/**
 * Lee la respuesta de /api/generate como NDJSON (una línea JSON por evento)
 * y llama a onProgress(mensaje) por cada línea de tipo "progress". Devuelve
 * el payload final del evento "done".
 */
async function streamGenerate(body, onProgress) {
  const res = await fetch("/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  // Errores de validación temprana: JSON plano, sin streaming.
  const contentType = res.headers.get("content-type") || "";
  if (!res.ok || !contentType.includes("ndjson")) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Error ${res.status}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalPayload = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIndex;
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);
      if (!line) continue;

      const evt = JSON.parse(line);
      if (evt.type === "progress") onProgress(evt.message);
      else if (evt.type === "error") throw new Error(evt.error || "Error generando contenido.");
      else if (evt.type === "done") finalPayload = evt;
    }
  }

  if (!finalPayload) throw new Error("El servidor no devolvió resultados.");
  return finalPayload;
}

generateBtn.addEventListener("click", async () => {
  const tema = temaEl.value.trim();
  if (!tema) {
    setStatus(statusEl, "Escribe el tema antes de generar.", "error");
    temaEl.focus();
    return;
  }

  const tipo = tipoEl.value;
  const modo = currentMode();

  generateBtn.disabled = true;
  setLoadingStatus(statusEl, "Kino está preparando tu solicitud…");

  try {
    const data = await streamGenerate(
      {
        tema,
        tipo,
        count: parseInt(countEl.value, 10),
        numSlides: parseInt(numSlidesEl.value, 10),
        aspectRatio: aspectEl.value,
        groupId: groupSelect.value || null,
        modo,
        items: modo === "control" ? collectItems() : [],
      },
      (message) => setLoadingStatus(statusEl, message)
    );

    renderResults(data);
    const nota = data.usedBrandProfile ? " (con perfil de marca)" : "";
    setStatus(statusEl, `${data.images.length} imagen(es) generada(s)${nota}.`, "ok");
  } catch (err) {
    setStatus(statusEl, err.message, "error");
  } finally {
    statusEl.classList.remove("loading");
    generateBtn.disabled = false;
  }
});

function renderResults({ images, tipo, verificacion = [] }) {
  resultsPanel.hidden = false;
  gallery.innerHTML = "";

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  images.forEach((src, i) => {
    const fig = document.createElement("figure");
    const img = document.createElement("img");
    img.src = src;
    img.alt = tipo === "carrusel" ? `Slide ${i + 1}` : `Imagen generada ${i + 1}`;
    const cap = document.createElement("figcaption");
    if (tipo === "carrusel") {
      const badge = document.createElement("span");
      badge.className = "slide-badge";
      badge.textContent = `Slide ${i + 1}/${images.length}`;
      cap.appendChild(badge);
    }

    // Skill correctora de ortografía
    const v = verificacion[i];
    if (v?.verificada) {
      const spell = document.createElement("span");
      const detalle = (v.errores || [])
        .map((e) => `"${e.visto}" → "${e.correccion}"`)
        .join("; ");
      if (v.ok) {
        spell.className = "spell-badge ok";
        spell.innerHTML = ICONS.check + (v.intentos > 0 ? " Texto corregido" : " Texto verificado");
        spell.title =
          v.intentos > 0
            ? "Se detectaron errores de ortografía y la imagen fue corregida automáticamente."
            : "Ortografía verificada (español/inglés).";
      } else {
        spell.className = "spell-badge warn";
        spell.innerHTML = ICONS.alertTriangle + " Revisar texto";
        spell.title =
          `Se intentó corregir ${v.intentos} vez/veces sin éxito total.` +
          (detalle ? ` Errores restantes: ${detalle}` : "");
      }
      cap.appendChild(spell);
    }
    const link = document.createElement("a");
    link.href = src;
    link.download = `kino-${stamp}-${i + 1}.png`;
    link.innerHTML = ICONS.download + " Descargar";
    cap.appendChild(link);
    fig.append(img, cap);
    gallery.appendChild(fig);
  });

  resultsPanel.scrollIntoView({ behavior: "smooth" });
}
