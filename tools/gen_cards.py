"""Gera as artes das cartas do Conjura a partir das fotos dos amigos (FLUX.2 Klein 4B, edição com referência).

Uso:  python gen_cards.py [--force] [--seeds N] [nome ...]
As fotos originais ficam em tools/fotos/ (fora do Git). As artes saem em assets/conjura/.
Com --seeds N gera N variações (nome_1, nome_2, ...) para escolher a melhor.
"""
import json, os, sys, time, uuid, urllib.request, urllib.parse, io, random
from PIL import Image

SERVER = "http://127.0.0.1:8188"
HERE = os.path.dirname(os.path.abspath(__file__))
FOTOS = os.path.join(HERE, "fotos")
OUT = os.path.join(HERE, "..", "assets", "conjura")
os.makedirs(OUT, exist_ok=True)
W, H = 864, 1152  # retrato 3:4 para a carta

KEEP = ("Keep his face exactly the same: same identity, same facial structure, eyes, nose, lips, eyebrows, "
        "same skin tone, same hairstyle and hair color, same facial hair, same body build. ")
STYLE = (" Renaissance Italian royal court, dramatic painterly fantasy card game illustration, "
         "rich oil painting look, warm candlelight, chiaroscuro, highly detailed, vertical portrait, "
         "three-quarter body shot, no text, no letters, no border, no frame.")

# traços de cada um, para o modelo não "inventar" outra pessoa
LOOKS = {
    "guarda": "a muscular young man with light brown skin, short black hair faded on the sides, clean-shaven, full lips, thick neck and strong arms",
    "escriba": "a young man with light olive skin, thick dark eyebrows, short messy black hair, a thin mustache and a small goatee",
    "tesoureiro": "a young man with fair skin, short dark hair faded on the sides and combed up, and a full trimmed dark beard",
    "rei": "a young man with tan skin, wavy black hair combed upward, a thin mustache, heavy-lidded eyes and a sleepy expression",
    "confessor": "a young man with light olive skin, messy curly black hair, thick eyebrows and a short dark beard",
    "sicario": "a young man with brown skin, short curly black hair, a thin goatee and mustache, slim face and a serious stare",
    "diplomata": "a young slim man with dark brown skin, very short buzz-cut black hair with a sharp hairline, clean-shaven, a gold chain bracelet",
    "corsario": "a young man with light brown skin, curly black hair with blond bleached tips and faded sides, a diamond stud earring, thin mustache and a small mole on his cheek",
}
# recorte (esquerda, topo, direita, baixo) em fração da foto, quando o rosto é pequeno na original
CROPS = {"diplomata": (0.12, 0.0, 0.78, 0.62), "tesoureiro": (0.0, 0.0, 0.85, 0.75), "guarda": (0.15, 0.0, 0.9, 0.75)}

CARDS = {
    "tesoureiro": ("tesoureiro.png", "Make the man in image 1 the royal treasurer of a medieval court. " + KEEP +
                   "He wears a rich burgundy velvet doublet with gold embroidery and a heavy golden chain of office, "
                   "holding an open leather pouch spilling gold coins, standing in a treasury full of gold coins, ledgers and candles." + STYLE),
    "sicario": ("sicario.png", "Make the man in image 1 a deadly medieval assassin. " + KEEP +
                "He wears a dark leather hooded assassin outfit with the hood lowered on his shoulders, holding a curved dagger, "
                "standing in a dark stone alley at night, with dramatic stripes of moonlight and shadow across him." + STYLE),
    "corsario": ("corsario.webp", "Make the man in image 1 a charismatic pirate captain (corsair). " + KEEP +
                 "Keep his curly hair with blond highlights and his earrings. He wears an open dark red captain's coat with gold buttons "
                 "over a loose white shirt and a silver chain, a cutlass at his belt, standing on the deck of a ship at sunset with sails behind." + STYLE),
    "diplomata": ("diplomata.png", "Make the man in image 1 an elegant royal diplomat. " + KEEP +
                  "He wears an elegant dark blue noble coat with a silver sash and a small gold bracelet, holding a sealed letter with a red wax seal "
                  "instead of a phone, standing in a palace hall with marble columns and banners." + STYLE),
    "guarda": ("guarda.png", "Make the man in image 1 a loyal royal guard, a strong muscular bodyguard. " + KEEP +
               "He wears polished steel plate armor over a dark tabard with a golden crown emblem, hands resting together on the pommel of a "
               "long sword planted in front of him, standing before a throne room door with torches." + STYLE),
    "confessor": ("confessor.png", "Make the man in image 1 the court confessor, a mysterious inquisitor priest. " + KEEP +
                  "He wears a black and crimson clerical robe with a high collar and a silver pendant, holding a lit candle and a rolled scroll, "
                  "standing in a gloomy monastery library with tall bookshelves." + STYLE),
    "rei": ("rei.png", "Make the man in image 1 a weak, bored and corrupt king. " + KEEP +
            "Keep his mustache. He wears a golden crown slightly crooked, a red royal mantle with ermine fur collar over a white shirt, "
            "slouching on a golden throne, holding a scepter lazily." + STYLE),
    "escriba": ("escriba.png", "Make the man in image 1 a clever royal scribe. " + KEEP +
                "Keep his mustache and goatee. He wears a simple dark hooded wool robe over a white tunic, holding a quill pen and a parchment, "
                "sitting at a wooden desk covered with scrolls, ink pots and candles in a cozy study (replace the computer with old books and scrolls)." + STYLE),
}


def post(path, data):
    req = urllib.request.Request(SERVER + path, data=json.dumps(data).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())


def upload(path, crop=None):
    name = "conjura_" + os.path.basename(path)
    img = Image.open(path).convert("RGB")
    if crop:
        w, h = img.size; img = img.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)))
    buf = io.BytesIO(); img.save(buf, "PNG")
    boundary = uuid.uuid4().hex
    body = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}.png\"\r\nContent-Type: image/png\r\n\r\n").encode() + buf.getvalue() + \
           (f"\r\n--{boundary}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{boundary}--\r\n").encode()
    req = urllib.request.Request(SERVER + "/upload/image", data=body, headers={"Content-Type": f"multipart/form-data; boundary={boundary}"})
    return json.loads(urllib.request.urlopen(req).read())["name"]


def workflow(image_name, prompt, seed):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "flux-2-klein-4b.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b_fp8_mixed.safetensors", "type": "flux2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "flux2-vae.safetensors"}},
        "4": {"class_type": "LoadImage", "inputs": {"image": image_name}},
        "5": {"class_type": "ImageScaleToTotalPixels", "inputs": {"image": ["4", 0], "upscale_method": "lanczos", "megapixels": 1.0, "resolution_steps": 1}},
        "6": {"class_type": "VAEEncode", "inputs": {"pixels": ["5", 0], "vae": ["3", 0]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "8": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["7", 0], "latent": ["6", 0]}},
        "9": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["7", 0]}},
        "10": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["9", 0], "latent": ["6", 0]}},
        "11": {"class_type": "CFGGuider", "inputs": {"model": ["1", 0], "positive": ["8", 0], "negative": ["10", 0], "cfg": 1.0}},
        "12": {"class_type": "Flux2Scheduler", "inputs": {"steps": 4, "width": W, "height": H}},
        "13": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "14": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "15": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}},
        "16": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["14", 0], "guider": ["11", 0], "sampler": ["13", 0], "sigmas": ["12", 0], "latent_image": ["15", 0]}},
        "17": {"class_type": "VAEDecode", "inputs": {"samples": ["16", 0], "vae": ["3", 0]}},
        "18": {"class_type": "SaveImage", "inputs": {"images": ["17", 0], "filename_prefix": "conjura/card"}},
    }


def run(name, out_name, seed):
    foto, prompt = CARDS[name]
    prompt = prompt.replace("the man in image 1", "the man in image 1, " + LOOKS[name] + ",")
    img_name = upload(os.path.join(FOTOS, foto), CROPS.get(name))
    pid = post("/prompt", {"prompt": workflow(img_name, prompt, seed), "client_id": str(uuid.uuid4())})["prompt_id"]
    t0 = time.time()
    while True:
        time.sleep(1.5)
        hist = json.loads(urllib.request.urlopen(SERVER + "/history/" + pid).read())
        if pid in hist:
            e = hist[pid]
            if e.get("status", {}).get("status_str") == "error":
                raise RuntimeError(json.dumps(e["status"])[:600])
            imgs = [i for o in e["outputs"].values() for i in o.get("images", [])]
            if imgs: break
        if time.time() - t0 > 900: raise TimeoutError(name)
    im = imgs[0]
    raw = urllib.request.urlopen(SERVER + "/view?" + urllib.parse.urlencode({"filename": im["filename"], "subfolder": im["subfolder"], "type": im["type"]})).read()
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    img.thumbnail((600, 800), Image.LANCZOS)
    path = os.path.join(OUT, out_name + ".webp")
    img.save(path, "WEBP", quality=84, method=6)
    print(f"[ok] {out_name} seed={seed} {time.time()-t0:.1f}s -> {os.path.getsize(path)//1024}KB", flush=True)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    seeds = int(sys.argv[sys.argv.index("--seeds") + 1]) if "--seeds" in sys.argv else 0
    if seeds: args = [a for a in args if not a.isdigit()]
    for n in args or list(CARDS):
        try:
            if seeds:
                for k in range(1, seeds + 1): run(n, f"{n}_{k}", random.randint(1, 2**31))
            elif force or not os.path.exists(os.path.join(OUT, n + ".webp")):
                run(n, n, random.randint(1, 2**31))
            else: print(f"[skip] {n}")
        except Exception as e:
            print(f"[erro] {n}: {e}", flush=True)
    print("DONE", flush=True)
