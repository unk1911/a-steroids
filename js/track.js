/**
 * A-STEROIDS - Lightweight first-party play-event tracking.
 *
 * Fire-and-forget GETs of a static 1x1 gif (t.gif) on our own server, with the
 * event in the query string. There is no server-side code: Apache's access log
 * is the event log, and tools/asteroids-plays.py summarizes it on a cron.
 * No third parties, no cookies, no user data. Purpose: distinguish real humans
 * who actually play from the bot/scanner noise that dominates the raw logs.
 *
 * Every call is wrapped so tracking can NEVER interfere with the game.
 */
(function () {
    'use strict';

    var ENDPOINT = 't.gif';

    // Per-page-load id so events from one visit can be grouped into a session.
    var session = (Math.random().toString(36).slice(2, 10)) +
                  (Math.random().toString(36).slice(2, 6));

    // Per-event counter: keeps every URL unique so no event is served from cache.
    var seq = 0;

    function send(event, data) {
        try {
            data = data || {};
            var q = 'e=' + encodeURIComponent(event) +
                    '&s=' + session +
                    '&n=' + (++seq) +
                    '&score=' + (parseInt(data.score, 10) || 0) +
                    '&level=' + (parseInt(data.level, 10) || 0) +
                    '&r=' + encodeURIComponent((document.referrer || '').slice(0, 300));
            var url = ENDPOINT + '?' + q;
            if (window.fetch) {
                // keepalive lets the game_over beacon survive the tab closing.
                fetch(url, { keepalive: true, cache: 'no-store', credentials: 'omit' })
                    .catch(function () {});
            } else {
                new Image().src = url;
            }
        } catch (err) {
            /* never let tracking break the game */
        }
    }

    window.ASteroids = window.ASteroids || {};
    window.ASteroids.Track = { event: send, session: session };
})();
