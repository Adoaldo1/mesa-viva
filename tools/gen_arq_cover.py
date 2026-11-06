"""Gera assets/cover_arq.webp a partir de uma foto do tabuleiro 3D do próprio jogo.

A foto vem do navegador (tabuleiro 3D numa partida de bots no meio do jogo, luz da tarde, renderizado em 2x)
e é salva como PNG; aqui ela recebe o recorte 4:3, a mesma graduação de cor da tela do jogo, vinheta e o título.
Uso: python tools/gen_arq_cover.py foto.png"""
import os, sys
from PIL import Image, ImageDraw, ImageEnhance, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
W, H = 768, 576

src = Image.open(sys.argv[1]).convert("RGB")
sw, sh = src.size
crop_h = round(sw * 3 / 4)
top = 0  # corta embaixo: a ilha desce e sobra mar em cima para o título
img = src.crop((0, top, sw, top + crop_h)).resize((W, H), Image.LANCZOS)

# mesma graduação do horário "tarde" no jogo (saturate 1.08, contrast 1.04)
img = ImageEnhance.Color(img).enhance(1.12)
img = ImageEnhance.Contrast(img).enhance(1.05)

# vinheta suave e faixa escura no topo (leitura do título)
shade = Image.new("L", (W, H), 0); sd = ImageDraw.Draw(shade)
sd.ellipse([-W * .25, -H * .2, W * 1.25, H * 1.25], fill=255)
shade = shade.filter(ImageFilter.GaussianBlur(70))
dark = Image.new("RGB", (W, H), (6, 24, 34))
img = Image.composite(img, dark, shade.point(lambda v: 90 + v * 165 // 255))
band = Image.new("L", (W, H), 0); bd = ImageDraw.Draw(band)
for y in range(150):
    bd.line([(0, y), (W, y)], fill=int(170 * (1 - y / 150) ** 1.6))
img = Image.composite(dark, img, band)


def font(sz):
    for f in ["C:/Windows/Fonts/georgiab.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"]:
        if os.path.exists(f):
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()


# título: dourado com contorno escuro e sombra
t, f = "ARQUIPÉLAGO", font(66)
d = ImageDraw.Draw(img)
w = d.textlength(t, font=f); x, y = (W - w) / 2, 22
glow = Image.new("L", (W, H), 0); ImageDraw.Draw(glow).text((x, y + 4), t, font=f, fill=255)
img.paste((4, 14, 20), mask=glow.filter(ImageFilter.GaussianBlur(8)).point(lambda v: min(255, v * 2)))
d = ImageDraw.Draw(img)
d.text((x, y), t, font=f, fill=(255, 226, 140), stroke_width=4, stroke_fill=(52, 30, 12))
# brilho no alto das letras
hi = Image.new("L", (W, H), 0); ImageDraw.Draw(hi).text((x, y), t, font=f, fill=255)
grad = Image.new("L", (W, H), 0); gd = ImageDraw.Draw(grad)
for yy in range(int(y), int(y + 40)):
    gd.line([(0, yy), (W, yy)], fill=int(150 * (1 - (yy - y) / 40)))
img.paste((255, 248, 214), mask=Image.composite(grad, Image.new("L", (W, H), 0), hi))

out = os.path.join(ROOT, "assets", "cover_arq.webp")
img.save(out, quality=90, method=6)
print(out, os.path.getsize(out) // 1024, "KB")
