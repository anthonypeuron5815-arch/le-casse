from PIL import Image, ImageDraw, ImageFilter, ImageFont
import math, os

OUT = os.path.expanduser('~/le-casse/icons')
os.makedirs(OUT, exist_ok=True)

GOLD   = (255, 197, 61)
GOLD_D = (255, 159, 28)
RED    = (255, 46, 85)
BG1    = (10, 15, 30)
BG2    = (4, 6, 13)

def base(size, inset=0.0):
    """Icône : cadran de coffre néon or + coeur rouge."""
    S = size * 4  # supersampling
    img = Image.new('RGB', (S, S), BG2)
    d = ImageDraw.Draw(img)

    # fond dégradé radial
    for i in range(140, 0, -1):
        r = S * 0.95 * i / 140
        t = i / 140
        col = tuple(int(BG2[k] + (BG1[k] - BG2[k]) * (1 - t) ** 1.6) for k in range(3))
        d.ellipse([S/2 - r, S/2 - r, S/2 + r, S/2 + r], fill=col)

    scale = 1.0 - inset
    c = S / 2

    glow = Image.new('RGB', (S, S), (0, 0, 0))
    gd = ImageDraw.Draw(glow)

    def ring(rad, w, col, target):
        target.ellipse([c - rad, c - rad, c + rad, c + rad], outline=col, width=int(w))

    R1 = S * 0.335 * scale
    R2 = S * 0.235 * scale
    ring(R1, S * 0.032 * scale, GOLD, gd)
    ring(R1, S * 0.032 * scale, GOLD, d)

    # anneau intérieur pointillé
    steps = 28
    for i in range(steps):
        a0 = i * (360 / steps)
        if i % 2: continue
        for t in (d, gd):
            t.arc([c - R2, c - R2, c + R2, c + R2], a0, a0 + 360 / steps * 0.62,
                  fill=GOLD_D, width=int(S * 0.016 * scale))

    # 4 branches du volant
    bw = S * 0.036 * scale
    bl = S * 0.115 * scale
    for ang in (0, 90, 180, 270):
        rad = math.radians(ang)
        x0 = c + math.cos(rad) * (R1 - S * 0.005)
        y0 = c + math.sin(rad) * (R1 - S * 0.005)
        x1 = c + math.cos(rad) * (R1 + bl)
        y1 = c + math.sin(rad) * (R1 + bl)
        for t in (d, gd):
            t.line([x0, y0, x1, y1], fill=GOLD, width=int(bw))
            t.ellipse([x1 - bw/2, y1 - bw/2, x1 + bw/2, y1 + bw/2], fill=GOLD)

    # coeur rouge
    rr = S * 0.072 * scale
    for t in (d, gd):
        t.ellipse([c - rr, c - rr, c + rr, c + rr], fill=RED)

    glow = glow.filter(ImageFilter.GaussianBlur(S * 0.045))
    img = Image.blend(img, Image.new('RGB', (S, S), (0, 0, 0)), 0.0)
    img = Image.fromarray(
        __import__('numpy').clip(
            __import__('numpy').asarray(img).astype(int) +
            (__import__('numpy').asarray(glow).astype(int) * 0.85).astype(int), 0, 255
        ).astype('uint8'))

    return img.resize((size, size), Image.LANCZOS)

def rounded(img, radius_ratio=0.22):
    size = img.size[0]
    mask = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size * 4, size * 4],
                                           radius=int(size * 4 * radius_ratio), fill=255)
    mask = mask.resize((size, size), Image.LANCZOS)
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    out.paste(img, (0, 0), mask)
    return out

# any/normal : coins arrondis
for s, name in [(512, 'icon-512.png'), (192, 'icon-192.png'),
                (180, 'apple-touch-icon.png'), (64, 'favicon.png')]:
    im = base(s, inset=0.06)
    (rounded(im) if name != 'apple-touch-icon.png' else im.convert('RGBA')).save(os.path.join(OUT, name))

# maskable : marque plus petite, fond plein bord à bord
base(512, inset=0.26).convert('RGBA').save(os.path.join(OUT, 'icon-maskable-512.png'))
base(192, inset=0.26).convert('RGBA').save(os.path.join(OUT, 'icon-maskable-192.png'))

# visuel de partage (og)
og = Image.new('RGB', (1200, 630), BG2)
mark = base(430, inset=0.05)
og.paste(mark, (95, 100))
d = ImageDraw.Draw(og)
def font(sz, bold=True):
    for p in ['/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf',
              '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']:
        if os.path.exists(p):
            return ImageFont.truetype(p, sz)
    return ImageFont.load_default()
d.text((600, 240), 'LE', font=font(96), fill=(243, 246, 255))
d.text((600, 335), 'CASSE', font=font(96), fill=GOLD)
d.text((602, 455), 'Une seconde de trop peut tout ruiner.', font=font(30), fill=(140, 152, 180))
og.save(os.path.join(OUT, 'og.png'))
print('icônes générées')
