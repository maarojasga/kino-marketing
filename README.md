# 🎨 Kino · Generador de Imágenes IA

Generador de imágenes de contenido para marketing impulsado por IA. Le pasas **imágenes de ejemplo** (referencias de estilo, marca, productos), escribes un **prompt** y genera **imágenes nuevas** que siguen esa línea visual.

## ¿Cómo funciona?

El usuario **solo escribe el tema** — toda la experiencia de dirección de arte vive en una **skill interna** (`lib/skill.js`) que construye el prompt completo por debajo.

1. **Subes hasta 6 imágenes de ejemplo** (opcional): posts anteriores, fotos de producto, referencias de identidad visual.
2. **Escribes solo el tema** (ej: *"20% de descuento en la colección de verano"*).
3. **La skill construye el prompt completo**: composición, estilo, formato, coherencia de marca. Si hay `ANTHROPIC_API_KEY`, Claude ejecuta la skill analizando tus referencias; si no, se usa la plantilla determinista de la skill.
4. **Gemini genera las imágenes** (1 a 4 por solicitud) usando tus referencias + el prompt construido, en el formato que elijas (cuadrado, historia, horizontal…).

```
Tema ──► [SKILL: dirección de arte (Claude o plantilla)] ──► prompt completo ──► [Gemini] ──► Imágenes
```

### La skill (`lib/skill.js`)

- `instrucciones`: las reglas de dirección de arte (composición, estilo, marca, formato, texto) que Claude sigue al construir el prompt.
- `construirPrompt(tema, opciones)`: plantilla determinista de respaldo cuando Claude no está configurado.

Para ajustar el estilo de las imágenes generadas, edita la skill — no es necesario tocar el resto del código.

## Requisitos

- Node.js 18 o superior
- Una API key de **Google AI Studio** (gratuita): https://aistudio.google.com/apikey
- *(Opcional)* Una API key de **Anthropic** para la mejora de prompts: https://platform.claude.com/

## Instalación

```bash
# 1. Instalar dependencias
npm install

# 2. Configurar las API keys
cp .env.example .env
# Edita .env y agrega tu GEMINI_API_KEY (y ANTHROPIC_API_KEY si quieres mejora de prompts)

# 3. Iniciar el servidor
npm start
```

Abre **http://localhost:3000** en tu navegador.

## API

### `POST /api/generate`

```json
{
  "prompt": "descuento de verano 20%",
  "referenceImages": ["data:image/jpeg;base64,..."],
  "count": 2,
  "aspectRatio": "1:1",
  "enhanceWithClaude": true
}
```

Respuesta:

```json
{
  "images": ["data:image/png;base64,..."],
  "finalPrompt": "prompt completo construido por la skill",
  "enhanced": true
}
```

| Campo | Tipo | Descripción |
|---|---|---|
| `prompt` | string | Obligatorio. **Solo el tema** — la skill construye el prompt completo. |
| `referenceImages` | string[] | Data URLs base64. Máx. 6. |
| `count` | number | 1–4 imágenes. |
| `aspectRatio` | string | `1:1`, `4:5`, `9:16`, `16:9`, `3:4`, etc. |
| `enhanceWithClaude` | boolean | Ejecuta la skill con Claude (requiere `ANTHROPIC_API_KEY`); si es `false` o falla, se usa la plantilla de la skill. |

### `GET /api/status`

Indica qué proveedores están configurados en el servidor.

## Estructura del proyecto

```
├── server.js          # Servidor Express + endpoint de generación
├── lib/
│   ├── skill.js       # SKILL de marketing: instrucciones + plantilla de prompt
│   ├── gemini.js      # Generación de imágenes (gemini-2.5-flash-image)
│   └── claude.js      # Ejecuta la skill con Claude (claude-opus-5)
└── public/            # Interfaz web (español)
    ├── index.html
    ├── app.js
    └── style.css
```

## Notas

- Las imágenes de referencia se redimensionan en el navegador (máx. 1568 px) antes de enviarse.
- Las claves API viven solo en el servidor (`.env`); nunca se exponen al navegador.
- Si Claude falla o no está configurado, la generación continúa con el prompt original.
