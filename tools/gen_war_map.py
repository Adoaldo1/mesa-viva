"""Gera o mapa do Supremacia (js/war-map.js): contornos dos continentes (lon/lat aproximados) divididos
em 42 territórios por Voronoi a partir de um ponto-semente por território, restrito à terra.

Uso: python tools/gen_war_map.py [--png]   (--png salva tools/war_map_preview.png para conferir)
Confere se as fronteiras desenhadas batem com a lista de vizinhos do jogo e lista as rotas marítimas.
"""
import json, os, sys
import numpy as np, cv2

HERE = os.path.dirname(os.path.abspath(__file__))
LON0, LON1, LAT0, LAT1, PX = -170, 182, -50, 84, 8
YS = 1.12  # achata menos as latitudes altas (efeito tipo Miller, só visual)
W, H = (LON1 - LON0) * PX, int((LAT1 - LAT0) * PX * YS)

LAND = {
  'na': [(-166,68),(-156,71.5),(-140,70),(-128,70.5),(-115,68.5),(-100,69),(-95,72),(-82,70),(-80,63),(-94,59),(-92,55),(-82,52.5),(-78,58),(-70,61),(-64,60),(-56,53),(-60,47.5),(-66,45),(-70,42),(-75,38.5),(-76,35),(-81,31),(-80,25.5),(-82,27),(-85,30),(-90,29.5),(-97,27.5),(-97,22),(-94,18.5),(-90,21.5),(-87,21.5),(-88,16),(-84,15.5),(-83,10.5),(-79.5,9.3),(-77.5,8.3),(-79.5,7.4),(-83,8.2),(-86,11.5),(-92,14.5),(-97,16),(-105,20),(-106,23.5),(-110,23),(-112.5,28),(-114.5,31),(-117,32.5),(-121,35),(-124,40),(-124.5,47),(-127,50.5),(-133,55),(-140,59.8),(-148,60.5),(-153,58),(-158,57),(-163,55),(-162,59),(-165.5,62),(-166,65)],
  'greenland': [(-73,78),(-60,82),(-35,83.5),(-20,81),(-18,75),(-22,70),(-32,68),(-42,60),(-48,61),(-53,66),(-56,72),(-66,76)],
  'sa': [(-77.5,8.3),(-72,12),(-64,11),(-60,8.5),(-52,5),(-50,0),(-44,-2),(-35,-5),(-35,-9),(-39,-14),(-40,-22),(-48,-26),(-53,-34),(-58,-38),(-62,-40),(-65,-45),(-68,-50),(-69,-55),(-73,-53),(-75,-46),(-73,-37),(-71,-30),(-70,-18),(-76,-14),(-81,-6),(-80,-2),(-78,2),(-79.5,7.4)],
  'europe': [(-9,43.5),(-9,37),(-6,36),(-2,36.7),(0,38.7),(3,42),(5,43.3),(9,44),(12,42),(15.5,38.2),(17,39.5),(14,44.5),(18,42.5),(20,39.5),(23,37),(24,40),(26.5,40.5),(29,41),(30,45.5),(34,46),(38,47),(40,46),(45,45),(48,46.5),(52,50),(58,51),(60,56),(62,62),(65,68),(58,69),(50,68),(44,68),(40,66),(35,66.5),(33,69.3),(30,69.5),(30,61),(28,60.3),(24,58.3),(21.5,57.3),(21,55),(14,54),(10,54),(8.5,57),(8,54),(5,53),(3,51),(-2,49.2),(-4.5,48.5),(-1.5,46.5),(-1.8,43.4)],
  'scandinavia': [(5,61.5),(5.5,58),(8,58),(10.5,59.2),(12,56.2),(14,55.4),(16.5,56.5),(17,58.5),(19,63),(22,65.8),(25.5,65),(21.5,62),(22,60.3),(26,60.4),(30.2,61),(30.2,69.7),(28,71),(20,70),(14,67.5),(11,63.5)],
  'britain': [(-5.5,50),(1.3,51),(1.7,52.8),(0,54),(-1.8,55.8),(-1.8,57.6),(-3.2,58.6),(-5.2,58.6),(-6,57),(-5,55),(-3.2,54.5),(-4.5,53),(-5,51.7)],
  'ireland': [(-10,51.6),(-6,52),(-5.8,54.8),(-8,55.3),(-10,54)],
  'iceland': [(-24,64),(-22.5,66.3),(-15,66.5),(-13.5,65),(-18,63.4)],
  'africa': [(-17,21),(-17,14.7),(-15,11),(-12,7.3),(-7,4.5),(-2,5),(5,6),(9,4),(10,1),(12,-5),(13,-12),(12,-17),(15,-27),(18,-34.5),(22,-34),(27,-33.3),(32,-29),(35,-24),(35,-18.5),(40,-15),(40,-10),(39,-5),(42,0),(48,4.5),(51,11.5),(44,11),(42.6,12.2),(39,17),(37.5,20),(35,24),(33.5,27.7),(32.3,31.2),(29,31),(25,32),(20,30.8),(15,32),(10,34),(10.5,37),(3,36.8),(-2,35.2),(-6,35.8),(-9.7,31),(-10,29),(-13,27.5)],
  'madagascar': [(44,-16),(49.5,-15),(50.3,-20),(47.3,-25),(44,-24),(43.5,-20)],
  'asia': [(65,68),(70,73),(80,73.3),(90,76),(105,78),(113,74),(130,72),(140,72.5),(160,70),(170,70),(180,66),(178,63),(170,60),(163,58),(160,52),(156,51),(156,57),(150,59.5),(140,59),(137,54),(141,52),(140,48),(135,43.5),(130,42.5),(129.5,37),(127,34.8),(126,37.5),(125,39.7),(121.5,40.5),(118,39),(120.5,36.5),(122,31),(120,26),(116.5,23),(110,21),(108,21.7),(106,18.5),(109.3,13),(106.5,9),(103,10),(100,13.5),(100.3,6.5),(104,2.2),(101.5,3.4),(98.3,8),(98.3,16),(94,18),(92,22),(88,22),(85,20),(80,15.5),(80,10),(77,8),(73,16),(72.7,21),(67.5,24),(62,25.2),(57,25.6),(56.3,27),(52,27.5),(49.5,30),(48,29.3),(51,24.6),(55.5,25.5),(56.3,24),(59.6,22.5),(55,17.3),(52,16),(45,12.8),(43.6,13.3),(40,19.5),(37,24.5),(34.8,28),(32.6,30.8),(34.5,32.5),(36,36),(31,36.7),(27.5,37),(26.3,40.2),(29,41),(35,42),(41.5,41.5),(45,45),(48,46.5),(52,50),(58,51),(60,56),(62,62)],
  'japan': [(130,31),(135,33.5),(140,35),(141,38),(141.5,41),(143,42),(145.5,43.5),(142,45.5),(139.5,42),(139.7,39.5),(137,37),(133,35.5),(130,34)],
  'sumatra': [(95,5.6),(98,4),(104,-2),(106,-6),(114.5,-7),(114.5,-8.6),(106,-7.6),(103,-5.5),(101,-2.5),(98,1),(95.2,3)],
  'borneo': [(109,1.6),(111,2.6),(117,7),(119.3,5),(117.7,1),(116.3,-3.6),(111,-3.4),(109,-1)],
  'newguinea': [(131,-1),(138,-1.6),(145,-4.5),(150.5,-10.5),(143,-9.3),(138,-8.2),(137,-5),(132,-3.2)],
  'australia': [(114,-22),(113.5,-26),(115,-34),(118,-35),(124,-33.6),(131,-31.5),(135,-34.6),(138,-35.6),(140,-38),(144,-38.5),(147,-38.7),(150,-37.5),(153.3,-32),(153.3,-25),(150,-22),(146,-19),(145.3,-15),(143.5,-11),(142,-15),(141,-17),(140,-17.6),(136.5,-15),(137,-12),(133,-11.6),(130,-13),(129.5,-15),(126,-14),(122,-17),(118.5,-20)],
}
LAKES = { 'caspian': [(47,45),(50,47),(53.5,46.8),(54,41),(53,37),(49,37.2),(47.5,41)], 'hudson_fill': [] }

# id, nome, continente, semente (lon, lat)
T = [
  ('alasca','Alasca','na',[(-152, 65), (-158, 60), (-146, 62), (-160, 66)]), ('mackenzie','Mackenzie','na',[(-128, 65), (-115, 65), (-102, 65), (-95, 68), (-125, 60)]), ('groenlandia','Groenlândia','na',[(-42, 73), (-30, 79), (-48, 64), (-24, 73), (-55, 76)]),
  ('vancouver','Vancouver','na',[(-127, 56), (-120, 52), (-133, 58), (-114, 55)]), ('ottawa','Ottawa','na',[(-96, 56), (-86, 52), (-104, 52), (-88, 58), (-80, 55), (-84, 64)]), ('labrador','Labrador','na',[(-68, 55), (-62, 51), (-74, 59), (-70, 48)]),
  ('california','Califórnia','na',[(-118, 38), (-108, 37), (-114, 44), (-122, 41)]), ('novayork','Nova York','na',[(-86, 38), (-77, 41), (-93, 41), (-82, 33), (-98, 34)]), ('mexico','México','na',[(-100, 22), (-90, 17), (-105, 27), (-84, 12)]),
  ('venezuela','Venezuela','sa',[(-66, 5), (-73, 6), (-58, 4), (-74, 2)]), ('peru','Peru','sa',[(-74, -10), (-69, -17), (-78, -3)]), ('brasil','Brasil','sa',[(-50, -10), (-45, -5), (-52, -22), (-60, -8)]), ('argentina','Argentina','sa',[(-65, -35), (-69, -46), (-60, -28), (-70, -28)]),
  ('islandia','Islândia','eu',[(-19, 65)]), ('inglaterra','Inglaterra','eu',[(-3, 54), (-8, 53), (-4, 57)]), ('portugal','Portugal','eu',[(-4, 40), (1, 46), (-1, 48), (4, 44)]),
  ('alemanha','Alemanha','eu',[(10, 51), (9, 55), (14, 51), (11, 47), (13, 43)]), ('polonia','Polônia','eu',[(20, 52), (24, 56), (23, 47), (26, 44), (22, 40), (28, 49)]), ('suecia','Suécia','eu',[(15, 62), (26, 65), (10, 61), (20, 68), (16, 58), (27, 62)]), ('moscou','Moscou','eu',[(40, 57), (33, 59), (50, 62), (56, 55), (45, 49), (38, 66), (31, 54), (33, 64)]),
  ('argelia','Argélia','af',[(-1, 24), (-8, 20), (-10, 11), (4, 11), (8, 32), (-5, 32), (12, 16)]), ('egito','Egito','af',[(27, 25), (22, 23), (31, 28), (30, 21)]), ('sudao','Sudão','af',[(36, 8), (41, 3), (30, 10), (46, 7), (36, -5), (38, 15), (24, 9), (33, 15)]), ('congo','Congo','af',[(17, 0), (14, -9), (22, -5), (19, 5), (10, 2)]),
  ('africadosul','África do Sul','af',[(24, -25), (31, -19), (18, -20), (28, -30)]), ('madagascar','Madagascar','af',[(47, -19)]),
  ('orientemedio','Oriente Médio','as',[(45, 28), (38, 35), (52, 33), (48, 19), (33, 39), (43, 40), (40, 22), (43, 16), (58, 28)]), ('aral','Aral','as',[(62, 44), (66, 36), (72, 42), (56, 41), (61, 51)]), ('omsk','Omsk','as',[(73, 56), (75, 63), (66, 59), (80, 52), (72, 68)]), ('dudinka','Dudinka','as',[(90, 67), (86, 60), (95, 73), (84, 72)]),
  ('siberia','Sibéria','as',[(115, 67), (125, 66), (106, 72), (132, 70), (140, 66)]), ('vladivostok','Vladivostok','as',[(157, 64), (167, 66), (148, 61), (160, 57), (140, 55), (134, 47)]), ('tchita','Tchita','as',[(116, 55), (122, 51), (108, 55), (128, 56)]), ('mongolia','Mongólia','as',[(100, 46), (107, 44), (91, 47)]),
  ('china','China','as',[(110, 30), (115, 25), (90, 33), (82, 38), (118, 38), (125, 41), (102, 26)]), ('india','Índia','as',[(78, 20), (75, 28), (85, 25), (78, 12), (68, 26)]), ('vietna','Vietnã','as',[(103, 15), (100, 6), (106, 20), (98, 19), (102, 3)]), ('japao','Japão','as',[(138, 37), (142, 43), (132, 33)]),
  ('sumatra','Sumatra','oc',[(100, 0), (110, -7), (104, -4)]), ('borneu','Bornéu','oc',[(114, 1), (110, 0), (116, -2)]), ('novaguine','Nova Guiné','oc',[(142, -5), (136, -3), (147, -7)]), ('australia','Austrália','oc',[(134, -25), (145, -25), (120, -25), (144, -14), (128, -17)]),
]
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
CONT = { 'na': ('América do Norte', 5), 'sa': ('América do Sul', 2), 'eu': ('Europa', 5), 'af': ('África', 3), 'as': ('Ásia', 7), 'oc': ('Oceania', 2) }


def P(lon, lat): return ((lon - LON0) * PX, (LAT1 - lat) * PX * YS)


def main():
    ids = [t[0] for t in T]; idx = {k: i for i, k in enumerate(ids)}
    adj = {k: set() for k in ids}
    for line in ADJ.strip().splitlines():
        a, rest = line.split(':')
        for b in rest.split(): adj[a.strip()].add(b); adj[b].add(a.strip())
    # cada massa de terra só pode ser dividida entre os territórios que pertencem a ela
    ALLOW = {'na': [t[0] for t in T if t[2] == 'na' and t[0] != 'groenlandia'], 'greenland': ['groenlandia'],
             'sa': [t[0] for t in T if t[2] == 'sa'], 'europe': ['portugal', 'alemanha', 'polonia', 'moscou'],
             'scandinavia': ['suecia'], 'britain': ['inglaterra'], 'ireland': ['inglaterra'], 'iceland': ['islandia'],
             'africa': [t[0] for t in T if t[2] == 'af' and t[0] != 'madagascar'], 'madagascar': ['madagascar'],
             'asia': [t[0] for t in T if t[2] == 'as' and t[0] != 'japao'], 'japan': ['japao'], 'sumatra': ['sumatra'],
             'borneo': ['borneu'], 'newguinea': ['novaguine'], 'australia': ['australia']}
    order = ['asia', 'europe', 'scandinavia'] + [k for k in LAND if k not in ('asia', 'europe', 'scandinavia')]
    pid = np.full((H, W), -1, np.int32)
    for n, k in enumerate(order):
        mk = np.zeros((H, W), np.uint8); cv2.fillPoly(mk, [np.array([P(*p) for p in LAND[k]], np.int32)], 1)
        pid[mk > 0] = n
    for k, poly in LAKES.items():
        if poly: mk = np.zeros((H, W), np.uint8); cv2.fillPoly(mk, [np.array([P(*p) for p in poly], np.int32)], 1); pid[mk > 0] = -1
    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    lab = np.full((H, W), -1, np.int32)
    for n, k in enumerate(order):
        sel = pid == n; best = np.full((H, W), 1e18, np.float32); l2 = np.full((H, W), -1, np.int32)
        for tid in ALLOW[k]:
            i = idx[tid]
            for sp in T[i][3]:
                sx, sy = P(*sp); d = (xx - sx) ** 2 + (yy - sy) ** 2
                m = d < best; best[m] = d[m]; l2[m] = i
        lab[sel] = l2[sel]
    # fronteiras: pares de vizinhos por pixel
    touch = {}
    for dy, dx in ((0, 1), (1, 0)):
        a = lab[:H - dy, :W - dx]; b = lab[dy:, dx:]
        m = (a != b) & (a >= 0) & (b >= 0)
        for x, y in zip(a[m], b[m]):
            key = tuple(sorted((int(x), int(y)))); touch[key] = touch.get(key, 0) + 1
    bad, sea = [], []
    for (i, j), n in touch.items():
        if ids[j] not in adj[ids[i]] and n > 6: bad.append((ids[i], ids[j], n))
    for a in ids:
        for b in adj[a]:
            if a < b and touch.get(tuple(sorted((idx[a], idx[b]))), 0) <= 6: sea.append((a, b))
    print('fronteiras desenhadas sem ligação no jogo:', bad)
    print('rotas marítimas (ligadas sem fronteira):', sea)
    # polígonos por território
    out = []
    S = 1 / PX  # unidades do mapa = graus de longitude
    for i, (k, name, cont, seed) in enumerate(T):
        m = (lab == i).astype(np.uint8)
        cs, _ = cv2.findContours(m, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
        polys = []
        for c in cs:
            if cv2.contourArea(c) < 40: continue
            c = cv2.approxPolyDP(c, 1.6, True)
            polys.append([[round(float(p[0][0]) * S, 2), round(float(p[0][1]) * S, 2)] for p in c])
        dt = cv2.distanceTransform(np.pad(m, 1), cv2.DIST_L2, 5)[1:-1, 1:-1]
        y, x = np.unravel_index(np.argmax(dt), dt.shape)
        out.append({'id': k, 'name': name, 'cont': cont, 'polys': polys, 'c': [round(x * S, 2), round(y * S, 2)], 'r': round(float(dt.max()) * S, 2)})
    data = {'w': round(W / PX, 2), 'h': round(H / PX, 2), 'territories': out,
            'adj': {k: sorted(v) for k, v in adj.items()}, 'sea': sea,
            'continents': {k: {'name': v[0], 'bonus': v[1]} for k, v in CONT.items()}}
    js = ('// ===== Supremacia: mapa (gerado por tools/gen_war_map.py — não editar à mão) =====\n'
          'const WAR_MAP = ' + json.dumps(data, ensure_ascii=False, separators=(',', ':')) + ';\n')
    open(os.path.join(HERE, '..', 'js', 'war-map.js'), 'w', encoding='utf8').write(js)
    print('territórios', len(out), 'arquivo', len(js) // 1024, 'KB')
    if '--png' in sys.argv:
        rng = np.random.default_rng(3); col = rng.integers(60, 230, (len(T), 3)).astype(np.uint8)
        img = np.full((H, W, 3), (70, 40, 20), np.uint8); img[lab >= 0] = col[lab[lab >= 0]]
        for (a, b) in sea: cv2.line(img, tuple(int(v) for v in P(*T[idx[a]][3][0])), tuple(int(v) for v in P(*T[idx[b]][3][0])), (255, 255, 255), 2)
        for t in out: cv2.putText(img, t['name'].encode('ascii', 'ignore').decode(), (int(t['c'][0] * PX) - 30, int(t['c'][1] * PX)), cv2.FONT_HERSHEY_SIMPLEX, .7, (0, 0, 0), 2)
        cv2.imwrite(os.path.join(HERE, 'war_map_preview.png'), cv2.resize(img, (W // 2, H // 2)))


if __name__ == '__main__':
    main()
