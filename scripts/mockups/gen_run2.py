import numpy as np, os
import gen_run as r
import gen_new_bg as g
from gen_run import *
from gen_run import lin, mix, fbm, ridge1d, clouds, photo_finish, paint_arr, trail, segd
from gen_illust import cov, sky
from gen_new_bg import W, H, xx, yy, smoothstep

def smin(a, b, k=18.0):
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0, 1)
    return b * (1 - h) + a * h - k * h * (1 - h)

def runner2(px, cx, cy, s, col='#1E1738', a=1.0):
    """이어진 러너 실루엣. 관절을 부드럽게 합쳐서 끊겨 보이지 않게 한다."""
    u = s / 10.0
    P = lambda x, y: (cx + x * u, cy + y * u)
    def cap(p0, p1, r0, r1=None):
        (x0, y0), (x1, y1) = P(*p0), P(*p1)
        dx, dy = x1 - x0, y1 - y0
        t = np.clip(((xx - x0) * dx + (yy - y0) * dy) / (dx * dx + dy * dy + 1e-9), 0, 1)
        rad = (r0 + ((r1 if r1 is not None else r0) - r0) * t) * u
        return np.hypot(xx - (x0 + t * dx), yy - (y0 + t * dy)) - rad
    parts = [((0.9, -4.4), (-0.4, 0.2), 1.25, 1.0),           # 몸통(앞으로 기울임)
             ((1.1, -4.2), (1.6, -5.2), 0.7, 0.6),            # 목
             ((1.8, -3.6), (3.6, -2.2), 0.62, 0.5), ((3.6, -2.2), (4.6, -3.7), 0.5, 0.45),   # 앞팔
             ((0.2, -3.5), (-1.8, -2.6), 0.62, 0.5), ((-1.8, -2.6), (-3.2, -3.9), 0.5, 0.45),  # 뒷팔
             ((-0.2, 0.2), (2.4, 1.8), 0.95, 0.75), ((2.4, 1.8), (1.9, 4.6), 0.75, 0.55), ((1.9, 4.6), (3.3, 4.9), 0.5, 0.45),   # 앞다리
             ((-0.4, 0.2), (-2.8, 2.0), 0.95, 0.75), ((-2.8, 2.0), (-5.3, 3.0), 0.75, 0.55), ((-5.3, 3.0), (-6.0, 2.0), 0.5, 0.45)]  # 뒷다리
    d = None
    for p in parts:
        c = cap(*p)
        d = c if d is None else smin(d, c, 7.0)
    hx, hy = P(1.9, -6.0)
    d = smin(d, np.hypot(xx - hx, yy - hy) - 1.25 * u, 7.0)
    return paint_arr(px, cov(d) * a, lin(col)[None, None, :])

def quail_back(px, cx, cy, s, col='#1E1738', a=1.0):
    """메추리 뒷모습 실루엣. (cx,cy)는 몸통 중심, s는 몸통 폭."""
    u = s / 10.0
    def ell(x, y, rx, ry, rot=0.0):
        c, sn = np.cos(rot), np.sin(rot)
        dx, dy = xx - (cx + x * u), yy - (cy + y * u)
        A, B = (dx * c + dy * sn) / (rx * u), (-dx * sn + dy * c) / (ry * u)
        return (np.hypot(A, B) - 1) * min(rx, ry) * u
    d = ell(0, 0.3, 5.0, 4.0)                                  # 통통한 몸
    d = smin(d, ell(0, -3.7, 2.9, 2.7), 12.0)                # 머리
    d = smin(d, ell(0.0, 4.4, 2.2, 1.5), 10.0)               # 꽁지 쪽
    # 머리 위 깃털 장식(메추리 특유의 곡선 깃)
    def feather(x0, y0, x1, y1, w):
        return segd((cx + x0 * u, cy + y0 * u), (cx + x1 * u, cy + y1 * u)) - w * u
    # 머리 위 깃: 가늘어지며 한쪽으로 살짝 휘는 물방울 모양 하나
    for i in range(14):
        t = i / 13
        px_, py_ = 0.2 + 1.6 * t * t - 0.3 * t, -5.3 - 2.6 * t
        rr = 0.78 * (1 - t) ** 0.8 + 0.07
        d = smin(d, np.hypot(xx - (cx + px_ * u), yy - (cy + py_ * u)) - rr * u, 9.0)
    # 짧은 다리
    for lx in (-1.7, 1.7):
        d = smin(d, feather(lx, 4.3, lx * 1.15, 6.0, 0.5), 5.0)
        d = smin(d, feather(lx * 1.15, 6.0, lx * 1.45, 6.2, 0.5), 5.0)
    return paint_arr(px, cov(d) * a, lin(col)[None, None, :])

def sunset_hill_base(runner_fn):
    px = sky('#5A6BB4', '#E58CA0', '#FFC080', glow=(W * 0.55, 1150, 850, '#FFE0A0', 0.7))
    px = clouds(px, 21, 0.58, 0.30, '#FFD9B5', '#9A84B4', 0.5, beta=3.8)
    for base, amp, c0, c1, ph, f in [(1380, 90, '#9A6C9C', '#7A5488', 0.4, 0.9), (1560, 120, '#5C4478', '#3E2F5C', 2.0, 0.7)]:
        row = base + amp * np.sin(f * 2 * np.pi * xx[0] / W + ph) + amp * 0.3 * np.sin(2.9 * f * 2 * np.pi * xx[0] / W + ph)
        d = yy - row[None, :]
        px = paint_arr(px, cov(-d), mix(lin(c0)[None, None, :], lin(c1)[None, None, :], smoothstep(0, 400, d)[..., None]))
    row = 1700 + 90 * np.sin(0.8 * 2 * np.pi * xx[0] / W + 3.0)
    px = paint_arr(px, cov(-(yy - row[None, :])), lin('#2C2148')[None, None, :])
    return px, row

def runner_hill2():
    px, row = sunset_hill_base(None)
    x = int(W * 0.2)
    px = runner2(px, x, float(row[x]) - 135, 270)
    return photo_finish(px, seed=7)

def quail_hill():
    px, row = sunset_hill_base(None)
    x = int(W * 0.2)
    px = quail_back(px, x, float(row[x]) - 85, 250)
    return photo_finish(px, seed=7)

def coast_road2():
    hz = 1000
    px = sky('#5E6DB0', '#E39AA6', '#FFC98A', glow=(W * 0.6, hz - 30, 800, '#FFE0A8', 0.7))
    px = clouds(px, 21, 0.54, 0.24, '#FFD9B5', '#8E7AB0', 0.7, bias=-0.1 * yy / H)
    t = np.clip((yy - hz) / (H - hz), 0, 1)[..., None]
    sea = mix(lin('#F2B189')[None, None, :], lin('#3F4F8A')[None, None, :], np.clip(t * 1.8, 0, 1)) * (0.88 + 0.26 * fbm(33, 2.6, aniso=(9.0, 1.0))[..., None])
    px = paint_arr(px, cov(-(yy - hz)), sea)
    dh = np.clip(yy - hz, 0, None)
    px = px + (np.exp(-((xx - W * 0.6) / (70 + dh * 0.4)) ** 2) * np.exp(-dh / 420) * (yy > hz))[..., None] * lin('#FFE4B0') * 0.8
    # 멀리 떠 있는 곶(연한 보라)
    r_ = ridge1d(9) * 90
    cape = hz + 6 - (140 * np.exp(-((xx[0] - W * 0.1) / 360) ** 2) + r_ * np.exp(-((xx[0] - W * 0.1) / 420) ** 2))
    px = paint_arr(px, cov(-(yy - cape[None, :])) * (yy < hz + 8), lin('#9C86B8')[None, None, :])
    # 해안 절벽 언덕: 오른쪽이 바다로 떨어지고 왼쪽으로 올라간다
    row = 1330 + 120 * np.sin(xx[0] / W * 2.2 + 0.6) + 40 * np.sin(xx[0] / W * 7)
    d = yy - row[None, :]
    col = mix(lin('#E3A5A4')[None, None, :], lin('#8E6A92')[None, None, :], smoothstep(0, 520, d)[..., None]) * (0.92 + 0.16 * fbm(31, 2.2)[..., None])
    px = paint_arr(px, cov(-d), col)
    # 절벽 끝의 부드러운 빛 번짐
    px = px + (np.exp(-np.abs(d) / 40) * (d < 0.5) * 0.22)[..., None] * lin('#FFE8C8')
    # 언덕 위를 따라가는 길: 소실점을 언덕 능선에 둔다
    vx = W * 0.62
    hz2 = float(row[int(vx)]) + 10
    px, cx, half, tt = trail(px, hz2, vx, 330, 300, '#FFF1DC', '#F8DCC0', edge='#FFF4E6', ph=2.4, bend=0.9)
    return photo_finish(px, seed=2)

LIST = [('coast-road2', coast_road2), ('runner-hill2', runner_hill2), ('quail-hill', quail_hill)]

if __name__ == '__main__':
    os.makedirs('outr2', exist_ok=True)
    plain, routed = [], []
    for name, fn in LIST:
        px = fn()
        img = g.finish(px, 23); g.write_png(f'outr2/{name}.png', img)
        imr = g.finish(g.route_overlay(px), 23); g.write_png(f'outr2/{name}-route.png', imr)
        plain.append(img[::4, ::4]); routed.append(imr[::4, ::4]); print('ok', name, flush=True)
    gv = np.full((H // 4, 8, 3), 20, np.uint8)
    for nm, tiles in (('all', plain), ('all-route', routed)):
        row = tiles[0]
        for tt in tiles[1:]: row = np.concatenate([row, gv, tt], axis=1)
        g.write_png(f'outr2/{nm}.png', np.ascontiguousarray(row))
