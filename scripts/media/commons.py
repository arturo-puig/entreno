"""Consultas a la API de Wikimedia Commons (solo lectura), con identificación y pausas."""
import json, re, sys, time, urllib.parse, urllib.request

UA = 'EntrenoApp/1.0 (personal training PWA; https://github.com/arturo-puig/entreno) python-urllib'
API = 'https://commons.wikimedia.org/w/api.php'

def get(params, tries=8):
    params = {**params, 'format': 'json', 'formatversion': '2'}
    url = API + '?' + urllib.parse.urlencode(params)
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'User-Agent': UA})
            with urllib.request.urlopen(req, timeout=30) as r:
                time.sleep(2)
                return json.load(r)
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = int(e.headers.get('Retry-After') or 0) or 10 * (i + 1)
                print(f'(429: espero {wait}s)', file=sys.stderr)
                time.sleep(min(wait, 90)); continue
            raise
    raise RuntimeError('rate limited')

def search(q, limit=30):
    d = get({'action': 'query', 'list': 'search', 'srsearch': q, 'srnamespace': 6, 'srlimit': limit})
    return [x['title'] for x in d['query']['search']]

def members(cat, kind='file', limit=200):
    d = get({'action': 'query', 'list': 'categorymembers', 'cmtitle': cat, 'cmtype': kind, 'cmlimit': limit})
    return [x['title'] for x in d['query']['categorymembers']]

def strip(h):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', '', h or '')).strip()

def info(titles):
    out = []
    for i in range(0, len(titles), 40):
        d = get({'action': 'query', 'titles': '|'.join(titles[i:i+40]), 'prop': 'imageinfo',
                 'iiprop': 'url|size|mime|extmetadata|mediatype', 'iiurlwidth': 480})
        for p in d['query']['pages']:
            ii = (p.get('imageinfo') or [{}])[0]
            em = ii.get('extmetadata', {})
            g = lambda k: strip(em.get(k, {}).get('value'))
            out.append({'title': p['title'], 'url': ii.get('url'), 'thumb': ii.get('thumburl'), 'mime': ii.get('mime'),
                        'w': ii.get('width'), 'h': ii.get('height'), 'size': ii.get('size'), 'duration': ii.get('duration'),
                        'license': g('LicenseShortName'), 'artist': g('Artist'), 'credit': g('Credit'),
                        'desc': g('ImageDescription')[:200], 'attr_req': g('AttributionRequired'), 'licurl': g('LicenseUrl')})
    return out

if __name__ == '__main__':
    cmd = sys.argv[1]
    if cmd == 'search':
        for q in sys.argv[2:]:
            print('##', q); [print('  ', t) for t in search(q)]
    elif cmd == 'members':
        for c in sys.argv[2:]:
            print('##', c); [print('  ', t) for t in members(c, 'subcat') + members(c)]
    elif cmd == 'info':
        print(json.dumps(info(sys.argv[2:]), ensure_ascii=False, indent=1))
