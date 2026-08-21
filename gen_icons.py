"""One-off icon generator (not part of the served app).

Run via an ephemeral dependency so this static-site repo never needs its own
Python packaging/venv:

    uv run --with pillow python gen_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

OUT_DIR = Path(__file__).parent / "icons"
BG = (37, 99, 235)  # matches manifest theme_color family
FG = (255, 255, 255)


def make_icon(size: int, path: Path, maskable: bool = False) -> None:
    img = Image.new("RGB", (size, size), BG)
    draw = ImageDraw.Draw(img)

    # rounded square background
    radius = size // 6
    draw.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=BG)

    text = "SQL"
    font_size = size // 3
    try:
        font = ImageFont.truetype("arialbd.ttf", font_size)
    except OSError:
        font = ImageFont.load_default()

    bbox = draw.textbbox((0, 0), text, font=font)
    w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
    # maskable icons need safe-zone padding (~10%) since Android may crop circular
    y_offset = -bbox[1] - (h // 10 if not maskable else 0)
    draw.text(((size - w) / 2, (size - h) / 2 + y_offset), text, fill=FG, font=font)

    img.save(path)
    print(f"wrote {path}")


def main() -> None:
    OUT_DIR.mkdir(exist_ok=True)
    make_icon(192, OUT_DIR / "icon-192.png")
    make_icon(512, OUT_DIR / "icon-512.png", maskable=True)


if __name__ == "__main__":
    main()
