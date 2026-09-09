"""Master app icon for focusbrew — coffee mug + code glyph, matching the
tray icon palette (blue brand bg, tan coffee, white glyph in Consolas
Bold, same family as the </> tray icon).

Regenerate the platform icon set after editing this:
    python scripts/gen_app_icon.py
    npx tauri icon scripts/app-icon-source.png
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

OUT = Path(__file__).resolve().parent / "app-icon-source.png"

SIZE = 1024
BG = (59, 130, 246, 255)      # #3B82F6 — same blue as the widget's default ring
MUG = (255, 255, 255, 255)
COFFEE = (196, 150, 105, 255)  # exact tray "coffee" brown

img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
d = ImageDraw.Draw(img)

# Rounded-square backdrop (Fluent-ish ~22% corner radius)
radius = int(SIZE * 0.22)
d.rounded_rectangle([0, 0, SIZE, SIZE], radius=radius, fill=BG)

# --- Mug (big, dominant) ---
mug_left, mug_right = 250, 730
mug_top, mug_bottom = 400, 800
body_radius = 34
d.rounded_rectangle(
    [mug_left, mug_top, mug_right, mug_bottom],
    radius=body_radius,
    fill=MUG,
)
# Coffee surface (ellipse at the rim)
rim_pad = 22
d.ellipse(
    [mug_left + rim_pad, mug_top - 22, mug_right - rim_pad, mug_top + 42],
    fill=COFFEE,
)
d.ellipse(
    [mug_left + rim_pad, mug_top - 22, mug_right - rim_pad, mug_top + 42],
    outline=MUG,
    width=12,
)
# Two small steam wisps
for sx in (mug_left + 130, mug_right - 150):
    d.arc([sx, mug_top - 110, sx + 60, mug_top - 30], start=200, end=430, fill=MUG, width=16)
# Handle — thick ring on the right
handle_w = 170
d.ellipse(
    [mug_right - 30, mug_top + 60, mug_right - 30 + handle_w, mug_top + 60 + 220],
    outline=MUG,
    width=52,
)
# Little base foot line for grounding
d.rounded_rectangle(
    [mug_left + 14, mug_bottom - 8, mug_right - 14, mug_bottom + 24],
    radius=16,
    fill=MUG,
)

# --- Code glyph "</>" printed on the mug body, like a logo ---
font = ImageFont.truetype("C:/Windows/Fonts/consolab.ttf", 190)
text = "</>"
bbox = d.textbbox((0, 0), text, font=font)
tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
mug_center_x = (mug_left + mug_right) / 2
mug_body_center_y = (mug_top + 60 + mug_bottom) / 2
tx = mug_center_x - tw / 2 - bbox[0]
ty = mug_body_center_y - th / 2 - bbox[1]
d.text((tx, ty), text, font=font, fill=BG)

img.save(OUT)
print(f"saved {OUT}")
