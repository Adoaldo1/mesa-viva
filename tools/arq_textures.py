"""Arquipélago — prepara as texturas dos biomas a partir das artes geradas (tools/arq_src/*.webp).

Para cada textura: deixa contínua (sem emenda ao repetir), reduz para 512 px e calcula um normal map a partir do
relevo aproximado (luminância suavizada). A rocha vulcânica é derivada da rocha de granito, recolorida.
Uso: python tools/arq_textures.py

Artes de origem (Z-Image Turbo, 1024x1024, prompts "seamless tileable stylized hand-painted game texture, top-down view of ..."):
  grama  (seed 1101) lush tropical grass ground with small clover patches
  rocha  (seed 1104) rough grey-blue granite rock surface with angular facets
  areia  (seed 1106) warm golden beach sand with fine ripples
  terra  (seed 2102) freshly tilled crumbly dark brown farm soil
  argila (seed 2103) natural wet clay riverbank mud
"""
import os
import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SRC, OUT = os.path.join(ROOT, "tools", "arq_src"), os.path.join(ROOT, "assets", "arq")
SIZE = 512
os.makedirs(OUT, exist_ok=True)


def seamless(img, band=0.18):
    """Mistura cada borda com a borda oposta (deslocando meia imagem), para a textura repetir sem costura."""
    a = np.asarray(img).astype(np.float32)
    h, w = a.shape[:2]
    shifted = np.roll(np.roll(a, h // 2, 0), w // 2, 1)
    # peso: 1 no meio da imagem original, 0 nas bordas (onde a versão deslocada, que é contínua ali, assume)
    yy, xx = np.mgrid[0:h, 0:w]
    d = np.minimum(np.minimum(xx, w - 1 - xx) / (w * band), np.minimum(yy, h - 1 - yy) / (h * band))
    m = np.clip(d, 0, 1)[..., None]
    m = m * m * (3 - 2 * m)
    return Image.fromarray(np.clip(a * m + shifted * (1 - m), 0, 255).astype(np.uint8))


def normal_map(img, strength=2.2, blur=1.6):
    g = np.asarray(img.convert("L").filter(ImageFilter.GaussianBlur(blur))).astype(np.float32) / 255
    dx = (np.roll(g, -1, 1) - np.roll(g, 1, 1)) * strength
    dy = (np.roll(g, -1, 0) - np.roll(g, 1, 0)) * strength
    n = np.dstack([-dx, -dy, np.ones_like(g)])
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return Image.fromarray(((n * .5 + .5) * 255).astype(np.uint8))


def roughness_map(img, base, spread, invert=False):
    """Aspereza (canal G, como o Three.js lê): partes claras/altas mais ásperas; com invert, as escuras (molhadas) brilham."""
    g = np.asarray(img.convert("L").filter(ImageFilter.GaussianBlur(2))).astype(np.float32) / 255
    g = (g - g.mean()) / (g.std() + 1e-6)
    r = np.clip(base + (-g if invert else g) * spread, 0.05, 1)
    v = (r * 255).astype(np.uint8)
    return Image.fromarray(np.dstack([v, v, v]))


# aspereza por bioma: (base, variação, invertido)
ROUGH = {"grama": (.9, .06, False), "terra": (.95, .04, False), "argila": (.72, .2, True), "rocha": (.62, .18, False), "areia": (.92, .05, False), "basalto": (.8, .12, True)}


def save(name, img, strength):
    img = seamless(img.convert("RGB")).resize((SIZE, SIZE), Image.LANCZOS)
    img.save(os.path.join(OUT, f"tex_{name}.webp"), quality=86)
    normal_map(img, strength).save(os.path.join(OUT, f"tex_{name}_n.webp"), quality=90)
    roughness_map(img, *ROUGH[name]).save(os.path.join(OUT, f"tex_{name}_r.webp"), quality=86)
    print(name, "ok")


src = lambda n: Image.open(os.path.join(SRC, n + ".webp"))
save("grama", src("grama"), 1.8)
save("terra", src("terra"), 2.4)
save("argila", src("argila"), 1.6)
save("rocha", src("rocha"), 3.0)
save("areia", src("areia"), 1.4)
# basalto: o granito em tons de carvão e terra escura (mesmo estilo de pincel)
g = np.asarray(src("rocha").convert("L")).astype(np.float32) / 255
lo, hi = np.array([34, 30, 30], np.float32), np.array([112, 96, 84], np.float32)
basalt = lo + (hi - lo) * (g[..., None] ** 1.3)
save("basalto", Image.fromarray(basalt.astype(np.uint8)), 3.0)
