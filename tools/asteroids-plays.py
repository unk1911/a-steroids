#!/usr/bin/env python3
"""A-STEROIDS - play-events collector + summary page. No PHP, no web-facing code.

The game requests t.gif?e=<event>&s=<session>&n=<seq>&score=&level=&r=<referrer>.
Apache's access log is therefore the raw event log. Every run (cron, as root
because the logs are root:adm 640) this script:

  1. pulls t.gif hits from the current and previous access log,
  2. validates them exactly like the old track.php did and appends new ones to
     the persistent JSONL event log (which outlives the 14-day log rotation),
  3. renders a static summary into /var/www/stats (behind its Basic Auth).

Must stay Python 3.6 compatible (Ubuntu 18.04).
"""
import gzip
import html
import json
import os
import re
import sys
import tempfile
from datetime import datetime, timezone
from urllib.parse import parse_qs, urlsplit

ACCESS_LOGS = [
    '/var/log/apache2/a-steroids.edeliverables.com-access.log.1',
    '/var/log/apache2/a-steroids.edeliverables.com-access.log',
]
EVENTS_LOG = '/var/www/_stats/asteroids-events.log'
OUT_HTML = '/var/www/stats/asteroids-plays.html'

ALLOWED = {'game_start', 'level_reached', 'game_over'}

# A user-agent looks like a bot if it matches any of these.
BOT_RE = re.compile(r'bot|crawl|spider|slurp|python|curl|wget|go-http|scan|headless|'
                    r'phantom|censys|palo alto|zgrab|monitor|uptime|axios|node-fetch|java/', re.I)

# Apache "combined" format. Quoted fields may contain \" escapes.
Q = r'"((?:[^"\\]|\\.)*)"'
LINE_RE = re.compile(r'^(\S+) \S+ \S+ \[([^\]]+)\] ' + Q + r' (\d{3}) \S+ ' + Q + ' ' + Q)


def clamp_int(v, lo, hi):
    try:
        n = int(v)
    except (TypeError, ValueError):
        n = 0
    return max(lo, min(hi, n))


def parse_line(line):
    m = LINE_RE.match(line)
    if not m:
        return None
    ip, when, request, status, _referer, ua = m.groups()
    parts = request.split(' ')
    if len(parts) < 2 or parts[0] != 'GET' or status not in ('200', '304'):
        return None
    url = urlsplit(parts[1])
    if url.path != '/t.gif':
        return None
    q = {k: v[0] for k, v in parse_qs(url.query).items()}
    event = q.get('e', '')
    if event not in ALLOWED:
        return None
    ts = datetime.strptime(when, '%d/%b/%Y:%H:%M:%S %z').astimezone(timezone.utc)
    return {
        'ts': ts.strftime('%Y-%m-%dT%H:%M:%S+00:00'),
        'ip': ip,
        'ua': ua.replace('\\"', '"')[:300],
        'ref': q.get('r', '')[:300],
        'event': event,
        'session': re.sub(r'[^A-Za-z0-9_-]', '', q.get('s', '')[:40]),
        'n': clamp_int(q.get('n'), 0, 100000),
        'score': clamp_int(q.get('score'), 0, 100000000),
        'level': clamp_int(q.get('level'), 0, 10000),
    }


def key(r):
    return (r.get('ts'), r.get('ip'), r.get('session'), r.get('event'), r.get('n', 0))


def load_events():
    events = []
    if os.path.exists(EVENTS_LOG):
        with open(EVENTS_LOG, encoding='utf-8', errors='replace') as f:
            for line in f:
                try:
                    r = json.loads(line)
                except ValueError:
                    continue
                if isinstance(r, dict) and 'event' in r:
                    events.append(r)
    return events


def collect(events):
    seen = set(key(r) for r in events)
    new = []
    for path in ACCESS_LOGS:
        if not os.path.exists(path):
            continue
        opener = gzip.open if path.endswith('.gz') else open
        with opener(path, 'rt', encoding='utf-8', errors='replace') as f:
            for line in f:
                if 't.gif' not in line:
                    continue
                r = parse_line(line)
                if r and key(r) not in seen:
                    seen.add(key(r))
                    new.append(r)
    new.sort(key=lambda r: (r['ts'], r['n']))
    if new:
        with open(EVENTS_LOG, 'a', encoding='utf-8') as f:
            for r in new:
                f.write(json.dumps(r, separators=(',', ':')) + '\n')
    return events + new


def h(s):
    return html.escape(str(s), quote=True)


def fmt(n):
    return '{:,}'.format(n)


def render(events):
    for r in events:
        r['is_bot'] = bool(BOT_RE.search(r.get('ua', '')))
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')

    starts = [r for r in events if r['event'] == 'game_start']
    overs = [r for r in events if r['event'] == 'game_over']
    human_starts = [r for r in starts if not r['is_bot']]
    human_overs = [r for r in overs if not r['is_bot']]

    human_sessions = set(r.get('session') for r in human_starts)
    today_sessions = set(r.get('session') for r in human_starts if r.get('ts', '').startswith(today))

    scores = sorted(int(r.get('score', 0)) for r in human_overs)
    max_score = scores[-1] if scores else 0
    med_score = scores[len(scores) // 2] if scores else 0
    avg_score = round(sum(scores) / len(scores)) if scores else 0
    deepest = max((int(r.get('level', 0)) for r in events), default=0)

    over_sessions = set(r.get('session') for r in human_overs)
    completion = round(100 * len(human_sessions & over_sessions) / len(human_sessions)) if human_sessions else 0

    recent = sorted(events, key=lambda r: (r.get('ts', ''), r.get('n', 0)), reverse=True)[:25]
    updated = datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')

    out = [HEAD, '  <div class="sub">\n    First-party play events &middot; bot-filtered &middot; UTC &middot; updated %s &middot;\n'
           '    <a href="asteroids.html">GoAccess raw-traffic report &rarr;</a>\n  </div>\n' % updated]
    if not events:
        out.append("  <div class=\"empty\">No play events logged yet. Once someone presses Enter and plays, they'll show up here.</div>\n")
    else:
        cards = [
            (fmt(len(today_sessions)), 'Players today', 'unique sessions, humans'),
            (fmt(len(human_sessions)), 'Players all-time', 'unique human sessions'),
            (fmt(len(human_starts)), 'Games started', 'humans (%s bot)' % fmt(len(starts) - len(human_starts))),
            ('%d%%' % completion, 'Reached game over', 'of players who started'),
            (fmt(max_score), 'Top score', 'median %s &middot; avg %s' % (fmt(med_score), fmt(avg_score))),
            (fmt(deepest), 'Deepest level', 'reached by anyone'),
        ]
        out.append('  <div class="grid">\n')
        for n, l, x in cards:
            out.append('    <div class="card"><div class="n">%s</div><div class="l">%s</div><div class="x">%s</div></div>\n' % (n, l, x))
        out.append('  </div>\n\n  <h2>RECENT EVENTS (LAST 25)</h2>\n  <table>\n'
                   '    <tr><th>Time (UTC)</th><th>Event</th><th>Score</th><th>Lvl</th><th>Who</th><th>User-Agent</th></tr>\n')
        for r in recent:
            ts = r.get('ts', '').replace('T', ' ').replace('+00:00', '')
            score = fmt(int(r.get('score', 0))) if r['event'] == 'game_over' else ''
            lvl = int(r.get('level', 0)) or ''
            who = 'bot' if r['is_bot'] else 'human'
            out.append('    <tr><td>%s</td><td>%s</td><td>%s</td><td>%s</td><td class="%s">%s</td><td class="ua">%s</td></tr>\n'
                       % (h(ts), h(r['event']), h(score), h(lvl), who, who, h(r.get('ua', ''))))
        out.append('  </table>\n')
    out.append('</body>\n</html>\n')

    # Atomic replace so a reader never sees a half-written page.
    d = os.path.dirname(OUT_HTML)
    fd, tmp = tempfile.mkstemp(dir=d, prefix='.asteroids-plays.')
    with os.fdopen(fd, 'w', encoding='utf-8') as f:
        f.write(''.join(out))
    os.chmod(tmp, 0o644)
    os.replace(tmp, OUT_HTML)


HEAD = """<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>A-STEROIDS &middot; Real Plays</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { background:#050805; color:#cfc; font-family:'Courier New',monospace; padding:24px; line-height:1.5; }
  h1 { color:#0f0; letter-spacing:3px; font-size:20px; margin-bottom:4px; }
  .sub { color:#6a6; font-size:12px; margin-bottom:20px; }
  .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); gap:12px; margin-bottom:24px; }
  .card { border:1px solid #1a3a1a; border-radius:8px; background:#0a0f0a; padding:14px 16px; }
  .card .n { font-size:30px; color:#0f0; font-weight:bold; }
  .card .l { font-size:11px; color:#7a7; letter-spacing:1px; text-transform:uppercase; }
  .card .x { font-size:11px; color:#585; margin-top:4px; }
  h2 { color:#0a0; font-size:13px; letter-spacing:2px; margin:20px 0 10px; border-bottom:1px solid #1a3a1a; padding-bottom:6px; }
  table { width:100%; border-collapse:collapse; font-size:12px; }
  th,td { text-align:left; padding:5px 8px; border-bottom:1px solid #122; }
  th { color:#6a6; font-weight:normal; }
  .bot { color:#844; }
  .human { color:#0d0; }
  .ua { color:#585; max-width:340px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .empty { color:#585; padding:20px 0; }
  a { color:#0a0; }
</style>
</head>
<body>
  <h1>A-STEROIDS &mdash; REAL PLAYS</h1>
"""


if __name__ == '__main__':
    if len(sys.argv) > 1:  # test hook: asteroids-plays.py <events.log> <out.html> [access logs...]
        EVENTS_LOG, OUT_HTML = sys.argv[1], sys.argv[2]
        ACCESS_LOGS = sys.argv[3:]
    render(collect(load_events()))
