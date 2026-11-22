"""Render the portrait Plus One logo reveal. Requires FFmpeg and Pillow."""

from io import BytesIO
from pathlib import Path
import subprocess

import cairosvg
from PIL import Image, ImageDraw, ImageOps

import export_assets as export
ASSETS = Path(__file__).resolve().parents[1] / "assets"
WIDTH, HEIGHT = 1080, 1440
FPS, DURATION = 30, 4.2
BLUE = "#242854"
CANVAS = "#fcfcfd"


def ease(time, start, duration):
    position = max(0, min(1, (time - start) / duration))
    return position * position * (3 - 2 * position)


def layer(svg, size):
    png = cairosvg.svg2png(bytestring=svg.encode(), output_width=size)
    return Image.open(BytesIO(png)).convert("RGBA")


def paste_center(frame, image, x, y, alpha=1):
    if alpha == 0:
        return
    if alpha < 1:
        image = image.copy()
        image.putalpha(image.getchannel("A").point(lambda value: round(value * alpha)))
    frame.alpha_composite(image, (round(x - image.width / 2), round(y - image.height / 2)))


def cut_artwork(frame, artwork, time):
    leave = ease(time, 1.0, .74)
    if leave == 1:
        return
    offset = round(420 * leave)
    panels = [
        ((64, 0, 580, 410), "#a8a0ec", .58, -offset),
        ((580, 0, 1016, 520), "#94a8f1", .44, offset),
        ((64, 920, 421, HEIGHT), "#6473dc", .62, -offset),
        ((421, 1072, 1016, HEIGHT), "#a79bdf", .42, offset),
    ]
    for bounds, tint, strength, shift in panels:
        crop = artwork.crop(bounds)
        crop = Image.blend(crop, Image.new("RGB", crop.size, tint), strength * (1 - leave))
        crop = crop.convert("RGBA")
        crop.putalpha(round(255 * (1 - leave)))
        frame.alpha_composite(crop, (bounds[0], bounds[1] + shift))


def build_frame(time, artwork, parts, lockup):
    fade_to_canvas = ease(time, 2.16, .74)
    frame = Image.blend(artwork, Image.new("RGB", artwork.size, CANVAS), fade_to_canvas).convert("RGBA")
    cut_artwork(frame, artwork, time)
    draw = ImageDraw.Draw(frame, "RGBA")
    drift = (1 - ease(time, .06, 1.66)) * 54
    draw.line((64, 0, 64, HEIGHT), fill="#b1b5d2", width=1)
    draw.line((WIDTH - 64, 0, WIDTH - 64, HEIGHT), fill="#b1b5d2", width=1)
    for inset, delay in [(0, .01), (34, .11), (68, .2)]:
        phase = ease(time, delay, .86)
        visible = phase * (1 - ease(time, 1.74, .75))
        if visible > 0:
            edge = 368 + drift - inset
            stroke = tuple(round(channel * visible + ambient * (1 - visible))
                           for channel, ambient in zip((225, 229, 253), (103, 116, 200)))
            draw.rounded_rectangle(
                (WIDTH / 2 - edge, 685 - edge, WIDTH / 2 + edge, 685 + edge),
                radius=86 - inset / 2, outline=stroke, width=2,
            )
    for index, part in enumerate(parts):
        approach = ease(time, .23 + index * .105, .76)
        move_off = ease(time, 2.0, .64)
        scale = 1 + (1 - approach) * .15 - move_off * .12
        icon = part.resize((round(part.width * scale), round(part.height * scale)), Image.Resampling.LANCZOS)
        x, y = [(-54, -90), (-96, 20), (25, 83), (120, -25)][index]
        paste_center(frame, icon, WIDTH / 2 + x * (1 - approach), 685 + y * (1 - approach),
                     approach * (1 - move_off))
    reveal = ease(time, 2.4, .58)
    paste_center(frame, lockup, WIDTH / 2, 685 + 24 * (1 - reveal), reveal)
    return frame.convert("RGB")


def main():
    artwork = ImageOps.fit(Image.open(ASSETS / "hero.webp").convert("RGB"), (WIDTH, HEIGHT))
    artwork = Image.blend(artwork, Image.new("RGB", artwork.size, BLUE), .39)
    parts = [layer(export.svg(32, 32, "Mark piece", f'<g fill="{CANVAS}">{part}</g>'), 262)
             for part in export.mark_shapes()]
    lockup = layer((ASSETS / "logo-primary.svg").read_text(), 436)
    command = [
        "ffmpeg", "-y", "-hide_banner", "-loglevel", "error", "-f", "rawvideo",
        "-pixel_format", "rgb24", "-video_size", f"{WIDTH}x{HEIGHT}", "-framerate", str(FPS),
        "-i", "pipe:0", "-c:v", "libx264", "-crf", "18", "-pix_fmt", "yuv420p",
        "-movflags", "+faststart", str(ASSETS / "logo-reveal.mp4"),
    ]
    with subprocess.Popen(command, stdin=subprocess.PIPE) as encoder:
        for index in range(round(DURATION * FPS)):
            encoder.stdin.write(build_frame(index / FPS, artwork, parts, lockup).tobytes())
        encoder.stdin.close()
        if encoder.wait():
            raise SystemExit("FFmpeg failed to encode the logo film")
    build_frame(3.8, artwork, parts, lockup).save(ASSETS / "logo-reveal-poster.webp", quality=90)


if __name__ == "__main__":
    main()
