# 🎨 Kino · Generador de Imágenes IA

Generador de contenido visual de marketing impulsado por IA. Cargas tu **manual de marca (PDF)**, organizas tus **ejemplos por categorías**, escribes solo el **tema** y genera **imágenes sueltas o carruseles** coherentes con tu marca.

## ¿Cómo funciona?

El usuario **solo escribe el tema** — toda la experiencia de dirección de arte vive en una **skill interna** (`lib/skill.js`) que construye los prompts completos por debajo.

```
Manual de marca (PDF) ──► perfil de marca extraído por Gemini ─┐
Grupos de ejemplos (categoría elegida) ────────────────────────┤
Tema + modo (General / Control total) ─────────────────────────┴─► SKILL ─► prompts ─► Gemini ─► Imágenes o Carrusel
```

### Funcionalidades

1. **Manual de marca (PDF)** — Lo subes una vez; Gemini extrae un perfil de marca (colores exactos, tipografías, logo, tono, reglas) que se aplica automáticamente a todas las generaciones.
2. **Grupos de ejemplos por categoría** — Organiza tus referencias en grupos con nombre (ej: *"posts educativos"*, *"promociones"*). Antes de generar eliges qué categoría usar.
3. **Imagen suelta o carrusel** — Las imágenes sueltas admiten 1–4 variaciones. Los carruseles (2–8 slides) se generan con arco narrativo (portada/gancho → desarrollo → cierre con CTA) y consistencia visual: cada slide usa la anterior como ancla de estilo.
4. **Dos modos de generación**:
   - **✨ General**: todo se genera automáticamente — la IA decide composición y textos.
   - **🎛 Control total**: tú defines por cada imagen/slide el **texto exacto** que debe aparecer (o ninguno) y **qué mostrar**.
5. **Skill correctora de ortografía** (`lib/corrector.js`) — Cada imagen generada pasa por un ciclo revisar → corregir → re-verificar:
   - **Revisar**: transcribe letra por letra todo el texto visible, detecta el idioma (español o inglés) y verifica estrictamente ortografía, tildes y palabras deformadas (errores típicos de IA como *"Inscrébte"* en vez de *"Inscríbete"*).
   - **Corregir**: si hay errores, **edita la imagen** (no la regenera) para arreglar solo el texto, manteniendo diseño, colores y composición idénticos. Hasta 2 intentos de corrección por imagen.
   - En modo control además comprueba que el texto aparezca exactamente como lo escribiste.
   - Resultado por imagen: **✓ Texto verificado**, **✓ Texto corregido** o **⚠ Revisar texto** (con el detalle "visto → corrección" al pasar el cursor).

## Requisitos

- Node.js 18 o superior
- Una API key de **Google AI Studio** (gratuita): https://aistudio.google.com/apikey

## Instalación

```bash
npm install
cp .env.example .env   # agrega tu GEMINI_API_KEY
npm start              # abre http://localhost:3000
```

## API

### `POST /api/generate`

```json
{
  "tema": "beneficios de la medicina funcional",
  "tipo": "carrusel",
  "numSlides": 4,
  "aspectRatio": "4:5",
  "groupId": "uuid-del-grupo",
  "modo": "control",
  "items": [
    { "texto": "¿Sabías esto?", "descripcion": "portada llamativa con pregunta" },
    { "texto": "", "descripcion": "infografía de beneficios" }
  ]
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `tema` | string | Obligatorio. **Solo el tema** — la skill construye los prompts. |
| `tipo` | string | `"imagen"` (default) o `"carrusel"`. |
| `count` | number | Imagen suelta: 1–4 variaciones. |
| `numSlides` | number | Carrusel: 2–8 slides. |
| `aspectRatio` | string | `1:1`, `4:5`, `9:16`, `16:9`, `3:4`. |
| `groupId` | string | Categoría de ejemplos a usar como referencia (opcional). |
| `modo` | string | `"general"` (todo automático) o `"control"` (textos exactos). |
| `items` | array | Modo control: `{ texto, descripcion }` por imagen/slide. |

Respuesta: `{ images: [...], prompts: [...], tipo, enhanced, usedBrandProfile }`.

### Manual de marca

- `POST /api/brand-manual` — `{ fileName, pdf }` (data URL base64). Extrae y guarda el perfil de marca.
- `GET /api/brand-manual` — perfil actual.
- `DELETE /api/brand-manual` — lo elimina.

### Grupos de ejemplos

- `GET /api/groups` — lista de categorías.
- `POST /api/groups` — `{ name, images: ["data:image/...;base64,..."] }` (máx. 10 imágenes).
- `DELETE /api/groups/:id`

## Estructura del proyecto

```
├── server.js          # Servidor Express + endpoints
├── lib/
│   ├── skill.js       # SKILL de marketing: instrucciones + plantillas (imagen y carrusel)
│   ├── corrector.js   # SKILL correctora: revisa ortografía y corrige editando la imagen
│   ├── gemini.js      # Todo Gemini: skill, generación/edición de imágenes y análisis del manual
│   ├── brand.js       # Análisis del manual de marca (PDF → perfil de marca)
│   └── store.js       # Persistencia local (data/store.json): marca + grupos
└── public/            # Interfaz web (español)
```

## Notas

- El manual de marca admite PDFs de hasta **50 MB**: los pequeños se envían embebidos y los grandes se suben por la Files API de Gemini (se eliminan de Gemini tras el análisis).
- El perfil de marca y los grupos se guardan en `data/` (fuera de git) y sobreviven reinicios del servidor.
- Las imágenes de referencia se redimensionan en el navegador (máx. 1568 px) antes de enviarse.
- Las claves API viven solo en el servidor (`.env`); nunca se exponen al navegador.
- Si la construcción del prompt con Gemini falla, la skill usa su plantilla determinista — la generación nunca se bloquea.
