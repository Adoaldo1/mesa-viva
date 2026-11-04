"""Gera dist/mesa-viva.html: um único arquivo com CSS, JS e artes embutidas (fácil de mandar para os amigos ou hospedar)."""
import base64, os, re

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
p = lambda *a: os.path.join(ROOT, *a)
html = open(p("index.html"), encoding="utf-8").read()

html = html.replace('<link rel="stylesheet" href="style.css">', "<style>\n" + open(p("style.css"), encoding="utf-8").read() + "\n</style>")
html = re.sub(r'<script src="(js/[\w.]+)"></script>', lambda m: "<script>\n" + open(p(m.group(1)), encoding="utf-8").read() + "\n</script>", html)

def inline(m):
    data = base64.b64encode(open(p("assets", m.group(1) + ".webp"), "rb").read()).decode()
    return "data:image/webp;base64," + data
html = re.sub(r"assets/(\w+)\.webp", inline, html)

os.makedirs(p("dist"), exist_ok=True)
open(p("dist", "mesa-viva.html"), "w", encoding="utf-8").write(html)
print("dist/mesa-viva.html", os.path.getsize(p("dist", "mesa-viva.html")) // 1024, "KB")
