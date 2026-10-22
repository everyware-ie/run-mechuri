import sys
import numpy as np
from PIL import Image
import gen_photo as gp
import gen_new_bg as g
from gen_photo import *   # noqa
from gen_photo import lin, mix, fbm, ridge1d, clouds, photo_finish, misty_mountains, paint_arr
from gen_illust import cov, sky, circle
from gen_new_bg import W, H, xx, yy, smoothstep

def segd(p0, p1):
    (x0, y0), (x1, y1) = p0, p1
    dx, dy = x1 - x0, y1 - y0
    t = np.clip(((xx - x0) * dx + (yy - y0) * dy) / (dx * dx + dy * dy + 1e-9), 0, 1)
    return np.hypot(xx - (x0 + t * dx), yy - (y0 + t * dy))

def runner(px, cx, cy, s, col='#2A2447', a=0.92):
    """달리는 사람 실루엣. (cx,cy)는 허리 근처, s는 키(px)."""
    u = s / 10.0
    P = lambda x, y: (cx + x * u, cy + y * u)
    d = np.full((H, W), 1e9)
    def cap(p0, p1, r): return segd(P(*p0), P(*p1)) - r * u
    parts = [((0.6, -4.0), (-0.6, 0.0), 0.95),                      # torso
             ((1.9, -3.1), (3.4, -1.7), 0.5), ((3.4, -1.7), (4.2, -3.1), 0.45),   # front arm
             ((-0.3, -3.2), (-2.1, -2.2), 0.5), ((-2.1, -2.2), (-3.4, -3.4), 0.45), # back arm
             ((-0.6, 0.0), (1.9, 1.6), 0.7), ((1.9, 1.6), (1.3, 4.1), 0.55), ((1.3, 4.1), (2.4, 4.4), 0.4),  # front leg
             ((-0.6, 0.0), (-2.7, 1.9), 0.7), ((-2.7, 1.9), (-5.0, 3.0), 0.55), ((-5.0, 3.0), (-5.6, 2.2), 0.4)]  # back leg
    for p0, p1, r in parts: d = np.minimum(d, cap(p0, p1, r))
    d = np.minimum(d, np.hypot(xx - P(1.3, -5.4)[0], yy - P(1.3, -5.4)[1]) - 1.05 * u)
    return paint_arr(px, cov(d)*a, lin(col)[None, None, :])

def trail(px, hz, vx, wb, sway, c_top, c_bot, edge=None, ph=0.0, bend=1.0):
    """지평선(hz)의 소실점에서 아래로 넓어지는 길. 구불구불."""
    t = np.clip((yy - hz) / (H - hz), 0, 1)
    cx = vx + sway * np.sin(t * 3.2 * bend + ph) * t ** 0.8 * 1.0
    half = 4 + wb * t ** 1.25
    d = np.abs(xx - cx) - half
    below = (yy > hz).astype(float)
    col = mix(lin(c_top)[None, None, :], lin(c_bot)[None, None, :], t[..., None])
    col = col * (0.93 + 0.14 * fbm(7, 2.4)[..., None])
    m = cov(d) * below
    if edge:
        rim = np.exp(-np.abs(d) / (3 + 10 * t)) * below * 0.5
        px = paint_arr(px, rim, lin(edge)[None, None, :])
    return paint_arr(px, m, col), cx, half, t

def grass(px, hz, c_far, c_near, seed):
    t = np.clip((yy - hz) / (H - hz), 0, 1)[..., None]
    c = mix(lin(c_far)[None, None, :], lin(c_near)[None, None, :], t) * (0.9 + 0.2 * fbm(seed, 2.3)[..., None])
    return paint_arr(px, cov(-(yy - hz)), c)

def tree_row(px, hz, vx, cx_fn, side, n, col, h0, w0, seed, haze=None):
    rng = np.random.default_rng(seed)
    for i in range(n):
        t = ((i + 1) / n) ** 1.9
        y = hz + (H - hz) * t * 0.98
        x = cx_fn(y) + side * (60 + 380 * t + rng.uniform(0, 40) * t)
        h = h0 * (0.12 + t * 1.5); w = w0 * (0.12 + t * 1.2)
        c = mix(lin(col)[None, None, :], lin(haze)[None, None, :], (1 - t) * 0.75) if haze else lin(col)[None, None, :]
        d = np.minimum(np.hypot((xx - x) / w, (yy - (y - h * 0.95)) / (h * 0.55)) - 1, 9) * min(w, h * 0.55)
        px = paint_arr(px, cov(d), c)
        px = paint_arr(px, cov(np.maximum(np.abs(xx - x) - w * 0.07, np.abs(yy - (y - h * 0.2)) - h * 0.2)), c * 0.8)
    return px

# 1 새벽 강변 러닝길
def river_dawn():
    hz = 1020
    px = sky('#8FA9D6', '#EBC7D2', '#FFE4C8', glow=(W * 0.4, hz - 40, 800, '#FFEBCF', 0.6))
    px = clouds(px, 3, 0.52, 0.22, '#FFF2E8', '#B3BCD6', 0.5, bias=-0.25 * yy / H)
    px = misty_mountains(px, '#EFDCD4', [(hz + 5, 300, '#9AA6C6', 0.4), (hz + 5, 190, '#7E8EB4', 0.22)], 11)
    t = np.clip((yy - hz) / (H - hz), 0, 1)[..., None]
    wat = mix(lin('#F1CBC6')[None, None, :], lin('#5F7FAE')[None, None, :], np.clip(t * 2.2, 0, 1)) * (0.88 + 0.26 * fbm(33, 2.6, aniso=(9.0, 1.0))[..., None])
    px = paint_arr(px, cov(-(yy - hz)), wat)
    px = px + (np.exp(-((xx - W * 0.4) / (80 + np.clip(yy - hz, 0, None) * 0.5)) ** 2) * np.exp(-np.clip(yy - hz, 0, None) / 500) * (yy > hz))[..., None] * lin('#FFEBD0') * 0.7
    # 강변 둑 + 길
    bank = 1500 + 40 * np.sin(xx[0] / W * 6)
    px = paint_arr(px, cov(-(yy - bank[None, :])), (mix(lin('#A9C99A')[None, None, :], lin('#5E8F6E')[None, None, :], np.clip((yy - 1500) / 420, 0, 1)[..., None])) * (0.9 + 0.2 * fbm(5, 2.3)[..., None]))
    px, cx, half, t = trail(px, 1500, W * 0.5, 620, 260, '#EFD5C2', '#D9B8A4', edge='#F8E6D8', ph=0.6)
    px = runner(px, 205, 1560, 260, '#4B4B7A', 0.9) if False else px
    return photo_finish(px, seed=1)

# 2 노을 해안 도로
def coast_road():
    hz = 1000
    px = sky('#5E6DB0', '#E39AA6', '#FFC98A', glow=(W * 0.6, hz - 30, 800, '#FFE0A8', 0.7))
    px = clouds(px, 21, 0.52, 0.2, '#FFD9B5', '#7E6AA6', 0.8, bias=-0.1 * yy / H)
    t = np.clip((yy - hz) / (H - hz), 0, 1)[..., None]
    sea = mix(lin('#F2B189')[None, None, :], lin('#3F4F8A')[None, None, :], np.clip(t * 2.0, 0, 1)) * (0.88 + 0.26 * fbm(33, 2.6, aniso=(9.0, 1.0))[..., None])
    px = paint_arr(px, cov(-(yy - hz)), sea)
    px = px + (np.exp(-((xx - W * 0.6) / (70 + np.clip(yy - hz, 0, None) * 0.4)) ** 2) * np.exp(-np.clip(yy - hz, 0, None) / 420) * (yy > hz))[..., None] * lin('#FFE4B0') * 0.8
    # 곶(헤드랜드)
    r = ridge1d(9) * 120
    cape = hz + 8 - (160 * np.exp(-((xx[0] - W * 0.12) / 330) ** 2) + r * np.exp(-((xx[0] - W * 0.12) / 400) ** 2))
    px = paint_arr(px, cov(-(yy - cape[None, :])), lin('#8E7AA8')[None, None, :])
    # 절벽 위 길(오른쪽 아래에서 곡선으로 올라간다)
    land = 1500 + 60 * np.sin(xx[0] / W * 3 + 1)
    px = paint_arr(px, cov(-(yy - land[None, :])), mix(lin('#C9A0A0')[None, None, :], lin('#8C6C86')[None, None, :], np.clip((yy - 1500) / 420, 0, 1)[..., None]))
    px, cx, half, t = trail(px, 1500, W * 0.4, 560, 260, '#F6D3B8', '#E9C0A4', edge='#FFE9D0', ph=2.2, bend=0.9)
    return photo_finish(px, seed=2)

# 3 새벽 트랙
def track():
    hz = 1000
    px = sky('#9DB4E0', '#F3C7D6', '#FFE6CC', glow=(W * 0.65, hz - 10, 800, '#FFF0D4', 0.55))
    px = clouds(px, 41, 0.5, 0.22, '#FFF5EC', '#BCA8CC', 0.6, bias=-0.2 * yy / H)
    # 멀리 나무 띠
    r = ridge1d(4)
    far = hz - 40 - 40 * r
    px = paint_arr(px, cov(-(yy - far[None, :])), lin('#A6B8C2')[None, None, :] * 1.0)
    px = grass(px, hz, '#BFDDB4', '#6FA37C', 12)
    t = np.clip((yy - hz) / (H - hz), 0, 1)
    vx = W * 0.5
    # 트랙 바닥(테라코타 파스텔)
    cxs = vx + 140 * np.sin(t * 2.6 + 0.5) * t
    half = 6 + 760 * t ** 1.2
    m = cov(np.abs(xx - cxs) - half) * (yy > hz)
    col = mix(lin('#EFA48E')[None, None, :], lin('#D9806F')[None, None, :], t[..., None]) * (0.95 + 0.1 * fbm(8, 2.3)[..., None])
    px = paint_arr(px, m, col)
    for k in range(-3, 4):
        lx = cxs + k * (half / 3.2)
        wd = 2 + 9 * t
        px = paint_arr(px, cov(np.abs(xx - lx) - wd) * (yy > hz) * (np.abs(k * half / 3.2) < half), lin('#FFF6EE')[None, None, :], ) if False else paint_arr(px, cov(np.abs(xx - lx) - wd) * (yy > hz) * (np.abs(k) * half / 3.2 < half * 0.98), lin('#FFF6EE')[None, None, :])
    return photo_finish(px, seed=3)

# 4 파스텔 언덕 구불길
def hills_trail():
    px = sky('#C9C2F2', '#F7C9DC', '#FFE6C9', glow=(W * 0.3, 1000, 700, '#FFF6E0', 0.5))
    px = paint_arr(px, cov(circle(W * 0.3, 960, 120)), lin('#FFF3DA')[None, None, :])
    px = clouds(px, 91, 0.60, 0.25, '#FFFFFF', '#E8C6E8', 0.55, bias=-0.3 * yy / H, beta=3.8)
    cols = [('#F5B8C4', '#FBD5D0'), ('#BFE0D0', '#E0F2E0'), ('#B3AEE6', '#D6D0F5')]
    rows = []
    for i, (base, amp, f, ph) in enumerate([(1180, 60, 0.9, 0.4), (1320, 70, 1.1, 2.0), (1460, 70, 0.8, 3.7)]):
        row = base + amp * np.sin(f * 2 * np.pi * xx[0] / W + ph) + amp * 0.4 * np.sin(2.7 * f * 2 * np.pi * xx[0] / W + ph)
        d = yy - row[None, :]
        c = mix(lin(cols[i][1])[None, None, :], lin(cols[i][0])[None, None, :], smoothstep(0, 260, d)[..., None])
        px = paint_arr(px, cov(-d), c)
    # 마지막 큰 언덕에 올라가는 길
    row = 1560 + 50 * np.sin(1.0 * 2 * np.pi * xx[0] / W + 1.1)
    d = yy - row[None, :]
    px = paint_arr(px, cov(-d), mix(lin('#CFEBC8')[None, None, :], lin('#7FBF9A')[None, None, :], smoothstep(0, 360, d)[..., None]) * (0.9 + 0.2 * fbm(31, 2.2)[..., None]))
    px, cx, half, t = trail(px, 1560, W * 0.62, 520, 250, '#FFF3E0', '#F7E2C8', edge='#FFFFFF', ph=-0.4)
    return photo_finish(px, grain=0.03, vig=0.12, seed=4)

# 5 일출 다리
def bridge():
    hz = 1020
    px = sky('#7C8FCC', '#F2A8B8', '#FFD29A', glow=(W * 0.5, hz - 20, 700, '#FFE8B8', 0.8))
    px = clouds(px, 51, 0.54, 0.2, '#FFE2C4', '#8C7AB2', 0.7, bias=-0.1 * yy / H, aniso=(2.0, 1.0))
    px = paint_arr(px, cov(circle(W * 0.5, hz - 18, 90)), lin('#FFF6DA')[None, None, :])
    t = np.clip((yy - hz) / (H - hz), 0, 1)
    wat = mix(lin('#F5BFA0')[None, None, :], lin('#566C9E')[None, None, :], np.clip(t[..., None] * 2.5, 0, 1)) * (0.9 + 0.2 * fbm(33, 2.6, aniso=(9.0, 1.0))[..., None])
    px = paint_arr(px, cov(-(yy - hz)), wat)
    px = px + (np.exp(-((xx - W * 0.5) / (60 + np.clip(yy - hz, 0, None) * 0.3)) ** 2) * np.exp(-np.clip(yy - hz, 0, None) / 450) * (yy > hz))[..., None] * lin('#FFEFC0') * 0.7
    # 다리 상판
    vx = W * 0.5
    hw = 8 + 520 * t ** 1.15
    px = paint_arr(px, cov(np.abs(xx - vx) - hw) * (yy > hz + 120), mix(lin('#D9B9B4')[None, None, :], lin('#9E8196')[None, None, :], t[..., None]))
    for sgn in (-1, 1):
        edge = vx + sgn * hw
        px = paint_arr(px, cov(np.abs(xx - edge) - (2 + 7 * t)) * (yy > hz + 120), lin('#FFF1E4')[None, None, :])
        for k in range(26):
            tt = (k / 26) ** 1.7
            y = hz + 120 + (H - hz - 120) * tt
            tk = (y - hz) / (H - hz); x = vx + sgn * (8 + 520 * tk ** 1.15)
            ph = 18 + 190 * tk
            px = paint_arr(px, cov(np.maximum(np.abs(xx - x) - (1.5 + 4 * tk), np.abs(yy - (y - ph / 2)) - ph / 2)), lin('#F7DCCB')[None, None, :], )
    px = px + (np.exp(-np.abs(xx - vx) / (30 + 400 * t)) * np.exp(-np.clip(yy - hz, 0, None) / 700) * (yy > hz + 120) * 0.35)[..., None] * lin('#FFE6C0')
    return photo_finish(px, seed=5)

# 6 아침 숲길
def forest_path():
    px = sky('#CFE8B0', '#8FC48A', '#4F8A66')
    f = fbm(41, 3.4)
    px = px * (0.85 + 0.4 * f[..., None])
    rng = np.random.default_rng(43)
    for _ in range(55):
        x, y, r = rng.uniform(-50, W + 50), rng.uniform(0, 1300), rng.uniform(40, 150)
        col = rng.choice(['#FFF6C8', '#EAF7A8', '#FFFFFF', '#CDE88A']); a = rng.uniform(0.05, 0.13)
        x0, x1, y0, y1 = int(max(x - r - 6, 0)), int(min(x + r + 6, W)), int(max(y - r - 6, 0)), int(min(y + r + 6, H))
        if x1 <= x0 or y1 <= y0: continue
        d = np.hypot(xx[y0:y1, x0:x1] - x, yy[y0:y1, x0:x1] - y)
        m = (cov((d - r) / 6) * (0.65 + 0.35 * d / r))[..., None] * a
        px[y0:y1, x0:x1] = px[y0:y1, x0:x1] * (1 - m) + lin(col) * m * 1.6
    u = (xx + 0.55 * yy) / 190.0
    rays = (0.5 + 0.5 * np.sin(u * 2 + 3 * fbm(44, 2.0))) ** 2
    px = px + (rays * np.exp(-yy / 1200) * np.exp(-((xx - W * 0.85) / 900) ** 2))[..., None] * lin('#FFF6C8') * 0.3
    hz = 900
    px = grass(px, hz + 200, '#9AC98A', '#4F8A5E', 12) if False else px
    px, cx, half, t = trail(px, hz, W * 0.5, 760, 220, '#F3E3B8', '#E5CA94', edge='#FFF6D8', ph=1.4)
    return photo_finish(px, grain=0.035, seed=6)

# 7 노을 언덕 위의 러너
def runner_hill():
    px = sky('#5A6BB4', '#E58CA0', '#FFC080', glow=(W * 0.55, 1150, 850, '#FFE0A0', 0.7))
    px = clouds(px, 21, 0.58, 0.30, '#FFD9B5', '#9A84B4', 0.5, beta=3.8)
    for base, amp, c0, c1, ph, f in [(1380, 90, '#9A6C9C', '#7A5488', 0.4, 0.9), (1560, 120, '#5C4478', '#3E2F5C', 2.0, 0.7)]:
        row = base + amp * np.sin(f * 2 * np.pi * xx[0] / W + ph) + amp * 0.3 * np.sin(2.9 * f * 2 * np.pi * xx[0] / W + ph)
        d = yy - row[None, :]
        px = paint_arr(px, cov(-d), mix(lin(c0)[None, None, :], lin(c1)[None, None, :], smoothstep(0, 400, d)[..., None]))
    # 앞 언덕 정상에 러너
    row = 1680 + 100 * np.sin(0.8 * 2 * np.pi * xx[0] / W + 3.0)
    d = yy - row[None, :]
    px = paint_arr(px, cov(-d), lin('#2C2148')[None, None, :])
    top = float(row[int(W * 0.2)])
    px = runner(px, W * 0.2, top - 160, 250, '#1E1738', 0.95)
    return photo_finish(px, seed=7)

# 8 새벽 수변 스카이라인
def skyline():
    hz = 1000
    px = sky('#7D93D0', '#E9B9D2', '#FFE0C8', glow=(W * 0.5, hz - 20, 800, '#FFEDD2', 0.6))
    px = clouds(px, 3, 0.52, 0.22, '#FFF2E8', '#B3BCD6', 0.5, bias=-0.25 * yy / H)
    rng = np.random.default_rng(77)
    x = -20
    while x < W + 20:
        w = rng.uniform(30, 80); h = rng.uniform(60, 300) * (1.5 if rng.random() < 0.15 else 1.0)
        c = mix(lin('#9AA0C8')[None, None, :], lin('#F0DCDC')[None, None, :], 0.45 + 0.3 * rng.random())
        px = paint_arr(px, cov(np.maximum(np.abs(xx - (x + w / 2)) - w / 2, np.abs(yy - (hz - h / 2)) - h / 2)), c)
        x += w + rng.uniform(0, 18)
    t = np.clip((yy - hz) / (H - hz), 0, 1)[..., None]
    ys = np.arange(H); src = np.clip(2 * hz - ys, 0, H - 1)
    wob = (fbm(63, 2.6, aniso=(8.0, 1.0))[:, 0] - 0.5)
    shift = (np.sin(ys / 9.0) * 4 + wob * 26) * (1 + (ys - hz) / 500.0)
    cols = np.clip((np.arange(W)[None, :] + shift[:, None]).astype(int), 0, W - 1)
    refl = mix(px[src[:, None], cols], lin('#5A7FB0')[None, None, :], 0.4) * (0.92 - 0.2 * t)
    px = paint_arr(px, cov(-(yy - hz)), refl * (0.93 + 0.14 * fbm(64, 2.6, aniso=(10.0, 1.0))[..., None]))
    bank = 1450 + 30 * np.sin(xx[0] / W * 5)
    px = paint_arr(px, cov(-(yy - bank[None, :])), mix(lin('#9FC49A')[None, None, :], lin('#5C8C6C')[None, None, :], np.clip((yy - 1450) / 470, 0, 1)[..., None]))
    px, cx, half, t2 = trail(px, 1450, W * 0.5, 640, 200, '#EBD2C0', '#D6B8A6', edge='#FAE8DA', ph=0.2)
    return photo_finish(px, seed=8)

# 9 가로수길
def avenue():
    hz = 980
    px = sky('#A9C0EA', '#F5CFD6', '#FFEBD2', glow=(W * 0.5, hz - 30, 700, '#FFF6E0', 0.8))
    px = clouds(px, 91, 0.58, 0.25, '#FFFFFF', '#E8C6E8', 0.45, bias=-0.3 * yy / H, beta=3.8)
    px = grass(px, hz, '#CFE4B8', '#7FB08A', 15)
    px, cx, half, t = trail(px, hz, W * 0.5, 700, 150, '#F7E8D8', '#E8CDB6', edge='#FFFFFF', ph=0.8)
    fn = lambda y: float(W * 0.5 + 150 * np.sin(((y - hz) / (H - hz)) * 3.2 + 0.8) * ((y - hz) / (H - hz)) ** 0.8)
    for side, seed in ((-1, 3), (1, 4)):
        px = tree_row(px, hz, W * 0.5, fn, side, 12, '#6FA580', 380, 85, seed, haze='#EEF0E0')
    px = px + (np.exp(-((xx - W * 0.5) / 260) ** 2) * np.exp(-np.abs(yy - hz) / 160))[..., None] * lin('#FFF2D0') * 0.5
    return photo_finish(px, grain=0.03, vig=0.14, seed=9)

LIST = [('river-dawn', river_dawn), ('coast-road', coast_road), ('track', track), ('hills-trail', hills_trail),
        ('bridge', bridge), ('forest-path', forest_path), ('runner-hill', runner_hill), ('skyline', skyline), ('avenue', avenue)]

if __name__ == '__main__':
    import os
    os.makedirs('outr', exist_ok=True)
    plain, routed = [], []
    for name, fn in LIST:
        try: px = fn()
        except Exception:
            import traceback; traceback.print_exc(); print('FAIL', name); continue
        img = g.finish(px, 23); g.write_png(f'outr/{name}.png', img)
        imr = g.finish(g.route_overlay(px), 23); g.write_png(f'outr/{name}-route.png', imr)
        plain.append(img[::4, ::4]); routed.append(imr[::4, ::4]); print('ok', name, flush=True)
    for nm, tiles in (('all', plain), ('all-route', routed)):
        tiles = tiles + [np.full_like(tiles[0], 20)] * (9 - len(tiles))
        gv = np.full((H // 4, 8, 3), 20, np.uint8)
        rows = []
        for r in range(3):
            row = tiles[r * 3]
            for tt in tiles[r * 3 + 1:r * 3 + 3]: row = np.concatenate([row, gv, tt], axis=1)
            rows.append(row)
        gh = np.full((8, rows[0].shape[1], 3), 20, np.uint8)
        img = rows[0]
        for r in rows[1:]: img = np.concatenate([img, gh, r], axis=0)
        g.write_png(f'outr/{nm}.png', np.ascontiguousarray(img))
