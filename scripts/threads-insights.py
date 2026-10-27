#!/usr/bin/env python3
"""팀 스레드 계정의 조회수·상호작용·팔로워를 가져와 레포에 쌓는다.

Threads API(공식, 무료)를 쓴다. 토큰과 앱 시크릿은 레포 밖
~/.config/runary-threads/config.json 에만 저장한다. 레포가 공개라서다.

    python3 scripts/threads-insights.py set-token   # 처음 한 번 (대시보드 토큰 생성기)
    python3 scripts/threads-insights.py snapshot    # 오늘 수치를 저장하고 통계 문서 갱신
    python3 scripts/threads-insights.py render      # 저장된 스냅숏으로 통계 문서만 다시 만들기
    python3 scripts/threads-insights.py report      # 저장하지 않고 터미널에만 보기

사용법과 지표 해석은 docs/marketing/threads/README.md 에 있다.
"""

import argparse
import getpass
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

API = "https://graph.threads.com/v1.0"
AUTH = "https://graph.threads.com"
AUTHORIZE = "https://threads.com/oauth/authorize"
SCOPES = "threads_basic,threads_manage_insights"
CONFIG = os.path.expanduser("~/.config/runary-threads/config.json")
KST = timezone(timedelta(hours=9))
# 계정의 날짜별 조회는 미국 태평양 시간 자정(07:00 UTC)에 끊긴다.
PACIFIC = timezone(timedelta(hours=-7))
OUT_DIR = Path(__file__).resolve().parents[1] / "docs" / "marketing" / "threads"

POST_METRICS = ["views", "likes", "replies", "reposts", "quotes", "shares"]
ACCOUNT_METRICS = ["views", "likes", "replies", "reposts", "quotes", "clicks"]
LABELS = {"views": "조회", "likes": "좋아요", "replies": "답글", "reposts": "리포스트",
          "quotes": "인용", "shares": "공유", "clicks": "링크 클릭"}
# 토큰은 발급 24시간 뒤부터 갱신할 수 있고 60일 뒤 만료된다. 만료 2주 전부터 갱신한다.
REFRESH_BEFORE = 14 * 24 * 3600


class ApiError(Exception):
    pass


def load_config():
    try:
        with open(CONFIG) as f:
            return json.load(f)
    except FileNotFoundError:
        return {}


def save_config(config):
    os.makedirs(os.path.dirname(CONFIG), exist_ok=True)
    fd = os.open(CONFIG, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        json.dump(config, f, indent=2)
    os.chmod(CONFIG, 0o600)


def request(url, params=None, data=None):
    if params:
        url = f"{url}?{urllib.parse.urlencode(params)}"
    body = urllib.parse.urlencode(data).encode() if data else None
    try:
        with urllib.request.urlopen(urllib.request.Request(url, data=body), timeout=30) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        try:
            detail = json.load(e).get("error", {}).get("message", "")
        except Exception:
            detail = ""
        raise ApiError(f"{e.code} {detail}".strip()) from None


# ── 연결 ──────────────────────────────────────────────────

def set_token(args):
    """대시보드의 '사용자 토큰 생성기'로 만든 장기 토큰을 저장한다."""
    config = load_config()
    print("앱 대시보드 > Threads API 액세스 > 설정 > 사용자 토큰 생성기에서 만든 토큰을 붙여 넣어 주세요.")
    print("(입력해도 화면에 보이지 않습니다.)\n")
    value = getpass.getpass("토큰: ").strip()
    if not value:
        sys.exit("토큰이 비어 있습니다.")
    me = request(f"{API}/me", params={"fields": "username", "access_token": value})
    now = int(time.time())
    config.update({"access_token": value, "issued_at": now, "expires_at": now + 60 * 24 * 3600})
    save_config(config)
    print(f"\n@{me.get('username')} 계정으로 연결했습니다. 토큰은 {CONFIG} 에만 저장했습니다.")


def login(args):
    """토큰 생성기를 쓸 수 없을 때의 리디렉션 방식. 앱 설정에 리디렉션 URI가 저장돼 있어야 한다."""
    config = load_config()
    print("Meta 개발자 앱의 'Threads 앱 ID'와 'Threads 앱 시크릿'을 넣어 주세요.")
    print("(일반 앱 ID가 아니라 Threads 쪽 값입니다. 시크릿은 입력해도 화면에 보이지 않습니다.)\n")
    app_id = input(f"Threads 앱 ID [{config.get('app_id', '')}]: ").strip() or config.get("app_id", "")
    secret = getpass.getpass("Threads 앱 시크릿 (Enter면 기존 값): ").strip() or config.get("app_secret", "")
    redirect = input(f"리디렉션 URI [{config.get('redirect_uri', 'https://localhost/')}]: ").strip() \
        or config.get("redirect_uri", "https://localhost/")
    if not app_id or not secret:
        sys.exit("앱 ID와 시크릿이 필요합니다.")
    # 허용 단계에서 막혀 다시 실행할 때 Enter만 누르면 되게 먼저 저장한다.
    config.update({"app_id": app_id, "app_secret": secret, "redirect_uri": redirect})
    save_config(config)

    url = AUTHORIZE + "?" + urllib.parse.urlencode({
        "client_id": app_id, "redirect_uri": redirect,
        "scope": SCOPES, "response_type": "code",
    })
    print("\n1. 아래 주소를 브라우저에서 열고 팀 스레드 계정으로 허용을 눌러 주세요.\n")
    print(url)
    print("\n2. 'localhost' 페이지가 열리지 않는다는 화면이 나오면 정상입니다.")
    print("   그 화면의 주소창 전체를 복사해 붙여 넣어 주세요.\n")
    pasted = input("주소: ").strip()
    code = urllib.parse.parse_qs(urllib.parse.urlparse(pasted).query).get("code", [pasted])[0]
    code = code.split("#")[0]

    short = request(f"{AUTH}/oauth/access_token", data={
        "client_id": app_id, "client_secret": secret,
        "grant_type": "authorization_code", "redirect_uri": redirect, "code": code,
    })
    long = request(f"{AUTH}/access_token", params={
        "grant_type": "th_exchange_token", "client_secret": secret,
        "access_token": short["access_token"],
    })
    now = int(time.time())
    config.update({"access_token": long["access_token"], "issued_at": now,
                   "expires_at": now + int(long.get("expires_in", 60 * 24 * 3600))})
    save_config(config)
    me = request(f"{API}/me", params={"fields": "username", "access_token": config["access_token"]})
    print(f"\n@{me.get('username')} 계정으로 연결했습니다. 토큰은 {CONFIG} 에만 저장했습니다.")


def token(config):
    if not config.get("access_token"):
        sys.exit("먼저 'python3 scripts/threads-insights.py set-token'을 실행해 주세요.")
    now = int(time.time())
    if config["expires_at"] <= now:
        sys.exit("토큰이 만료됐습니다. 토큰 생성기에서 새로 만들고 set-token을 다시 실행해 주세요.")
    if config["expires_at"] - now < REFRESH_BEFORE and now - config.get("issued_at", 0) > 24 * 3600:
        res = request(f"{AUTH}/refresh_access_token", params={
            "grant_type": "th_refresh_token", "access_token": config["access_token"],
        })
        config.update({"access_token": res["access_token"], "issued_at": now,
                       "expires_at": now + int(res.get("expires_in", 60 * 24 * 3600))})
        save_config(config)
        print("토큰을 60일 더 연장했습니다.", file=sys.stderr)
    return config["access_token"]


# ── 수집 ──────────────────────────────────────────────────

def metric_values(rows):
    """인사이트 응답을 {지표: 값}으로 바꾼다. 날짜별 값은 합계를 쓴다."""
    out = {}
    for row in rows:
        if "total_value" in row:
            out[row["name"]] = row["total_value"].get("value")
        elif "link_total_values" in row:
            out[row["name"]] = sum(v.get("value", 0) for v in row["link_total_values"])
        else:
            out[row["name"]] = sum(v.get("value", 0) for v in row.get("values", []))
    return out


def all_posts(access):
    params = {"fields": "id,text,timestamp,permalink,media_type", "limit": 100, "access_token": access}
    url, out = f"{API}/me/threads", []
    while url:
        page = request(url, params=params)
        out += page.get("data", [])
        url, params = page.get("paging", {}).get("next"), None
    # 다른 사람 글을 리포스트한 항목은 인사이트가 비어 있다.
    return [p for p in out if p.get("media_type") != "REPOST_FACADE"]


def post_insights(access, post_id):
    try:
        rows = request(f"{API}/{post_id}/insights",
                       params={"metric": ",".join(POST_METRICS), "access_token": access}).get("data", [])
    except ApiError:
        # 개발 중인 지표(views, shares)가 거절되면 나머지만 다시 받는다.
        stable = [m for m in POST_METRICS if m not in ("views", "shares")]
        rows = request(f"{API}/{post_id}/insights",
                       params={"metric": ",".join(stable), "access_token": access}).get("data", [])
    return metric_values(rows)


def account_window(access, days, now):
    since = now - timedelta(days=days)
    rows = request(f"{API}/me/threads_insights", params={
        "metric": ",".join(ACCOUNT_METRICS), "since": int(since.timestamp()),
        "until": int(now.timestamp()), "access_token": access,
    }).get("data", [])
    daily = []
    for row in rows:
        if row["name"] == "views":
            for v in row.get("values", []):
                end = datetime.fromisoformat(v["end_time"].replace("+0000", "+00:00")).astimezone(PACIFIC)
                daily.append({"date": (end - timedelta(days=1)).date().isoformat(), "views": v.get("value", 0)})
    return metric_values(rows), daily


def collect():
    access = token(load_config())
    now = datetime.now(timezone.utc)
    me = request(f"{API}/me", params={"fields": "username", "access_token": access})
    followers = metric_values(request(f"{API}/me/threads_insights", params={
        "metric": "followers_count", "access_token": access}).get("data", [])).get("followers_count")
    week, _ = account_window(access, 7, now)
    month, daily = account_window(access, 30, now)
    posts = []
    for p in all_posts(access):
        posts.append({"id": p["id"], "timestamp": p["timestamp"], "media_type": p.get("media_type"),
                      "permalink": p.get("permalink", ""), "text": p.get("text") or "",
                      **post_insights(access, p["id"])})
    return {
        "fetched_at": now.astimezone(KST).isoformat(timespec="minutes"),
        "username": me.get("username"),
        "followers": followers,
        "account": {"last_7_days": week, "last_30_days": month, "daily_views": daily},
        "posts": sorted(posts, key=lambda p: p["timestamp"], reverse=True),
    }


# ── 문서 만들기 ───────────────────────────────────────────

def num(value):
    return "-" if value is None else f"{value:,}"


def signed(value):
    return "" if not value else f" (+{value:,})" if value > 0 else f" ({value:,})"


def short(text, width=26):
    line = " ".join((text or "(글 없음)").split()).replace("|", "/")
    return line if len(line) <= width else line[:width] + "…"


def posted_on(post):
    return datetime.fromisoformat(post["timestamp"].replace("+0000", "+00:00")).astimezone(KST)


def load_snapshots(directory):
    files = sorted((directory / "snapshots").glob("*.json"))
    return [json.loads(f.read_text()) for f in files]


def render_stats(snapshots):
    latest = snapshots[-1]
    previous = snapshots[-2] if len(snapshots) > 1 else None
    prev_posts = {p["id"]: p for p in previous["posts"]} if previous else {}
    day = latest["fetched_at"][:10]
    lines = [
        "---", "title: 스레드 통계", "product: running", "type: marketing", "status: draft",
        f"updated: {day}", "---", "",
        "# 스레드 통계", "",
        f"`scripts/threads-insights.py snapshot`이 만드는 파일이다. 직접 고치지 않는다. "
        f"가져오는 법과 지표 해석은 [README](README.md)에 있다.", "",
        f"**@{latest['username']}** · 마지막 수집 {latest['fetched_at'][:16].replace('T', ' ')} KST"
        + (f" · 지난 수집 {previous['fetched_at'][:10]}" if previous else ""), "",
        "## 요약", "",
        "| | 7일 | 30일 |", "|---|---:|---:|",
    ]
    week, month = latest["account"]["last_7_days"], latest["account"]["last_30_days"]
    for key in ACCOUNT_METRICS:
        lines.append(f"| {LABELS[key]} (계정 전체) | {num(week.get(key))} | {num(month.get(key))} |")
    change = latest["followers"] - previous["followers"] if previous and latest["followers"] is not None \
        and previous["followers"] is not None else None
    lines += [f"| **팔로워** | **{num(latest['followers'])}{signed(change)}** | |", ""]

    lines += ["## 팔로워 추이", "", "| 수집일 | 팔로워 | 변화 |", "|---|---:|---:|"]
    before = None
    for snap in snapshots:
        diff = snap["followers"] - before if before is not None and snap["followers"] is not None else None
        lines.append(f"| {snap['fetched_at'][:10]} | {num(snap['followers'])} | {signed(diff).strip(' ()') or '-'} |")
        before = snap["followers"]
    lines.append("")

    weekly = {}
    for d in latest["account"]["daily_views"]:
        start = datetime.fromisoformat(d["date"]).date()
        start -= timedelta(days=start.weekday())
        weekly[start] = weekly.get(start, 0) + d["views"]
    lines += ["## 주별 조회 (계정 전체, 최근 30일)", "", "| 주 (월요일 시작) | 조회 |", "|---|---:|"]
    lines += [f"| {w:%m/%d} 주 | {num(v)} |" for w, v in sorted(weekly.items())]
    lines += ["", "첫 주와 이번 주는 7일이 다 차지 않았을 수 있다.", ""]

    posts = latest["posts"]
    lines += [f"## 게시물 ({len(posts)}개, 올린 날부터 지금까지)", ""]
    if previous:
        lines += ["괄호는 지난 수집 대비 늘어난 값이다.", ""]
    lines += ["| 날짜 | 글 | 조회 | 좋아요 | 답글 | 리포스트 | 인용 | 공유 |",
              "|---|---|---:|---:|---:|---:|---:|---:|"]
    for p in posts:
        old = prev_posts.get(p["id"], {})
        cells = [f"{num(p.get(k))}{signed((p.get(k) or 0) - (old.get(k) or 0)) if old else ''}" for k in POST_METRICS]
        lines.append(f"| {posted_on(p):%m/%d} | [{short(p['text'])}]({p['permalink']}) | " + " | ".join(cells) + " |")
    totals = [sum(p.get(k) or 0 for p in posts) for k in POST_METRICS]
    lines += ["| | **합계** | " + " | ".join(f"**{t:,}**" for t in totals) + " |", ""]
    return "\n".join(lines)


def write_stats(directory):
    snapshots = load_snapshots(directory)
    if not snapshots:
        sys.exit("저장된 스냅숏이 없습니다. snapshot을 먼저 실행해 주세요.")
    path = directory / "stats.md"
    path.write_text(render_stats(snapshots))
    return path


def snapshot(args):
    data = collect()
    directory = Path(args.dir)
    (directory / "snapshots").mkdir(parents=True, exist_ok=True)
    path = directory / "snapshots" / f"{data['fetched_at'][:10]}.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")
    stats = write_stats(directory)
    print(f"저장: {path}\n갱신: {stats}")


def render(args):
    print(f"갱신: {write_stats(Path(args.dir))}")


def report(args):
    print(render_stats([collect()]))


def main():
    parser = argparse.ArgumentParser(description="팀 스레드 계정 통계")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("set-token", help="처음 한 번: 대시보드에서 만든 토큰 저장")
    sub.add_parser("login", help="토큰 생성기를 못 쓸 때: 리디렉션 방식으로 연결")
    for name, text in [("snapshot", "오늘 수치를 저장하고 통계 문서 갱신"),
                       ("render", "저장된 스냅숏으로 통계 문서만 다시 만들기")]:
        cmd = sub.add_parser(name, help=text)
        cmd.add_argument("--dir", default=str(OUT_DIR), help="저장 폴더 (기본: docs/marketing/threads)")
    sub.add_parser("report", help="저장하지 않고 터미널에만 보기")
    args = parser.parse_args()
    commands = {"set-token": set_token, "login": login, "snapshot": snapshot, "render": render, "report": report}
    try:
        commands[args.command](args)
    except ApiError as e:
        sys.exit(f"Threads API 오류: {e}")


if __name__ == "__main__":
    main()
