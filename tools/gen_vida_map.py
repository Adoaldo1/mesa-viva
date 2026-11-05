"""Gera o mapa pintado do tabuleiro da Vida Adulta (FLUX.2 Klein com imagem de referência).
A referência é o "esqueleto" do traçado (estradas cinza, rio azul, praça bege) desenhado nas posições exatas do jogo;
o modelo pinta uma cidade cartunesca em volta, mantendo estradas e rio no lugar.

Uso: python tools/gen_vida_map.py caminho/layout.png [--seeds N]     Saída: assets/vida/mapa_<n>.webp
"""
import os, sys, random, io, json, time, urllib.request, urllib.parse
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_cards as G

OUT = os.path.join(G.HERE, "..", "assets", "vida"); os.makedirs(OUT, exist_ok=True)
PROMPT = ("Transform image 1 into a highly detailed, dense, colorful hand-drawn cartoon city map seen from above at a slight isometric angle, "
          "in a comic book illustration style with thick black ink outlines, cel shading and vibrant saturated colors. "
          "Keep the gray roads exactly in the same positions and shapes: they become clean empty asphalt streets with white lane markings and nothing on top of them. "
          "Keep the blue river exactly where it is, with small bridges where roads cross it. Keep the beige circle as an empty round paved town plaza. "
          "Fill every green area densely with quirky small buildings, colorful houses with red and blue roofs, shops, apartment blocks, tiny offices, "
          "trees, parks, a university with columns, a little wedding chapel, a casino with lights, a farm with a windmill, a bank, a courthouse, "
          "a mansion with a swimming pool, construction cranes and tiny cars parked on side lots. Funny, lively, crowded, playful adult cartoon style. "
          "No text, no letters, no words, no logos.")


def run(layout, out_name, seed, W=1536, H=1000):
    img_name = G.upload(layout)
    wf = G.workflow(img_name, PROMPT, seed, W, H); wf["18"]["inputs"]["filename_prefix"] = "vida/mapa"
    wf["5"]["inputs"]["megapixels"] = 1.5
    pid = G.post("/prompt", {"prompt": wf, "client_id": "vidamap"})["prompt_id"]
    t0 = time.time()
    while True:
        time.sleep(2)
        hist = json.loads(urllib.request.urlopen(G.SERVER + "/history/" + pid).read())
        if pid in hist:
            e = hist[pid]
            if e.get("status", {}).get("status_str") == "error": raise RuntimeError(json.dumps(e["status"])[:600])
            imgs = [i for o in e["outputs"].values() for i in o.get("images", [])]
            if imgs: break
        if time.time() - t0 > 1200: raise TimeoutError(out_name)
    im = imgs[0]
    raw = urllib.request.urlopen(G.SERVER + "/view?" + urllib.parse.urlencode({"filename": im["filename"], "subfolder": im["subfolder"], "type": im["type"]})).read()
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    path = os.path.join(OUT, out_name + ".webp"); img.save(path, "WEBP", quality=86, method=6)
    print(f"[ok] {out_name} seed={seed} {img.size} {time.time()-t0:.1f}s -> {os.path.getsize(path)//1024}KB", flush=True)


if __name__ == "__main__":
    layout = [a for a in sys.argv[1:] if not a.startswith("--") and not a.isdigit()][0]
    seeds = int(sys.argv[sys.argv.index("--seeds") + 1]) if "--seeds" in sys.argv else 1
    for k in range(1, seeds + 1):
        try: run(layout, f"mapa_{k}", random.randint(1, 2**31))
        except Exception as e: print(f"[erro] {e}", flush=True)
    print("DONE", flush=True)
