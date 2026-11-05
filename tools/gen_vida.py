"""Gera os personagens da Vida Adulta a partir das fotos dos amigos (FLUX.2 Klein 4B, edição com referência).
Caricaturas cômicas e cartunescas com humor adulto (perrengues da vida adulta).

Uso:  python tools/gen_vida.py [--seeds N] [nome ...]      Saída: assets/vida/<nome>.webp
"""
import os, sys, random, io, json, time, urllib.request, urllib.parse
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_cards as G

OUT = os.path.join(G.HERE, "..", "assets", "vida"); os.makedirs(OUT, exist_ok=True)
KEEP = G.KEEP
STYLE = (" Funny cartoon caricature illustration in a bold comic style: big expressive head on a smaller body, exaggerated funny facial expression, "
         "thick clean outlines, flat vibrant colors with soft cel shading, playful adult humor about the chaos of grown-up life, simple colorful background, "
         "vertical portrait, waist-up, no text, no letters, no logos.")
EDIT = ("Turn the man in image 1 into a funny cartoon caricature (bold comic style, big head, thick outlines, flat vibrant colors). "
        "Keep his face recognizable: same face shape, skin tone, exact haircut and hair length, eyes, nose and expression features. ")
CHARS = {
    "rei": ("rei.png", "Make the man in image 1 a funny cartoon caricature of 'the eternal civil service exam student'. " + KEEP +
            "Keep his mustache. He is exhausted with huge dark circles, half asleep over a giant pile of study books and sticky notes, holding a huge coffee mug." + STYLE),
    "tesoureiro": ("tesoureiro.png", "Make the man in image 1 a funny cartoon caricature of 'the WhatsApp group crypto investor'. " + KEEP +
                   "He wears a cheap shiny suit, sweating nervously, staring at a phone showing a red crashing chart, with banknotes flying away." + STYLE),
    "sicario": ("sicario.png", "Make the man in image 1 a funny cartoon caricature of 'the gym obsessed guy'. " + KEEP +
                "He wears a tank top, flexing proudly with comically huge biceps, holding a giant protein shaker, in a gym." + STYLE),
    "corsario": ("corsario.webp", "Make the man in image 1 a funny cartoon caricature of 'the party king'. " + KEEP +
                 "Keep his curly hair with blond highlights and his earring. He wears sunglasses on his head and a flashy shirt, holding a champagne bottle, confetti around, looking hungover and happy." + STYLE),
    "confessor": ("confessor.png", "Make the man in image 1 a funny cartoon caricature of 'the dad of a pet'. " + KEEP +
                  "He carries a tiny grumpy dog in a baby carrier on his chest, with a pet stroller and toys, looking tired but proud." + STYLE),
    "escriba": ("escriba.png", "Make the man in image 1 a funny cartoon caricature of 'the home office worker'. " + KEEP +
                "Keep his mustache and goatee. He wears a shirt and tie on top and pajama shorts with slippers, holding a laptop on a video call, a messy room behind." + STYLE),
    "diplomata": ("diplomata.png", EDIT + "He becomes 'the side hustle ride-share driver': sitting at a car steering wheel with a phone holder full of notifications and an energy drink, tired smile. "
                  "His exact haircut: very short dense black hair with tight 360 waves only 1 to 2 centimeters long; do NOT make the hair longer. Keep the gold necklace." + STYLE),
    "guarda": ("guarda.png", EDIT + "He becomes 'the barbecue master': wearing a funny apron, holding barbecue tongs and a skewer of meat, smoke from a grill, proud and sweaty. "
               "Keep his round face, short curly hair with a low fade and stocky build." + STYLE),
}


def run(name, out_name, seed):
    foto, prompt = CHARS[name]
    prompt = prompt.replace("the man in image 1", "the man in image 1, " + G.LOOKS[name] + ",", 1)
    img_name = G.upload(os.path.join(G.FOTOS, foto), G.CROPS.get(name))
    wf = G.workflow(img_name, prompt, seed, 864, 1152); wf["18"]["inputs"]["filename_prefix"] = "vida/char"
    pid = G.post("/prompt", {"prompt": wf, "client_id": "vida"})["prompt_id"]
    t0 = time.time()
    while True:
        time.sleep(1.5)
        hist = json.loads(urllib.request.urlopen(G.SERVER + "/history/" + pid).read())
        if pid in hist:
            e = hist[pid]
            if e.get("status", {}).get("status_str") == "error": raise RuntimeError(json.dumps(e["status"])[:600])
            imgs = [i for o in e["outputs"].values() for i in o.get("images", [])]
            if imgs: break
        if time.time() - t0 > 900: raise TimeoutError(name)
    im = imgs[0]
    raw = urllib.request.urlopen(G.SERVER + "/view?" + urllib.parse.urlencode({"filename": im["filename"], "subfolder": im["subfolder"], "type": im["type"]})).read()
    img = Image.open(io.BytesIO(raw)).convert("RGB"); img.thumbnail((480, 640), Image.LANCZOS)
    path = os.path.join(OUT, out_name + ".webp"); img.save(path, "WEBP", quality=82, method=6)
    print(f"[ok] {out_name} seed={seed} {time.time()-t0:.1f}s -> {os.path.getsize(path)//1024}KB", flush=True)


if __name__ == "__main__":
    seeds = int(sys.argv[sys.argv.index("--seeds") + 1]) if "--seeds" in sys.argv else 1
    names = [a for a in sys.argv[1:] if not a.startswith("--") and not a.isdigit()] or list(CHARS)
    for n in names:
        for k in range(1, seeds + 1):
            try: run(n, f"{n}_{k}" if seeds > 1 else n, random.randint(1, 2**31))
            except Exception as e: print(f"[erro] {n}: {e}", flush=True)
    print("DONE", flush=True)
