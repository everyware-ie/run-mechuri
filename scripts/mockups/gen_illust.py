import sys, os
sys.argv = ['x', 'out4']
import numpy as np
import gen_new_bg as g
from gen_new_bg import W, H, xx, yy, hex_lin, smoothstep, finish, write_png

def cov(sd):                      # SDF(px) -> 안티앨리어싱된 커버리지
    return np.clip(0.5 - sd, 0, 1)

def paint(px, mask, col, a=1.0):
    m = (mask * a)[..., None]
    return px * (1 - m) + hex_lin(col) * m

def ellipse(cx, cy, rx, ry, rot=0.0):
    c, s = np.cos(rot), np.sin(rot)
    dx, dy = xx - cx, yy - cy
    a, b = (dx * c + dy * s) / rx, (-dx * s + dy * c) / ry
    r = np.hypot(a, b)
    return (r - 1) * min(rx, ry)          # 근사 SDF

def circle(cx, cy, r): return np.hypot(xx - cx, yy - cy) - r

def tri(p0, p1, p2):
    pts = [np.array(p) for p in (p0, p1, p2)]
    d = None
    sgn = np.ones((H, W))
    inside = np.ones((H, W), bool)
    dmin = np.full((H, W), 1e9)
    for i in range(3):
        a, b = pts[i], pts[(i + 1) % 3]
        e = b - a
        t = np.clip(((xx - a[0]) * e[0] + (yy - a[1]) * e[1]) / (e @ e), 0, 1)
        dmin = np.minimum(dmin, np.hypot(xx - (a[0] + t * e[0]), yy - (a[1] + t * e[1])))
        cross = (xx - a[0]) * e[1] - (yy - a[1]) * e[0]
        inside &= cross >= 0 if i == 0 else True
    cr = [((xx - pts[i][0]) * (pts[(i+1)%3][1]-pts[i][1]) - (yy - pts[i][1]) * (pts[(i+1)%3][0]-pts[i][0])) for i in range(3)]
    ins = (cr[0] >= 0) & (cr[1] >= 0) & (cr[2] >= 0) | (cr[0] <= 0) & (cr[1] <= 0) & (cr[2] <= 0)
    return np.where(ins, -dmin, dmin)

def ridge(base, amp, freqs, phase, color_mask_fn=None):
    y = base + sum(a * np.sin(f * xx / W * 2 * np.pi + p) for a, f, p in zip(amp, freqs, phase))
    return (yy - y)                    # 양수 = 능선 아래(땅)

def sky(top, mid, bot, glow=None):
    t = yy / H
    c0, c1, c2 = hex_lin(top), hex_lin(mid), hex_lin(bot)
    a = smoothstep(0, 0.6, t)[..., None]; b = smoothstep(0.45, 0.85, t)[..., None]
    px = c0 * (1 - a) + c1 * a
    px = px * (1 - b) + c2 * b
    if glow:
        gx, gy, r, col, amt = glow
        d = np.hypot(xx - gx, yy - gy) / r
        px = px + np.exp(-d * d * 2.2)[..., None] * hex_lin(col) * amt
    return px

def hills(px, specs):
    for base, amp, fr, ph, col, haze in specs:
        d = ridge(base, amp, fr, ph)
        m = cov(-d)
        px = paint(px, m, col)
        # 능선 바로 아래를 살짝 밝게 — 부드러운 입체감
        rim = m * np.exp(-np.clip(d, 0, None) / 40.0)
        px = px + rim[..., None] * hex_lin(haze) * 0.10
    return px

def cloud(px, cx, cy, s, col='#FFFFFF', a=0.9):
    parts = [(0, 0, 70), (-85, 22, 50), (80, 20, 56), (-30, -34, 54), (35, -26, 46)]
    sd = np.full((H, W), 1e9)
    for dx, dy, r in parts:
        sd = np.minimum(sd, circle(cx + dx * s, cy + dy * s, r * s))
    base = np.maximum(-(yy - (cy + 70 * s)), 0)
    sd = np.maximum(sd, (cy + 66 * s) * -1 + yy)      # 바닥을 평평하게
    return paint(px, cov(sd), col, a)

def stars(px, seed, n=170, region=0.55):
    rng = np.random.default_rng(seed)
    for _ in range(n):
        x, y = rng.uniform(0, W), rng.uniform(0, H * region)
        r = rng.choice([1.6, 2.2, 3.0], p=[0.6, 0.3, 0.1])
        a = rng.uniform(0.35, 0.95) * (1 - y / (H * region)) ** 0.5
        px = paint(px, cov(circle(x, y, r)), '#FFF4E0', a)
    return px

def egg(px, cx, cy, s, rot, body, speck):
    sd = ellipse(cx, cy, 46 * s, 60 * s, rot)
    # 위가 좁은 알 모양: 위쪽 반을 살짝 좁힌다
    top = (yy - cy) < 0
    sd2 = ellipse(cx, cy, 46 * s * 0.88, 60 * s, rot)
    sd = np.where(top, np.minimum(sd, sd2) * 0 + sd2, sd)
    m = cov(sd)
    px = paint(px, m, body)
    rng = np.random.default_rng(int(cx))
    for _ in range(11):
        a = rng.uniform(0, 2 * np.pi); r = rng.uniform(0, 36) * s
        sx, sy = cx + r * np.cos(a), cy + r * np.sin(a) * 1.2
        sp = cov(ellipse(sx, sy, rng.uniform(4, 8) * s, rng.uniform(3, 6) * s, rng.uniform(0, 3)))
        px = paint(px, sp * m, speck, 0.9)
    px = paint(px, cov(ellipse(cx - 16 * s, cy - 24 * s, 9 * s, 16 * s, 0.5)) * m, '#FFFFFF', 0.28)
    return px

def quail(px, cx, cy, s, flip=1):
    """cx,cy = 발 밑 중심. s = 배율. 왼쪽을 보는 메추리(flip=-1이면 반대)"""
    X = lambda dx: cx + flip * dx * s
    Y = lambda dy: cy + dy * s
    # 그림자
    px = paint(px, cov(ellipse(cx, cy + 4 * s, 150 * s, 16 * s)), '#000000', 0.28)
    # 다리
    for lx in (-26, 24):
        px = paint(px, cov(ellipse(X(lx), Y(-14), 5 * s, 22 * s)), '#E9A26A')
        px = paint(px, cov(ellipse(X(lx - 8 * flip), Y(-1), 17 * s, 5 * s)), '#E9A26A')
    # 몸통
    body = cov(ellipse(X(8), Y(-118), 132 * s, 108 * s, 0))
    px = paint(px, body, '#C9965F')
    # 배 (밝은 색)
    px = paint(px, cov(ellipse(X(-34), Y(-84), 82 * s, 72 * s, 0)) * body, '#F6E6C8')
    # 가슴 점무늬
    rng = np.random.default_rng(5)
    for _ in range(14):
        a = rng.uniform(0, 2 * np.pi); r = rng.uniform(0, 1) ** 0.5
        sx, sy = X(-34 + 70 * r * np.cos(a)), Y(-84 + 58 * r * np.sin(a))
        px = paint(px, cov(ellipse(sx, sy, 5 * s, 6.5 * s, 0.4)) * body, '#9A6B3F', 0.75)
    # 날개
    wing = cov(ellipse(X(52), Y(-108), 68 * s, 52 * s, flip * -0.35))
    px = paint(px, wing * body, '#8F6038')
    for k in range(3):
        px = paint(px, cov(ellipse(X(36 + k * 22), Y(-112 + k * 6), 10 * s, 3 * s, flip * -0.35)) * body, '#C9965F', 0.7)
    # 머리 (몸통에 붙은 동그란 머리)
    head_c = (X(-62), Y(-196))
    head = cov(circle(*head_c, 66 * s))
    px = paint(px, head, '#C9965F')
    px = paint(px, cov(ellipse(X(-70), Y(-176), 46 * s, 38 * s)) * head, '#F6E6C8')  # 턱·볼
    # 머리 줄무늬
    px = paint(px, cov(ellipse(X(-60), Y(-232), 40 * s, 7 * s, flip * 0.1)) * head, '#6F4A2B', 0.9)
    # 깃(머리 위 깃털)
    plume = cov(ellipse(X(-34), Y(-264), 7 * s, 30 * s, flip * 0.55))
    px = paint(px, plume, '#6F4A2B')
    px = paint(px, cov(circle(X(-26), Y(-292), 8 * s)), '#6F4A2B')
    # 부리
    px = paint(px, cov(tri((X(-122), Y(-192)), (X(-96), Y(-208)), (X(-96), Y(-178)))), '#F2A33A')
    # 눈 + 하이라이트
    px = paint(px, cov(circle(X(-82), Y(-204), 8.5 * s)), '#2A1B12')
    px = paint(px, cov(circle(X(-85), Y(-207), 3 * s)), '#FFFFFF')
    # 볼 홍조
    px = paint(px, cov(ellipse(X(-70), Y(-182), 13 * s, 8 * s)), '#F28B7C', 0.55)
    return px

def grass(px, cx, cy, s, col):
    for dx, h, rot in [(-18, 40, -0.5), (0, 56, 0), (18, 40, 0.5), (34, 28, 0.8)]:
        px = paint(px, cov(ellipse(cx + dx * s, cy - h / 2 * s, 5 * s, h / 2 * s, rot)), col)
    return px

def finishing(px):
    vig = 1 - 0.30 * smoothstep(0.45, 1.1, np.hypot((xx / W - .5) * 1.1, (yy / H - .5) * .95) * 1.5)
    return px * vig[..., None]

def scene(kind):
    if kind == 'morning':
        px = sky('#16305A', '#3F7FA8', '#F2C98F', glow=(W * 0.30, H * 0.69, 520, '#FFE6B0', 0.55))
        px = paint(px, cov(circle(W * 0.30, H * 0.705, 96)), '#FFF0C8', 0.95)
        px = cloud(px, 860, 330, 0.9, '#E7F1FA', 0.28); px = cloud(px, 210, 540, 0.7, '#E7F1FA', 0.2)
        px = hills(px, [(1290, [40, 18], [1.1, 2.7], [0.5, 1.0], '#5D8FA0', '#FFF0C8'),
                        (1470, [48, 20], [0.9, 2.1], [2.2, 0.3], '#2F5F78', '#BFE3F0'),
                        (1680, [38, 14], [1.3, 2.9], [4.0, 1.7], '#1B3F55', '#9FD0E0'),
                        (1790, [26, 10], [1.1, 2.4], [1.0, 3.0], '#102A3C', '#7FB5C8')])
        eggc, spk, gcol = '#F6EBD6', '#8B5E3C', '#0B2230'
    elif kind == 'noon':
        px = sky('#2465C6', '#4E9BE0', '#B7DEF6', glow=(W * 0.80, H * 0.10, 420, '#FFFFFF', 0.22))
        px = cloud(px, 250, 300, 1.15, '#FFFFFF', 0.95); px = cloud(px, 880, 470, 0.9, '#FFFFFF', 0.9)
        px = cloud(px, 160, 1020, 0.7, '#FFFFFF', 0.8); px = cloud(px, 950, 1180, 0.8, '#FFFFFF', 0.75)
        px = hills(px, [(1320, [38, 16], [1.0, 2.5], [0.9, 2.0], '#6FC08A', '#FFFFFF'),
                        (1500, [46, 18], [0.8, 2.2], [3.0, 0.6], '#3FA070', '#E8FFE8'),
                        (1690, [36, 14], [1.2, 2.8], [1.4, 3.7], '#287A58', '#D0F5D8'),
                        (1795, [24, 10], [1.0, 2.3], [2.6, 0.9], '#1B5A44', '#B0E5C0')])
        eggc, spk, gcol = '#FBF1DD', '#8B5E3C', '#144636'
    else:
        px = sky('#150F3E', '#5B2D78', '#E9835C', glow=(W * 0.72, H * 0.72, 560, '#FFB074', 0.45))
        px = stars(px, 7)
        px = paint(px, cov(circle(W * 0.80, H * 0.17, 74)), '#FFF3D6', 0.97)
        px = paint(px, cov(circle(W * 0.80 + 30, H * 0.17 - 14, 64)), '#3A2468', 0.0)
        px = hills(px, [(1300, [40, 16], [1.1, 2.6], [1.5, 0.4], '#6B3A7C', '#FFB074'),
                        (1480, [48, 20], [0.9, 2.0], [0.2, 2.5], '#3E2368', '#E58AA0'),
                        (1690, [36, 14], [1.2, 2.9], [3.1, 1.2], '#241548', '#A06FB8'),
                        (1795, [26, 10], [1.0, 2.4], [0.7, 3.4], '#150C2E', '#7F55A0')])
        eggc, spk, gcol = '#F4E4D2', '#7A4E34', '#0F0924'
    # 전경: 메추리와 알. 경로가 지나갈 가운데는 비운다
    px = quail(px, 300, 1768, 1.0, flip=1)
    px = egg(px, 800, 1790, 0.85, 0.25, eggc, spk)
    px = egg(px, 905, 1805, 0.65, -0.35, eggc, spk)
    px = grass(px, 520, 1812, 1.2, gcol); px = grass(px, 990, 1830, 1.0, gcol); px = grass(px, 70, 1822, 1.2, gcol)
    return finishing(px)

if __name__ == '__main__':
    sheet, sheet_r = [], []
    for name in ('morning', 'noon', 'evening'):
        px = scene(name)
        img = finish(px, 7)
        write_png(f'out4/{name}.png', img)
        rp = g.route_overlay(px); imgr = finish(rp, 7)
        write_png(f'out4/{name}-route.png', imgr)
        sheet.append(img[::2, ::2]); sheet_r.append(imgr[::2, ::2]); print('ok', name)
    gap = np.full((H // 2, 12, 3), 20, dtype=np.uint8)
    for nm, imgs in (('sheet', sheet), ('sheet-route', sheet_r)):
        row = imgs[0]
        for im in imgs[1:]: row = np.concatenate([row, gap, im], axis=1)
        write_png(f'out4/{nm}.png', row)
