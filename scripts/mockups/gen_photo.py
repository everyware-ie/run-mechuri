import sys
sys.argv = ['x', 'out10']
import numpy as np
import gen_new_bg as g
import gen_illust as il
from gen_illust import cov, paint, sky, circle
from gen_new_bg import W, H, xx, yy, hex_lin, smoothstep
from gen_more import win_paint

lin = hex_lin
def mix(a, b, t): return a * (1 - t) + b * t
def flat(c): return np.broadcast_to(lin(c), (H, W, 3)).copy()

def fbm(seed, beta=2.2, aniso=(1.0, 1.0)):
    rng = np.random.default_rng(seed)
    n = rng.standard_normal((H, W))
    fy = np.fft.fftfreq(H)[:, None] * H * aniso[1]
    fx = np.fft.fftfreq(W)[None, :] * W * aniso[0]
    k = np.hypot(fx, fy); k[0, 0] = 1
    filt = k ** (-beta / 2); filt[0, 0] = 0
    f = np.real(np.fft.ifft2(np.fft.fft2(n) * filt))
    lo, hi = np.percentile(f, 1), np.percentile(f, 99)
    return np.clip((f - lo) / (hi - lo), 0, 1)

def ridge1d(seed, beta=3.0):
    rng = np.random.default_rng(seed)
    n = rng.standard_normal(W)
    k = np.abs(np.fft.fftfreq(W) * W); k[0] = 1
    f = np.real(np.fft.ifft(np.fft.fft(n) * k ** (-beta / 2) * (k > 0)))
    f = f - f.min(); return f / f.max()

def clouds(px, seed, thr, soft, light, shadow, a=1.0, beta=3.6, bias=None, aniso=(1.0, 1.0)):
    f = fbm(seed, beta, aniso)
    if bias is not None: f = f + bias
    dens = smoothstep(thr, thr + soft, f)
    lit = np.clip(0.55 + 9.0 * (f - np.roll(f, -22, axis=0)), 0, 1)
    col = mix(lin(shadow), lin(light), lit[..., None])
    m = (dens * a)[..., None]
    return px * (1 - m) + col * m

def photo_finish(px, grain=0.035, vig=0.22, seed=0):
    rng = np.random.default_rng(seed)
    v = 1 - vig * smoothstep(0.35, 1.05, np.hypot((xx / W - .5) * 1.1, (yy / H - .5) * .95) * 1.5)
    px = px * v[..., None]
    gr = rng.standard_normal((H, W, 1)) * grain
    return px * (1 + gr * (0.4 + px.mean(axis=2, keepdims=True) ** 0.5))

def misty_mountains(px, haze, specs, seed0):
    for i, (base, amp, col, hz_mix) in enumerate(specs):
        r = ridge1d(seed0 + i)
        row = base - amp * r
        d = yy - row[None, :]
        tex = fbm(seed0 + 40 + i, 3.2)
        c = mix(lin(col)[None, None, :] * (0.88 + 0.24 * tex[..., None]), lin(haze)[None, None, :], np.clip(smoothstep(0, 520, d) * 0.9 + hz_mix, 0, 1)[..., None])
        px = paint_arr(px, cov(-d), c)
        band = np.exp(-np.abs(yy - (base + 40)) / 150) * 0.28
        px = mix(px, lin(haze), band[..., None])
    return px

def paint_arr(px, m, col):
    m = m[..., None]
    return px * (1 - m) + col * m

# 1 안개 낀 산 능선
def misty():
    px = sky('#7F9CC4', '#C9CFE0', '#F6DCC8', glow=(W * 0.35, 1000, 700, '#FFE6C8', 0.45))
    px = clouds(px, 3, 0.52, 0.22, '#FFF2E8', '#B3BCD6', 0.55, bias=-0.25 * yy / H)
    px = misty_mountains(px, '#E9D9D0', [(1080, 330, '#8C9BBA', 0.45), (1250, 300, '#7A8BAE', 0.32),
                                          (1450, 280, '#5F7498', 0.2), (1680, 250, '#42587C', 0.08), (1860, 190, '#2E3F5E', 0.0)], 11)
    return photo_finish(px, seed=1)

# 2 구름 가득한 노을
def sunset():
    px = sky('#3C4A86', '#C4739A', '#FFB77A', glow=(W * 0.55, 1250, 800, '#FFD7A0', 0.60))
    px = clouds(px, 21, 0.50, 0.20, '#FFD4A8', '#6A5A9A', 0.95, bias=0.0)
    px = clouds(px, 22, 0.60, 0.18, '#FFE6C8', '#7C6AA8', 0.80, beta=3.0)
    land = ridge1d(5) * 70 + 1790
    d = yy - land[None, :]
    px = paint_arr(px, cov(-d), lin('#2B2146')[None, None, :])
    return photo_finish(px, seed=2)

# 3 바다 수평선 새벽
def sea():
    hz = 1050
    px = sky('#8FB0D8', '#E8C9CF', '#FFE3C4', glow=(W * 0.62, hz - 30, 700, '#FFF1D6', 0.6))
    px = clouds(px, 31, 0.50, 0.2, '#FFF1E6', '#B9A8C4', 0.65, bias=-0.2 * yy / H, aniso=(0.5, 1.0))
    # 바다
    t = np.clip((yy - hz) / (H - hz), 0, 1)[..., None]
    sea_c = mix(lin('#E7B9A8')[None, None, :], lin('#3C5F86')[None, None, :], np.clip(t * 1.6, 0, 1))
    rip = fbm(33, 2.6, aniso=(9.0, 1.0))
    sea_c = sea_c * (0.86 + 0.28 * rip[..., None])
    glint = np.exp(-((xx - W * 0.62) / (60 + (yy - hz) * 0.35)) ** 2) * np.clip(rip - 0.4, 0, 1) * 2.4 * np.exp(-(yy - hz) / 700)
    sea_c = sea_c + glint[..., None] * lin('#FFF1D6')
    m = cov(-(yy - hz))
    px = paint_arr(px, m, sea_c)
    px = px + (np.exp(-np.abs(yy - hz) / 5) * 0.25 * (yy > hz - 3))[..., None] * lin('#FFF4DC')
    return photo_finish(px, seed=3)

# 4 숲 속 햇살(보케)
def forest():
    px = sky('#2E5B3C', '#3E7A4A', '#1E3B2A')
    f = fbm(41, 3.4)
    px = px * (0.8 + 0.5 * f[..., None])
    rng = np.random.default_rng(43)
    for _ in range(70):
        x, y, r = rng.uniform(-50, W + 50), rng.uniform(0, H), rng.uniform(40, 170)
        col = rng.choice(['#F4F0A0', '#CDE88A', '#FFF6C8', '#9BD07A'])
        a = rng.uniform(0.04, 0.12)
        x0, x1, y0, y1 = int(max(x - r - 6, 0)), int(min(x + r + 6, W)), int(max(y - r - 6, 0)), int(min(y + r + 6, H))
        if x1 <= x0 or y1 <= y0: continue
        d = np.hypot(xx[y0:y1, x0:x1] - x, yy[y0:y1, x0:x1] - y)
        m = (cov((d - r) / 6) * (0.65 + 0.35 * d / r))[..., None] * a
        px[y0:y1, x0:x1] = px[y0:y1, x0:x1] * (1 - m) + lin(col) * m * 1.5
    # 햇살 줄기
    u = (xx + 0.55 * yy) / 190.0
    rays = (0.5 + 0.5 * np.sin(u * 2 + 3 * fbm(44, 2.0))) ** 2
    px = px + (rays * np.exp(-yy / 1100) * np.exp(-((xx - W * 0.9) / 900) ** 2))[..., None] * lin('#FFF3B8') * 0.22
    return photo_finish(px, grain=0.04, seed=4)

# 5 모래 언덕
def dunes():
    px = sky('#9CB7D6', '#E8D2C6', '#F8E0C4', glow=(W * 0.2, 760, 600, '#FFF0D6', 0.4))
    px = clouds(px, 51, 0.62, 0.2, '#FFF6EC', '#C9B7C8', 0.5, bias=-0.3 * yy / H, aniso=(2.0, 1.0))
    layers = [(1100, 150, 0.5, 0.3, '#EFC9A0', '#B98A74'), (1320, 200, 0.7, 2.0, '#E9B98A', '#A8756A'),
              (1560, 230, 0.6, 4.0, '#E2A878', '#8F5F5E'), (1790, 190, 0.8, 1.0, '#D99868', '#7A4C52')]
    for base, amp, f, ph, lit_c, sh_c in layers:
        row = base + amp * (np.sin(f * 2 * np.pi * xx[0] / W + ph) * 0.5 + 0.25 * np.sin(2.3 * f * 2 * np.pi * xx[0] / W + ph * 1.7))
        d = yy - row[None, :]
        slope = np.gradient(row)[None, :]
        face = 0.5 + 0.5 * np.tanh(-slope * 0.9)          # 왼쪽 면은 빛, 오른쪽 면은 그림자
        face = np.broadcast_to(face, (H, W))
        col = mix(lin(sh_c)[None, None, :], lin(lit_c)[None, None, :], face[..., None])
        rip = 0.5 + 0.5 * np.sin((yy + 0.35 * xx) / 7.0 + fbm(52, 2.4) * 9)
        col = col * (0.94 + 0.10 * rip[..., None] * np.exp(-np.clip(d, 0, None) / 400)[..., None])
        px = paint_arr(px, cov(-d), col)
        px = mix(px, lin('#F3D9C4'), (np.exp(-np.clip(-d, 0, None) / 120) * (d < 0) * 0.12)[..., None])
    return photo_finish(px, seed=5)

# 6 호수에 비친 산
def lake():
    hz = 1080
    px = sky('#8DB1D9', '#D9D4E2', '#F7DFD0', glow=(W * 0.5, hz - 100, 700, '#FFEBD0', 0.4))
    px = clouds(px, 61, 0.55, 0.2, '#FFF4EA', '#BFC3DA', 0.55, bias=-0.25 * yy / H)
    px = misty_mountains(px, '#EBDDD4', [(hz + 10, 330, '#8D9CBC', 0.35), (hz + 10, 230, '#667B9F', 0.16), (hz + 10, 140, '#445A7E', 0.04)], 71)
    # 호수: 위 장면을 뒤집고 물결로 일그러뜨린다
    ys = np.arange(H)
    src = np.clip(2 * hz - ys, 0, H - 1)
    wob = (fbm(63, 2.6, aniso=(8.0, 1.0))[:, 0] - 0.5)
    shift = (np.sin(ys / 9.0) * 4 + wob * 30) * (1 + (ys - hz) / 500.0)
    cols = np.clip((np.arange(W)[None, :] + shift[:, None]).astype(int), 0, W - 1)
    refl = px[src[:, None], cols]
    refl = mix(refl, lin('#5A7FA6')[None, None, :], 0.30)
    refl = refl * (0.9 - 0.25 * np.clip((ys - hz) / 800, 0, 1))[:, None, None]
    rip = fbm(64, 2.6, aniso=(10.0, 1.0))
    refl = refl * (0.93 + 0.14 * rip[..., None])
    m = cov(-(yy - hz))
    px = paint_arr(px, m, refl)
    return photo_finish(px, seed=6)

# 7 파스텔 하늘
def pastel_sky():
    px = sky('#A9B8F0', '#F2B8D8', '#FFD9B8', glow=(W * 0.5, 1300, 800, '#FFF0DD', 0.4))
    px = clouds(px, 81, 0.46, 0.34, '#FFFFFF', '#E3B4E0', 0.75, beta=3.8)
    px = clouds(px, 82, 0.58, 0.30, '#FFF6F0', '#F0C2D8', 0.6, beta=4.0, bias=0.0)
    return photo_finish(px, grain=0.025, vig=0.12, seed=7)

# 8 파스텔 언덕
def pastel_hills():
    px = sky('#C9C2F2', '#F7C9DC', '#FFE6C9', glow=(W * 0.3, 1100, 700, '#FFF6E0', 0.5))
    px = paint_arr(px, cov(circle(W * 0.3, 1060, 120)), lin('#FFF3DA')[None, None, :])
    px = clouds(px, 91, 0.60, 0.25, '#FFFFFF', '#E8C6E8', 0.55, bias=-0.3 * yy / H, beta=3.8)
    cols = [('#F5B8C4', '#FBD5D0'), ('#BFE0D0', '#E0F2E0'), ('#B3AEE6', '#D6D0F5'), ('#8FC3C0', '#C0E2D8'), ('#8C86CC', '#B5AEE6')]
    for i, (base, amp, f, ph) in enumerate([(1230, 60, 0.9, 0.4), (1380, 70, 1.1, 2.0), (1530, 70, 0.8, 3.7), (1690, 60, 1.2, 1.1), (1820, 50, 1.0, 5.0)]):
        row = base + amp * np.sin(f * 2 * np.pi * xx[0] / W + ph) + amp * 0.4 * np.sin(2.7 * f * 2 * np.pi * xx[0] / W + ph)
        d = yy - row[None, :]
        c = mix(lin(cols[i][1])[None, None, :], lin(cols[i][0])[None, None, :], smoothstep(0, 260, d)[..., None])
        px = paint_arr(px, cov(-d), c)
    return photo_finish(px, grain=0.03, vig=0.12, seed=8)

# 9 데이지 들판
def daisies():
    px = sky('#D7C8F2', '#F6CFE0', '#FFE9D2')
    rng = np.random.default_rng(101)
    for _ in range(46):
        x, y, r = rng.uniform(0, W), rng.uniform(0, 1000), rng.uniform(30, 120)
        col = rng.choice(['#FFFFFF', '#FFE3F0', '#FFF2C8', '#D8F0FF'])
        x0, x1, y0, y1 = int(max(x - r - 6, 0)), int(min(x + r + 6, W)), int(max(y - r - 6, 0)), int(min(y + r + 6, H))
        d = np.hypot(xx[y0:y1, x0:x1] - x, yy[y0:y1, x0:x1] - y)
        m = (cov((d - r) / 5))[..., None] * rng.uniform(0.10, 0.30)
        px[y0:y1, x0:x1] = px[y0:y1, x0:x1] * (1 - m) + lin(col) * m
    # 풀밭
    row = 1280 + 60 * np.sin(xx[0] / W * 2 * np.pi * 1.2 + 1)
    d = yy - row[None, :]
    grass = mix(lin('#BFE3B8')[None, None, :], lin('#6FAE84')[None, None, :], smoothstep(0, 600, d)[..., None])
    grass = grass * (0.88 + 0.24 * fbm(103, 2.2)[..., None])
    px = paint_arr(px, cov(-d), grass)
    # 데이지
    def daisy(px, cx, cy, r, blur):
        for k in range(12):
            a = k * np.pi * 2 / 12 + 0.3
            pcx, pcy = cx + np.cos(a) * r * 0.95, cy + np.sin(a) * r * 0.95
            def sd(X, Y, pcx=pcx, pcy=pcy, a=a):
                c, s = np.cos(a), np.sin(a)
                u, v = ((X - pcx) * c + (Y - pcy) * s) / (r * 0.62), (-(X - pcx) * s + (Y - pcy) * c) / (r * 0.2)
                return (np.hypot(u, v) - 1) * r * 0.2
            win_paint(px, pcx - r, pcx + r, pcy - r, pcy + r, lambda X, Y, sd=sd: sd(X, Y) / (1 + blur), '#FFFFFF', 0.95)
        win_paint(px, cx - r, cx + r, cy - r, cy + r, lambda X, Y: (np.hypot(X - cx, Y - cy) - r * 0.36) / (1 + blur), '#F6C94C', 1.0)
    rr = np.random.default_rng(7)
    for _ in range(34):
        y = rr.uniform(1380, 1900); depth = (y - 1380) / 520
        daisy(px, rr.uniform(0, W), y, 22 + depth * 78, blur=(0.0 if depth > 0.5 else 2.2))
    return photo_finish(px, grain=0.03, vig=0.14, seed=9)

LIST = [('misty', misty), ('sunset', sunset), ('sea', sea), ('forest', forest), ('dunes', dunes),
        ('lake', lake), ('pastel-sky', pastel_sky), ('pastel-hills', pastel_hills), ('daisies', daisies)]

if __name__ == '__main__':
    import os
    os.makedirs('out10', exist_ok=True)
    plain, routed = [], []
    for name, fn in LIST:
        try:
            px = fn()
        except Exception:
            import traceback; traceback.print_exc(); print('FAIL', name); continue
        img = g.finish(px, 23); g.write_png(f'out10/{name}.png', img)
        rp = g.route_overlay(px); imr = g.finish(rp, 23); g.write_png(f'out10/{name}-route.png', imr)
        plain.append(img[::4, ::4]); routed.append(imr[::4, ::4]); print('ok', name, flush=True)
    gap_v = np.full((H // 4, 8, 3), 20, np.uint8)
    for nm, tiles in (('all', plain), ('all-route', routed)):
        tiles = tiles + [np.full_like(tiles[0], 20)] * (9 - len(tiles))
        rows = []
        for r in range(3):
            row = tiles[r * 3]
            for t in tiles[r * 3 + 1:r * 3 + 3]: row = np.concatenate([row, gap_v, t], axis=1)
            rows.append(row)
        gap_h = np.full((8, rows[0].shape[1], 3), 20, np.uint8)
        img = rows[0]
        for r in rows[1:]: img = np.concatenate([img, gap_h, r], axis=0)
        g.write_png(f'out10/{nm}.png', np.ascontiguousarray(img))
