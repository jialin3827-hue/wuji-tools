#!/usr/bin/env bash
# Parse team quota-level.md into quota.json, then commit and push only if changed.
# Intended to run on the team box (needs /home/box/team-shared/quota-level.md).
set -euo pipefail

DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
SRC="${QUOTA_LEVEL_MD:-/home/box/team-shared/quota-level.md}"
OUT="$DIR/quota.json"

if [[ ! -f "$SRC" ]]; then
  echo "update.sh: source not found: $SRC" >&2
  exit 1
fi

python3 - "$SRC" "$OUT" << 'PY'
import json, re, sys
from pathlib import Path

src, out = Path(sys.argv[1]), Path(sys.argv[2])

NOTES = {
    "綠燈": "正常運作，可放心做研究、巡網路、試新工具",
    "黃燈": "只做賺錢線與重大消息；暫停一般研究與探索",
    "紅燈": "停掉非必要排程；只保留賺錢線與必要通知",
}
LEVEL_CODE = {"綠燈": "green", "黃燈": "yellow", "紅燈": "red"}

# 2026-11-17 中午｜黃燈｜78.8%｜週四 11/19 09:10（台北）重置
LINE = re.compile(
    r"^(?P<date>\d{4}-\d{2}-\d{2})(?:\s+(?P<tag>.+?))?"
    r"｜(?P<label>綠燈|黃燈|紅燈)"
    r"｜(?P<pct>\d+(?:\.\d+)?)%"
    r"｜週四\s+(?P<rm>\d{1,2})/(?P<rd>\d{1,2})\s+(?P<rh>\d{1,2}):(?P<rmin>\d{2})"
)

def level_from_percent(pct: float) -> str:
    if pct < 60:
        return "綠燈"
    if pct < 85:
        return "黃燈"
    return "紅燈"

def reset_iso(entry_date: str, month: int, day: int, hour: int, minute: int) -> str:
    year = int(entry_date[:4])
    em, ed = int(entry_date[5:7]), int(entry_date[8:10])
    # Reset date earlier in the calendar than the entry → next year (e.g. late Dec → early Jan).
    if (month, day) < (em, ed):
        year += 1
    return f"{year:04d}-{month:02d}-{day:02d}T{hour:02d}:{minute:02d}:00+08:00"

def updated_label(date: str, tag: str | None) -> str:
    tag = (tag or "").strip()
    return f"{date} {tag}".strip()

rows = []
unknown = 0
for raw in src.read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line or line.startswith("#"):
        continue
    m = LINE.match(line)
    if not m:
        unknown += 1
        print(f"update.sh: skip unrecognized line: {line}", file=sys.stderr)
        continue
    pct = float(m.group("pct"))
    label = m.group("label")
    computed = level_from_percent(pct)
    if computed != label:
        print(
            f"update.sh: warning: {line} percent maps to {computed}, file says {label}; using file label",
            file=sys.stderr,
        )
    rows.append({
        "updated": updated_label(m.group("date"), m.group("tag")),
        "percent": pct if pct != int(pct) else int(pct) if float(int(pct)) == pct else pct,
        "level": LEVEL_CODE[label],
        "levelLabel": label,
        "resetAt": reset_iso(
            m.group("date"),
            int(m.group("rm")),
            int(m.group("rd")),
            int(m.group("rh")),
            int(m.group("rmin")),
        ),
    })

if not rows:
    print("update.sh: no valid rows in source", file=sys.stderr)
    sys.exit(1)

# Keep integer percents as int (42) and one-decimal as float (78.8)
def clean_pct(n):
    if abs(n - round(n, 1)) < 1e-9:
        n = round(n, 1)
    if abs(n - int(n)) < 1e-9:
        return int(n)
    return n

for row in rows:
    row["percent"] = clean_pct(row["percent"])

cur = rows[-1]
payload = {
    "percent": cur["percent"],
    "level": cur["level"],
    "levelLabel": cur["levelLabel"],
    "updated": cur["updated"],
    "resetAt": cur["resetAt"],
    "note": NOTES[cur["levelLabel"]],
    "history": [
        {k: r[k] for k in ("updated", "percent", "level", "levelLabel")}
        for r in rows
    ],
}

text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
if out.exists() and out.read_text(encoding="utf-8") == text:
    print("unchanged")
    sys.exit(0)

out.write_text(text, encoding="utf-8")
print(f"wrote {out} {cur['levelLabel']} {cur['percent']}% updated={cur['updated']} reset={cur['resetAt']}")
if unknown:
    print(f"update.sh: skipped {unknown} unrecognized line(s)", file=sys.stderr)
PY

# If python printed "unchanged" and the file already matches HEAD, skip git.
cd "$ROOT"
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  git add "quota/quota.json"
  if git diff --cached --quiet -- "quota/quota.json"; then
    echo "git: quota.json already committed, nothing to push"
    exit 0
  fi
  # Keep identity if already set; otherwise use the repo's existing wuji-bot identity.
  if ! git config user.name >/dev/null; then
    git config user.name "wuji-bot"
    git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
  fi
  msg="quota: update $(python3 -c 'import json; d=json.load(open("quota/quota.json")); print(d["levelLabel"], str(d["percent"])+"%")') $(TZ=Asia/Taipei date +%F_%H%M)"
  git commit -m "$msg"
  git fetch origin
  if ! git rebase origin/main; then
    echo "update.sh: rebase onto origin/main failed" >&2
    exit 1
  fi
  git push origin HEAD
  echo "git: committed and pushed: $msg"
fi
