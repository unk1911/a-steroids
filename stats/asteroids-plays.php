<?php
/**
 * A-STEROIDS - Play-events summary.
 *
 * Lives under /var/www/stats, so it inherits the existing Basic Auth. Reads
 * the first-party event log (game_start / level_reached / game_over) and
 * summarizes REAL players, separated from the bot/scanner noise that inflates
 * the GoAccess reports next door.
 */

$LOG = '/var/www/_stats/asteroids-events.log';

// A user-agent looks like a bot if it matches any of these.
$BOT_RE = '/bot|crawl|spider|slurp|python|curl|wget|go-http|scan|headless|phantom|censys|palo alto|zgrab|monitor|uptime|axios|node-fetch|java\//i';

$events = [];
if (is_readable($LOG)) {
    foreach (file($LOG, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
        $r = json_decode($line, true);
        if (is_array($r) && isset($r['event'])) {
            $r['is_bot'] = isset($r['ua']) && preg_match($BOT_RE, $r['ua']);
            $events[] = $r;
        }
    }
}

$today = gmdate('Y-m-d');
$isToday = function ($r) use ($today) {
    return isset($r['ts']) && strpos($r['ts'], $today) === 0;
};

// --- aggregate --- (PHP 7.2: use closures, no arrow functions)
$isEvent = function ($name) {
    return function ($r) use ($name) { return $r['event'] === $name; };
};
$notBot = function ($r) { return !$r['is_bot']; };

$starts = array_filter($events, $isEvent('game_start'));
$overs  = array_filter($events, $isEvent('game_over'));

$humanStarts = array_filter($starts, $notBot);
$humanOvers  = array_filter($overs,  $notBot);

$sessions       = array_unique(array_column($starts, 'session'));
$humanSessions  = array_unique(array_column($humanStarts, 'session'));
$todayHumanStarts = array_filter($humanStarts, $isToday);
$todayHumanSess   = array_unique(array_column($todayHumanStarts, 'session'));

$scores = array_map(function ($r) { return (int) ($r['score'] ?? 0); }, $humanOvers);
sort($scores);
$maxScore = $scores ? max($scores) : 0;
$medScore = $scores ? $scores[intdiv(count($scores), 2)] : 0;
$avgScore = $scores ? round(array_sum($scores) / count($scores)) : 0;
$levels   = array_map(function ($r) { return (int) ($r['level'] ?? 0); }, $events);
$deepest  = $levels ? max($levels) : 0;

// Completion: of human sessions that started, how many reached game_over?
$overSessions = array_unique(array_column($humanOvers, 'session'));
$completion = count($humanSessions) ? round(100 * count(array_intersect($humanSessions, $overSessions)) / count($humanSessions)) : 0;

$fmt = function ($n) { return number_format($n); };
$recent = array_slice(array_reverse($events), 0, 25);

function h($s) { return htmlspecialchars((string) $s, ENT_QUOTES, 'UTF-8'); }
?>
<!DOCTYPE html>
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
  <div class="sub">
    First-party play events &middot; bot-filtered &middot; UTC &middot;
    <a href="asteroids.html">GoAccess raw-traffic report &rarr;</a>
  </div>

<?php if (!$events): ?>
  <div class="empty">No play events logged yet. Once someone presses Enter and plays, they'll show up here.</div>
<?php else: ?>

  <div class="grid">
    <div class="card"><div class="n"><?= $fmt(count($todayHumanSess)) ?></div><div class="l">Players today</div><div class="x">unique sessions, humans</div></div>
    <div class="card"><div class="n"><?= $fmt(count($humanSessions)) ?></div><div class="l">Players all-time</div><div class="x">unique human sessions</div></div>
    <div class="card"><div class="n"><?= $fmt(count($humanStarts)) ?></div><div class="l">Games started</div><div class="x">humans (<?= $fmt(count($starts) - count($humanStarts)) ?> bot)</div></div>
    <div class="card"><div class="n"><?= $completion ?>%</div><div class="l">Reached game over</div><div class="x">of players who started</div></div>
    <div class="card"><div class="n"><?= $fmt($maxScore) ?></div><div class="l">Top score</div><div class="x">median <?= $fmt($medScore) ?> &middot; avg <?= $fmt($avgScore) ?></div></div>
    <div class="card"><div class="n"><?= $fmt($deepest) ?></div><div class="l">Deepest level</div><div class="x">reached by anyone</div></div>
  </div>

  <h2>RECENT EVENTS (LAST 25)</h2>
  <table>
    <tr><th>Time (UTC)</th><th>Event</th><th>Score</th><th>Lvl</th><th>Who</th><th>User-Agent</th></tr>
<?php foreach ($recent as $r): ?>
    <tr>
      <td><?= h(str_replace(['T', '+00:00'], [' ', ''], $r['ts'] ?? '')) ?></td>
      <td><?= h($r['event']) ?></td>
      <td><?= $r['event'] === 'game_over' ? h($fmt((int) $r['score'])) : '' ?></td>
      <td><?= (int) ($r['level'] ?? 0) ?: '' ?></td>
      <td class="<?= $r['is_bot'] ? 'bot' : 'human' ?>"><?= $r['is_bot'] ? 'bot' : 'human' ?></td>
      <td class="ua"><?= h($r['ua'] ?? '') ?></td>
    </tr>
<?php endforeach; ?>
  </table>
<?php endif; ?>

</body>
</html>
