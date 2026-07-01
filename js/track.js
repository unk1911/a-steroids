/**
 * A-STEROIDS - Lightweight first-party play-event tracking.
 *
 * Fire-and-forget beacons to our own server (track.php). No third parties,
 * no cookies, no user data. Purpose: distinguish real humans who actually
 * play from the bot/scanner noise that dominates the raw access logs.
 *
 * Every call is wrapped so tracking can NEVER interfere with the game.
 */
(function () {
    'use strict';

    var ENDPOINT = 'track.php';

    // Per-page-load id so events from one visit can be grouped into a session.
    var session = (Math.random().toString(36).slice(2, 10)) +
                  (Math.random().toString(36).slice(2, 6));

    function send(event, data) {
        try {
            var payload = JSON.stringify({
                e: event,
                s: session,
                d: data || {},
                r: document.referrer || ''
            });
            if (navigator.sendBeacon) {
                navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'application/json' }));
            } else if (window.fetch) {
                fetch(ENDPOINT, {
                    method: 'POST',
                    body: payload,
                    headers: { 'Content-Type': 'application/json' },
                    keepalive: true
                }).catch(function () {});
            }
        } catch (err) {
            /* never let tracking break the game */
        }
    }

    window.ASteroids = window.ASteroids || {};
    window.ASteroids.Track = { event: send, session: session };
})();
