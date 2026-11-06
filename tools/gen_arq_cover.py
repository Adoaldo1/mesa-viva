"""Gera assets/cover_arq.webp: capa do Arquipélago desenhada em código (ilha de hexágonos, mar, título).
Uso: python tools/gen_arq_cover.py"""
import math, os, random
from PIL import Image, ImageDraw, ImageFilter, ImageFont

W, H = 768, 576
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
random.seed(14)

img = Image.new("RGB", (W, H))
d = ImageDraw.Draw(img)
# mar: degradê do turquesa raso ao azul fundo
for y in range(H):
    t = y / H
    d.line([(0, y), (W, y)], fill=(int(28 + 20 * (1 - t)), int(120 - 50 * t), int(150 - 40 * t)))
# brilhos na água
for _ in range(900):
    x, y, l = random.randrange(W), random.randrange(H), random.randint(4, 16)
    d.line([(x, y), (x + l, y)], fill=(120, 200, 215), width=1)

COL = {"mata": (54, 120, 58), "barreiro": (186, 98, 60), "algodoal": (232, 226, 200), "pedreira": (128, 128, 136), "vulcao": (70, 52, 46)}
kinds = ["mata"] * 4 + ["barreiro"] * 4 + ["algodoal"] * 5 + ["pedreira"] * 5 + ["vulcao"]
random.shuffle(kinds)
size, cx, cy = 50, W / 2, H / 2 + 34
coords = [(q, r) for r in range(-2, 3) for q in range(max(-2, -2 - r), min(2, 2 - r) + 1)]

def corners(x, y, s):
    return [(x + s * math.cos(math.radians(60 * i - 30)), y + s * math.sin(math.radians(60 * i - 30))) for i in range(6)]

# sombra e areia da costa
shadow = Image.new("L", (W, H), 0); sd = ImageDraw.Draw(shadow)
for q, r in coords:
    x, y = cx + size * math.sqrt(3) * (q + r / 2), cy + size * 1.5 * r
    sd.polygon(corners(x, y + 10, size * 1.12), fill=255)
img.paste((12, 40, 52), mask=shadow.filter(ImageFilter.GaussianBlur(14)))
for q, r in coords:
    x, y = cx + size * math.sqrt(3) * (q + r / 2), cy + size * 1.5 * r
    d.polygon(corners(x, y, size * 1.1), fill=(226, 205, 150))
# hexágonos com relevo (lado mais escuro embaixo)
for (q, r), k in zip(coords, kinds):
    x, y = cx + size * math.sqrt(3) * (q + r / 2), cy + size * 1.5 * r
    base = COL[k]
    d.polygon(corners(x, y + 6, size * .94), fill=tuple(int(c * .6) for c in base))
    d.polygon(corners(x, y, size * .94), fill=base, outline=(40, 30, 20))
    if k == "mata":
        for i in range(5):
            tx, ty = x + random.uniform(-22, 22), y + random.uniform(-18, 18)
            d.polygon([(tx, ty - 16), (tx - 9, ty + 6), (tx + 9, ty + 6)], fill=(28, 80, 36))
    elif k == "pedreira":
        for i in range(3):
            tx, ty = x + random.uniform(-18, 18), y + random.uniform(-12, 14)
            d.polygon([(tx - 14, ty + 8), (tx - 2, ty - 14), (tx + 12, ty + 8)], fill=(96, 96, 104), outline=(60, 60, 66))
    elif k == "algodoal":
        for i in range(9):
            tx, ty = x + random.uniform(-24, 24), y + random.uniform(-20, 20)
            d.ellipse([tx - 4, ty - 4, tx + 4, ty + 4], fill=(255, 255, 250), outline=(170, 160, 130))
    elif k == "barreiro":
        for i in range(3):
            tx, ty = x + random.uniform(-20, 12), y + random.uniform(-14, 12)
            d.rectangle([tx, ty, tx + 14, ty + 7], fill=(150, 70, 40), outline=(100, 45, 25))
    elif k == "vulcao":
        d.polygon([(x - 26, y + 18), (x - 6, y - 22), (x + 6, y - 22), (x + 26, y + 18)], fill=(52, 38, 34))
        d.ellipse([x - 9, y - 30, x + 9, y - 18], fill=(240, 110, 40))
# barquinho
bx, by = 120, 470
d.polygon([(bx - 26, by), (bx + 26, by), (bx + 18, by + 12), (bx - 18, by + 12)], fill=(110, 68, 36))
d.polygon([(bx, by - 44), (bx, by - 4), (bx + 26, by - 6)], fill=(245, 238, 215))
d.line([(bx, by - 46), (bx, by)], fill=(70, 45, 25), width=3)

# título
def font(sz):
    for f in ["C:/Windows/Fonts/georgiab.ttf", "C:/Windows/Fonts/georgia.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf"]:
        if os.path.exists(f):
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()
f = font(64)
t = "ARQUIPÉLAGO"
w = d.textlength(t, font=f)
for dx, dy in [(-3, 3), (3, 3), (0, 5)]:
    d.text(((W - w) / 2 + dx, 40 + dy), t, font=f, fill=(20, 30, 40))
d.text(((W - w) / 2, 40), t, font=f, fill=(250, 226, 150))

img.save(os.path.join(ROOT, "assets", "cover_arq.webp"), quality=88)
print("assets/cover_arq.webp")
