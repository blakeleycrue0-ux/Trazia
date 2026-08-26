# Anuncio de Trazia (9:16)

Un anuncio de 8 segundos hecho con HTML y CSS, no con vídeo generado: el texto
sale nítido y con las tipografías reales de la marca.

## Editarlo

Abre `anuncio.html` en el navegador y se reproduce solo. Todo el texto está en
el HTML, en claro:

| Dónde | Qué dice ahora |
| --- | --- |
| `.eyebrow` | Curso 2026 / 2027 |
| `.headline` | Todo el insti |
| `.swap__a` | en mil sitios. |
| `.swap__b` | aquí. |
| `.note` (x4) | Horario / Notas / Entregas / Hábitos |
| `.outro__claim` | Traza tu día. |
| `.outro__url` | trazia.site |

Los tiempos son los `animation-delay` de cada regla, en milisegundos sobre una
única línea de tiempo de 8 segundos (`window.AD_DURATION`).

## Exportarlo

```bash
node anuncio/render.mjs
```

Deja en `anuncio/salida/`:

- `anuncio-trazia.webm` — el vídeo, 1080x1920 a 25 fps.
- `clave-1..4.png` — cuatro fotogramas sueltos, listos para publicar como
  carrusel o como anuncio fijo.

Variables opcionales: `OUT` (carpeta de salida), `FONT_DIR` (copia local de las
tipografías si no hay acceso a Google Fonts) y `FFMPEG`.

## Sobre el formato

Sale en **WebM** porque el ffmpeg del entorno donde se generó no trae H.264.
Para publicarlo en TikTok o Instagram, que quieren MP4, tienes dos caminos:

1. Convertir el WebM a MP4 con cualquier conversor.
2. Abrir `anuncio.html` a pantalla completa y grabar la pantalla: el móvil ya
   graba en MP4 y la animación arranca sola al cargar.
