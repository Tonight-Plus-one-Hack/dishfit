"""Build the SVG and PNG exports from the mark and local typefaces."""

import argparse
from base64 import b64encode
from html import escape
from pathlib import Path
import xml.etree.ElementTree as ET

import cairosvg
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"
CANVAS = "#fcfcfd"
INK = "#1c2024"
NIGHT = "#111113"
LIGHT = "#edeef0"
NAMESPACE = "http://www.w3.org/2000/svg"


def mark_shapes():
    root = ET.parse(ROOT / "source/mark.svg").getroot()
    parts = []
    for child in root:
        tag = child.tag.removeprefix(f"{{{NAMESPACE}}}")
        attributes = " ".join(f'{key}="{escape(value)}"' for key, value in child.attrib.items())
        parts.append(f"<{tag} {attributes}/>")
    return parts


def word_path(text, family, weight, size, tracking=0):
    font = TTFont(ROOT / f"fonts/{family}.woff2")
    glyphs = font.getGlyphSet(location={"wght": weight})
    cmap = font.getBestCmap()
    scale = size / font["head"].unitsPerEm
    outlines = SVGPathPen(glyphs, ntos=lambda number: f"{number:.3f}".rstrip("0").rstrip(".") or "0")
    advance = 0
    for character in text:
        glyph = glyphs[cmap[ord(character)]]
        pen = TransformPen(outlines, (scale, 0, 0, -scale, advance, 0))
        glyph.draw(pen)
        advance += glyph.width * scale + tracking
    return outlines.getCommands(), advance - tracking


def svg(width, height, label, content):
    return (
        f'<svg xmlns="{NAMESPACE}" viewBox="0 0 {width} {height}" role="img" '
        f'aria-label="{escape(label)}">\n{content}\n</svg>\n'
    )


def write_export(name, content, png_width, png_height=None, raster_source=None):
    (ASSETS / f"{name}.svg").write_text(content)
    cairosvg.svg2png(
        bytestring=(raster_source or content).encode(),
        write_to=str(ASSETS / f"{name}.png"),
        output_width=png_width,
        output_height=png_height,
    )


def export_logos(name, mark):
    word, width = word_path(name, "geist", 550, 25, -0.9)
    lockup = f'{mark}\n  <path transform="translate(40 24)" d="{word}"/>'
    for filename, fill, label in (
        ("logo-primary", INK, "Primary"),
        ("logo-dark", NIGHT, "Dark"),
        ("logo-light", LIGHT, "Light"),
    ):
        content = svg(round(width + 43, 2), 32, f"{name} {label} logo", f'<g fill="{fill}">{lockup}</g>')
        write_export(filename, content, 960)
    write_export("symbol", svg(32, 32, f"{name} symbol", f'<g fill="{INK}">{mark}</g>'), 512)


def export_square(name, mark):
    for filename, label, background, foreground, size in (
        ("app-icon", "App icon", NIGHT, LIGHT, 1024),
        ("social-avatar", "Social avatar", "#8391f7", NIGHT, 512),
    ):
        artwork = (
            f'<rect width="1024" height="1024" fill="{background}"/>\n'
            f'<g transform="translate(257 257) scale(16)" fill="{foreground}">{mark}</g>'
        )
        write_export(filename, svg(1024, 1024, f"{name} {label}", artwork), size, size)


def export_story(name, mark):
    image = b64encode((ASSETS / "hero.webp").read_bytes()).decode()
    # CairoSVG lacks WebP support, so the SVG and PNG share the scene geometry
    # and use equivalent embedded encodings of the same original photograph.
    from io import BytesIO
    from PIL import Image

    image_png = BytesIO()
    with Image.open(ASSETS / "hero.webp") as source:
        source.save(image_png, format="PNG")
    raster_uri = "image/png;base64," + b64encode(image_png.getvalue()).decode()
    story_head = (
        f'<rect width="1080" height="1920" fill="{CANVAS}"/>'
        '<svg x="32" y="704" width="1016" height="860" viewBox="0 0 1016 860" overflow="hidden">'
        '<image width="1016" height="860" preserveAspectRatio="xMidYMid slice" '
        f'href="data:image/webp;base64,{image}"/></svg>'
        '<path d="M32 0v1920M1048 0v1920M0 300h1080M0 1676h1080" '
        'fill="none" stroke="#d9d9e0" stroke-width="2"/>'
        '<path d="M149 815h782v644H149z M149 792v46m-23-23h46m759-23v46m-23-23h46'
        'M149 1436v46m-23-23h46m759-23v46m-23-23h46" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width="2"/>'
        f'<g transform="translate(88 233) scale(1.55)" fill="{INK}">{mark}</g>'
    )
    text = [
        (name, "geist", 550, 41, -1.2, 155, 272),
        ("See you", "source-serif-4", 400, 116, -4, 84, 461),
        ("out tonight.", "source-serif-4", 400, 116, -4, 84, 588),
        ("Berlin  /  Saturday", "geist-mono", 500, 28, -0.4, 88, 660),
        ("Open the invite to join us", "geist-mono", 500, 25, -0.4, 88, 1636),
    ]
    families = {"geist": "Geist", "geist-mono": "Geist Mono", "source-serif-4": "Source Serif 4"}
    font_faces = []
    for key, family in families.items():
        woff = b64encode((ROOT / f"fonts/{key}.woff2").read_bytes()).decode()
        font_faces.append(f'@font-face{{font-family:"{family}";src:url(data:font/woff2;base64,{woff});font-weight:200 900}}')
    elements = []
    outlines = []
    for value, family, weight, size, tracking, x, y in text:
        elements.append(
            f'<text x="{x}" y="{y}" style="font-family:\'{families[family]}\';font-weight:{weight};'
            f'font-size:{size}px;letter-spacing:{tracking}px">{escape(value)}</text>'
        )
        path, _ = word_path(value, family, weight, size, tracking)
        outlines.append(f'<path transform="translate({x} {y})" d="{path}"/>')
    editable = story_head + "<style>" + "".join(font_faces) + "</style>" + f'<g fill="{INK}">' + "\n".join(elements) + "</g>"
    flattened = story_head.replace(f'href="data:image/webp;base64,{image}', f'xmlns:xlink="http://www.w3.org/1999/xlink" xlink:href="data:{raster_uri}')
    flattened += f'<g fill="{INK}">' + "\n".join(outlines) + "</g>"
    write_export("story-template", svg(1080, 1920, f"{name} story template", editable), 1080, 1920,
                 svg(1080, 1920, f"{name} story template", flattened))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", default="Plus One")
    name = parser.parse_args().name
    ASSETS.mkdir(exist_ok=True)
    mark = "\n  ".join(mark_shapes())
    export_logos(name, mark)
    export_square(name, mark)
    export_story(name, mark)


if __name__ == "__main__":
    main()
