# Descarga las fotos (jugadores, boxeadores, atletas) a assets/fotos/{id}.jpg
# Prueba Wikipedia ES y, si no hay miniatura, Wikipedia EN.
import json, os, ssl, urllib.request, urllib.parse

BASE = os.path.join(os.path.dirname(__file__), '..', 'assets', 'fotos')
os.makedirs(BASE, exist_ok=True)
ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
UA = 'CarreraLive/1.0 (juego local; ermanmeneses@gmail.com)'

PEOPLE = {
    # ---- jugadores de futbol ----
    'MES': 'Lionel_Messi', 'CR7': 'Cristiano_Ronaldo', 'NEY': 'Neymar',
    'MBA': 'Kylian_Mbappé', 'HAA': 'Erling_Haaland', 'VIN': 'Vinícius_Júnior',
    'BEL': 'Jude_Bellingham', 'LEW': 'Robert_Lewandowski', 'BEN': 'Karim_Benzema',
    'MOD': 'Luka_Modrić', 'KDB': 'Kevin_De_Bruyne', 'SAL': 'Mohamed_Salah',
    'KAN': 'Harry_Kane', 'LAU': 'Lautaro_Martínez',
    # ---- boxeo (LatAm) ----
    'CAN': 'Saúl_Álvarez', 'JCC': 'Julio_César_Chávez', 'JMM': 'Juan_Manuel_Márquez',
    'MON': 'Carlos_Monzón', 'MAI': 'Marcos_Maidana',
    'TRI': 'Félix_Trinidad', 'COT': 'Miguel_Cotto', 'WGO': 'Wilfredo_Gómez',
    'DUR': 'Roberto_Durán', 'AGU': 'Alexis_Argüello', 'MAY': 'Ricardo_Mayorga',
    'PAM': 'Antonio_Cervantes', 'STE': 'Teófilo_Stevenson', 'SAV': 'Félix_Savón',
    'LIN': 'Jorge_Linares', 'VAL': 'Edwin_Valero',
    # ---- boxeo (mundial) ----
    'ALI': 'Muhammad_Ali', 'TYS': 'Mike_Tyson', 'FMW': 'Floyd_Mayweather',
    'PAC': 'Manny_Pacquiao', 'GGG': 'Gennadi_Golovkin', 'KLI': 'Vitali_Klitschko',
    # ---- resistencia (LatAm) ----
    'NAI': 'Nairo_Quintana', 'EGA': 'Egan_Bernal', 'URA': 'Rigoberto_Urán',
    'CAR': 'Richard_Carapaz', 'LIM': 'Vanderlei_Cordeiro_de_Lima',
    'TEJ': 'Gladys_Tejeda', 'KOB': 'Kristel_Köbrich', 'CUR': 'Juan_Curuchet',
    'POL': 'Claudia_Poll', 'BRR': 'Erick_Barrondo',
    # ---- resistencia (mundial: africanos, españoles, etc.) ----
    'KIP': 'Eliud_Kipchoge', 'GEB': 'Haile_Gebrselassie', 'BEK': 'Kenenisa_Bekele',
    'DIB': 'Tirunesh_Dibaba', 'IND': 'Miguel_Induráin', 'CON': 'Alberto_Contador',
    'VLV': 'Alejandro_Valverde_(ciclista)', 'FAR': 'Mo_Farah', 'FRO': 'Chris_Froome',
    'POG': 'Tadej_Pogačar', 'MER': 'Eddy_Merckx',
}

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers={'User-Agent': UA}), context=ctx, timeout=25)

def summary_thumb(lang, title):
    api = 'https://%s.wikipedia.org/api/rest_v1/page/summary/%s' % (lang, urllib.parse.quote(title))
    d = json.loads(get(api).read().decode('utf-8'))
    return (d.get('thumbnail') or {}).get('source') or (d.get('originalimage') or {}).get('source')

ok, fail = [], []
for pid, title in PEOPLE.items():
    src = None
    for lang in ('es', 'en'):
        try:
            src = summary_thumb(lang, title)
            if src: break
        except Exception:
            pass
    if not src:
        fail.append(pid); continue
    try:
        big = src.replace('/220px-', '/400px-').replace('/320px-', '/400px-')
        with open(os.path.join(BASE, pid + '.jpg'), 'wb') as f:
            f.write(get(big).read())
        ok.append(pid)
    except Exception:
        fail.append(pid)

print('OK (%d):' % len(ok), ', '.join(ok))
print('FALLOS (%d):' % len(fail), ', '.join(fail) if fail else '-')
