"""Gera a arte de uma carta 100% por IA usando DUAS referências no FLUX.2 Klein:
imagem 1 = foto inteira (pose, corpo) e imagem 2 = recorte ampliado do rosto (traços em alta resolução).

Uso: python gen_ref2.py nome --seeds 4
Saída: assets/conjura/<nome>_<k>.webp (formato da carta 5:7)
"""
import json, os, sys, time, uuid, urllib.request, urllib.parse, io, random
from PIL import Image

SERVER = "http://127.0.0.1:8188"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "assets", "conjura")
W, H = 800, 1120  # 5:7, igual à carta

STYLE = (" Close-up bust portrait, his face large and sharp in the frame. Painterly realistic oil painting, rich colors, "
         "dramatic warm light, highly detailed, fantasy card game illustration, no text, no border.")
CARDS = {
    # foto, recorte do rosto (frações), prompt
    "guarda": ("guarda.png", (0.27, 0.02, 0.68, 0.47),
               "Portrait of the young man from image 1 as a loyal royal guard of a renaissance court. "
               "His face must be exactly the face shown up close in image 2: the same person, same identity, round soft face with full cheeks, "
               "same eyes, eyebrows, nose, full lips, same hairline and short black curly hair with a low fade, same light brown skin tone, clean-shaven. "
               "Same head angle and expression as in image 1: calm, looking up to the side. He wears polished steel plate armor with pauldrons over a dark blue tabard "
               "with a golden crown emblem, his hands in steel gauntlets clasped together under his chin, a torch-lit throne room behind him." + STYLE),
    "diplomata": ("diplomata.png", (0.35, 0.0, 0.64, 0.31),
                  "Portrait of the young man from image 1 as an elegant young royal diplomat of a renaissance court. "
                  "His face must be exactly the face shown up close in image 2: the same person, same identity, young slim oval face, same eyes, eyebrows, nose, lips, "
                  "a very faint thin mustache, same medium brown skin tone, and the same very short dense black hair with 360 waves and a sharp lineup "
                  "(keep the hair exactly that short, do not lengthen or style it). Same head angle as in image 1: head tilted down, looking down. "
                  "He wears an elegant dark blue noble coat with silver embroidery over a white high-collar shirt, a thin gold chain necklace and a gold bracelet, "
                  "and reads a folded letter sealed with red wax; a candle-lit palace hall with marble columns and red banners behind him." + STYLE),
}


def post(path, data):
    req = urllib.request.Request(SERVER + path, data=json.dumps(data).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())


def upload(img, name):
    buf = io.BytesIO(); img.save(buf, "PNG"); bd = uuid.uuid4().hex
    body = (f"--{bd}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}.png\"\r\nContent-Type: image/png\r\n\r\n").encode() + buf.getvalue() + \
           (f"\r\n--{bd}\r\nContent-Disposition: form-data; name=\"overwrite\"\r\n\r\ntrue\r\n--{bd}--\r\n").encode()
    req = urllib.request.Request(SERVER + "/upload/image", data=body, headers={"Content-Type": f"multipart/form-data; boundary={bd}"})
    return json.loads(urllib.request.urlopen(req).read())["name"]


def workflow(img1, img2, prompt, seed):
    n = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "flux-2-klein-4b.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b_fp8_mixed.safetensors", "type": "flux2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "flux2-vae.safetensors"}},
        "4": {"class_type": "LoadImage", "inputs": {"image": img1}},
        "5": {"class_type": "ImageScaleToTotalPixels", "inputs": {"image": ["4", 0], "upscale_method": "lanczos", "megapixels": 1.0, "resolution_steps": 1}},
        "6": {"class_type": "VAEEncode", "inputs": {"pixels": ["5", 0], "vae": ["3", 0]}},
        "20": {"class_type": "LoadImage", "inputs": {"image": img2}},
        "21": {"class_type": "ImageScaleToTotalPixels", "inputs": {"image": ["20", 0], "upscale_method": "lanczos", "megapixels": 1.0, "resolution_steps": 1}},
        "22": {"class_type": "VAEEncode", "inputs": {"pixels": ["21", 0], "vae": ["3", 0]}},
        "7": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "8": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["7", 0], "latent": ["6", 0]}},
        "23": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["8", 0], "latent": ["22", 0]}},
        "9": {"class_type": "ConditioningZeroOut", "inputs": {"conditioning": ["7", 0]}},
        "10": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["9", 0], "latent": ["6", 0]}},
        "24": {"class_type": "ReferenceLatent", "inputs": {"conditioning": ["10", 0], "latent": ["22", 0]}},
        "11": {"class_type": "CFGGuider", "inputs": {"model": ["1", 0], "positive": ["23", 0], "negative": ["24", 0], "cfg": 1.0}},
        "12": {"class_type": "Flux2Scheduler", "inputs": {"steps": 4, "width": W, "height": H}},
        "13": {"class_type": "KSamplerSelect", "inputs": {"sampler_name": "euler"}},
        "14": {"class_type": "RandomNoise", "inputs": {"noise_seed": seed}},
        "15": {"class_type": "EmptyFlux2LatentImage", "inputs": {"width": W, "height": H, "batch_size": 1}},
        "16": {"class_type": "SamplerCustomAdvanced", "inputs": {"noise": ["14", 0], "guider": ["11", 0], "sampler": ["13", 0], "sigmas": ["12", 0], "latent_image": ["15", 0]}},
        "17": {"class_type": "VAEDecode", "inputs": {"samples": ["16", 0], "vae": ["3", 0]}},
        "18": {"class_type": "SaveImage", "inputs": {"images": ["17", 0], "filename_prefix": "conjura/ref2"}},
    }
    return n


def run(name, k):
    foto, crop, prompt = CARDS[name]
    img = Image.open(os.path.join(HERE, "fotos", foto)).convert("RGB"); w, h = img.size
    face = img.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)))
    face = face.resize((1024, int(1024 * face.height / face.width)), Image.LANCZOS)
    a, b = upload(img, f"r2_{name}_full"), upload(face, f"r2_{name}_face")
    seed = random.randint(1, 2**31)
    pid = post("/prompt", {"prompt": workflow(a, b, prompt, seed), "client_id": str(uuid.uuid4())})["prompt_id"]
    t0 = time.time()
    while True:
        time.sleep(1.5)
        hist = json.loads(urllib.request.urlopen(SERVER + "/history/" + pid).read())
        if pid in hist:
            e = hist[pid]
            if e.get("status", {}).get("status_str") == "error": raise RuntimeError(json.dumps(e["status"])[:500])
            imgs = [i for o in e["outputs"].values() for i in o.get("images", [])]
            if imgs: break
    im = imgs[0]
    raw = urllib.request.urlopen(SERVER + "/view?" + urllib.parse.urlencode({"filename": im["filename"], "subfolder": im["subfolder"], "type": im["type"]})).read()
    out = Image.open(io.BytesIO(raw)).convert("RGB").resize((500, 700), Image.LANCZOS)
    path = os.path.join(OUT, f"{name}_{k}.webp"); out.save(path, "WEBP", quality=88, method=6)
    print(f"[ok] {name}_{k} seed={seed} {time.time()-t0:.1f}s", flush=True)


if __name__ == "__main__":
    names = [a for a in sys.argv[1:] if not a.startswith("--") and not a.isdigit()]
    seeds = int(sys.argv[sys.argv.index("--seeds") + 1]) if "--seeds" in sys.argv else 4
    for n in names:
        for k in range(1, seeds + 1):
            try: run(n, k)
            except Exception as e: print(f"[erro] {n}_{k}: {e}", flush=True)
    print("DONE")
