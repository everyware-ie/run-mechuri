import sys
sys.argv = ['x', 'out6']
import numpy as np
import gen_new_bg as g
import gen_illust as il
from gen_illust import cov, paint, sky, circle, finishing
from gen_new_bg import W, H, xx, yy, hex_lin, smoothstep

def win_paint(px, x0, x1, y0, y1, sd_fn, col, a):
    """창 안쪽 영역만 칠한다(속도용)."""
    x0, y0 = max(int(x0), 0), max(int(y0), 0); x1, y1 = min(int(x1), W), min(int(y1), H)
    sx, sy = xx[y0:y1, x0:x1], yy[y0:y1, x0:x1]
    m = cov(sd_fn(sx, sy))[..., None] * a
    px[y0:y1, x0:x1] = px[y0:y1, x0:x1] * (1 - m) + hex_lin(col) * m

# ---------- 1. 네온 도시 야경 ----------
def skyline(px, seed, base, hmin, hmax, wmin, wmax, color, win_alpha, win_seed, glow_edge=None):
    rng = np.random.default_rng(seed)
    row = np.full(W, base, dtype=float); bid = np.zeros(W, int)
    x, k = 0, 0
    while x < W:
        w = int(rng.uniform(wmin, wmax)); h = rng.uniform(hmin, hmax)
        row[x:x + w] = base - h; bid[x:x + w] = k; x += w; k += 1
    d = yy - row[None, :]
    m = cov(-d)
    px = paint(px, m, color)
    if glow_edge:
        px = paint(px, cov(np.abs(d) - 1.2) * (np.abs(np.gradient(row))[None, :] < 30), glow_edge, 0.55)
    if win_alpha:
        wr = np.random.default_rng(win_seed)
        gh, gw = H // 24 + 2, W // 16 + 2
        lit = wr.random((gh, gw)); tone = wr.random((gh, gw))
        cx, cy = (xx // 16).astype(int), (yy // 24).astype(int)
        inner = ((xx % 16) >= 4) & ((xx % 16) <= 11) & ((yy % 24) >= 7) & ((yy % 24) <= 17)
        on = (lit[cy, cx] < 0.30) & inner & (d > 26) & (m > 0.5)
        warm = on & (tone[cy, cx] < 0.7); cool = on & (tone[cy, cx] >= 0.7)
        px = paint(px, warm.astype(float), '#FFC36B', win_alpha)
        px = paint(px, cool.astype(float), '#7FE0FF', win_alpha)
    return px, row

def city():
    px = sky('#080B26', '#2A1850', '#8A3A62', glow=(W * 0.5, H * 0.74, 700, '#FF7A4A', 0.30))
    px = il.stars(px, 21, n=90, region=0.35)
    px, _ = skyline(px, 1, 1330, 120, 520, 70, 140, '#1B1D4A', 0.35, 31)
    px, _ = skyline(px, 2, 1480, 100, 520, 60, 130, '#10112F', 0.65, 32, glow_edge='#7FB6FF')
    px, rowf = skyline(px, 3, 1650, 80, 430, 70, 150, '#080919', 0.95, 33, glow_edge='#FF5A2B')
    # 네온 간판과 안테나 불빛
    for sx, sy, w, col in [(180, 1290, 120, '#FF4F9A'), (860, 1230, 100, '#4FE3FF')]:
        sd = lambda X, Y, sx=sx, sy=sy, w=w: np.maximum(np.abs(X - sx) - w / 2, np.abs(Y - sy) - 7) 
        px = px + (np.exp(-np.hypot(xx - sx, yy - sy) / 55))[..., None] * hex_lin(col) * 0.28
        win_paint(px, sx - w, sx + w, sy - 30, sy + 30, sd, col, 1.0)
    # 길 위 빛줄기
    for i in range(26):
        y = 1760 + i * 6
        px = paint(px, cov(il.ellipse(540 + (i - 13) * 18, y, 120 - i * 2, 1.6)), '#FFB070', 0.12)
    return finishing(px)

# ---------- 2. 레트로 신스웨이브 ----------
def synth():
    px = sky('#0B0A2A', '#2A1060', '#D2407F')
    px = il.stars(px, 5, n=120, region=0.45)
    hz = 1250
    cx, cy, R = W * 0.5, 780, 330
    # 해: 위 노랑-분홍, 아래 보라, 아래쪽에 줄무늬 구멍
    t = np.clip((yy - (cy - R)) / (2 * R), 0, 1)[..., None]
    suncol = hex_lin('#FFD06B') * (1 - t) + hex_lin('#E8337F') * t
    m = cov(circle(cx, cy, R))
    px = px + (np.exp(-(np.hypot(xx - cx, yy - cy) / (R * 1.5)) ** 2))[..., None] * hex_lin('#FF4FA0') * 0.30
    stripe = np.ones((H, W))
    for i in range(9):
        y = cy + 40 + i * 34; hgt = 3 + i * 2.6
        stripe *= 1 - cov(np.abs(yy - y) - hgt / 2)
    mm = (m * stripe)[..., None]
    px = px * (1 - mm) + suncol * mm
    # 바닥
    floor = cov(hz - yy) * 0 + cov(-(yy - hz))
    tf = np.clip((yy - hz) / (H - hz), 0, 1)[..., None]
    fcol = hex_lin('#2A0F52') * (1 - tf) + hex_lin('#07051A') * tf
    px = px * (1 - floor[..., None]) + fcol * floor[..., None]
    # 원근 격자
    gl = np.zeros((H, W))
    for i in range(1, 13):
        y = hz + (i / 12) ** 2.1 * (H - hz)
        gl = np.maximum(gl, cov(np.abs(yy - y) - 1.3))
    for k in range(-14, 15):
        xb = W / 2 + k * 160
        # 소실점(540,hz)에서 (xb, H)로 가는 선
        dx, dy = xb - W / 2, H - hz
        dist = np.abs((xx - W / 2) * dy - (yy - hz) * dx) / np.hypot(dx, dy)
        gl = np.maximum(gl, cov(dist - 1.3))
    px = paint(px, gl * floor, '#4FE3FF', 0.55)
    px = px + (np.exp(-np.abs(yy - hz) / 26) * (yy > hz - 2))[..., None] * hex_lin('#FF6BD0') * 0.5
    px = paint(px, cov(np.abs(yy - hz) - 1.5), '#FFD2F4', 0.9)
    return finishing(px)

# ---------- 3. 벚꽃 ----------
def petals():
    px = sky('#0C1A38', '#26407A', '#5A5E9C', glow=(W * 0.2, H * 0.18, 620, '#FFB4D0', 0.22))
    rng = np.random.default_rng(8)
    # 보케
    for _ in range(14):
        x, y, r = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(70, 190)
        col = rng.choice(['#FFB3CF', '#FFD0B8', '#C9B2FF'])
        px = px + (cov((np.hypot(xx - x, yy - y) - r) / 22 * 2) * 0.05)[..., None] * hex_lin(col)
    def petal(px, x, y, s, rot, col, a):
        x0, x1, y0, y1 = x - 60 * s, x + 60 * s, y - 60 * s, y + 60 * s
        def sd(X, Y):
            c, sn = np.cos(rot), np.sin(rot)
            u, v = ((X - x) * c + (Y - y) * sn) / (26 * s), (-(X - x) * sn + (Y - y) * c) / (15 * s)
            u = u * (1 + 0.22 * np.clip(v, -1, 1) * 0)   # 타원
            r = np.hypot(u, v)
            notch = np.exp(-((u - 1.0) / 0.18) ** 2) * (np.abs(v) < 0.3) * 0.5
            return (r - 1 + notch) * 12 * s
        win_paint(px, x0, x1, y0, y1, sd, col, a)
    for i in range(130):
        x, y = rng.uniform(-30, W + 30), rng.uniform(-30, H)
        depth = rng.uniform(0.5, 1.6)
        edge = 1 - 0.55 * np.exp(-((x - W / 2) / 260) ** 2) * np.exp(-((y - 1000) / 600) ** 2)
        petal(px, x, y, depth, rng.uniform(0, 6.28), rng.choice(['#FFC2D8', '#FFD9E6', '#FFAFCB', '#FFE6EE']),
              float(rng.uniform(0.55, 0.95) * edge * min(1, depth)))
    return finishing(px)

# ---------- 4. 메추리알 패턴 ----------
def sparkle(px, x, y, r, col, a):
    def sd(X, Y):
        return (np.sqrt(np.abs(X - x) / r + 1e-9) + np.sqrt(np.abs(Y - y) / r + 1e-9) - 1.0) * r * 0.45
    win_paint(px, x - r * 1.2, x + r * 1.2, y - r * 1.2, y + r * 1.2, sd, col, a)

def egg_w(px, cx, cy, s, rot, body, speck, a, seed):
    x0, x1, y0, y1 = cx - 90 * s, cx + 90 * s, cy - 90 * s, cy + 90 * s
    def sd_egg(X, Y):
        c, sn = np.cos(rot), np.sin(rot)
        u, v = ((X - cx) * c + (Y - cy) * sn), (-(X - cx) * sn + (Y - cy) * c)
        wv = 46 * s * (1 - 0.14 * np.clip(-v / (60 * s), 0, 1))
        return (np.hypot(u / wv, v / (60 * s)) - 1) * 46 * s
    win_paint(px, x0, x1, y0, y1, sd_egg, body, a)
    rng = np.random.default_rng(seed)
    for _ in range(12):
        t = rng.uniform(0, 6.28); r = rng.uniform(0, 34) * s
        lx, ly = r * np.cos(t), r * np.sin(t) * 1.2
        c, sn = np.cos(rot), np.sin(rot)
        px_, py_ = cx + lx * c - ly * sn, cy + lx * sn + ly * c
        rr = rng.uniform(3.5, 7) * s
        def sd_sp(X, Y, px_=px_, py_=py_, rr=rr):
            return np.maximum(np.hypot(X - px_, Y - py_) - rr, sd_egg(X, Y) + 4 * s)
        win_paint(px, px_ - 12 * s, px_ + 12 * s, py_ - 12 * s, py_ + 12 * s, sd_sp, speck, a * 0.9)

def pattern():
    px = sky('#0F3B36', '#14504A', '#0B2B2A')
    rng = np.random.default_rng(14)
    pts = []
    tries = 0
    while len(pts) < 46 and tries < 4000:
        tries += 1
        x, y, s = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(0.7, 1.5)
        if all(np.hypot(x - a, y - b) > 120 * (s + t) / 1.4 for a, b, t in pts):
            pts.append((x, y, s))
    palette = [('#FBF1DD', '#8B5E3C'), ('#BFE3F4', '#33607A'), ('#FFD3DE', '#9A4A62'), ('#F4D9A8', '#7A4E34'), ('#D4F0CF', '#3F7A4E')]
    for i, (x, y, s) in enumerate(pts):
        body, speck = palette[i % len(palette)]
        edge = 1 - 0.78 * np.exp(-((x - W / 2) / 300) ** 2) * np.exp(-((y - 1000) / 640) ** 2)
        egg_w(px, x, y, s, rng.uniform(-0.7, 0.7), body, speck, float(edge), 100 + i)
    for _ in range(40):
        x, y, r = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(10, 26)
        edge = 1 - 0.7 * np.exp(-((x - W / 2) / 300) ** 2) * np.exp(-((y - 1000) / 640) ** 2)
        sparkle(px, x, y, r, '#FFF4C6', float(0.8 * edge))
    return finishing(px)

if __name__ == '__main__':
    sheet, sheet_r = [], []
    for name, fn in (('city', city), ('synth', synth), ('petals', petals), ('eggs', pattern)):
        px = fn()
        img = g.finish(px, 13); g.write_png(f'out6/{name}.png', img)
        rp = g.route_overlay(px); imr = g.finish(rp, 13); g.write_png(f'out6/{name}-route.png', imr)
        sheet.append(img[::2, ::2]); sheet_r.append(imr[::2, ::2]); print('ok', name, flush=True)
    gap = np.full((H // 2, 12, 3), 20, dtype=np.uint8)
    for nm, imgs in (('sheet', sheet), ('sheet-route', sheet_r)):
        row = imgs[0]
        for im in imgs[1:]: row = np.concatenate([row, gap, im], axis=1)
        g.write_png(f'out6/{nm}.png', row)
