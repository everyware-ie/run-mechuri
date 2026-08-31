#!/usr/bin/env python3
"""기본 배경 이미지를 생성한다.

사용법:
    python3 scripts/generate-backgrounds.py [출력_디렉터리]

기본 출력은 frontend/assets/backgrounds/ 이다. 의존성이 없다(표준 라이브러리만).

색값의 근거와 선정 과정은 docs/product/features/background-images.md 에 있다.
색을 바꾸려면 아래 SPECS만 고치면 된다.
"""
import math, os, random, struct, sys, zlib

W, H = 1080, 1920
DITHER = 0.5          # 밴딩 제거용 미세 노이즈. 0으로 두면 어두운 구간에 띠가 생긴다
SEED = 3              # 같은 입력이면 항상 같은 파일이 나오도록 고정한다


def hex_to_rgb(s):
    return tuple(int(s[i:i + 2], 16) for i in (1, 3, 5))


def to_linear(c):
    c = c / 255.0
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def to_srgb(c):
    c = 12.92 * c if c <= 0.0031308 else 1.055 * (c ** (1 / 2.4)) - 0.055
    return c * 255.0


def write_png(path, rows):
    raw = b''.join(b'\x00' + bytes(r) for r in rows)

    def chunk(tag, data):
        body = tag + data
        return (struct.pack('>I', len(data)) + body
                + struct.pack('>I', zlib.crc32(body) & 0xffffffff))

    png = (b'\x89PNG\r\n\x1a\n'
           + chunk(b'IHDR', struct.pack('>IIBBBBB', W, H, 8, 2, 0, 0, 0))
           + chunk(b'IDAT', zlib.compress(raw, 9))
           + chunk(b'IEND', b''))
    with open(path, 'wb') as f:
        f.write(png)


def make_ramp(stops):
    """(위치, 색) 목록을 받아 0~1 위치의 선형광 색을 돌려준다."""
    table = [(p, [to_linear(v) for v in hex_to_rgb(c)]) for p, c in stops]

    def at(t):
        if t <= table[0][0]:
            return table[0][1]
        for i in range(1, len(table)):
            p1, c1 = table[i]
            if t <= p1:
                p0, c0 = table[i - 1]
                u = (t - p0) / (p1 - p0)
                u = u * u * (3 - 2 * u)          # smoothstep
                return [c0[k] + (c1[k] - c0[k]) * u for k in range(3)]
        return table[-1][1]

    return at


def render(shader):
    rnd = random.Random(SEED)
    rows = []
    for y in range(H):
        row = bytearray()
        for x in range(W):
            px = shader(x, y)
            for i in range(3):
                v = to_srgb(min(1.0, max(0.0, px[i]))) + rnd.uniform(-DITHER, DITHER)
                row.append(0 if v < 0 else (255 if v > 255 else int(v + 0.5)))
        rows.append(row)
    return rows


def diagonal(top, bottom, degrees=160, light=None, amount=0.0, direction=None):
    """한 색에서 다른 색으로 내려가는 그라디언트. 빛을 한 겹 얹을 수 있다."""
    a, b = [to_linear(v) for v in hex_to_rgb(top)], [to_linear(v) for v in hex_to_rgb(bottom)]
    lit = [to_linear(v) for v in hex_to_rgb(light)] if light else None
    rad = math.radians(degrees)
    sin_a, cos_a = math.sin(rad), math.cos(rad)
    length = abs(W * sin_a) + abs(H * cos_a)
    cx, cy = W / 2.0, H / 2.0

    def shader(x, y):
        t = ((x - cx) * sin_a - (y - cy) * cos_a) / length + 0.5
        t = min(1.0, max(0.0, t))
        t = t * t * (3 - 2 * t)
        px = [a[i] + (b[i] - a[i]) * t for i in range(3)]
        if direction == 'down':                  # 지평선이 밝아온다
            d = (y - H * 0.93) / (H * 0.22)
            g = math.exp(-d * d) * amount
            px = [px[i] + lit[i] * g for i in range(3)]
        elif direction == 'up':                  # 하늘 위쪽이 열린다
            d = math.hypot((x - W * 0.72) * 0.85, y + H * 0.10) / (H * 0.72)
            g = max(0.0, 1 - d) ** 3 * amount
            if g > 0:
                px = [px[i] + lit[i] * g for i in range(3)]
        return px

    return shader


def sky(stops, sun=None):
    """위에서 아래로 여러 색을 거치는 하늘. 해무리를 얹을 수 있다."""
    ramp = make_ramp(stops)
    sun_color = [to_linear(v) for v in hex_to_rgb(sun[3])] if sun else None
    aspect = W / H

    def shader(x, y):
        px = list(ramp(y / (H - 1)))
        if sun:
            sx, sy, radius, _, strength = sun
            d = math.hypot((x / W - sx) * aspect, y / H - sy) / radius
            if d < 1:
                g = (1 - d) ** 3 * strength
                px = [min(1.5, px[i] + sun_color[i] * g) for i in range(3)]
        return px

    return shader


# 색값의 근거는 docs/product/features/background-images.md 를 볼 것
SPECS = [
    # 아침 — 짙은 남색이 어둠으로 내려간다. 셋 다 같은 바탕에 빛의 방향만 다르다
    ('아침-1-빛없음',   lambda: diagonal('#1A4680', '#0B0D10')),
    ('아침-2-아래빛',   lambda: diagonal('#1A4680', '#0B0D10', light='#6FA8CE',
                                         amount=0.340, direction='down')),
    ('아침-3-위빛',     lambda: diagonal('#1A4680', '#0B0D10', light='#6FA8CE',
                                         amount=0.440, direction='up')),
    # 점심 — 위가 진한 파랑, 아래로 갈수록 하얘진다
    ('점심-1-바다하늘', lambda: sky([(0.00, '#1E86D6'), (0.34, '#5DAEE6'), (0.66, '#A9D6F1'),
                                    (0.88, '#DCEFFA'), (1.00, '#EAF6FD')])),
    ('점심-2-해있는하늘', lambda: sky([(0.00, '#4FA8E4'), (0.40, '#7CC0EC'),
                                      (0.74, '#BADEF5'), (1.00, '#E4F2FC')],
                                     sun=(0.50, 0.02, 0.55, '#FFFFFF', 0.55))),
    ('점심-3-맑은한낮', lambda: sky([(0.00, '#1878CE'), (0.30, '#4A9EDC'),
                                    (0.62, '#8CC6EC'), (1.00, '#CFE9F7')])),
    # 저녁 — 위에 파랑이 남고 아래에만 노을이 걸린다
    ('저녁-1-파스텔',   lambda: sky([(0.00, '#8CC6EA'), (0.26, '#DCDCE0'), (0.48, '#F6CDBC'),
                                    (0.72, '#F9A493'), (1.00, '#F58B86')])),
    ('저녁-2-드라마틱', lambda: sky([(0.00, '#2E2B5E'), (0.32, '#684386'), (0.58, '#BE5490'),
                                    (0.80, '#F0553E'), (1.00, '#FF8347')])),
    ('저녁-3-맑은노을', lambda: sky([(0.00, '#123B72'), (0.30, '#3E79B4'), (0.58, '#CFC7A6'),
                                    (0.82, '#F3A23C'), (1.00, '#E8721F')])),
]


def main():
    out_dir = sys.argv[1] if len(sys.argv) > 1 else 'frontend/assets/backgrounds'
    os.makedirs(out_dir, exist_ok=True)
    for name, build in SPECS:
        path = os.path.join(out_dir, name + '.png')
        write_png(path, render(build()))
        print('%8d KB  %s' % (os.path.getsize(path) // 1024, path))


if __name__ == '__main__':
    main()
