"""Cola a cabeça original (rosto + cabelo) sobre uma arte gerada com o MESMO enquadramento e
unifica o estilo com uma pintura leve (img2img de baixa intensidade no Z-Image Turbo).

Uso: python face_blend.py <foto> <arte_base> <saida> cx cy rx ry [--denoise 0.3] [--seeds 3]
     cx, cy, rx, ry: elipse da cabeça em fração da imagem (0–1).
"""
import sys, os, io, json, time, uuid, random, urllib.request, urllib.parse
from PIL import Image, ImageDraw, ImageFilter

SERVER = "http://127.0.0.1:8188"
args = [a for a in sys.argv[1:] if not a.startswith("--")]
foto, base, saida = args[:3]
cx, cy, rx, ry = map(float, args[3:7])
den = float(sys.argv[sys.argv.index("--denoise") + 1]) if "--denoise" in sys.argv else 0.3
seeds = int(sys.argv[sys.argv.index("--seeds") + 1]) if "--seeds" in sys.argv else 3
S = 1024

b = Image.open(base).convert("RGB").resize((S, S), Image.LANCZOS)
o = Image.open(foto).convert("RGB").resize((S, S), Image.LANCZOS)
# leva a cor/luz da foto para perto da arte (média por canal na região da cabeça)
mask = Image.new("L", (S, S), 0)
box = (int((cx - rx) * S), int((cy - ry) * S), int((cx + rx) * S), int((cy + ry) * S))
ImageDraw.Draw(mask).ellipse(box, fill=255)
from PIL import ImageStat
ms, mo = ImageStat.Stat(b, mask).mean, ImageStat.Stat(o, mask).mean
o = Image.merge("RGB", [ch.point(lambda v, k=k: max(0, min(255, int(v * (ms[k] / max(1, mo[k])) * .5 + v * .5)))) for k, ch in enumerate(o.split())])
soft = mask.filter(ImageFilter.GaussianBlur(S * 0.025))
comp = Image.composite(o, b, soft)
tmp = os.path.join(os.environ.get("TEMP", "."), "face_blend_comp.png"); comp.save(tmp)


def post(path, data):
    req = urllib.request.Request(SERVER + path, data=json.dumps(data).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())


def upload(path):
    data = open(path, "rb").read(); bd = uuid.uuid4().hex; name = "blend_" + uuid.uuid4().hex[:6] + ".png"
    body = (f"--{bd}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"{name}\"\r\nContent-Type: image/png\r\n\r\n").encode() + data + f"\r\n--{bd}--\r\n".encode()
    req = urllib.request.Request(SERVER + "/upload/image", data=body, headers={"Content-Type": f"multipart/form-data; boundary={bd}"})
    return json.loads(urllib.request.urlopen(req).read())["name"]


PROMPT = ("painterly realistic oil painting portrait of a young man in an elegant dark blue noble coat with silver embroidery, "
          "holding a sealed letter with red wax, candle-lit renaissance palace hall, warm candlelight, cohesive brush strokes, highly detailed, no text")
name = upload(tmp)
for k in range(1, seeds + 1):
    wf = {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_bf16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b_fp8_mixed.safetensors", "type": "lumina2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3.0}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": PROMPT}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": ""}},
        "7": {"class_type": "LoadImage", "inputs": {"image": name}},
        "8": {"class_type": "VAEEncode", "inputs": {"pixels": ["7", 0], "vae": ["3", 0]}},
        "9": {"class_type": "KSampler", "inputs": {"model": ["4", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["8", 0],
                                                   "seed": random.randint(1, 2**31), "steps": 8, "cfg": 1.0, "sampler_name": "res_multistep", "scheduler": "simple", "denoise": den}},
        "10": {"class_type": "VAEDecode", "inputs": {"samples": ["9", 0], "vae": ["3", 0]}},
        "11": {"class_type": "SaveImage", "inputs": {"images": ["10", 0], "filename_prefix": "conjura/blend"}},
    }
    pid = post("/prompt", {"prompt": wf, "client_id": str(uuid.uuid4())})["prompt_id"]
    while True:
        time.sleep(1.5)
        h = json.loads(urllib.request.urlopen(SERVER + "/history/" + pid).read())
        if pid in h and h[pid]["outputs"]: break
        if pid in h and h[pid].get("status", {}).get("status_str") == "error": raise RuntimeError(str(h[pid]["status"])[:400])
    im = [i for o_ in h[pid]["outputs"].values() for i in o_.get("images", [])][0]
    raw = urllib.request.urlopen(SERVER + "/view?" + urllib.parse.urlencode({"filename": im["filename"], "subfolder": im["subfolder"], "type": im["type"]})).read()
    out = Image.open(io.BytesIO(raw)).convert("RGB"); out.thumbnail((700, 700), Image.LANCZOS)
    path = saida.replace(".webp", f"_{k}.webp"); out.save(path, "WEBP", quality=86, method=6); print("[ok]", path, flush=True)
comp.thumbnail((700, 700)); comp.save(saida.replace(".webp", "_comp.webp"), "WEBP", quality=86)
print("DONE")
