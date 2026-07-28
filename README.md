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
5. **Verificador de ortografía** — Tras generar cada imagen, la skill lee su texto, detecta el idioma (español o inglés) y verifica ortografía, tildes y letras deformadas. Si encuentra errores, **regenera la imagen automáticamente** con la corrección; en modo control también comprueba que el texto aparezca exactamente como lo escribiste. El resultado se muestra con una insignia por imagen (✓ verificado / ✓ corregido / ⚠ revisar).

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
│   ├── gemini.js      # Todo Gemini: skill, generación de imágenes/carruseles y análisis del manual
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
