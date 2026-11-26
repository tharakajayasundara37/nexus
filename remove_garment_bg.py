"""
NEXUS Garment Background Remover & Master Hanger Compositor
Fast, robust background extraction for uploaded clothing items (shirts, trousers, hoodies, etc.).
Extracts garment cutouts from studio/e-commerce photos (white, off-white, grey backgrounds)
and mounts them onto official NEXUS 3D rail hangers with transparent background.
"""
from __future__ import annotations

import sys
import os
from collections import deque
from pathlib import Path
import numpy as np
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent
RAIL_ASSETS_DIR = (ROOT / 'public' / 'rail_assets') if (ROOT / 'public' / 'rail_assets').exists() else (ROOT / 'rail_assets')

def is_background_pixel(r: float, g: float, b: float, seed_rgb: tuple[float, float, float]) -> bool:
    # 1. Color distance to sampled corner/seed
    dr, dg, db = r - seed_rgb[0], g - seed_rgb[1], b - seed_rgb[2]
    dist = (dr * dr + dg * dg + db * db) ** 0.5
    if dist <= 42:
        return True
    
    # 2. Studio backdrops: High luma, low chroma
    luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
    chroma = max(r, g, b) - min(r, g, b)
    if luma >= 220 and chroma <= 28:
        return True
    if luma >= 240 and chroma <= 40:
        return True
    
    return False

def extract_garment_cutout(img_path: str | Path, category: str = 'shirts') -> Image.Image:
    im = Image.open(img_path).convert('RGBA')
    arr = np.asarray(im).copy()
    h, w = arr.shape[:2]
    
    # Check if already transparent (>15% border pixels transparent)
    border_alpha = np.concatenate([
        arr[0, :, 3], arr[-1, :, 3],
        arr[:, 0, 3], arr[:, -1, 3]
    ])
    if (border_alpha < 50).sum() / max(1, border_alpha.size) > 0.15:
        # Already transparent, just crop bounding box
        bbox = im.getbbox()
        return im.crop(bbox) if bbox else im
    
    rgb = arr[:, :, :3].astype(np.float32)
    
    # Sample 4 corners for backdrop seed
    corner_samples = [
        rgb[0, 0], rgb[0, -1],
        rgb[-1, 0], rgb[-1, -1]
    ]
    seed_rgb = tuple(float(v) for v in np.median(corner_samples, axis=0))
    
    visited = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    
    def try_push(x: int, y: int):
        if x < 0 or y < 0 or x >= w or y >= h or visited[y, x]:
            return
        r, g, b = rgb[y, x]
        if is_background_pixel(float(r), float(g), float(b), seed_rgb):
            visited[y, x] = True
            q.append((x, y))
            
    # Push all 4 outer borders
    for x in range(w):
        try_push(x, 0)
        try_push(x, h - 1)
    for y in range(h):
        try_push(0, y)
        try_push(w - 1, y)
        
    # For trousers, also push bottom center gap between legs
    if category == 'trousers':
        mid_x = w // 2
        span = max(10, int(w * 0.18))
        for x in range(mid_x - span, mid_x + span):
            for y in range(h - 1, int(h * 0.65), -1):
                try_push(x, y)
                
    # Run BFS flood-fill
    while q:
        x, y = q.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            try_push(nx, ny)
            
    # Set background alpha to 0
    arr[:, :, 3][visited] = 0
    
    # Soften alpha edges slightly
    out_im = Image.fromarray(arr)
    r, g, b, a = out_im.split()
    a_smooth = a.filter(ImageFilter.MedianFilter(3))
    out_im = Image.merge('RGBA', (r, g, b, a_smooth))
    
    # Bounding box
    bbox = out_im.getbbox()
    if bbox:
        out_im = out_im.crop(bbox)
        
    # If the garment photo included an old hanger/clips at the very top (e.g. top 10%), trim it
    if category == 'trousers':
        cropped_arr = np.asarray(out_im)
        ch, cw = cropped_arr.shape[:2]
        # Look for dark pants waistband start in top 20%
        waist_y = 0
        for y in range(int(ch * 0.22)):
            row = cropped_arr[y]
            opaque = row[:, 3] > 100
            if opaque.any():
                luma = 0.2126 * row[opaque, 0] + 0.7152 * row[opaque, 1] + 0.0722 * row[opaque, 2]
                # If row is mostly dark garment (<85 luma) or has high coverage
                if (luma < 85).sum() > cw * 0.35:
                    waist_y = y
                    break
        if waist_y > 10:
            out_im = out_im.crop((0, waist_y, cw, ch))
            
    return out_im

def composite_on_master_hanger(garment_im: Image.Image, category: str = 'shirts') -> Image.Image:
    canvas_w = 600
    canvas_h = 840
    canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    
    if category == 'trousers':
        hanger_path = RAIL_ASSETS_DIR / 'master_trouser_hanger_official.png'
        max_w = 420
        max_h = 660
        py = 168
    else:
        hanger_path = RAIL_ASSETS_DIR / 'master_front_hanger_official.png'
        max_w = 540
        max_h = 690
        py = 95

    hanger = Image.open(hanger_path).convert('RGBA')
    
    gw, gh = garment_im.size
    scale = min(max_w / gw, max_h / gh)
    nw, nh = max(1, int(gw * scale)), max(1, int(gh * scale))
    scaled_garment = garment_im.resize((nw, nh), Image.Resampling.LANCZOS)
    
    px = (canvas_w - nw) // 2
    
    # Paste garment
    canvas.paste(scaled_garment, (px, py), scaled_garment)
    
    # Paste master hanger on top
    hw, hh = hanger.size
    hx = (canvas_w - hw) // 2
    hy = 5
    canvas.paste(hanger, (hx, hy), hanger)
    
    return canvas

def composite_on_side_hanger(garment_im: Image.Image, category: str = 'shirts') -> Image.Image:
    gw, gh = garment_im.size
    if category == 'trousers':
        hanger_path = RAIL_ASSETS_DIR / 'master_trouser_side_hanger_official.png'
        if not hanger_path.exists():
            hanger_path = RAIL_ASSETS_DIR / 'master_side_hanger_official.png'
        hanger = Image.open(hanger_path).convert('RGBA')
        hw, hh = hanger.size
        
        max_w = 75
        max_h = 315
        scale = min(max_w / gw, max_h / gh)
        nw, nh = max(1, int(gw * scale)), max(1, int(gh * scale))
        scaled_garment = garment_im.resize((nw, nh), Image.Resampling.LANCZOS)
        
        canvas_w = max(60, nw + 8)
        canvas_h = 360
        canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
        
        px = (canvas_w - nw) // 2
        py = 42
        canvas.paste(scaled_garment, (px, py), scaled_garment)
        
        hx = (canvas_w - hw) // 2
        hy = 0
        canvas.paste(hanger, (hx, hy), hanger)
        return canvas
    else:
        hanger_path = RAIL_ASSETS_DIR / 'master_side_hanger_official.png'
        hanger = Image.open(hanger_path).convert('RGBA')
        hw, hh = hanger.size
        
        canvas_w = 260
        canvas_h = 840
        canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
        
        max_w = 240
        max_h = 690
        scale = min(max_w / gw, max_h / gh)
        nw, nh = max(1, int(gw * scale)), max(1, int(gh * scale))
        scaled_garment = garment_im.resize((nw, nh), Image.Resampling.LANCZOS)
        
        px = (canvas_w - nw) // 2
        py = 95
        canvas.paste(scaled_garment, (px, py), scaled_garment)
        
        hx = (canvas_w - hw) // 2
        hy = 5
        canvas.paste(hanger, (hx, hy), hanger)
        return canvas

def process_file_cli(input_path: str, output_path: str | None = None, category: str = 'shirts', view_type: str = 'front') -> str:
    inp = Path(input_path)
    if not inp.exists():
        raise FileNotFoundError(f"Input image not found: {input_path}")
        
    if not output_path:
        out_name = f"{inp.stem}_cutout.png"
        output_path = str(inp.parent / out_name)
        
    garment = extract_garment_cutout(inp, category=category)
    if view_type == 'side':
        composited = composite_on_side_hanger(garment, category=category)
    else:
        composited = composite_on_master_hanger(garment, category=category)
    composited.save(output_path, 'PNG', optimize=True)
    return output_path

if __name__ == '__main__':
    if len(sys.argv) < 2:
        print("Usage: py remove_garment_bg.py <input_img> [output_img] [category] [view_type]")
        sys.exit(1)
        
    in_file = sys.argv[1]
    out_file = sys.argv[2] if len(sys.argv) > 2 else None
    cat = sys.argv[3] if len(sys.argv) > 3 else 'trousers'
    view = sys.argv[4] if len(sys.argv) > 4 else 'front'
    
    result = process_file_cli(in_file, out_file, category=cat, view_type=view)
    print(f"SUCCESS:{result}")
