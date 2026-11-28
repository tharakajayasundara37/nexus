"""
NEXUS Garment Background Remover & Master Hanger Compositor
Extracts garment cutouts from studio/e-commerce photos (light, grey, white, or dark studio backdrops)
and mounts them cleanly onto the official NEXUS 3D rail hangers with proportional waistband-fitted clips.
"""
from __future__ import annotations

import sys
from collections import deque
from pathlib import Path
import numpy as np
import cv2
from PIL import Image, ImageFilter

ROOT = Path(__file__).resolve().parent
RAIL_ASSETS_DIR = (ROOT / 'public' / 'rail_assets') if (ROOT / 'public' / 'rail_assets').exists() else (ROOT / 'rail_assets')


def has_top_hook(im: Image.Image) -> bool:
    """Detect whether an RGBA garment cutout already includes a hanger hook at the very top."""
    arr = np.asarray(im)
    h, w = arr.shape[:2]
    if w < 10 or h < 40:
        return False

    alpha = arr[:, :, 3] > 40
    top_rows = max(5, int(h * 0.08))
    opaque_counts = alpha[:top_rows].sum(axis=1)
    avg_top_opaque = float(opaque_counts.mean())

    top_spans = []
    for y in range(top_rows):
        xs = np.where(alpha[y])[0]
        top_spans.append(int(xs[-1] - xs[0] + 1) if len(xs) else 0)
    avg_top_span = float(np.mean(top_spans))

    body_start = int(h * 0.25)
    body_end = max(body_start + 2, int(h * 0.65))
    body_max_span = 0
    for y in range(body_start, body_end, 2):
        xs = np.where(alpha[y])[0]
        if len(xs):
            span = int(xs[-1] - xs[0] + 1)
            if span > body_max_span:
                body_max_span = span

    return avg_top_opaque < max(16.0, w * 0.22) and (w < 120 or avg_top_span < body_max_span * 0.48)


def _strip_old_trouser_hanger(out_im: Image.Image) -> Image.Image:
    """
    If an uploaded solid-background trouser photo included its own store hanger at the top,
    locate where the continuous solid trouser waistband begins and crop above it.
    """
    arr = np.asarray(out_im)
    ch, cw = arr.shape[:2]
    if ch < 80 or cw < 40:
        return out_im

    alpha = arr[:, :, 3] > 60
    scan_limit = int(ch * 0.32)

    # First check if top 12% has a narrow hook (evidence of an attached hanger)
    top_rows = max(5, int(ch * 0.08))
    avg_top_opaque = float(alpha[:top_rows].sum(axis=1).mean())
    if avg_top_opaque >= max(18.0, cw * 0.28):
        return out_im

    # Find widest span in upper-mid body (waistband/hips reference)
    ref_spans = []
    for y in range(int(ch * 0.25), int(ch * 0.45), 2):
        xs = np.where(alpha[y])[0]
        if len(xs):
            ref_spans.append(int(xs[-1] - xs[0] + 1))
    ref_width = float(np.median(ref_spans)) if ref_spans else float(cw * 0.7)

    # Waistband starts at the first row where >= 8 consecutive rows have a wide (>52% ref_width)
    # AND dense (>82% fill across the span's center 70%) garment cross-section.
    consecutive = 0
    waist_y = 0
    for y in range(top_rows, scan_limit):
        xs = np.where(alpha[y])[0]
        if len(xs) >= max(20, int(ref_width * 0.50)):
            x1, x2 = int(xs[0]), int(xs[-1])
            span = x2 - x1 + 1
            pad = max(2, int(span * 0.15))
            mid_slice = alpha[y, x1 + pad : max(x1 + pad + 1, x2 - pad + 1)]
            fill_ratio = float(mid_slice.mean()) if mid_slice.size else 0.0
            if span >= ref_width * 0.52 and fill_ratio >= 0.82:
                consecutive += 1
                if consecutive >= 8:
                    waist_y = max(0, y - 7)
                    break
            else:
                consecutive = 0
        else:
            consecutive = 0

    if waist_y > 10:
        cropped = out_im.crop((0, waist_y, cw, ch))
        bbox = cropped.getbbox()
        return cropped.crop(bbox) if bbox else cropped
    return out_im


def extract_garment_cutout(
    img_path: str | Path,
    category: str = 'shirts',
    preserve_existing_hanger: bool = False,
) -> tuple[Image.Image, bool]:
    """
    Remove studio/e-commerce background and return (cutout_rgba, already_had_hanger).
    Supports both uniform light backdrops and dark/gradient studio backdrops.
    """
    im = Image.open(img_path).convert('RGBA')
    arr = np.asarray(im).copy()
    h, w = arr.shape[:2]

    # 1. Check if already transparent (>15% border pixels transparent)
    border_alpha = np.concatenate([
        arr[0, :, 3], arr[-1, :, 3],
        arr[:, 0, 3], arr[:, -1, 3]
    ])
    if (border_alpha < 50).sum() / max(1, border_alpha.size) > 0.15:
        bbox = im.getbbox()
        trimmed = im.crop(bbox) if bbox else im
        return trimmed, has_top_hook(trimmed)

    rgb = arr[:, :, :3]
    # Sample 6px border strips around all 4 edges
    pad = max(2, min(8, min(h, w) // 40))
    border_pixels = np.concatenate([
        rgb[:pad, :, :].reshape(-1, 3),
        rgb[-pad:, :, :].reshape(-1, 3),
        rgb[:, :pad, :].reshape(-1, 3),
        rgb[:, -pad:, :].reshape(-1, 3),
    ], axis=0).astype(np.float32)

    seed_rgb = np.median(border_pixels, axis=0)
    border_std = float(np.mean(np.std(border_pixels, axis=0)))
    border_luma = float(0.2126 * seed_rgb[0] + 0.7152 * seed_rgb[1] + 0.0722 * seed_rgb[2])

    is_uniform_light = (border_luma >= 185.0 and border_std <= 22.0)

    if is_uniform_light:
        # Fast exact BFS flood-fill for white/off-white/light-grey studio backgrounds
        rgb_f = rgb.astype(np.float32)
        sr, sg, sb = float(seed_rgb[0]), float(seed_rgb[1]), float(seed_rgb[2])
        dist = np.sqrt(
            (rgb_f[:, :, 0] - sr) ** 2 +
            (rgb_f[:, :, 1] - sg) ** 2 +
            (rgb_f[:, :, 2] - sb) ** 2
        )
        luma = 0.2126 * rgb_f[:, :, 0] + 0.7152 * rgb_f[:, :, 1] + 0.0722 * rgb_f[:, :, 2]
        chroma = np.max(rgb_f, axis=2) - np.min(rgb_f, axis=2)
        bg_candidate = (dist <= 38.0) | ((luma >= 225.0) & (chroma <= 26.0)) | ((luma >= 240.0) & (chroma <= 38.0))

        visited = np.zeros((h, w), dtype=bool)
        q: deque[tuple[int, int]] = deque()

        def try_push(x: int, y: int):
            if 0 <= x < w and 0 <= y < h and not visited[y, x] and bg_candidate[y, x]:
                visited[y, x] = True
                q.append((x, y))

        for x in range(w):
            try_push(x, 0)
            try_push(x, h - 1)
        for y in range(h):
            try_push(0, y)
            try_push(w - 1, y)

        if category == 'trousers':
            mid_x = w // 2
            span = max(10, int(w * 0.18))
            for x in range(max(0, mid_x - span), min(w, mid_x + span)):
                for y in range(h - 1, int(h * 0.65), -1):
                    try_push(x, y)

        while q:
            cx, cy = q.popleft()
            if cx > 0:
                try_push(cx - 1, cy)
            if cx + 1 < w:
                try_push(cx + 1, cy)
            if cy > 0:
                try_push(cx, cy - 1)
            if cy + 1 < h:
                try_push(cx, cy + 1)

        alpha_mask = np.where(visited, 0, 255).astype(np.uint8)
    else:
        # Dark or gradient studio backdrop (e.g. charcoal/slate studio wall & floor):
        # Run cv2.grabCut on resized frame guided by outer border background seeds & high-contrast foreground hints.
        max_dim = 560
        scale = min(1.0, max_dim / max(h, w))
        sw, sh = max(32, int(w * scale)), max(32, int(h * scale))
        bgr_small = cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR)
        if scale < 1.0:
            bgr_small = cv2.resize(bgr_small, (sw, sh), interpolation=cv2.INTER_AREA)

        lab_small = cv2.cvtColor(bgr_small, cv2.COLOR_BGR2LAB).astype(np.float32)
        side_w = max(4, int(sw * 0.05))
        # Per-row backdrop prototype from left + right edges at the exact height y (with vertical smoothing)
        row_bg_samples = np.concatenate([lab_small[:, :side_w, :], lab_small[:, -side_w:, :]], axis=1)
        bg_row_lab = np.median(row_bg_samples, axis=1)  # (sh, 3)
        bg_row_lab = cv2.GaussianBlur(bg_row_lab[:, None, :], (1, 15), 0)  # (sh, 1, 3)
        dist_lab = np.linalg.norm(lab_small - bg_row_lab, axis=2)

        gc_mask = np.full((sh, sw), cv2.GC_PR_BGD, dtype=np.uint8)
        m_w = max(4, int(sw * 0.08))
        m_h = max(3, int(sh * 0.025))
        gc_mask[:m_h, :] = cv2.GC_BGD
        gc_mask[-m_h:, :] = cv2.GC_BGD
        gc_mask[:, :m_w] = cv2.GC_BGD
        gc_mask[:, -m_w:] = cv2.GC_BGD
        # Soft backdrop hint everywhere else so GrabCut separates dark garment creases from dark floor shadows
        gc_mask[dist_lab < 8.5] = cv2.GC_PR_BGD

        # Foreground hints only inside inner frame where pixel differs from same-row backdrop
        inner = np.zeros((sh, sw), dtype=bool)
        inner[m_h : sh - m_h, m_w : sw - m_w] = True
        gc_mask[inner & (dist_lab > 12.5)] = cv2.GC_PR_FGD
        gc_mask[inner & (dist_lab > 20.0)] = cv2.GC_FGD

        bgd_model = np.zeros((1, 65), np.float64)
        fgd_model = np.zeros((1, 65), np.float64)
        try:
            cv2.grabCut(bgr_small, gc_mask, None, bgd_model, fgd_model, 5, cv2.GC_INIT_WITH_MASK)
        except Exception:
            pass

        fg_small = np.where((gc_mask == cv2.GC_FGD) | (gc_mask == cv2.GC_PR_FGD), 255, 0).astype(np.uint8)
        # Close small interior crease holes and remove thin horizontal floor shadows protruding past garment body
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        fg_small = cv2.morphologyEx(fg_small, cv2.MORPH_CLOSE, kernel)
        # Strip pure low-chroma floor shadow extensions in bottom 12%
        mid_band = fg_small[int(sh * 0.58) : int(sh * 0.85), :]
        m_xs = np.where(mid_band > 0)[1]
        if len(m_xs):
            bx1 = max(0, int(m_xs.min()) - 4)
            bx2 = min(sw, int(m_xs.max()) + 4)
            bot_y = int(sh * 0.88)
            fg_small[bot_y:, :bx1] = 0
            fg_small[bot_y:, bx2:] = 0
        # Keep only the main garment component(s) touching high-confidence core
        num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(fg_small, connectivity=8)
        if num_labels > 1:
            areas = stats[1:, cv2.CC_STAT_AREA]
            max_area = int(areas.max()) if len(areas) else 0
            cleaned = np.zeros_like(fg_small)
            for lbl in range(1, num_labels):
                if stats[lbl, cv2.CC_STAT_AREA] >= max(60, int(max_area * 0.05)):
                    cleaned[labels == lbl] = 255
            fg_small = cleaned

        if scale < 1.0:
            alpha_mask = cv2.resize(fg_small, (w, h), interpolation=cv2.INTER_LINEAR)
            alpha_mask = np.where(alpha_mask >= 120, 255, 0).astype(np.uint8)
        else:
            alpha_mask = fg_small

    # Smooth edge feather slightly & clip bounding box
    arr[:, :, 3] = alpha_mask
    out_im = Image.fromarray(arr)
    r, g, b, a = out_im.split()
    a_smooth = a.filter(ImageFilter.MedianFilter(3))
    out_im = Image.merge('RGBA', (r, g, b, a_smooth))

    bbox = out_im.getbbox()
    if bbox:
        out_im = out_im.crop(bbox)

    if not preserve_existing_hanger:
        if category == 'trousers':
            out_im = _strip_old_trouser_hanger(out_im)
            return out_im, False
        elif category == 'shirts':
            # If an uploaded flat/studio shirt photo already has an old hanger sticking up above its collar,
            # crop the narrow upper hook/arch down to where the garment's real collar/shoulders begin.
            arr_s = np.asarray(out_im)
            ch_s, cw_s = arr_s.shape[:2]
            if ch_s >= 80 and cw_s >= 40:
                a_s = arr_s[:, :, 3] > 50
                top_r = max(4, int(ch_s * 0.07))
                if float(a_s[:top_r].sum(axis=1).mean()) < max(16.0, cw_s * 0.14):
                    for y_s in range(top_r, int(ch_s * 0.25)):
                        if int(a_s[y_s].sum()) > int(cw_s * 0.25):
                            cropped_s = out_im.crop((0, max(0, y_s - 4), cw_s, ch_s))
                            bbox_s = cropped_s.getbbox()
                            out_im = cropped_s.crop(bbox_s) if bbox_s else cropped_s
                            break
            return out_im, False

    return out_im, has_top_hook(out_im)


def _draw_sleek_trouser_clamp_hanger(
    canvas: Image.Image,
    wx1: int,
    wx2: int,
    waist_y: int,
    canvas_w: int,
) -> None:
    """
    Composite the sleek Image-2 (3_cut.png) wooden clamp hanger fitted to the exact trouser waistband:
    - Hook centered cleanly above waist center (x = waist_cx)
    - Wooden clamp bar sized to the waistband width (no wide protruding black wings)
    - Silver clips positioned directly on the left & right corners of the trouser waistband
    """
    hanger_path = RAIL_ASSETS_DIR / 'master_trouser_hanger_official.png'
    hanger = Image.open(hanger_path).convert('RGBA')

    # Exact component slices from master_trouser_hanger_official.png (600x300)
    hook_part = hanger.crop((228, 0, 361, 194))     # 133x194, neck center at x_rel=81
    wood_part = hanger.crop((142, 192, 481, 240))   # 339x48
    lclip_part = hanger.crop((42, 188, 86, 298))    # 44x110
    rclip_part = hanger.crop((534, 188, 576, 298))  # 42x110
    dark_rail_seg = hanger.crop((100, 208, 136, 232))  # 36x24 connector rod

    waist_w = max(120, wx2 - wx1 + 1)
    waist_cx = (wx1 + wx2) // 2

    # 1. Scale hook so its bottom neck reaches waist bar cleanly (hook height ~ waist_y - 12)
    target_hook_h = max(62, min(92, waist_y - 6))
    hook_scale = target_hook_h / hook_part.height
    target_hook_w = max(20, int(round(hook_part.width * hook_scale)))
    hook_resized = hook_part.resize((target_hook_w, target_hook_h), Image.Resampling.LANCZOS)
    hook_neck_x = int(round(81 * hook_scale))
    hx = waist_cx - hook_neck_x
    hy = max(2, waist_y - target_hook_h - 8)

    # 2. Scale silver clips to grip left & right waistband corners
    clip_scale = max(0.36, min(0.50, waist_w / 520.0))
    lc_w = max(12, int(round(lclip_part.width * clip_scale)))
    lc_h = max(28, int(round(lclip_part.height * clip_scale)))
    rc_w = max(12, int(round(rclip_part.width * clip_scale)))
    rc_h = max(28, int(round(rclip_part.height * clip_scale)))
    lclip_resized = lclip_part.resize((lc_w, lc_h), Image.Resampling.LANCZOS)
    rclip_resized = rclip_part.resize((rc_w, rc_h), Image.Resampling.LANCZOS)

    # Position clips right over the left & right waistband edges
    lc_x = max(2, wx1 + int(lc_w * 0.15))
    rc_x = min(canvas_w - rc_w - 2, wx2 - int(rc_w * 1.15))
    if rc_x <= lc_x + lc_w + 40:
        lc_x = max(2, waist_cx - waist_w // 2)
        rc_x = min(canvas_w - rc_w - 2, waist_cx + waist_w // 2 - rc_w)

    wood_h = max(16, int(round(wood_part.height * max(0.38, clip_scale * 0.92))))
    wood_y = max(hy + target_hook_h - 4, waist_y - int(wood_h * 0.85))
    clip_y = wood_y - int(lc_h * 0.05)

    # 3. Connect clips smoothly via subtle steel/dark shoulder strip + central wooden bar (NO outer protruding wings)
    inner_span = max(40, (rc_x + rc_w // 2) - (lc_x + lc_w // 2))
    rod_w = max(20, inner_span)
    rod_h = max(8, int(wood_h * 0.56))
    rod_resized = dark_rail_seg.resize((rod_w, rod_h), Image.Resampling.LANCZOS)
    rod_x = lc_x + lc_w // 2
    rod_y = wood_y + (wood_h - rod_h) // 2

    wood_w = max(60, int(inner_span * 0.82))
    wood_resized = wood_part.resize((wood_w, wood_h), Image.Resampling.LANCZOS)
    wood_x = waist_cx - wood_w // 2

    # Composite layers cleanly: rod -> wood bar -> hook -> clips gripping waistband on top
    canvas.paste(rod_resized, (rod_x, rod_y), rod_resized)
    canvas.paste(wood_resized, (wood_x, wood_y), wood_resized)
    canvas.paste(hook_resized, (hx, hy), hook_resized)
    canvas.paste(lclip_resized, (lc_x, clip_y), lclip_resized)
    canvas.paste(rclip_resized, (rc_x, clip_y), rclip_resized)


def composite_on_master_hanger(
    garment_im: Image.Image,
    category: str = 'shirts',
    already_has_hook: bool = False,
) -> Image.Image:
    canvas_w = 600
    canvas_h = 840
    canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))

    gw, gh = garment_im.size
    if already_has_hook:
        # Preserve an already-hangered transparent cutout cleanly at full scale without adding a 2nd hanger
        scale = min((canvas_w - 20) / gw, (canvas_h - 16) / gh)
        nw, nh = max(1, int(round(gw * scale))), max(1, int(round(gh * scale)))
        scaled = garment_im.resize((nw, nh), Image.Resampling.LANCZOS)
        px = (canvas_w - nw) // 2
        py = 6
        canvas.paste(scaled, (px, py), scaled)
        return canvas

    if category == 'trousers':
        # Match Image 2 (3_cut.png) proportions: trouser waistband at ~11.4% (y=96), trouser fills ~87% height
        py = 96
        max_w = 500
        max_h = canvas_h - py - 6
        scale = min(max_w / gw, max_h / gh)
        nw, nh = max(1, int(round(gw * scale))), max(1, int(round(gh * scale)))
        scaled_garment = garment_im.resize((nw, nh), Image.Resampling.LANCZOS)

        # Measure waistband edges in top 2%..10% of scaled garment to center waistband directly under hook
        sa = np.asarray(scaled_garment)[:, :, 3] > 50
        y1 = max(0, int(nh * 0.02))
        y2 = max(y1 + 2, int(nh * 0.10))
        x1_list, x2_list = [], []
        for y in range(y1, min(nh, y2)):
            xs = np.where(sa[y])[0]
            if len(xs):
                x1_list.append(int(xs[0]))
                x2_list.append(int(xs[-1]))

        local_wx1 = int(np.median(x1_list)) if x1_list else int(nw * 0.12)
        local_wx2 = int(np.median(x2_list)) if x2_list else int(nw * 0.88)
        local_wcx = (local_wx1 + local_wx2) // 2

        px = max(10, min(canvas_w - nw - 10, (canvas_w // 2) - local_wcx))
        canvas.paste(scaled_garment, (px, py), scaled_garment)

        _draw_sleek_trouser_clamp_hanger(
            canvas,
            wx1=px + local_wx1,
            wx2=px + local_wx2,
            waist_y=py,
            canvas_w=canvas_w,
        )
        return canvas

    # Shirts front hanger: 3D Z-layered neck-cavity composite (matches Reign / Hoodie $199 reference)
    hanger_path = RAIL_ASSETS_DIR / 'master_front_hanger_official.png'
    hanger = Image.open(hanger_path).convert('RGBA')
    hfa = np.asarray(hanger).copy()
    luma_h = 0.2126 * hfa[:, :, 0] + 0.7152 * hfa[:, :, 1] + 0.0722 * hfa[:, :, 2]
    chroma_h = np.max(hfa[:, :, :3], axis=2) - np.min(hfa[:, :, :3], axis=2)
    ys_grid = np.arange(hanger.height)[:, None]
    # Strip white collar halo remnants around outer hanger wing tips (y > 88)
    hfa[(ys_grid > 88) & (luma_h > 175) & (chroma_h < 28), 3] = 0
    hanger = Image.fromarray(hfa)

    py = 118
    max_w = 540
    max_h = min(690, canvas_h - py - 10)
    scale = min(max_w / gw, max_h / gh)
    nw, nh = max(1, int(round(gw * scale))), max(1, int(round(gh * scale)))
    scaled_garment = garment_im.resize((nw, nh), Image.Resampling.LANCZOS)

    # Measure top collar/neck span to center neck under chrome rod and size wooden hanger arch
    sa = np.asarray(scaled_garment)[:, :, 3] > 50
    top_rows = [y for y in range(min(nh, max(4, int(nh * 0.08)))) if sa[y].sum() > 16]
    if top_rows:
        top_xs = np.where(sa[top_rows[0]])[0]
        neck_cx = int((int(top_xs[0]) + int(top_xs[-1])) // 2)
        top_neck_w = int(int(top_xs[-1]) - int(top_xs[0]) + 1)
    else:
        neck_cx = nw // 2
        top_neck_w = int(nw * 0.28)
    px = max(10, min(canvas_w - nw - 10, (canvas_w // 2) - neck_cx))

    hw, hh = hanger.size
    h_scale = max(1.0, min(1.22, (top_neck_w * 1.05) / 160.0))
    nhw, nhh = int(round(hw * h_scale)), int(round(hh * h_scale))
    h_resized = hanger.resize((nhw, nhh), Image.Resampling.LANCZOS)
    hx = (canvas_w // 2) - int(round(298 * h_scale))
    hy = 5

    shirt_full = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    shirt_full.paste(scaled_garment, (px, py), scaled_garment)

    hanger_full = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    hanger_full.paste(h_resized, (hx, hy), h_resized)

    h_arr = np.asarray(hanger_full)
    wood_bot_y = int(hy + nhh)
    max_inner_r = max(52, min(86, int(top_neck_w * 0.44)))
    y_idx, x_idx = np.ogrid[:canvas_h, :canvas_w]
    span_y = max(12, wood_bot_y - py)
    t_y = np.clip((y_idx - py) / span_y, 0.0, 1.0)
    inner_r = max_inner_r * (1.0 - t_y ** 1.35)
    dx = np.abs(x_idx - (canvas_w // 2))
    in_cavity = (y_idx >= py - 2) & (y_idx <= wood_bot_y) & (dx <= inner_r)

    final_im = Image.alpha_composite(hanger_full, shirt_full)
    out_arr = np.asarray(final_im).copy()
    alpha_h = h_arr[:, :, 3].astype(np.float32) / 255.0
    dist_edge = np.clip((inner_r - dx) / 3.5, 0.0, 1.0)
    blend = np.where(in_cavity & (h_arr[:, :, 3] > 20), alpha_h * dist_edge, 0.0)[:, :, None]
    out_arr[:, :, :3] = np.clip(out_arr[:, :, :3] * (1.0 - blend) + h_arr[:, :, :3] * blend, 0, 255).astype(np.uint8)
    out_arr[:, :, 3] = np.maximum(out_arr[:, :, 3], h_arr[:, :, 3])
    return Image.fromarray(out_arr)


def composite_on_side_hanger(
    garment_im: Image.Image,
    category: str = 'shirts',
    already_has_hook: bool = False,
) -> Image.Image:
    gw, gh = garment_im.size
    if category == 'trousers':
        if already_has_hook:
            scale = min(92 / gw, 354 / gh)
            nw, nh = max(1, int(round(gw * scale))), max(1, int(round(gh * scale)))
            scaled_garment = garment_im.resize((nw, nh), Image.Resampling.LANCZOS)
            canvas_w = max(60, nw + 8)
            canvas = Image.new('RGBA', (canvas_w, 360), (0, 0, 0, 0))
            canvas.paste(scaled_garment, ((canvas_w - nw) // 2, 3), scaled_garment)
            return canvas

        hanger_path = RAIL_ASSETS_DIR / 'master_trouser_side_hanger_official.png'
        if not hanger_path.exists():
            hanger_path = RAIL_ASSETS_DIR / 'master_side_hanger_official.png'
        hanger = Image.open(hanger_path).convert('RGBA')
        hw, hh = hanger.size

        max_w = 82
        max_h = 315
        scale = min(max_w / gw, max_h / gh)
        nw, nh = max(1, int(round(gw * scale))), max(1, int(round(gh * scale)))
        scaled_garment = garment_im.resize((nw, nh), Image.Resampling.LANCZOS)

        canvas_w = max(60, nw + 8)
        canvas_h = 360
        canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))

        # Align hanger hook over top waistband center of side trouser
        sa = np.asarray(scaled_garment)[:, :, 3] > 50
        y1, y2 = 0, max(2, int(nh * 0.08))
        wxs = np.where(sa[y1:y2])[1]
        waist_cx_local = int(np.median(wxs)) if len(wxs) else nw // 2

        px = (canvas_w - nw) // 2
        py = 42
        canvas.paste(scaled_garment, (px, py), scaled_garment)

        hx = max(0, min(canvas_w - hw, (px + waist_cx_local) - hw // 2))
        hy = 0
        canvas.paste(hanger, (hx, hy), hanger)
        return canvas

    # Shirts side hanger
    canvas_w = 260
    canvas_h = 840
    canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))

    if already_has_hook:
        scale = min((canvas_w - 16) / gw, (canvas_h - 16) / gh)
        nw, nh = max(1, int(round(gw * scale))), max(1, int(round(gh * scale)))
        scaled_garment = garment_im.resize((nw, nh), Image.Resampling.LANCZOS)
        canvas.paste(scaled_garment, ((canvas_w - nw) // 2, 8), scaled_garment)
        return canvas

    hanger_path = RAIL_ASSETS_DIR / 'master_side_hanger_official.png'
    hanger = Image.open(hanger_path).convert('RGBA')
    hw, hh = hanger.size

    py = 104
    max_w = 240
    max_h = min(690, canvas_h - py - 10)
    scale = min(max_w / gw, max_h / gh)
    nw, nh = max(1, int(round(gw * scale))), max(1, int(round(gh * scale)))
    scaled_garment = garment_im.resize((nw, nh), Image.Resampling.LANCZOS)

    # Align top collar center directly under the side hanger chrome rod (x=109 inside 222px asset)
    sa = np.asarray(scaled_garment)[:, :, 3] > 50
    collar_xs = np.where(sa[: max(4, int(nh * 0.06))])[1]
    collar_cx = int(np.median(collar_xs)) if len(collar_xs) else nw // 2
    px = max(4, min(canvas_w - nw - 4, (canvas_w // 2) - collar_cx))

    hx = (canvas_w // 2) - 109
    hy = 5
    # Paste hanger behind collar so the walnut neck block tucks naturally inside the shirt collar
    canvas.paste(hanger, (hx, hy), hanger)
    canvas.paste(scaled_garment, (px, py), scaled_garment)
    return canvas


_REMBG_SESSION = None


def _get_rembg_session():
    """Lazily initialize and cache the u2net rembg session for fast bag/studio segmentation."""
    global _REMBG_SESSION
    if _REMBG_SESSION is None:
        from rembg import new_session
        _REMBG_SESSION = new_session('u2net')
    return _REMBG_SESSION


def extract_bag_cutout(img_path: str | Path, canvas_pad_ratio: float = 0.04) -> Image.Image:
    """
    Extract a crisp transparent RGBA cutout for bags & accessories using u2net segmentation
    (stripping complex indoor/table backdrops, white boxes, and corner watermarks),
    then tighten bounds and preserve crisp studio silhouettes for 3D pedestal rendering.
    """
    im = Image.open(img_path).convert('RGBA')
    arr = np.asarray(im).copy()
    h, w = arr.shape[:2]

    border_alpha = np.concatenate([
        arr[0, :, 3], arr[-1, :, 3],
        arr[:, 0, 3], arr[:, -1, 3],
    ])
    already_transparent = (border_alpha < 50).sum() / max(1, border_alpha.size) > 0.20

    if already_transparent:
        out_im = im
    else:
        used_rembg = False
        try:
            from rembg import remove
            sess = _get_rembg_session()
            # alpha_matting preserves thin leather straps/zippers cleanly without white fringe
            out_im = remove(
                im.convert('RGB'),
                session=sess,
                alpha_matting=False,
                post_process_mask=True,
            ).convert('RGBA')
            used_rembg = True
        except Exception:
            out_im = None

        if not used_rembg or out_im is None:
            out_im, _ = extract_garment_cutout(
                img_path, category='bags', preserve_existing_hanger=True
            )

    out_arr = np.asarray(out_im).copy()
    alpha = out_arr[:, :, 3]

    # Clean semi-transparent corner dust / small watermarks by keeping significant foreground components
    fg_bin = (alpha > 32).astype(np.uint8)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(fg_bin, connectivity=8)
    if num_labels > 1:
        areas = stats[1:, cv2.CC_STAT_AREA]
        max_area = int(areas.max()) if len(areas) else 0
        if max_area > 0:
            keep = np.zeros_like(fg_bin)
            for lbl in range(1, num_labels):
                if stats[lbl, cv2.CC_STAT_AREA] >= max(120, int(max_area * 0.025)):
                    keep[labels == lbl] = 1
            out_arr[:, :, 3] = np.where(keep > 0, alpha, 0)

    # Gentle anti-aliased edge smoothing (preserve metallic hardware/straps crispness)
    out_arr[:, :, 3] = cv2.GaussianBlur(out_arr[:, :, 3], (3, 3), 0.65)
    # Zero very faint edge noise so drop-shadow traces pure bag contours
    out_arr[out_arr[:, :, 3] < 14, 3] = 0

    cleaned = Image.fromarray(out_arr)
    bbox = cleaned.getbbox()
    if not bbox:
        return cleaned

    cropped = cleaned.crop(bbox)
    cw, ch = cropped.size
    pad_x = max(4, int(round(cw * canvas_pad_ratio)))
    pad_top = max(4, int(round(ch * canvas_pad_ratio)))
    # Minimal bottom margin so the bag base sits flush on the 3D stone pedestal surface
    pad_bot = 2
    final_im = Image.new('RGBA', (cw + pad_x * 2, ch + pad_top + pad_bot), (0, 0, 0, 0))
    final_im.paste(cropped, (pad_x, pad_top), cropped)
    return final_im


def extract_dummy_cutout(img_path: str | Path) -> Image.Image:
    """
    Extract a crisp transparent full-body dummy / runway look cutout using u2net segmentation,
    strip studio/indoor backdrops cleanly, keep only the main subject, and center it inside a
    normalized 900x1600 (9:16 portrait) transparent RGBA stage frame matching RunwaySection (--rw-ar: 0.5625).
    """
    im = Image.open(img_path).convert('RGBA')
    arr = np.asarray(im).copy()
    border_alpha = np.concatenate([
        arr[0, :, 3], arr[-1, :, 3],
        arr[:, 0, 3], arr[:, -1, 3],
    ])
    already_transparent = (border_alpha < 50).sum() / max(1, border_alpha.size) > 0.25

    if already_transparent:
        out_im = im
    else:
        used_rembg = False
        try:
            from rembg import remove
            sess = _get_rembg_session()
            out_im = remove(
                im.convert('RGB'),
                session=sess,
                alpha_matting=False,
                post_process_mask=True,
            ).convert('RGBA')
            used_rembg = True
        except Exception:
            out_im = None

        if not used_rembg or out_im is None:
            out_im, _ = extract_garment_cutout(
                img_path, category='dummy', preserve_existing_hanger=True
            )

    out_arr = np.asarray(out_im).copy()
    alpha = out_arr[:, :, 3]

    # Keep only the main mannequin / model silhouette (strip stray shadows or background artifacts)
    fg_bin = (alpha > 32).astype(np.uint8)
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(fg_bin, connectivity=8)
    if num_labels > 1:
        areas = stats[1:, cv2.CC_STAT_AREA]
        max_area = int(areas.max()) if len(areas) else 0
        if max_area > 0:
            keep = np.zeros_like(fg_bin)
            for lbl in range(1, num_labels):
                if stats[lbl, cv2.CC_STAT_AREA] >= max(160, int(max_area * 0.04)):
                    keep[labels == lbl] = 1
            out_arr[:, :, 3] = np.where(keep > 0, alpha, 0)

    out_arr[:, :, 3] = cv2.GaussianBlur(out_arr[:, :, 3], (3, 3), 0.55)
    out_arr[out_arr[:, :, 3] < 14, 3] = 0

    cleaned = Image.fromarray(out_arr)
    bbox = cleaned.getbbox()
    if not bbox:
        return Image.new('RGBA', (900, 1600), (0, 0, 0, 0))

    cropped = cleaned.crop(bbox)
    cw, ch = cropped.size

    # Normalize onto 1024x1600 (0.64 ratio) editorial runway frame filling ~96% vertical height so dummy looks bold & full-scale
    canvas_w, canvas_h = 1024, 1600
    max_w, max_h = 980, 1550
    scale = min(max_w / max(1, cw), max_h / max(1, ch))
    nw, nh = max(1, int(round(cw * scale))), max(1, int(round(ch * scale)))
    resized = cropped.resize((nw, nh), Image.Resampling.LANCZOS)

    canvas = Image.new('RGBA', (canvas_w, canvas_h), (0, 0, 0, 0))
    px = (canvas_w - nw) // 2
    py = max(12, canvas_h - 14 - nh)
    canvas.paste(resized, (px, py), resized)
    return canvas


def process_file_cli(input_path: str, output_path: str | None = None, category: str = 'shirts', view_type: str = 'front') -> str:
    inp = Path(input_path)
    if not inp.exists():
        raise FileNotFoundError(f"Input image not found: {input_path}")

    if not output_path:
        out_name = f"{inp.stem}_cutout.png"
        output_path = str(inp.parent / out_name)

    if category == 'bags':
        bag_cutout = extract_bag_cutout(inp)
        fmt = 'WEBP' if str(output_path).lower().endswith('.webp') else 'PNG'
        if fmt == 'WEBP':
            bag_cutout.save(output_path, 'WEBP', quality=94, method=6)
        else:
            bag_cutout.save(output_path, 'PNG', optimize=True)
        return output_path

    if category in ('dummy', 'runway', 'look'):
        dummy_cutout = extract_dummy_cutout(inp)
        fmt = 'WEBP' if str(output_path).lower().endswith('.webp') else 'PNG'
        if fmt == 'WEBP':
            dummy_cutout.save(output_path, 'WEBP', quality=94, method=6)
        else:
            dummy_cutout.save(output_path, 'PNG', optimize=True)
        return output_path

    # For side views, keep any uploaded side hanger hook intact if background was removed cleanly
    preserve_hook = (view_type == 'side')
    garment, already_has_hook = extract_garment_cutout(
        inp, category=category, preserve_existing_hanger=preserve_hook
    )
    if view_type == 'side':
        composited = composite_on_side_hanger(garment, category=category, already_has_hook=already_has_hook)
    else:
        composited = composite_on_master_hanger(garment, category=category, already_has_hook=already_has_hook)
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
