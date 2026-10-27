#!/usr/bin/env python3
"""새 기본 배경 후보 시안. numpy만 쓴다(최종본은 표준 라이브러리 버전으로 옮길 수 있다)."""
import struct, sys, zlib, os
import numpy as np

W, H = 1080, 1920
OUT = sys.argv[1]
os.makedirs(OUT, exist_ok=True)


def hex_lin(s):
    c = np.array([int(s[i:i + 2], 16) for i in (1, 3, 5)], dtype=np.float64) / 255
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def to_srgb(a):
    a = np.clip(a, 0, 1)
    return np.where(a <= 0.0031308, a * 12.92, 1.055 * a ** (1 / 2.4) - 0.055) * 255


def write_png(path, img):
    h, w, _ = img.shape
    raw = b''.join(b'\x00' + img[y].tobytes() for y in range(h))

    def chunk(tag, data):
        body = tag + data
        return struct.pack('>I', len(data)) + body + struct.pack('>I', zlib.crc32(body) & 0xffffffff)

    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0))
                + chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b''))


yy, xx = np.mgrid[0:H, 0:W].astype(np.float64)
u, v = xx / W, yy / H                      # 0~1 좌표
aspect = W / H


def smooth_field(seed, scale):
    """저주파 노이즈. 값이 0~1로 정규화된다. scale이 클수록 큰 굴곡."""
    rng = np.random.default_rng(seed)
    n = rng.standard_normal((H, W))
    fy = np.fft.fftfreq(H)[:, None] * H
    fx = np.fft.fftfreq(W)[None, :] * W
    k = np.hypot(fx / aspect, fy)
    filt = np.exp(-(k / scale) ** 2) * (k > 0.4)
    f = np.real(np.fft.ifft2(np.fft.fft2(n) * filt))
    f -= f.min()
    return f / f.max()


def blob(cx, cy, rx, ry, rot=0.0):
    dx, dy = (u - cx) * aspect, v - cy
    c, s = np.cos(rot), np.sin(rot)
    a, b = dx * c + dy * s, -dx * s + dy * c
    return np.exp(-((a / rx) ** 2 + (b / ry) ** 2))


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def contours(field, levels, width_px, ink, alpha, mask=None):
    """등고선. 기울기로 선 굵기를 일정하게 맞춘다."""
    g = field * levels
    gy, gx = np.gradient(g)
    mag = np.hypot(gx, gy) + 1e-6
    d = np.abs(g - np.round(g)) / mag               # 가장 가까운 선까지의 픽셀 거리
    line = 1 - smoothstep(width_px * 0.5, width_px * 0.5 + 1.2, d)
    if mask is not None:
        line = line * mask
    return line[..., None] * hex_lin(ink)[None, None, :] * alpha


def build(top, bottom, blobs, ink, ink_alpha, seed, levels=11, warm=None):
    t = smoothstep(0, 1, v)[..., None]
    px = hex_lin(top) * (1 - t) + hex_lin(bottom) * t
    px = np.broadcast_to(px, (H, W, 3)).copy()
    for cx, cy, rx, ry, rot, col, amt in blobs:
        px += blob(cx, cy, rx, ry, rot)[..., None] * hex_lin(col) * amt
    # 지도 같은 등고선 — 경로와 결이 맞는 질감. 가운데는 경로가 지나가니 조금 더 옅게
    f = smooth_field(seed, 5.5)
    center = 1 - 0.55 * blob(0.5, 0.5, 0.45, 0.30)
    px += contours(f, levels, 1.7, ink, ink_alpha, mask=center)
    # 비네팅
    vig = 1 - 0.38 * smoothstep(0.35, 1.05, np.hypot((u - 0.5) * aspect * 1.25, (v - 0.5) * 0.95) * 1.5)
    px *= vig[..., None]
    return px


def finish(px, seed):
    rng = np.random.default_rng(seed + 100)
    out = to_srgb(px) + rng.uniform(-0.6, 0.6, (H, W, 1))     # 띠 방지 디더
    return np.clip(out + 0.5, 0, 255).astype(np.uint8)


SPECS = {
    # 아침 — 푸른 새벽. 위쪽 청록빛이 번지고 아래는 검게 가라앉는다
    'morning': dict(top='#0B2A44', bottom='#05080D', ink='#8FD8F0', ink_alpha=0.085, seed=11,
                    blobs=[(0.78, 0.10, 0.55, 0.30, 0.4, '#1F9CC9', 0.42),
                           (0.12, 0.30, 0.45, 0.22, -0.5, '#2A4FB8', 0.30),
                           (0.55, 0.62, 0.70, 0.18, 0.0, '#0E5A78', 0.16)]),
    # 점심 — 깊은 청록. 오로라처럼 민트가 비스듬히 흐른다
    'noon': dict(top='#062C2E', bottom='#040A0C', ink='#9EF0D6', ink_alpha=0.085, seed=23,
                 blobs=[(0.20, 0.16, 0.55, 0.22, 0.7, '#12B59A', 0.36),
                        (0.85, 0.40, 0.50, 0.20, -0.8, '#1E7FD0', 0.30),
                        (0.35, 0.75, 0.65, 0.16, 0.5, '#0C6E66', 0.18)]),
    # 저녁 — 보랏빛 노을. 위는 남보라, 가운데 마젠타가 번지고 맨 아래에 호박색이 살짝 걸린다
    'evening': dict(top='#1A1244', bottom='#0A0612', ink='#FFC9A8', ink_alpha=0.075, seed=37,
                    blobs=[(0.18, 0.12, 0.55, 0.26, 0.5, '#5A3FC0', 0.40),
                           (0.82, 0.48, 0.55, 0.24, -0.6, '#C2417A', 0.34),
                           (0.50, 1.04, 0.80, 0.14, 0.0, '#FF8A3D', 0.30)]),
}


def route_overlay(base):
    """경로가 올라간 모습을 확인하기 위한 가짜 경로. 제품 렌더러와는 무관하다."""
    t = np.linspace(0, 1, 900)
    x = 0.50 + 0.30 * np.sin(2 * np.pi * (t * 1.15 + 0.05)) * (1 - 0.35 * t) + 0.08 * np.sin(11 * t)
    y = 0.22 + 0.58 * t + 0.05 * np.sin(7 * t)
    pts = np.stack([x * W, y * H], axis=1)
    px = base.copy()
    dmin = np.full((H, W), 1e9)
    for i in range(0, len(pts) - 1, 1):
        x0, y0 = pts[i]
        x1, y1 = pts[i + 1]
        xmin, xmax = int(min(x0, x1) - 170), int(max(x0, x1) + 170)
        ymin, ymax = int(min(y0, y1) - 170), int(max(y0, y1) + 170)
        xmin, ymin = max(xmin, 0), max(ymin, 0)
        xmax, ymax = min(xmax, W), min(ymax, H)
        sx, sy = xx[ymin:ymax, xmin:xmax], yy[ymin:ymax, xmin:xmax]
        dx, dy = x1 - x0, y1 - y0
        L2 = dx * dx + dy * dy + 1e-9
        tt = np.clip(((sx - x0) * dx + (sy - y0) * dy) / L2, 0, 1)
        d = np.hypot(sx - (x0 + tt * dx), sy - (y0 + tt * dy))
        dmin[ymin:ymax, xmin:xmax] = np.minimum(dmin[ymin:ymax, xmin:xmax], d)
    glow = hex_lin('#FF5A2B')
    core = hex_lin('#FFF3EC')
    px += (np.exp(-np.minimum(dmin, 170) / 26)[..., None] * 0.55 + np.exp(-dmin / 8)[..., None] * 0.5) * glow
    px += (1 - smoothstep(3.0, 4.6, dmin))[..., None] * core
    return px


if __name__ == '__main__':
    sheet = []
    sheet_route = []
    for name, spec in SPECS.items():
        spec = dict(spec)
        seed = spec['seed']
        px = build(**spec)
        write_png(os.path.join(OUT, name + '.png'), finish(px, seed))
        sheet.append(finish(px, seed)[::2, ::2])
        rp = route_overlay(px)
        write_png(os.path.join(OUT, name + '-route.png'), finish(rp, seed))
        sheet_route.append(finish(rp, seed)[::2, ::2])
        print('ok', name)
    gap = np.full((H // 2, 12, 3), 20, dtype=np.uint8)
    for nm, imgs in (('sheet', sheet), ('sheet-route', sheet_route)):
        row = imgs[0]
        for im in imgs[1:]:
            row = np.concatenate([row, gap, im], axis=1)
        write_png(os.path.join(OUT, nm + '.png'), row)
