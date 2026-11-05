"""Gera as artes do Mesa Viva usando ComfyUI (Stability Matrix) com Z-Image Turbo.

Uso:  python gen_art.py [--force] [nome ...]
Salva .webp em ../assets/
"""
import json, os, sys, time, uuid, urllib.request, urllib.parse, io, random
from PIL import Image

SERVER = "http://127.0.0.1:8188"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "assets")
os.makedirs(OUT, exist_ok=True)

NEG_NOTE = "no text, no letters, no words, no watermark, no logo"
CHAR_STYLE = ("stylized 3D character portrait for a board game, bust shot, centered, looking at camera, "
              "friendly expressive face, soft studio lighting, vibrant saturated colors, smooth shading, "
              "high detail, plain solid {bg} background, " + NEG_NOTE)
ICON_STYLE = ("stylized 3D game illustration, centered single subject, vibrant colors, soft lighting, "
              "clean simple composition, plain solid {bg} background, " + NEG_NOTE)

# nome: (prompt, largura, altura, tamanho_final)
ASSETS = {
    # ---- personagens ----
    "char_vitoria": (CHAR_STYLE.format(bg="crimson") + ", confident businesswoman in her 40s, sharp red tailored suit, pearl earrings, short black bob haircut, holding a golden fountain pen", 1024, 1024, 384),
    "char_otavio": (CHAR_STYLE.format(bg="olive green") + ", cheerful coffee plantation baron in his 50s, tanned skin, straw panama hat, cream linen suit, thick dark beard, holding a coffee cup", 1024, 1024, 384),
    "char_lia": (CHAR_STYLE.format(bg="turquoise") + ", young genius inventor girl, curly orange hair, brass steampunk goggles on forehead, oil smudge on cheek, denim overalls, holding a small wrench", 1024, 1024, 384),
    "char_bento": (CHAR_STYLE.format(bg="navy blue") + ", jolly harbor sea captain, big white beard, navy captain cap, wool peacoat with brass buttons, pipe", 1024, 1024, 384),
    "char_estrela": (CHAR_STYLE.format(bg="hot pink") + ", glamorous movie star woman, wavy platinum hair, heart shaped sunglasses, sparkling golden dress, dark skin, confident smile", 1024, 1024, 384),
    "char_dante": (CHAR_STYLE.format(bg="dark slate gray") + ", sly noir detective man, beige trench coat with raised collar, grey fedora hat, stubble, magnifying glass", 1024, 1024, 384),
    "char_amara": (CHAR_STYLE.format(bg="warm orange") + ", happy african chef woman, tall white chef hat, white chef jacket, holding a wooden spoon, big smile", 1024, 1024, 384),
    "char_kai": (CHAR_STYLE.format(bg="purple") + ", cool young asian street artist, colorful paint splatter hoodie, headphones around neck, spray paint can, messy blue hair", 1024, 1024, 384),
    # ---- tabuleiro / ui ----
    "board_center": ("isometric miniature city diorama seen from above, tiny colorful buildings, skyscrapers, parks with trees, a harbor with boats, a train line, golden coins scattered, tilt-shift toy photography, vibrant, cheerful, soft light, " + NEG_NOTE, 1024, 1024, 768),
    "lobby_bg": ("cozy wooden game table in a warm living room at night, board game pieces, dice, cards and snacks on the table, warm lamp light, bokeh, cinematic, " + NEG_NOTE, 1344, 768, 1344),
    "cover_magnata": ('vibrant board game key art illustration, the title text "MAGNATA" written in big bold shiny golden 3D letters at the top center, below it a bustling colorful cartoon metropolis at sunset, golden coins raining, tiny houses and hotels, two white dice in the foreground, epic and joyful, no other text, no watermark', 1024, 768, 768),
    "card_fortuna": ("ornate playing card back design, golden four leaf clover in center, emerald green and gold filigree, symmetrical, elegant, " + NEG_NOTE, 768, 1024, 384),
    "card_evento": ("ornate playing card back design, golden lightning bolt and stars in center, royal blue and orange filigree, symmetrical, elegant, " + NEG_NOTE, 768, 1024, 384),
    "bg_wood": ("top-down photo of a dark walnut wooden table surface, rich warm brown wood grain planks, soft warm lighting, subtle wear, texture, empty, " + NEG_NOTE, 1344, 768, 1344),
    "cover_conjura": ('dark fantasy card game key art illustration, the title text "CONJURA" written in big ornate shiny golden 3D medieval letters at the top center, below it a candle-lit royal throne hall, a round mahogany table with green velvet covered with ornate face-down playing cards with red backs and gold coins, a golden crown on the table, a dagger stuck into one card, a white venetian mask, red velvet banners, dramatic warm candlelight, mysterious tense atmosphere of court intrigue, no other text, no watermark', 1024, 768, 768),
    "conjura/verso": ("ornate playing card back design, a golden royal heraldic crest in the center: a jeweled crown above a shield with a crossed dagger and quill pen, on deep crimson velvet with intricate gold filigree borders and subtle damask pattern, perfectly symmetrical, elegant, rich, dark fantasy, centered, flat front view, " + NEG_NOTE, 800, 1120, 500),
    "cover_war": ('epic strategy board game key art illustration, the title text "SUPREMACIA" written in big bold metallic steel and brass 3D military stencil letters at the top center, below it a dramatic dimly lit war room with a large 3D relief world map table, small plastic toy soldier army pieces in red, blue, yellow, green, white and black colors spread over the continents, red and yellow dice rolling on the table, a brass lamp hanging above, smoke and warm light beams, tense cinematic atmosphere, no other text, no watermark', 1024, 768, 768),
    "cover_vida": ('funny cartoon board game key art illustration, the title text "VIDA ADULTA" written in big bold playful rounded 3D cartoon letters at the top center, below it a colorful toy board game with a winding road, a big spinning wheel with numbers, tiny toy cars full of little peg people, a chaotic happy family, piles of bills and coins flying, a wedding chapel, a graduation cap, a toll booth, bright saturated colors, comic adult humor style, no other text, no watermark', 1024, 768, 768),
    # ---- Conjura: cenário 3D ----
    "cj_hall": ("interior of a dark medieval royal throne hall at night seen from eye level, gothic stone arches and massive columns, long red velvet banners with golden crown emblems, iron candle chandeliers, warm candlelight pools on the stone, deep shadows, light haze and dust in the air, cinematic, painterly realistic concept art, wide shot, empty, no people, " + NEG_NOTE, 1344, 768, 1344),
    "cj_wood": ("seamless flat texture of dark polished mahogany wood, fine long straight grain, rich deep reddish brown, varnished furniture wood, top-down orthographic view, even flat lighting, texture map, " + NEG_NOTE, 1024, 1024, 768),
    "cj_felt": ("seamless flat texture of deep emerald green velvet cloth with a subtle darker green damask ornament pattern, top-down orthographic view, even flat lighting, fabric texture map, " + NEG_NOTE, 1024, 1024, 768),
    # ---- cantos e especiais ----
    "tile_start": (ICON_STYLE.format(bg="light green") + ", a big golden arrow made of stacked gold coins pointing right", 1024, 1024, 256),
    "tile_jail": (ICON_STYLE.format(bg="light orange") + ", cute cartoon jail cell with iron bars and a small padlock", 1024, 1024, 256),
    "tile_upgrade": (ICON_STYLE.format(bg="light purple") + ", architect blueprint scroll with a golden hammer and a glowing golden star above a tiny house", 1024, 1024, 256),
    "tier_0": (ICON_STYLE.format(bg="light green") + ", empty grass lot with a small blank wooden sign post and a few flowers", 1024, 1024, 256),
    "tier_1": (ICON_STYLE.format(bg="light green") + ", small cozy cottage house with a red roof and a chimney", 1024, 1024, 256),
    "tier_2": (ICON_STYLE.format(bg="light blue") + ", charming two-story townhouse with a blue roof and a balcony", 1024, 1024, 256),
    "tier_3": (ICON_STYLE.format(bg="light yellow") + ", big elegant mansion with columns, garden and a fountain", 1024, 1024, 256),
    "tier_4": (ICON_STYLE.format(bg="light gray") + ", modern apartment building with six floors and glass windows", 1024, 1024, 256),
    "tier_5": (ICON_STYLE.format(bg="light red") + ", luxury tall hotel skyscraper with a golden crown top and red awning entrance", 1024, 1024, 256),
    "tile_park": (ICON_STYLE.format(bg="light yellow") + ", charming town square with a fountain, wooden bench and a tree", 1024, 1024, 256),
    "tile_gotojail": (ICON_STYLE.format(bg="light red") + ", cartoon police whistle and police cap with a badge", 1024, 1024, 256),
    "tile_station": (ICON_STYLE.format(bg="light gray") + ", cute retro steam locomotive front view", 1024, 1024, 256),
    "tile_power": (ICON_STYLE.format(bg="light yellow") + ", glowing light bulb with a lightning bolt inside", 1024, 1024, 256),
    "tile_water": (ICON_STYLE.format(bg="light blue") + ", shiny water faucet with a big water droplet", 1024, 1024, 256),
    "tile_tax": (ICON_STYLE.format(bg="light gray") + ", heavy money bag with a red ribbon and a stamp", 1024, 1024, 256),
    "tile_fortuna": (ICON_STYLE.format(bg="mint green") + ", golden four leaf clover", 1024, 1024, 256),
    "tile_evento": (ICON_STYLE.format(bg="light blue") + ", golden lightning bolt surrounded by stars", 1024, 1024, 256),
}


def workflow(prompt, w, h, seed):
    return {
        "1": {"class_type": "UNETLoader", "inputs": {"unet_name": "z_image_turbo_bf16.safetensors", "weight_dtype": "default"}},
        "2": {"class_type": "CLIPLoader", "inputs": {"clip_name": "qwen_3_4b_fp8_mixed.safetensors", "type": "lumina2", "device": "default"}},
        "3": {"class_type": "VAELoader", "inputs": {"vae_name": "ae.safetensors"}},
        "4": {"class_type": "ModelSamplingAuraFlow", "inputs": {"model": ["1", 0], "shift": 3.0}},
        "5": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": prompt}},
        "6": {"class_type": "CLIPTextEncode", "inputs": {"clip": ["2", 0], "text": ""}},
        "7": {"class_type": "EmptySD3LatentImage", "inputs": {"width": w, "height": h, "batch_size": 1}},
        "8": {"class_type": "KSampler", "inputs": {"model": ["4", 0], "positive": ["5", 0], "negative": ["6", 0], "latent_image": ["7", 0],
                                                   "seed": seed, "steps": 8, "cfg": 1.0, "sampler_name": "res_multistep", "scheduler": "simple", "denoise": 1.0}},
        "9": {"class_type": "VAEDecode", "inputs": {"samples": ["8", 0], "vae": ["3", 0]}},
        "10": {"class_type": "SaveImage", "inputs": {"images": ["9", 0], "filename_prefix": "mesaviva/img"}},
    }


def post(path, data):
    req = urllib.request.Request(SERVER + path, data=json.dumps(data).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req).read())


def get(path):
    return urllib.request.urlopen(SERVER + path).read()


def generate(name, prompt, w, h, size):
    seed = random.randint(1, 2**31)
    pid = post("/prompt", {"prompt": workflow(prompt, w, h, seed), "client_id": str(uuid.uuid4())})["prompt_id"]
    t0 = time.time()
    while True:
        time.sleep(1.5)
        hist = json.loads(get("/history/" + pid))
        if pid in hist:
            entry = hist[pid]
            if entry.get("status", {}).get("status_str") == "error":
                raise RuntimeError(json.dumps(entry["status"])[:500])
            imgs = [i for o in entry["outputs"].values() for i in o.get("images", [])]
            if imgs:
                break
        if time.time() - t0 > 600:
            raise TimeoutError(name)
    im = imgs[0]
    raw = get("/view?" + urllib.parse.urlencode({"filename": im["filename"], "subfolder": im["subfolder"], "type": im["type"]}))
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    img.thumbnail((size, size * 2) if w <= h else (size, size), Image.LANCZOS)
    path = os.path.join(OUT, name + ".webp")
    img.save(path, "WEBP", quality=82, method=6)
    print(f"[ok] {name} {img.size} {time.time()-t0:.1f}s -> {os.path.getsize(path)//1024}KB", flush=True)


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    force = "--force" in sys.argv
    names = args or list(ASSETS)
    for n in names:
        if not force and os.path.exists(os.path.join(OUT, n + ".webp")):
            print(f"[skip] {n}")
            continue
        try:
            generate(n, *ASSETS[n])
        except Exception as e:
            print(f"[erro] {n}: {e}", flush=True)
    print("DONE", flush=True)
