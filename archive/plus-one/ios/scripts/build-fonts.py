"""Instantiate the brand's variable WOFF2 fonts (brand/fonts) into static TTFs for the iOS bundle.

iOS registers TTF/OTF through UIAppFonts; static instances keep weights and PostScript names deterministic.
Run from anywhere: python apps/ios/scripts/build-fonts.py (needs `pip install fonttools brotli`).
"""

from pathlib import Path

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = Path(__file__).resolve().parents[3]
SOURCE = ROOT / "brand" / "fonts"
TARGET = ROOT / "apps" / "ios" / "PlusOne" / "Resources" / "Fonts"

# (source file, family name, PostScript family prefix, [(weight, style name)])
FONTS = [
    ("geist.woff2", "Geist", "Geist", [(400, "Regular"), (500, "Medium"), (600, "SemiBold")]),
    ("geist-mono.woff2", "Geist Mono", "GeistMono", [(400, "Regular"), (500, "Medium")]),
    ("source-serif-4.woff2", "Source Serif 4", "SourceSerif4", [(400, "Regular"), (500, "Medium")]),
]


def set_names(font: TTFont, family: str, style: str, postscript: str) -> None:
    table = font["name"]
    full = f"{family} {style}"
    for record in list(table.names):
        if record.nameID in (1, 2, 3, 4, 6, 16, 17, 25):
            table.removeNames(nameID=record.nameID)
    for platform, encoding, language in ((3, 1, 0x409), (1, 0, 0)):
        table.setName(family if style in ("Regular",) else f"{family} {style}", 1, platform, encoding, language)
        table.setName("Regular", 2, platform, encoding, language)
        table.setName(f"{postscript};PlusOne", 3, platform, encoding, language)
        table.setName(full, 4, platform, encoding, language)
        table.setName(postscript, 6, platform, encoding, language)
        table.setName(family, 16, platform, encoding, language)
        table.setName(style, 17, platform, encoding, language)


def main() -> None:
    TARGET.mkdir(parents=True, exist_ok=True)
    for source, family, prefix, weights in FONTS:
        for weight, style in weights:
            font = TTFont(SOURCE / source)
            static = instancer.instantiateVariableFont(font, {"wght": weight})
            static.flavor = None
            postscript = f"{prefix}-{style}"
            set_names(static, family, style, postscript)
            static["OS/2"].usWeightClass = weight
            out = TARGET / f"{postscript}.ttf"
            static.save(out)
            print(f"wrote {out.relative_to(ROOT)}")
    for license_file in SOURCE.glob("OFL-*.txt"):
        (TARGET / license_file.name).write_text(license_file.read_text())


if __name__ == "__main__":
    main()
