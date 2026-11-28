/**
 * NEXUS Master Rail Hanger Auto-Compositor & Background Remover
 * Automatically removes solid backgrounds (white, grey, studio backdrops) from uploaded clothing images
 * and dynamically binds the pure garment dummy onto the official wooden master rail hanger.
 * 
 * Generates exact transparent canvas profiles for the 3D Runway Rail:
 * - Front View: 600 x 840 px (hook centered at x=300, y=5)
 * - Side View (Shirts): 260 x 840 px (hook centered at x=130, y=5)
 * - Side View (Trousers): 300 x 840 px (hook centered at x=150, y=5)
 */

(function(root) {
  'use strict';

  const HANGER_FRONT_URL = 'rail_assets/master_front_hanger_official.png';
  const HANGER_TROUSER_FRONT_URL = 'rail_assets/master_trouser_hanger_official.png';
  const HANGER_SIDE_URL = 'rail_assets/master_side_hanger_official.png';
  const HANGER_TROUSER_SIDE_URL = 'rail_assets/master_trouser_side_hanger_official.png';

  function resolveAssetUrl(url) {
    if (!url) return url;
    if (url.startsWith('data:') || url.startsWith('blob:')) return url;
    const clean = url.replace(/^\.?\//, '');
    if (typeof window !== 'undefined' && window.location && window.location.origin && window.location.protocol.startsWith('http')) {
      return window.location.origin + '/' + clean;
    }
    return clean;
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      if (!src) return reject(new Error('No image source provided'));
      const resolved = resolveAssetUrl(src);
      const img = new Image();
      if (typeof window !== 'undefined' && window.location && window.location.origin && resolved.startsWith('http') && !resolved.startsWith(window.location.origin)) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(new Error('Failed to load image: ' + resolved));
      img.src = resolved;
    });
  }

  const HangerCompositor = {
    FRONT_WIDTH: 600,
    FRONT_HEIGHT: 840,
    SIDE_SHIRT_WIDTH: 260,
    SIDE_TROUSER_WIDTH: 300,
    SIDE_HEIGHT: 840,

    /**
     * Check if an image already has a hanger (e.g. pre-composited WebP in cdn or already-hangered upload)
     */
    isPrecomposited(url) {
      if (!url) return false;
      return (
        url.includes('scene_rail_cdn') ||
        url.includes('trousers_cutouts') ||
        url.includes('hanger_front_') ||
        url.includes('hanger_side_')
      );
    },

    /**
     * Detect whether a trimmed garment cutout canvas already has a hanger hook at the top.
     * Prevents stacking a second/third hanger onto already-hangered images.
     */
    hasTopHook(canvas) {
      const w = canvas.width;
      const h = canvas.height;
      if (!w || !h || h < 40) return false;

      const ctx = canvas.getContext('2d');
      const data = ctx.getImageData(0, 0, w, h).data;

      const topRows = Math.max(5, Math.floor(h * 0.08));
      let topOpaqueSum = 0;
      let topSpanSum = 0;

      for (let y = 0; y < topRows; y++) {
        let rowOpaque = 0;
        let minX = w, maxX = -1;
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 40) {
            rowOpaque++;
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
          }
        }
        topOpaqueSum += rowOpaque;
        topSpanSum += maxX >= minX ? (maxX - minX + 1) : 0;
      }

      const avgTopOpaque = topOpaqueSum / topRows;
      const avgTopSpan = topSpanSum / topRows;

      let bodyMaxSpan = 0;
      const bodyStart = Math.floor(h * 0.25);
      const bodyEnd = Math.floor(h * 0.65);
      for (let y = bodyStart; y < bodyEnd; y += 2) {
        let minX = w, maxX = -1;
        for (let x = 0; x < w; x++) {
          if (data[(y * w + x) * 4 + 3] > 40) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
          }
        }
        if (maxX >= minX) {
          const span = maxX - minX + 1;
          if (span > bodyMaxSpan) bodyMaxSpan = span;
        }
      }

      return (
        avgTopOpaque < Math.max(16, w * 0.22) &&
        (w < 120 || avgTopSpan < bodyMaxSpan * 0.48)
      );
    },

    /**
     * Extract Garment Cutout (Remove white, off-white, grey studio background via BFS flood-fill)
     * Returns a canvas containing ONLY the clothing dummy with transparent background, trimmed to bounding box.
     */
    extractGarmentCutout(img, category = 'shirts') {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) return img;

      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);

      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      // 1. Check if image is already a transparent cutout PNG
      let transparentBorders = 0;
      const totalBorderSamples = (w * 2) + (h * 2);
      for (let x = 0; x < w; x++) {
        if (data[x * 4 + 3] < 50) transparentBorders++;
        if (data[((h - 1) * w + x) * 4 + 3] < 50) transparentBorders++;
      }
      for (let y = 0; y < h; y++) {
        if (data[(y * w) * 4 + 3] < 50) transparentBorders++;
        if (data[(y * w + (w - 1)) * 4 + 3] < 50) transparentBorders++;
      }

      if (transparentBorders / totalBorderSamples > 0.15) {
        // Already transparent! Just trim bounding box
        return this.trimCanvasBbox(canvas, category);
      }

      // 2. Sample background color at 4 outer corners
      const getPixel = (x, y) => {
        const i = (y * w + x) * 4;
        return [data[i], data[i + 1], data[i + 2]];
      };

      const corners = [
        getPixel(0, 0),
        getPixel(w - 1, 0),
        getPixel(0, h - 1),
        getPixel(w - 1, h - 1)
      ];

      const avgBg = [
        Math.round((corners[0][0] + corners[1][0] + corners[2][0] + corners[3][0]) / 4),
        Math.round((corners[0][1] + corners[1][1] + corners[2][1] + corners[3][1]) / 4),
        Math.round((corners[0][2] + corners[1][2] + corners[2][2] + corners[3][2]) / 4)
      ];

      const isBg = (r, g, b) => {
        // Color distance to average corner background
        const dr = r - avgBg[0];
        const dg = g - avgBg[1];
        const db = b - avgBg[2];
        const dist = Math.sqrt(dr * dr + dg * dg + db * db);
        if (dist <= 42) return true;

        // High luma & low chroma (studio white/grey paper)
        const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
        const chroma = Math.max(r, g, b) - Math.min(r, g, b);
        if (luma >= 220 && chroma <= 28) return true;
        if (luma >= 238 && chroma <= 40) return true;

        return false;
      };

      // 3. BFS Flood Fill from outer edges
      const visited = new Uint8Array(w * h);
      const queue = new Int32Array(w * h);
      let qHead = 0;
      let qTail = 0;

      const tryPush = (x, y) => {
        if (x < 0 || x >= w || y < 0 || y >= h) return;
        const pos = y * w + x;
        if (visited[pos]) return;
        const idx = pos * 4;
        if (isBg(data[idx], data[idx + 1], data[idx + 2])) {
          visited[pos] = 1;
          queue[qTail++] = pos;
        }
      };

      // Push all 4 borders
      for (let x = 0; x < w; x++) {
        tryPush(x, 0);
        tryPush(x, h - 1);
      }
      for (let y = 0; y < h; y++) {
        tryPush(0, y);
        tryPush(w - 1, y);
      }

      // For trousers, also flood fill from the bottom center gap between legs
      if (category === 'trousers') {
        const midX = Math.floor(w / 2);
        const span = Math.max(10, Math.floor(w * 0.18));
        for (let x = midX - span; x <= midX + span; x++) {
          for (let y = h - 1; y >= Math.floor(h * 0.65); y--) {
            tryPush(x, y);
          }
        }
      }

      // Process flood fill queue
      while (qHead < qTail) {
        const pos = queue[qHead++];
        const x = pos % w;
        const y = Math.floor(pos / w);

        if (x > 0) tryPush(x - 1, y);
        if (x < w - 1) tryPush(x + 1, y);
        if (y > 0) tryPush(x, y - 1);
        if (y < h - 1) tryPush(x, y + 1);
      }

      // Apply transparency
      for (let i = 0; i < w * h; i++) {
        if (visited[i]) {
          data[i * 4 + 3] = 0;
        }
      }

      ctx.putImageData(imgData, 0, 0);
      return this.trimCanvasBbox(canvas, category);
    },

    /**
     * Trim canvas to garment bounding box (and trim top wooden hanger clips if present)
     */
    trimCanvasBbox(srcCanvas, category = 'shirts') {
      const w = srcCanvas.width;
      const h = srcCanvas.height;
      const ctx = srcCanvas.getContext('2d');
      const imgData = ctx.getImageData(0, 0, w, h);
      const data = imgData.data;

      let minX = w, minY = h, maxX = 0, maxY = 0;

      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const alpha = data[(y * w + x) * 4 + 3];
          if (alpha > 40) {
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      if (minX > maxX || minY > maxY) {
        return srcCanvas; // Empty or fully transparent
      }

      // If trousers had an old hanger bar/clips in top ~20%, detect waistband start
      let startY = minY;
      if (category === 'trousers') {
        const cropH = maxY - minY + 1;
        const checkH = Math.min(Math.floor(cropH * 0.22), 80);
        for (let y = minY; y < minY + checkH; y++) {
          let darkCount = 0;
          let opaqueCount = 0;
          for (let x = minX; x <= maxX; x++) {
            const idx = (y * w + x) * 4;
            if (data[idx + 3] > 100) {
              opaqueCount++;
              const luma = 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2];
              if (luma < 85) darkCount++;
            }
          }
          if (darkCount > (maxX - minX + 1) * 0.35) {
            startY = y;
            break;
          }
        }
      }

      const cropW = Math.max(1, maxX - minX + 1);
      const cropH = Math.max(1, maxY - startY + 1);

      const outCanvas = document.createElement('canvas');
      outCanvas.width = cropW;
      outCanvas.height = cropH;
      const outCtx = outCanvas.getContext('2d');
      outCtx.drawImage(srcCanvas, minX, startY, cropW, cropH, 0, 0, cropW, cropH);

      return outCanvas;
    },

    /**
     * Composite Front View on Master Front Hanger (600 x 840)
     */
    async compositeFront(garmentSrc, category = 'shirts') {
      if (this.isPrecomposited(garmentSrc)) {
        return garmentSrc;
      }

      const canvas = document.createElement('canvas');
      canvas.width = this.FRONT_WIDTH;
      canvas.height = this.FRONT_HEIGHT;
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const hangerUrl = category === 'trousers' ? HANGER_TROUSER_FRONT_URL : HANGER_FRONT_URL;
      const [rawGarmentImg, hangerImg] = await Promise.all([
        loadImage(garmentSrc),
        loadImage(hangerUrl)
      ]);

      // 1. Extract pure clothing dummy cutout (background removed & trimmed)
      const garmentCutout = this.extractGarmentCutout(rawGarmentImg, category);

      // If the uploaded image already includes a hanger/hook, preserve it at full scale without adding a second hanger
      if (this.hasTopHook(garmentCutout)) {
        const gw0 = garmentCutout.width || garmentCutout.naturalWidth;
        const gh0 = garmentCutout.height || garmentCutout.naturalHeight;
        const scale0 = Math.min((this.FRONT_WIDTH - 20) / gw0, (this.FRONT_HEIGHT - 16) / gh0);
        const tw0 = Math.round(gw0 * scale0);
        const th0 = Math.round(gh0 * scale0);
        ctx.drawImage(garmentCutout, Math.round((this.FRONT_WIDTH - tw0) / 2), 8, tw0, th0);
        return canvas.toDataURL('image/png', 0.95);
      }

      // 2. Calculate garment scaling
      const gw = garmentCutout.width || garmentCutout.naturalWidth;
      const gh = garmentCutout.height || garmentCutout.naturalHeight;

      if (category === 'trousers') {
        // Match Image 2 (3_cut.png) proportions: trouser waistband at y=96 (~11.4%), trouser fills ~87% height
        const posY = 96;
        const maxW = 500;
        const maxH = this.FRONT_HEIGHT - posY - 6;
        const scale = Math.min(maxW / gw, maxH / gh);
        const targetW = Math.max(1, Math.round(gw * scale));
        const targetH = Math.max(1, Math.round(gh * scale));

        // Render scaled garment onto temp canvas to measure exact waistband left/right corners
        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = targetW;
        scaledCanvas.height = targetH;
        const sCtx = scaledCanvas.getContext('2d');
        sCtx.drawImage(garmentCutout, 0, 0, targetW, targetH);

        const x1List = [];
        const x2List = [];
        try {
          const sData = sCtx.getImageData(0, 0, targetW, targetH).data;
          const y1 = Math.max(0, Math.floor(targetH * 0.02));
          const y2 = Math.max(y1 + 2, Math.floor(targetH * 0.10));
          for (let y = y1; y < Math.min(targetH, y2); y++) {
            let minX = targetW, maxX = -1;
            for (let x = 0; x < targetW; x++) {
              if (sData[(y * targetW + x) * 4 + 3] > 50) {
                if (x < minX) minX = x;
                if (x > maxX) maxX = x;
              }
            }
            if (maxX >= minX) {
              x1List.push(minX);
              x2List.push(maxX);
            }
          }
        } catch (e) {}

        x1List.sort((a, b) => a - b);
        x2List.sort((a, b) => a - b);
        const localWx1 = x1List.length ? x1List[Math.floor(x1List.length / 2)] : Math.round(targetW * 0.12);
        const localWx2 = x2List.length ? x2List[Math.floor(x2List.length / 2)] : Math.round(targetW * 0.88);
        const localWcx = Math.round((localWx1 + localWx2) / 2);

        const posX = Math.max(10, Math.min(this.FRONT_WIDTH - targetW - 10, Math.round(this.FRONT_WIDTH / 2) - localWcx));
        ctx.drawImage(scaledCanvas, posX, posY, targetW, targetH);

        // Sleek clamp hanger assembled directly from master_trouser_hanger_official.png parts fitted to waistband
        const wx1 = posX + localWx1;
        const wx2 = posX + localWx2;
        const waistW = Math.max(120, wx2 - wx1 + 1);
        const waistCx = Math.round((wx1 + wx2) / 2);

        const targetHookH = Math.max(62, Math.min(92, posY - 6));
        const hookScale = targetHookH / 194;
        const targetHookW = Math.max(20, Math.round(133 * hookScale));
        const hookNeckX = Math.round(81 * hookScale);
        const hx = waistCx - hookNeckX;
        const hy = Math.max(2, posY - targetHookH - 8);

        const clipScale = Math.max(0.36, Math.min(0.50, waistW / 520));
        const lcW = Math.max(12, Math.round(44 * clipScale));
        const lcH = Math.max(28, Math.round(110 * clipScale));
        const rcW = Math.max(12, Math.round(42 * clipScale));
        const rcH = Math.max(28, Math.round(110 * clipScale));

        let lcX = Math.max(2, wx1 + Math.round(lcW * 0.15));
        let rcX = Math.min(this.FRONT_WIDTH - rcW - 2, wx2 - Math.round(rcW * 1.15));
        if (rcX <= lcX + lcW + 40) {
          lcX = Math.max(2, waistCx - Math.round(waistW / 2));
          rcX = Math.min(this.FRONT_WIDTH - rcW - 2, waistCx + Math.round(waistW / 2) - rcW);
        }

        const woodH = Math.max(16, Math.round(48 * Math.max(0.38, clipScale * 0.92)));
        const woodY = Math.max(hy + targetHookH - 4, posY - Math.round(woodH * 0.85));
        const clipY = woodY - Math.round(lcH * 0.05);

        const innerSpan = Math.max(40, (rcX + Math.round(rcW / 2)) - (lcX + Math.round(lcW / 2)));
        const rodW = Math.max(20, innerSpan);
        const rodH = Math.max(8, Math.round(woodH * 0.56));
        const rodX = lcX + Math.round(lcW / 2);
        const rodY = woodY + Math.round((woodH - rodH) / 2);

        const woodW = Math.max(60, Math.round(innerSpan * 0.82));
        const woodX = waistCx - Math.round(woodW / 2);

        // Draw connector rod, wood bar, hook, and silver waistband clips
        ctx.drawImage(hangerImg, 100, 208, 36, 24, rodX, rodY, rodW, rodH);
        ctx.drawImage(hangerImg, 142, 192, 339, 48, woodX, woodY, woodW, woodH);
        ctx.drawImage(hangerImg, 228, 0, 133, 194, hx, hy, targetHookW, targetHookH);
        ctx.drawImage(hangerImg, 42, 188, 44, 110, lcX, clipY, lcW, lcH);
        ctx.drawImage(hangerImg, 534, 188, 42, 110, rcX, clipY, rcW, rcH);

        return canvas.toDataURL('image/png', 0.95);
      }

      const pyShirt = 118;
      const maxW = 540;
      const maxH = Math.min(690, this.FRONT_HEIGHT - pyShirt - 10);

      const scale = Math.min(maxW / gw, maxH / gh);
      const targetW = Math.round(gw * scale);
      const targetH = Math.round(gh * scale);

      // Center horizontally by top collar/neck center & size hanger arch proportionally
      const scaledCanvas = document.createElement('canvas');
      scaledCanvas.width = targetW;
      scaledCanvas.height = targetH;
      const sCtx = scaledCanvas.getContext('2d');
      sCtx.drawImage(garmentCutout, 0, 0, targetW, targetH);

      let neckCx = Math.round(targetW / 2);
      let topNeckW = Math.round(targetW * 0.28);
      try {
        const sData = sCtx.getImageData(0, 0, targetW, targetH).data;
        const limitY = Math.min(targetH, Math.max(4, Math.floor(targetH * 0.08)));
        for (let y = 0; y < limitY; y++) {
          let minX = targetW, maxX = -1, cnt = 0;
          for (let x = 0; x < targetW; x++) {
            if (sData[(y * targetW + x) * 4 + 3] > 50) {
              cnt++;
              if (x < minX) minX = x;
              if (x > maxX) maxX = x;
            }
          }
          if (cnt > 16 && maxX >= minX) {
            neckCx = Math.round((minX + maxX) / 2);
            topNeckW = maxX - minX + 1;
            break;
          }
        }
      } catch (e) {}

      const posX = Math.max(10, Math.min(this.FRONT_WIDTH - targetW - 10, Math.round(this.FRONT_WIDTH / 2) - neckCx));

      // Clean white halo pixels below rod (y > 88) on shirt front hanger
      const hw = hangerImg.naturalWidth || 597;
      const hh = hangerImg.naturalHeight || 175;
      const hCanvas = document.createElement('canvas');
      hCanvas.width = hw;
      hCanvas.height = hh;
      const hCtx = hCanvas.getContext('2d');
      hCtx.drawImage(hangerImg, 0, 0, hw, hh);
      try {
        const hImgData = hCtx.getImageData(0, 0, hw, hh);
        const hd = hImgData.data;
        for (let y = 89; y < hh; y++) {
          for (let x = 0; x < hw; x++) {
            const idx = (y * hw + x) * 4;
            const r = hd[idx], g = hd[idx + 1], b = hd[idx + 2];
            const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
            const chroma = Math.max(r, g, b) - Math.min(r, g, b);
            if (luma > 175 && chroma < 28) hd[idx + 3] = 0;
          }
        }
        hCtx.putImageData(hImgData, 0, 0);
      } catch (e) {}

      const hScale = Math.max(1.0, Math.min(1.22, (topNeckW * 1.05) / 160));
      const nhw = Math.round(hw * hScale);
      const nhh = Math.round(hh * hScale);
      const hx = Math.round(this.FRONT_WIDTH / 2) - Math.round(298 * hScale);
      const hy = 5;

      // Render hanger behind shirt first, then blend wood arch strictly inside inner neck V-cavity
      ctx.drawImage(hCanvas, 0, 0, hw, hh, hx, hy, nhw, nhh);
      ctx.drawImage(scaledCanvas, posX, pyShirt, targetW, targetH);

      const hFull = document.createElement('canvas');
      hFull.width = this.FRONT_WIDTH;
      hFull.height = this.FRONT_HEIGHT;
      const hfCtx = hFull.getContext('2d');
      hfCtx.drawImage(hCanvas, 0, 0, hw, hh, hx, hy, nhw, nhh);

      try {
        const outImg = ctx.getImageData(0, 0, this.FRONT_WIDTH, this.FRONT_HEIGHT);
        const hFullImg = hfCtx.getImageData(0, 0, this.FRONT_WIDTH, this.FRONT_HEIGHT);
        const od = outImg.data;
        const hd = hFullImg.data;
        const woodBotY = hy + nhh;
        const spanY = Math.max(12, woodBotY - pyShirt);
        const maxInnerR = Math.max(52, Math.min(86, Math.round(topNeckW * 0.44)));
        const cxCenter = Math.round(this.FRONT_WIDTH / 2);

        for (let y = Math.max(0, pyShirt - 2); y <= Math.min(this.FRONT_HEIGHT - 1, woodBotY); y++) {
          const tY = Math.max(0, Math.min(1, (y - pyShirt) / spanY));
          const innerR = maxInnerR * (1 - Math.pow(tY, 1.35));
          for (let x = Math.max(0, cxCenter - maxInnerR - 2); x <= Math.min(this.FRONT_WIDTH - 1, cxCenter + maxInnerR + 2); x++) {
            const dx = Math.abs(x - cxCenter);
            if (dx <= innerR) {
              const idx = (y * this.FRONT_WIDTH + x) * 4;
              const hAlpha = hd[idx + 3] / 255;
              if (hAlpha > 0.08) {
                const edgeFade = Math.max(0, Math.min(1, (innerR - dx) / 3.5));
                const b = hAlpha * edgeFade;
                od[idx]     = Math.round(od[idx] * (1 - b) + hd[idx] * b);
                od[idx + 1] = Math.round(od[idx + 1] * (1 - b) + hd[idx + 1] * b);
                od[idx + 2] = Math.round(od[idx + 2] * (1 - b) + hd[idx + 2] * b);
                od[idx + 3] = Math.max(od[idx + 3], hd[idx + 3]);
              }
            }
          }
        }
        ctx.putImageData(outImg, 0, 0);
      } catch (e) {}

      return canvas.toDataURL('image/png', 0.95);
    },

    /**
     * Composite Side View on Master Side Hanger (260 x 840 for shirts, ~70 x 360 for trousers)
     */
    async compositeSide(garmentSrc, category = 'shirts') {
      if (this.isPrecomposited(garmentSrc)) {
        return garmentSrc;
      }

      const isTrouser = category === 'trousers';
      const hangerUrl = isTrouser ? HANGER_TROUSER_SIDE_URL : HANGER_SIDE_URL;

      const [rawGarmentImg, hangerImg] = await Promise.all([
        loadImage(garmentSrc),
        loadImage(hangerUrl)
      ]);

      // Extract cutout for side view as well
      const garmentCutout = this.extractGarmentCutout(rawGarmentImg, category);
      const alreadyHasHook = this.hasTopHook(garmentCutout);

      const gw = garmentCutout.width || garmentCutout.naturalWidth;
      const gh = garmentCutout.height || garmentCutout.naturalHeight;

      if (isTrouser) {
        // Trousers side cutout: standard 360 height to match rail proportions exactly
        if (alreadyHasHook) {
          const scale0 = Math.min(80 / gw, 356 / gh);
          const tw0 = Math.max(1, Math.round(gw * scale0));
          const th0 = Math.max(1, Math.round(gh * scale0));
          const cw0 = Math.max(60, tw0 + 8);
          const canvas0 = document.createElement('canvas');
          canvas0.width = cw0;
          canvas0.height = 360;
          const ctx0 = canvas0.getContext('2d');
          ctx0.clearRect(0, 0, cw0, 360);
          ctx0.drawImage(garmentCutout, Math.round((cw0 - tw0) / 2), 2, tw0, th0);
          return canvas0.toDataURL('image/png', 0.95);
        }

        const maxH = 315;
        const maxW = 75;
        const scale = Math.min(maxW / gw, maxH / gh);
        const targetW = Math.max(1, Math.round(gw * scale));
        const targetH = Math.max(1, Math.round(gh * scale));

        const canvasW = Math.max(60, targetW + 8);
        const canvasH = 360;

        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvasW, canvasH);

        const posX = Math.round((canvasW - targetW) / 2);
        const posY = 42;
        ctx.drawImage(garmentCutout, posX, posY, targetW, targetH);

        const hw = hangerImg.naturalWidth || 26;
        const hh = hangerImg.naturalHeight || 45;
        const hx = Math.round((canvasW - hw) / 2);
        const hy = 0;
        ctx.drawImage(hangerImg, hx, hy, hw, hh);

        return canvas.toDataURL('image/png', 0.95);
      } else {
        const canvasW = this.SIDE_SHIRT_WIDTH;
        const canvasH = this.SIDE_HEIGHT;

        const canvas = document.createElement('canvas');
        canvas.width = canvasW;
        canvas.height = canvasH;
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (alreadyHasHook) {
          const scale0 = Math.min((canvasW - 16) / gw, (canvasH - 16) / gh);
          const tw0 = Math.round(gw * scale0);
          const th0 = Math.round(gh * scale0);
          ctx.drawImage(garmentCutout, Math.round((canvasW - tw0) / 2), 8, tw0, th0);
          return canvas.toDataURL('image/png', 0.95);
        }

        const pySide = 104;
        const maxH = Math.min(690, canvasH - pySide - 10);
        let scale = maxH / gh;
        let targetH = Math.round(gh * scale);
        let targetW = Math.round(gw * scale);
        const maxW = canvasW - 20;
        if (targetW > maxW) {
          scale = maxW / gw;
          targetW = maxW;
          targetH = Math.round(gh * scale);
        }

        const scaledCanvas = document.createElement('canvas');
        scaledCanvas.width = targetW;
        scaledCanvas.height = targetH;
        const sCtx = scaledCanvas.getContext('2d');
        sCtx.drawImage(garmentCutout, 0, 0, targetW, targetH);

        let collarCx = Math.round(targetW / 2);
        try {
          const sData = sCtx.getImageData(0, 0, targetW, targetH).data;
          const xs = [];
          const limitY = Math.max(4, Math.floor(targetH * 0.06));
          for (let y = 0; y < limitY; y++) {
            for (let x = 0; x < targetW; x++) {
              if (sData[(y * targetW + x) * 4 + 3] > 50) xs.push(x);
            }
          }
          if (xs.length) {
            xs.sort((a, b) => a - b);
            collarCx = xs[Math.floor(xs.length / 2)];
          }
        } catch (e) {}

        const posX = Math.max(4, Math.min(canvasW - targetW - 4, Math.round(canvasW / 2) - collarCx));

        // Draw side hanger BEHIND shirt collar so walnut neck block tucks naturally inside the collar
        const hw = hangerImg.naturalWidth || 222;
        const hh = hangerImg.naturalHeight || 150;
        const hx = Math.round((canvasW / 2) - 109);
        const hy = 5;

        ctx.drawImage(hangerImg, hx, hy, hw, hh);
        ctx.drawImage(scaledCanvas, posX, pySide, targetW, targetH);

        return canvas.toDataURL('image/png', 0.95);
      }
    },

    /**
     * Helper to process both views at once (NEVER substitute stock default side cutouts)
     */
    async processGarmentDualViews(frontSrc, sideSrc, category = 'shirts', attachHanger = true) {
      if (!attachHanger) {
        return { frontView: frontSrc, sideView: sideSrc || frontSrc };
      }

      try {
        let frontComposited = '';
        if (frontSrc) {
          try {
            frontComposited = await this.compositeFront(frontSrc, category);
          } catch (cfErr) {
            console.warn('[HangerCompositor] compositeFront fallback:', cfErr);
            frontComposited = frontSrc;
          }
        }

        let sideComposited = '';
        if (sideSrc && sideSrc.trim()) {
          if (sideSrc === frontSrc && frontComposited) {
            sideComposited = frontComposited;
          } else {
            try {
              sideComposited = await this.compositeSide(sideSrc, category);
            } catch (csErr) {
              console.warn('[HangerCompositor] compositeSide fallback to sideSrc:', csErr);
              sideComposited = sideSrc;
            }
          }
        } else {
          sideComposited = frontComposited || frontSrc;
        }

        return {
          frontView: frontComposited || frontSrc,
          sideView: sideComposited || sideSrc || frontComposited || frontSrc
        };
      } catch (err) {
        console.warn('[HangerCompositor] Error compositing views:', err);
        return {
          frontView: frontSrc,
          sideView: sideSrc || frontSrc
        };
      }
    }
  };

  root.HangerCompositor = HangerCompositor;
})(typeof window !== 'undefined' ? window : this);
