"""Gera o mapa do Supremacia (js/war-map.js) a partir da geografia real.

Fonte: Natural Earth 1:50m, países (domínio público)
  https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson/ne_50m_admin_0_countries.geojson
Uso: python tools/gen_war_map.py caminho/ne_50m_admin_0_countries.geojson [--png]

Cada país vai para um território do jogo; países grandes (Rússia, Canadá, EUA, Indonésia, Malásia) são divididos
entre vários territórios pelas sementes (Voronoi dentro do país). Projeção de Miller, como nos mapas-múndi escolares.
Confere se as fronteiras desenhadas batem com a lista de vizinhos do jogo e lista as rotas marítimas.
"""
import json, math, os, sys
import numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__))
LON0, LON1, LAT0, LAT1, PX = -170, 192, -57, 84, 10  # PX pixels por grau de longitude


def miller(lat):  # em "graus" para manter a mesma escala da longitude
    return math.degrees(1.25 * math.log(math.tan(math.pi / 4 + .4 * math.radians(lat))))


Y0, Y1 = miller(LAT1), miller(LAT0)
W, H = (LON1 - LON0) * PX, int((Y0 - Y1) * PX)
def P(lon, lat):
    if lon < LON0: lon += 360
    return ((lon - LON0) * PX, (Y0 - miller(max(LAT0, min(LAT1, lat)))) * PX)

# id, nome, continente, sementes (lon, lat)
T = [
  ('alasca','Alasca','na',[(-152,65),(-158,60),(-146,62),(-160,66)]),
  ('mackenzie','Mackenzie','na',[(-128,65),(-115,65),(-102,65),(-95,70),(-120,72),(-100,76),(-85,78),(-70,70)]),
  ('groenlandia','Groenlândia','na',[(-42,73)]),
  ('vancouver','Vancouver','na',[(-127,56),(-120,52),(-133,58),(-114,55)]),
  ('ottawa','Ottawa','na',[(-96,55),(-86,51),(-104,52),(-88,58),(-82,47),(-84,63),(-78,60)]),
  ('labrador','Labrador','na',[(-68,54),(-62,50),(-74,58),(-72,48),(-63,46)]),
  ('california','Califórnia','na',[(-118,38),(-108,38),(-114,44),(-122,41),(-104,46)]),
  ('novayork','Nova York','na',[(-86,38),(-77,41),(-93,41),(-82,33),(-98,34),(-70,44),(-90,46)]),
  ('mexico','México','na',[(-100,22)]),
  ('venezuela','Venezuela','sa',[(-66,6)]), ('peru','Peru','sa',[(-74,-10)]), ('brasil','Brasil','sa',[(-50,-10)]), ('argentina','Argentina','sa',[(-65,-35)]),
  ('islandia','Islândia','eu',[(-19,65)]), ('inglaterra','Inglaterra','eu',[(-3,54)]), ('portugal','Portugal','eu',[(-2,42)]),
  ('alemanha','Alemanha','eu',[(10,50)]), ('polonia','Polônia','eu',[(24,50)]), ('suecia','Suécia','eu',[(18,63)]),
  ('moscou','Moscou','eu',[(40,57),(33,60),(50,62),(56,56),(45,50),(38,66),(31,54),(44,44),(60,66)]),
  ('argelia','Argélia','af',[(0,22)]), ('egito','Egito','af',[(25,26)]), ('sudao','Sudão','af',[(36,6)]), ('congo','Congo','af',[(18,-2)]),
  ('africadosul','África do Sul','af',[(25,-24)]), ('madagascar','Madagascar','af',[(47,-19)]),
  ('orientemedio','Oriente Médio','as',[(45,29)]), ('aral','Aral','as',[(64,44)]),
  ('omsk','Omsk','as',[(73,56),(75,63),(68,60),(82,52),(72,70),(88,53)]),
  ('dudinka','Dudinka','as',[(90,67),(88,60),(96,74),(84,72),(100,62),(97,53)]),
  ('siberia','Sibéria','as',[(115,67),(125,66),(108,73),(132,71),(140,68),(145,73)]),
  ('vladivostok','Vladivostok','as',[(160,64),(170,66),(152,62),(160,56),(140,58),(135,48),(178,67),(-175,66)]),
  ('tchita','Tchita','as',[(114,55),(122,52),(106,55),(128,57)]),
  ('mongolia','Mongólia','as',[(100,46)]), ('china','China','as',[(105,32)]), ('india','Índia','as',[(78,22)]),
  ('vietna','Vietnã','as',[(103,15),(101,4)]), ('japao','Japão','as',[(138,37)]),
  ('sumatra','Sumatra','oc',[(101,-1),(110,-7),(104,-4),(120,-8)]),
  ('borneu','Bornéu','oc',[(114,1),(117,4),(121,-2),(123,10)]),
  ('novaguine','Nova Guiné','oc',[(143,-6),(136,-3),(150,-7),(130,-3),(158,-9)]),
  ('australia','Austrália','oc',[(134,-25),(173,-41)]),
]
# país (ADM0_A3) → território
C = {
  'groenlandia': ['GRL'], 'mexico': 'MEX BLZ GTM HND SLV NIC CRI PAN CUB JAM HTI DOM PRI BHS'.split(),
  'venezuela': 'VEN COL GUY SUR'.split(), 'peru': 'PER BOL ECU'.split(), 'brasil': 'BRA PRY'.split(), 'argentina': 'ARG CHL URY FLK'.split(),
  'islandia': ['ISL', 'FRO'], 'inglaterra': 'GBR IRL IMN GGY JEY'.split(), 'portugal': 'PRT ESP FRA AND MCO'.split(),
  'alemanha': 'DEU NLD BEL LUX CHE AUT LIE DNK ITA SMR VAT MLT CZE'.split(),
  'polonia': 'POL SVK HUN ROU BGR SRB HRV SVN BIH MNE MKD ALB KOS GRC MDA UKR BLR LTU LVA EST'.split(), 'suecia': 'SWE NOR FIN ALD'.split(),
  'argelia': 'DZA MAR SAH TUN MRT MLI SEN GMB GNB GIN SLE LBR CIV BFA GHA TGO BEN NER NGA CPV'.split(), 'egito': 'EGY LBY'.split(),
  'sudao': 'SDN SDS ETH ERI DJI SOM SOL KEN UGA TZA RWA BDI TCD'.split(), 'congo': 'COD COG GAB CMR GNQ CAF AGO STP'.split(),
  'africadosul': 'ZAF NAM BWA ZWE ZMB MOZ MWI LSO SWZ'.split(), 'madagascar': 'MDG COM'.split(),
  'orientemedio': 'TUR SYR IRQ IRN SAU JOR ISR PSX LBN KWT QAT ARE BHR OMN YEM CYP CYN GEO ARM AZE'.split(),
  'aral': 'KAZ UZB TKM KGZ TJK AFG'.split(), 'mongolia': ['MNG'], 'china': 'CHN TWN HKG MAC KOR PRK'.split(),
  'india': 'IND PAK NPL BTN BGD LKA KAS'.split(), 'vietna': 'VNM LAO KHM THA MMR SGP'.split(), 'japao': ['JPN'],
  'novaguine': 'PNG SLB'.split(), 'sumatra': ['TLS'], 'australia': 'AUS NZL NCL'.split(), 'borneu': 'BRN PHL'.split(),
}
SPLIT = {'CAN': ['mackenzie', 'vancouver', 'ottawa', 'labrador'], 'USA': ['alasca', 'california', 'novayork'],
         'RUS': ['moscou', 'omsk', 'dudinka', 'siberia', 'tchita', 'vladivostok'], 'IDN': ['sumatra', 'borneu', 'novaguine'], 'MYS': ['vietna', 'borneu']}
ADJ = """alasca: vladivostok mackenzie vancouver
mackenzie: vancouver ottawa groenlandia
groenlandia: labrador islandia
vancouver: ottawa california
ottawa: california novayork labrador
labrador: novayork
california: novayork mexico
novayork: mexico
mexico: venezuela
venezuela: peru brasil
peru: brasil argentina
brasil: argentina argelia
islandia: inglaterra
inglaterra: suecia alemanha portugal
portugal: alemanha polonia argelia egito
alemanha: polonia
polonia: moscou orientemedio egito
suecia: moscou
moscou: orientemedio aral omsk
argelia: egito sudao congo
egito: sudao orientemedio
sudao: congo africadosul madagascar
congo: africadosul
africadosul: madagascar
orientemedio: aral india
aral: omsk china india
omsk: china mongolia dudinka
dudinka: mongolia tchita siberia
siberia: tchita vladivostok
tchita: vladivostok china mongolia
vladivostok: china japao
mongolia: china
china: japao india vietna
india: vietna sumatra
vietna: borneu
sumatra: australia
borneu: australia novaguine
novaguine: australia"""
CONT = {'na': ('América do Norte', 5), 'sa': ('América do Sul', 2), 'eu': ('Europa', 5), 'af': ('África', 3), 'as': ('Ásia', 7), 'oc': ('Oceania', 2)}
CONT_LABEL = {'na': (-150, 42), 'sa': (-100, -22), 'eu': (-26, 52), 'af': (-12, -12), 'as': (165, 30), 'oc': (168, -30)}


def rings_of(geom):
    polys = geom['coordinates'] if geom['type'] == 'MultiPolygon' else [geom['coordinates']]
    return [p[0] for p in polys]  # só o contorno externo (buracos de lagos são irrelevantes nesta escala)


def main():
    src = [a for a in sys.argv[1:] if not a.startswith('--')][0]
    feats = json.load(open(src, encoding='utf8'))['features']
    ids = [t[0] for t in T]; idx = {k: i for i, k in enumerate(ids)}
    owner = {}
    for t, cs in C.items():
        for c in cs: owner[c] = [t]
    owner.update(SPLIT)
    adj = {k: set() for k in ids}
    for line in ADJ.strip().splitlines():
        a, rest = line.split(':')
        for b in rest.split(): adj[a.strip()].add(b); adj[b].add(a.strip())

    lab = np.full((H, W), -1, np.int32)
    seedpx = {k: [P(*s) for s in T[idx[k]][3]] for k in ids}
    dropped = []
    for f in feats:
        a3 = f['properties']['ADM0_A3']
        if a3 not in owner: continue
        allowed = owner[a3]
        for ring in rings_of(f['geometry']):
            pts = [P(lon, lat) for lon, lat in ring]
            # anel que cruza a linha de data: Chukotka (Rússia) fica à direita do mapa
            xs = [p[0] for p in pts]
            if max(xs) - min(xs) > W / 2: pts = [(x + 360 * PX if x < W / 2 else x, y) for x, y in pts]
            arr = np.array(pts, np.float64)
            area = abs(cv2.contourArea(arr.astype(np.float32))) / PX / PX
            cx, cy = arr[:, 0].mean(), arr[:, 1].mean()
            # cada pedaço vai para a semente permitida mais próxima; pedacinhos isolados e longe são descartados
            def nearest(cands):
                b, bd = None, 1e18
                for k in cands:
                    for sx, sy in seedpx[k]:
                        d = (cx - sx) ** 2 + (cy - sy) ** 2
                        if d < bd: bd, b = d, k
                return b, math.sqrt(bd) / PX
            best, dist = nearest(allowed)
            if dist > 28:  # pedaço longe do território do país (ex.: Guiana Francesa): vai para o território mais próximo
                if area < 3: dropped.append(a3); continue
                best, dist = nearest(ids)
            if area < .08: continue
            mk = np.zeros((H, W), np.uint8); cv2.fillPoly(mk, [np.round(arr).astype(np.int32)], 1)
            # só as grandes massas de terra são divididas; ilhas vão inteiras para um território
            if len(allowed) == 1 or dist > 28 or area < 400: lab[mk > 0] = idx[best]; continue
            # país dividido: Voronoi entre as sementes dos territórios permitidos
            ys, xs2 = np.nonzero(mk)
            bestd = np.full(len(xs2), 1e18); bl = np.full(len(xs2), -1)
            for k in allowed:
                for sx, sy in seedpx[k]:
                    d = (xs2 - sx) ** 2 + (ys - sy) ** 2; m = d < bestd; bestd[m] = d[m]; bl[m] = idx[k]
            lab[ys, xs2] = bl
    touch = {}
    for dy, dx in ((0, 1), (1, 0), (1, 1)):
        a = lab[:H - dy, :W - dx]; b = lab[dy:, dx:]
        m = (a != b) & (a >= 0) & (b >= 0)
        pairs, counts = np.unique(np.stack([np.minimum(a[m], b[m]), np.maximum(a[m], b[m])], 1), axis=0, return_counts=True)
        for (x, y), n in zip(pairs, counts): touch[(int(x), int(y))] = touch.get((int(x), int(y)), 0) + int(n)
    bad = [(ids[i], ids[j], n) for (i, j), n in touch.items() if ids[j] not in adj[ids[i]] and n > 8]
    for (i0, j0, n0) in bad:  # onde as fronteiras indevidas se tocam (lon/lat)
        ii, jj = idx[i0], idx[j0]; mi = lab == ii; mj = lab == jj
        near = mi & (np.roll(mj, 1, 0) | np.roll(mj, -1, 0) | np.roll(mj, 1, 1) | np.roll(mj, -1, 1))
        ys, xs = np.nonzero(near)
        if len(xs): print('  ', i0, j0, 'em lon', round(xs.mean() / PX + LON0, 1), 'y(px)', int(ys.mean()))
        # abre um estreito de mar entre os dois (não são vizinhos no jogo)
        k = np.ones((7, 7), np.uint8); gap = cv2.dilate(near.astype(np.uint8), k) > 0
        lab[gap & (mi | mj)] = -1
    sea = [(a, b) for a in ids for b in adj[a] if a < b and touch.get(tuple(sorted((idx[a], idx[b]))), 0) <= 8]
    print('fronteiras sem ligação no jogo (estreito aberto):', bad)
    print('rotas marítimas:', sea)
    print('pedaços descartados:', sorted(set(dropped)))
    out = []; S = 1 / PX; nverts = 0
    for i, (k, name, cont, seeds) in enumerate(T):
        m = (lab == i).astype(np.uint8)
        cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        polys = []
        for c in cs:
            if cv2.contourArea(c) < 30: continue
            c = cv2.approxPolyDP(c, 1.1, True)
            if len(c) < 3: continue
            polys.append([[round(float(p[0][0]) * S, 2), round(float(p[0][1]) * S, 2)] for p in c]); nverts += len(c)
        big = max(cs, key=cv2.contourArea); mb = np.zeros_like(m); cv2.drawContours(mb, [big], -1, 1, -1)
        dt = cv2.distanceTransform(np.pad(mb, 1), cv2.DIST_L2, 5)[1:-1, 1:-1]
        y, x = np.unravel_index(np.argmax(dt), dt.shape)
        out.append({'id': k, 'name': name, 'cont': cont, 'polys': polys, 'c': [round(x * S, 2), round(y * S, 2)], 'r': round(float(dt.max()) * S, 2)})
    labels = {k: [round(P(*v)[0] * S, 2), round(P(*v)[1] * S, 2)] for k, v in CONT_LABEL.items()}
    data = {'w': round(W / PX, 2), 'h': round(H / PX, 2), 'territories': out, 'adj': {k: sorted(v) for k, v in adj.items()}, 'sea': sea,
            'continents': {k: {'name': v[0], 'bonus': v[1], 'label': labels[k]} for k, v in CONT.items()},
            'source': 'Natural Earth 1:50m (domínio público), projeção de Miller'}
    js = ('// ===== Supremacia: mapa (gerado por tools/gen_war_map.py a partir do Natural Earth — não editar à mão) =====\n'
          'const WAR_MAP = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    open(os.path.join(HERE, '..', 'js', 'war-map.js'), 'w', encoding='utf8').write(js)
    print('territórios', len(out), 'vértices', nverts, 'arquivo', len(js) // 1024, 'KB', 'mapa', W // PX, 'x', H // PX)
    if '--png' in sys.argv:
        rng = np.random.default_rng(3); col = rng.integers(60, 230, (len(T), 3)).astype(np.uint8)
        img = np.full((H, W, 3), (70, 40, 20), np.uint8); img[lab >= 0] = col[lab[lab >= 0]]
        for t in out: cv2.putText(img, t['name'].encode('ascii', 'ignore').decode(), (int(t['c'][0] * PX) - 30, int(t['c'][1] * PX)), cv2.FONT_HERSHEY_SIMPLEX, .8, (0, 0, 0), 2)
        cv2.imwrite(os.path.join(os.environ.get('TEMP', HERE), 'war_map_preview.png'), cv2.resize(img, (W // 2, H // 2)))


if __name__ == '__main__':
    main()
