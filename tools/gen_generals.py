"""Gera os comandantes do Supremacia a partir das fotos dos amigos (FLUX.2 Klein 4B, edição com referência).

Uso:  python tools/gen_generals.py [--seeds N] [nome ...]
Reaproveita o fluxo e as descrições de rosto de gen_cards.py. Saída: assets/war/<nome>.webp
"""
import os, sys, random, io, json, time, urllib.request, urllib.parse
from PIL import Image
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gen_cards as G

OUT = os.path.join(G.HERE, "..", "assets", "war"); os.makedirs(OUT, exist_ok=True)
STYLE = (" Cinematic painterly digital illustration for a world war strategy board game, commander portrait, "
         "dramatic rim light, smoky war room atmosphere, muted olive, steel and brass palette, highly detailed, "
         "vertical portrait, waist-up shot, no text, no letters, no logos, no border.")
KEEP = G.KEEP
EDIT = ("Edit image 1, the man in image 1. Change ONLY his clothes and the background. Keep EVERYTHING ELSE exactly identical to image 1: "
        "his face, head, exact haircut, skin, expression, eyes, head angle and body. ")
GENERALS = {
    "rei": ("rei.png", "Make the man in image 1 a pompous field marshal. " + KEEP + "Keep his mustache. He wears an ornate dark green dress uniform "
            "with golden epaulettes, rows of medals and a red sash, a peaked officer cap slightly crooked, leaning lazily on a map table with toy army pieces." + STYLE),
    "tesoureiro": ("tesoureiro.png", "Make the man in image 1 a desert army general. " + KEEP + "He wears a sand colored field uniform with rolled sleeves, "
                   "a tan beret with a brass badge and aviator sunglasses hanging on his shirt, standing in front of a tank in a sandstorm at sunset." + STYLE),
    "sicario": ("sicario.png", "Make the man in image 1 a special forces commander. " + KEEP + "He wears a black tactical vest over a dark combat shirt, "
                "a radio headset around his neck, standing in a dark command bunker lit by green screens and a glowing world map." + STYLE),
    "corsario": ("corsario.webp", "Make the man in image 1 a navy admiral. " + KEEP + "Keep his curly hair with blond highlights and his earring. "
                 "He wears a white naval admiral uniform with golden buttons, epaulettes and medals, standing on the bridge of a battleship with a stormy sea behind." + STYLE),
    "confessor": ("confessor.png", "Make the man in image 1 a military intelligence colonel. " + KEEP + "He wears a long dark grey trench coat over an officer uniform "
                  "with a red collar tab, holding a classified folder, in a dim room with pinned maps, photos and red strings." + STYLE),
    "escriba": ("escriba.png", "Make the man in image 1 a brilliant army strategist. " + KEEP + "Keep his mustache and goatee. He wears an olive officer uniform "
                "with rolled sleeves, holding a pointer over a big war map table covered with army pieces and flags, in a war room." + STYLE),
    "diplomata": ("diplomata.png", EDIT + "1) his black t-shirt becomes a brown leather air force pilot bomber jacket with a sheepskin collar and squadron patches; "
                  "2) the phone in his hand becomes a pilot helmet; 3) the bedroom background becomes an airfield hangar with fighter planes. "
                  "His exact haircut: very short dense black hair with tight 360 waves only 1 to 2 centimeters long, a sharp straight lineup and a low fade; do NOT make the hair longer. "
                  "Keep the gold necklace. Painterly realistic illustration for a war strategy board game, dramatic light, no text."),
    "guarda": ("guarda.png", EDIT + "1) his black t-shirt becomes an olive armored corps tank commander uniform with a dark beret badge on the shoulder strap and a canvas chest harness; "
               "2) his clasped hands get leather gloves; 3) the white background becomes a muddy battlefield with a tank and smoke. "
               "Painterly realistic illustration for a war strategy board game, dramatic light, no text."),
}


def run(name, out_name, seed):
    foto, prompt = GENERALS[name]
    prompt = prompt.replace("the man in image 1", "the man in image 1, " + G.LOOKS[name] + ",", 1)
    img_name = G.upload(os.path.join(G.FOTOS, foto), G.CROPS.get(name))
    wf = G.workflow(img_name, prompt, seed, 864, 1152); wf["18"]["inputs"]["filename_prefix"] = "war/general"
    pid = G.post("/prompt", {"prompt": wf, "client_id": "war"})["prompt_id"]
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
    names = [a for a in sys.argv[1:] if not a.startswith("--") and not a.isdigit()] or list(GENERALS)
    for n in names:
        for k in range(1, seeds + 1):
            try: run(n, f"{n}_{k}" if seeds > 1 else n, random.randint(1, 2**31))
            except Exception as e: print(f"[erro] {n}: {e}", flush=True)
    print("DONE", flush=True)
