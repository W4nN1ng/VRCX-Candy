"""Draw the VRCX-Candy icon set.

The mark is the upstream VRCX speech bubble with a C inside it where the X was. One
letter changed and nothing else, which is the whole idea: the bubble says this is the
same program, the letter says which build of it, and the two read as a family rather
than as two unrelated programs.

The C is built from two circles and a wedge rather than set in a font. Upstream's X is
a geometric construction, not a glyph, and a letter with a typeface's contrast and
serifs would have sat oddly next to it. Two circles and a wedge also means the icon
does not depend on a font being installed.

It is drawn heavy on purpose - the ring is a little under half the radius - because
that is the weight of the X it replaces, and because past about 64 pixels the thin
strokes of a lighter C fill in and it turns into a blob.

Everything is drawn oversized and scaled down, which is the other half of keeping the
small sizes clean. Run it from the repository root:

    uv run --with pillow python candy/make-icon.py
"""

import math
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
IMAGES = ROOT / 'images'

# Coordinates below are written against a 1024 box and scaled up from there.
DESIGN = 1024
SS = 2048

ICO_SIZES = [(16, 16), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)]

INK = (17, 17, 17, 255)
PAPER = (255, 255, 255, 255)

BUBBLE = (96, 92, 928, 664)
BUBBLE_RADIUS = 150
STROKE = 46
# Runs up into the bubble so the two shapes union into one silhouette; see below.
TAIL = ((548, 618), (872, 618), (812, 900))

# Sits where upstream puts the X: centred between the bubble's top and bottom edges,
# which is above the middle of the box because the tail takes the space down the right.
LETTER_CENTRE = (512, 368)
LETTER_RADIUS = 180
LETTER_RING = 82
# The opening, in degrees, centred on the right hand side of the circle.
LETTER_GAP = 56

# The badge on the notification icon, kept in the red the upstream notify icon uses.
# It is the one spot of colour in the set, and it is there because a badge means "you
# have a notification" rather than being part of the mark.
NOTIFY_DOT = (237, 28, 36, 255)
NOTIFY_DOT_BOX = (690, 56, 962, 328)

unit = SS / DESIGN


def box(rect):
    """ @rtype: list[float] """
    return [value * unit for value in rect]


def polygon(points):
    """ @rtype: list[tuple[float, float]] """
    return [(x * unit, y * unit) for x, y in points]


def dilate(mask, radius):
    """Grow a mask by `radius` in every direction.

    PIL will not stroke a polygon outwards - a wide outline is drawn inside the edge -
    so the silhouette is grown by stamping copies of itself around a circle and keeping
    the brightest pixels. The shape sits well clear of the canvas edge, so the
    wraparound that ImageChops.offset does cannot reach back into it.

    @type mask: Image.Image
    @type radius: int
    @rtype: Image.Image
    """
    grown = Image.new('L', mask.size, 0)
    steps = 48
    for i in range(steps):
        angle = 2 * math.pi * i / steps
        offset = (round(radius * math.cos(angle)), round(radius * math.sin(angle)))
        grown = ImageChops.lighter(grown, ImageChops.offset(mask, *offset))
    return grown


def bubble_layer():
    """The speech bubble: a thick black stroke around a white inside.

    The tail joins at the bottom right rather than hanging off it, so the outline runs
    round the whole silhouette as one line instead of drawing a seam across the join.
    That is what the single mask is for.

    @rtype: Image.Image
    """
    solid = Image.new('L', (SS, SS), 0)
    draw = ImageDraw.Draw(solid)
    draw.rounded_rectangle(box(BUBBLE), radius=round(BUBBLE_RADIUS * unit), fill=255)
    draw.polygon(polygon(TAIL), fill=255)

    layer = Image.new('RGBA', (SS, SS), (0, 0, 0, 0))
    stroke = Image.new('RGBA', (SS, SS), INK)
    stroke.putalpha(dilate(solid, round(STROKE * unit)))
    layer.alpha_composite(stroke)

    inside = Image.new('RGBA', (SS, SS), PAPER)
    inside.putalpha(solid)
    layer.alpha_composite(inside)
    return layer


def letter_c_mask():
    """A ring with a wedge opened on its right hand side.

    @rtype: Image.Image
    """
    mask = Image.new('L', (SS, SS), 0)
    draw = ImageDraw.Draw(mask)
    cx, cy = LETTER_CENTRE
    radius = LETTER_RADIUS
    inner = radius - LETTER_RING

    draw.ellipse(box((cx - radius, cy - radius, cx + radius, cy + radius)), fill=255)
    draw.ellipse(box((cx - inner, cy - inner, cx + inner, cy + inner)), fill=0)

    # PIL measures angles clockwise from three o'clock, which is where the opening
    # belongs, so the wedge is centred on zero. The box runs a little past the ring so
    # the cut reaches through it rather than leaving a sliver.
    draw.pieslice(
        box((cx - radius - 4, cy - radius - 4, cx + radius + 4, cy + radius + 4)),
        -LETTER_GAP / 2,
        LETTER_GAP / 2,
        fill=0,
    )
    return mask


def render(badge=False):
    """ @rtype: Image.Image """
    canvas = Image.new('RGBA', (SS, SS), (0, 0, 0, 0))
    canvas.alpha_composite(bubble_layer())

    ink = Image.new('RGBA', (SS, SS), INK)
    ink.putalpha(letter_c_mask())
    canvas.alpha_composite(ink)

    if badge:
        ImageDraw.Draw(canvas).ellipse(
            box(NOTIFY_DOT_BOX), fill=NOTIFY_DOT, outline=PAPER, width=round(26 * unit)
        )
    return canvas


def main():
    """ @rtype: None """
    IMAGES.mkdir(exist_ok=True)

    for name, badge in (('VRCX-Candy', False), ('VRCX-Candy_notify', True)):
        icon = render(badge).resize((512, 512), Image.LANCZOS)
        icon.save(IMAGES / f'{name}.png')
        icon.save(IMAGES / f'{name}.ico', sizes=ICO_SIZES)
        print(f'{name}.png and {name}.ico written')


if __name__ == '__main__':
    main()
