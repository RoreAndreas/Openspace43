"""Importe les personnages PixelLab dans l'open space.

Pour chaque personnage du catalogue (src/characters/catalog.json) qui a un identifiant PixelLab :
télécharge son export (le zip public de PixelLab), range ses images dans public/characters/<id>/
(une planche par animation : une rangée par direction, une colonne par image) et écrit les
dimensions dans src/characters/sheets.json, que le moteur lit au démarrage.

Toutes les images d'un personnage partagent la même case (la plus grande) et le même point
d'ancrage (ses pieds) : PixelLab centre chaque image sur sa toile, on garde ce centrage.
Rien n'est redimensionné.

    python scripts/characters.py            # tous les personnages
    python scripts/characters.py rore mage_du_code   # seulement ceux-là (id du catalogue)

Il faut Python 3.10+ et Pillow (pip install pillow).
"""
from __future__ import annotations

import hashlib
import io
import json
import sys
import urllib.error
import urllib.request
import zipfile
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
CATALOG = ROOT / 'src' / 'characters' / 'catalog.json'
SHEETS = ROOT / 'src' / 'characters' / 'sheets.json'
OUT = ROOT / 'public' / 'characters'
DOWNLOAD = 'https://api.pixellab.ai/mcp/characters/{}/download'

# l'ordre des rotations dans rotations.png
ROTATIONS = ['south', 'south-east', 'east', 'north-east', 'north', 'north-west', 'west', 'south-west']
# l'ordre des rangées dans une planche d'animation
ANIM_DIRS = ['south', 'east', 'north', 'west']
# les animations que le moteur sait jouer : un nom PixelLab qui contient ce mot devient cette animation
ANIMS = ['walk', 'work', 'interact', 'special']


def fetch(pixellab_id: str) -> zipfile.ZipFile:
    with urllib.request.urlopen(DOWNLOAD.format(pixellab_id), timeout=60) as r:
        return zipfile.ZipFile(io.BytesIO(r.read()))


def load(z: zipfile.ZipFile, path: str) -> Image.Image:
    im = Image.open(io.BytesIO(z.read(path))).convert('RGBA')
    # pas de demi-transparence en pixel art : chaque pixel est plein ou vide
    a = im.getchannel('A').point(lambda v: 255 if v >= 128 else 0)
    im.putalpha(a)
    return im


def palette(im: Image.Image, n: int = 6) -> list[str]:
    """Ses couleurs principales (sans le contour noir), de la plus présente à la moins présente."""
    counts: dict[tuple[int, int, int], int] = {}
    for r, g, b, a in im.getdata():
        if a and max(r, g, b) > 40:
            counts[(r, g, b)] = counts.get((r, g, b), 0) + 1
    picked: list[tuple[int, int, int]] = []
    for c, _ in sorted(counts.items(), key=lambda kv: -kv[1]):
        # une teinte trop proche d'une couleur déjà retenue n'apporte rien
        if all(sum((x - y) ** 2 for x, y in zip(c, p)) > 45 ** 2 for p in picked):
            picked.append(c)
        if len(picked) == n:
            break
    return ['#%02x%02x%02x' % c for c in picked]


def anim_key(name: str) -> str | None:
    low = name.lower()
    for k in ANIMS:
        if k in low:
            return k
    return None


def frames_of(entry) -> list[str]:
    """Une direction d'animation : une liste de chemins, ou un dict {index: chemin}."""
    if isinstance(entry, list):
        return entry
    if isinstance(entry, dict):
        return [entry[k] for k in sorted(entry, key=lambda k: int(''.join(c for c in k if c.isdigit()) or 0))]
    return [entry]


def build(char: dict) -> dict:
    z = fetch(char['pixellab'])
    meta = json.loads(z.read('metadata.json'))
    frames = meta['states'][0]['frames']
    rots = {d: load(z, p) for d, p in frames['rotations'].items()}
    anims: dict[str, dict[str, list[Image.Image]]] = {}
    for name, dirs in (frames.get('animations') or {}).items():
        key = anim_key(name)
        if not key:
            print(f"  - animation « {name} » ignorée (nom sans {', '.join(ANIMS)})")
            continue
        for d, entry in dirs.items():
            if d in ANIM_DIRS:
                anims.setdefault(key, {})[d] = [load(z, p) for p in frames_of(entry)]

    every = list(rots.values()) + [im for a in anims.values() for fs in a.values() for im in fs]
    cw = max(im.width for im in every)
    ch = max(im.height for im in every)

    def placed(im: Image.Image) -> Image.Image:
        cell = Image.new('RGBA', (cw, ch))
        cell.paste(im, ((cw - im.width) // 2, (ch - im.height) // 2))
        return cell

    folder = OUT / char['id']
    folder.mkdir(parents=True, exist_ok=True)
    for old in folder.glob('*.png'):
        old.unlink()

    dirs = [d for d in ROTATIONS if d in rots]
    sheet = Image.new('RGBA', (cw * len(dirs), ch))
    for i, d in enumerate(dirs):
        sheet.paste(placed(rots[d]), (i * cw, 0))
    sheet.save(folder / 'rotations.png', optimize=True)

    south = placed(rots['south'])
    bbox = south.getchannel('A').getbbox()
    feet = bbox[3] - 1
    out = {
        'cell': [cw, ch],
        'anchor': [cw // 2, feet],
        'height': feet - bbox[1] + 1,
        'palette': palette(south),
        'rotations': dirs,
        'anims': {},
    }
    for key, by_dir in anims.items():
        rows = [d for d in ANIM_DIRS if d in by_dir]
        n = max(len(by_dir[d]) for d in rows)
        sheet = Image.new('RGBA', (cw * n, ch * len(rows)))
        for r, d in enumerate(rows):
            for c, im in enumerate(by_dir[d]):
                sheet.paste(placed(im), (c * cw, r * ch))
        sheet.save(folder / f'{key}.png', optimize=True)
        out['anims'][key] = {'dirs': rows, 'frames': n}
        # contrôle : ses pieds doivent tomber au même endroit que sur sa rotation (sinon il sauterait en changeant de pose)
        for d in rows:
            if d not in rots:
                continue
            want = placed(rots[d]).getchannel('A').getbbox()[3]
            got = max(placed(im).getchannel('A').getbbox()[3] for im in by_dir[d])
            if abs(want - got) > 2:
                print(f"  ⚠ {key} {d} : les pieds sont décalés de {got - want} px par rapport à la rotation")
    # une empreinte des images : le navigateur recharge les planches quand elles changent
    h = hashlib.sha1()
    for png in sorted(folder.glob('*.png')):
        h.update(png.read_bytes())
    out['v'] = h.hexdigest()[:8]
    return out


def main(only: list[str]) -> None:
    catalog = json.loads(CATALOG.read_text(encoding='utf-8'))
    sheets = json.loads(SHEETS.read_text(encoding='utf-8')) if SHEETS.exists() else {}
    for char in catalog['characters']:
        if only and char['id'] not in only:
            continue
        if not char.get('pixellab'):
            print(f"{char['id']} : pas encore d'identifiant PixelLab, ignoré")
            continue
        print(f"{char['id']} ({char['name']})")
        try:
            sheets[char['id']] = build(char)
        except urllib.error.HTTPError as e:
            # 423 : PixelLab génère encore une de ses animations ; on garde ses images actuelles
            print(f"  PixelLab répond {e.code} ({'génération en cours' if e.code == 423 else e.reason}) : images inchangées, réessaie plus tard")
            continue
        info = sheets[char['id']]
        anims = ', '.join(f"{k} {v['frames']} images × {len(v['dirs'])} directions" for k, v in info['anims'].items()) or 'aucune'
        print(f"  case {info['cell'][0]}×{info['cell'][1]}, hauteur {info['height']} px, animations : {anims}")
    known = {c['id'] for c in catalog['characters']}
    sheets = {k: v for k, v in sorted(sheets.items()) if k in known}
    SHEETS.write_text(json.dumps(sheets, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    main(sys.argv[1:])
