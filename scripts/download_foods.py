# Descarga fotos REALES de los platos típicos (comidas) a assets/fotos/{id}.jpg
# desde Wikipedia (prueba varios títulos candidatos, ES y EN).
import json, os, ssl, urllib.request, urllib.parse

BASE = os.path.join(os.path.dirname(__file__), '..', 'assets', 'fotos')
os.makedirs(BASE, exist_ok=True)
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
UA = 'CarreraLive/1.0 (juego local; ermanmeneses@gmail.com)'

# id -> lista de títulos candidatos de Wikipedia (se prueban en orden, ES y EN)
FOODS = {
    'F01': ['Taco', 'Tacos'],
    'F02': ['Feijoada'],
    'F03': ['Asado', 'Asado (Argentina)'],
    'F04': ['Arepa'],
    'F05': ['Ceviche'],
    'F06': ['Empanada'],
    'F07': ['Chivito (plato)', 'Chivito'],
    'F08': ['Encebollado'],
    'F09': ['Pabellón criollo'],
    'F10': ['Salteña'],
    'F11': ['Sopa paraguaya'],
    'F12': ['Gallo pinto'],
    'F13': ['Baleada'],
    'F14': ['Pupusa'],
    'F15': ['Pepián', 'Pepian'],
    'F16': ['Sancocho'],
    'F17': ['Mofongo'],
    'F18': ['Ropa vieja'],
}

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), context=ctx, timeout=25)

def summary_thumb(lang, title):
    api = 'https://%s.wikipedia.org/api/rest_v1/page/summary/%s' % (lang, urllib.parse.quote(title))
    d = json.loads(get(api).read().decode('utf-8'))
    return (d.get('thumbnail') or {}).get('source') or (d.get('originalimage') or {}).get('source')

ok, fail = [], []
for fid, titles in FOODS.items():
    src = None
    for title in titles:
        for lang in ('es', 'en'):
            try:
                src = summary_thumb(lang, title)
                if src: break
            except Exception:
                pass
        if src: break
    if not src:
        fail.append(fid); continue
    try:
        big = src.replace('/220px-', '/420px-').replace('/320px-', '/420px-')
        with open(os.path.join(BASE, fid + '.jpg'), 'wb') as f:
            f.write(get(big).read())
        ok.append(fid)
    except Exception:
        fail.append(fid)

print('OK (%d):' % len(ok), ', '.join(ok))
print('FALLOS (%d):' % len(fail), ', '.join(fail) if fail else '-')
