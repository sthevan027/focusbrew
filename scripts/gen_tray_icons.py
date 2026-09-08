"""Generates the tray-state icons for focusbrew.

Simple flat colored circles are enough to tell states apart at a glance in
the taskbar; swap these for real artwork later without touching any Rust
code (files keep the same names).
"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "src-tauri" / "icons" / "tray"
OUT.mkdir(parents=True, exist_ok=True)

SIZE = 64
STATES = {
    "idle": (120, 120, 128, 255),      # gray — nothing detected
    "working": (46, 160, 67, 255),      # green — AI/editor detected
    "focus": (216, 66, 66, 255),        # red — focus mode locked in
    "coffee": (139, 94, 60, 255),       # brown — coffee break
}


def draw_circle(color):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    pad = 4
    d.ellipse([pad, pad, SIZE - pad, SIZE - pad], fill=color)
    return img


def draw_cup(color):
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.ellipse([4, 4, SIZE - 4, SIZE - 4], fill=(60, 40, 25, 255))
    d.rectangle([16, 22, 44, 46], fill=color)
    d.ellipse([44, 26, 54, 40], outline=color, width=4)
    return img


for name, color in STATES.items():
    img = draw_cup(color) if name == "coffee" else draw_circle(color)
    img.save(OUT / f"{name}.png")

print(f"wrote {len(STATES)} icons to {OUT}")
