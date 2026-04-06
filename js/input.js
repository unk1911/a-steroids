/**
 * A-STEROIDS Input Handler
 * Keyboard input with key state tracking + mobile touch controls
 */
window.ASteroids.Input = (function () {
    const keys = {};
    const justPressed = {};
    const callbacks = {};

    // Touch state
    let isTouchDevice = false;
    let touchActive = false;
    let touchX = 0;
    let touchY = 0;
    let touchStartTime = 0;
    let touchStartX = 0;
    let touchStartY = 0;
    let holdTimer = null;
    let tapTarget = { x: 0, y: 0, active: false };

    function init() {
        window.addEventListener('keydown', (e) => {
            // Prevent scrolling with game keys
            if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
                e.preventDefault();
            }
            if (!keys[e.code]) {
                justPressed[e.code] = true;
            }
            keys[e.code] = true;

            // Fire one-shot callbacks
            if (callbacks[e.code]) {
                callbacks[e.code].forEach(fn => fn());
            }
        });

        window.addEventListener('keyup', (e) => {
            keys[e.code] = false;
        });

        // Lose focus = release all keys
        window.addEventListener('blur', () => {
            Object.keys(keys).forEach(k => keys[k] = false);
            touchActive = false;
        });

        // Detect touch device and set up touch handlers
        if ('ontouchstart' in window) {
            isTouchDevice = true;
            document.body.classList.add('touch-device');
            initTouch();
        }
    }

    function initTouch() {
        const canvas = document.getElementById('gameCanvas');

        canvas.addEventListener('touchstart', (e) => {
            e.preventDefault();

            // Ignore multi-touch
            if (e.touches.length >= 2) {
                return;
            }

            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            touchX = (touch.clientX - rect.left) * (canvas.width / rect.width);
            touchY = (touch.clientY - rect.top) * (canvas.height / rect.height);
            touchStartX = touchX;
            touchStartY = touchY;
            touchStartTime = performance.now();

            // Delay thrust to distinguish tap (shoot) from hold (fly)
            holdTimer = setTimeout(() => {
                touchActive = true;
                keys['ArrowUp'] = true;
                holdTimer = null;
            }, 120);

            // Trigger start on title/gameover screens
            justPressed['Enter'] = true;
        }, { passive: false });

        canvas.addEventListener('touchmove', (e) => {
            e.preventDefault();
            if (e.touches.length < 1) return;

            const touch = e.touches[0];
            const rect = canvas.getBoundingClientRect();
            touchX = (touch.clientX - rect.left) * (canvas.width / rect.width);
            touchY = (touch.clientY - rect.top) * (canvas.height / rect.height);
        }, { passive: false });

        canvas.addEventListener('touchend', (e) => {
            e.preventDefault();

            // If no more touches, release
            if (e.touches.length === 0) {
                // Clear hold timer if tap was too short to trigger it
                if (holdTimer) {
                    clearTimeout(holdTimer);
                    holdTimer = null;
                }

                const elapsed = performance.now() - touchStartTime;
                const dx = touchX - touchStartX;
                const dy = touchY - touchStartY;
                const dragDist = Math.sqrt(dx * dx + dy * dy);

                // Quick tap = auto-aim at tap point + fire
                if (elapsed < 300 && dragDist < 25) {
                    tapTarget = { x: touchX, y: touchY, active: true };
                    justPressed['Space'] = true;
                    keys['Space'] = true;
                    setTimeout(() => { keys['Space'] = false; }, 80);
                }

                touchActive = false;
                keys['ArrowUp'] = false;
            }
        }, { passive: false });

        canvas.addEventListener('touchcancel', (e) => {
            e.preventDefault();
            if (holdTimer) {
                clearTimeout(holdTimer);
                holdTimer = null;
            }
            touchActive = false;
            keys['ArrowUp'] = false;
        }, { passive: false });

        // Prevent default on the document to stop pull-to-refresh and overscroll
        document.addEventListener('touchmove', (e) => {
            if (e.target === canvas || canvas.contains(e.target)) {
                e.preventDefault();
            }
        }, { passive: false });
    }

    function isDown(code) {
        return !!keys[code];
    }

    function wasPressed(code) {
        if (justPressed[code]) {
            justPressed[code] = false;
            return true;
        }
        return false;
    }

    function clearJustPressed() {
        Object.keys(justPressed).forEach(k => justPressed[k] = false);
    }

    function onPress(code, fn) {
        if (!callbacks[code]) callbacks[code] = [];
        callbacks[code].push(fn);
    }

    // Game controls (supports WASD and Arrow keys)
    function left() { return isDown('ArrowLeft') || isDown('KeyA'); }
    function right() { return isDown('ArrowRight') || isDown('KeyD'); }
    function up() { return isDown('ArrowUp') || isDown('KeyW'); }
    function shoot() { return isDown('Space'); }
    function hyperspace() { return wasPressed('ShiftLeft') || wasPressed('ShiftRight') || wasPressed('KeyH'); }
    function start() { return wasPressed('Enter') || wasPressed('Space'); }
    function pause() { return wasPressed('KeyP') || wasPressed('Escape'); }

    function getTouchTarget() {
        return { active: touchActive, x: touchX, y: touchY };
    }

    function getIsTouchDevice() {
        return isTouchDevice;
    }

    function getTapTarget() {
        return tapTarget;
    }

    function clearTapTarget() {
        tapTarget.active = false;
    }

    return {
        init,
        isDown,
        wasPressed,
        clearJustPressed,
        onPress,
        left,
        right,
        up,
        shoot,
        hyperspace,
        start,
        pause,
        getTouchTarget,
        getTapTarget,
        clearTapTarget,
        isTouchDevice: getIsTouchDevice
    };
})();
