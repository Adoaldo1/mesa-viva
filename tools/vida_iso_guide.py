"""Converte o traçado plano do tabuleiro da Vida Adulta (layout.png, vista de cima) para a projeção isométrica
usada no jogo (câmera ortográfica, azimute 45°, elevação 30°). O resultado é o "esqueleto" que o gerador de imagem
pinta como cidade isométrica — as ruas caem exatamente onde o jogo desenha as casas.

Uso: python tools/vida_iso_guide.py layout.png saida.png
Os mesmos números (ISO_AZ, ISO_EL, ISO_VIEW) estão em js/vida3d.js.
"""
import sys, math
import numpy as np
from PIL import Image

AZ, EL = math.radians(45), math.radians(30)
BW, BH = 20, 13
# janela da imagem no espaço da tela (unidades do mundo): x de -VW/2 a VW/2, y de -VH/2 a VH/2
VW, VH = 26.4, 14.85
OUT_W, OUT_H = 1600, 900

o = np.array([math.sin(AZ) * math.cos(EL), math.sin(EL), math.cos(AZ) * math.cos(EL)])
f = -o / np.linalg.norm(o)
r = np.cross(f, [0, 1, 0]); r /= np.linalg.norm(r)
u = np.cross(r, f)

def main(src, dst):
    lay = np.asarray(Image.open(src).convert('RGB')).astype(np.uint8)
    LH, LW = lay.shape[:2]; k = LW / BW
    xs = (np.arange(OUT_W) + .5) / OUT_W * VW - VW / 2
    ys = VH / 2 - (np.arange(OUT_H) + .5) / OUT_H * VH
    SX, SY = np.meshgrid(xs, ys)
    Q = SX[..., None] * r + SY[..., None] * u
    t = -Q[..., 1] / f[1]
    P = Q + t[..., None] * f
    X = ((P[..., 0] + BW / 2) * k).astype(int); Z = ((P[..., 2] + BH / 2) * k).astype(int)
    inside = (X >= 0) & (X < LW) & (Z >= 0) & (Z < LH)
    out = np.zeros((OUT_H, OUT_W, 3), np.uint8); out[:] = (110, 190, 80)
    out[inside] = lay[Z[inside], X[inside]]
    Image.fromarray(out).save(dst)
    print('ok', dst, 'r', r.round(3), 'u', u.round(3))

if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2])
