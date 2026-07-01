<?php
/**
 * A-STEROIDS - First-party play-event collector.
 *
 * Appends one JSON line per event to a log OUTSIDE the web root. No cookies,
 * no third parties. Deliberately permissive on failure (returns 204) so a
 * bad/garbage request never surfaces to the player.
 */

// Beacons are POSTs; ignore everything else (incl. the constant scanner GETs).
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    http_response_code(405);
    exit;
}

// Cap the read — these payloads are tiny; anything large is abuse.
$raw  = file_get_contents('php://input', false, null, 0, 4096);
$data = json_decode($raw, true);
if (!is_array($data)) {
    http_response_code(204);
    exit;
}

// Only known event names are recorded.
$allowed = ['game_start' => 1, 'level_reached' => 1, 'game_over' => 1];
$event   = isset($data['e']) ? (string) $data['e'] : '';
if (!isset($allowed[$event])) {
    http_response_code(204);
    exit;
}

$clampInt = function ($v, $min, $max) {
    $n = (int) $v;
    return $n < $min ? $min : ($n > $max ? $max : $n);
};

$d = (isset($data['d']) && is_array($data['d'])) ? $data['d'] : [];

$rec = [
    'ts'      => gmdate('c'),
    'ip'      => $_SERVER['REMOTE_ADDR'] ?? '',
    'ua'      => substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 300),
    'ref'     => substr((string) ($data['r'] ?? ''), 0, 300),
    'event'   => $event,
    'session' => preg_replace('/[^A-Za-z0-9_-]/', '', substr((string) ($data['s'] ?? ''), 0, 40)),
    'score'   => $clampInt($d['score'] ?? 0, 0, 100000000),
    'level'   => $clampInt($d['level'] ?? 0, 0, 10000),
];

$logfile = '/var/www/_stats/asteroids-events.log';
@file_put_contents($logfile, json_encode($rec, JSON_UNESCAPED_SLASHES) . "\n", FILE_APPEND | LOCK_EX);

http_response_code(204);
