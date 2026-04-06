/**
 * A-STEROIDS Retro Sound Engine
 * All sounds generated programmatically using Web Audio API
 * Pure 80s squeaky Atari goodness
 */
window.ASteroids = window.ASteroids || {};
const ASteroids = window.ASteroids;

ASteroids.Audio = (function () {
    let ctx = null;
    let masterGain = null;
    let initialized = false;
    let muted = false;

    // Thump-thump heartbeat state
    let thumpInterval = null;
    let thumpVariant = 0;
    let thumpSpeed = 800; // ms between thumps

    function init() {
        if (initialized) return;
        try {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = ctx.createGain();
            masterGain.gain.value = 0.5;
            masterGain.connect(ctx.destination);
            initialized = true;
        } catch (e) {
            console.warn('Web Audio API not available:', e);
        }
    }

    function resume() {
        if (ctx && ctx.state === 'suspended') {
            ctx.resume();
        }
    }

    function now() {
        return ctx ? ctx.currentTime : 0;
    }

    function createNoiseBuffer(duration) {
        const sampleRate = ctx.sampleRate;
        const length = sampleRate * duration;
        const buffer = ctx.createBuffer(1, length, sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < length; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        return buffer;
    }

    // Classic "pew" laser fire - short descending square wave
    function fire() {
        if (!initialized || muted) return;
        const t = now();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(1200, t);
        osc.frequency.exponentialRampToValueAtTime(150, t + 0.12);

        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(t);
        osc.stop(t + 0.13);
    }

    // Thrust - filtered noise, continuous feel
    let thrustOsc = null;
    let thrustGain = null;
    let thrustNoise = null;

    function thrustOn() {
        if (!initialized || muted) return;
        if (thrustNoise) return; // already playing
        const t = now();

        const buffer = createNoiseBuffer(2);
        thrustNoise = ctx.createBufferSource();
        thrustNoise.buffer = buffer;
        thrustNoise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 200;
        filter.Q.value = 2;

        thrustGain = ctx.createGain();
        thrustGain.gain.setValueAtTime(0.001, t);
        thrustGain.gain.linearRampToValueAtTime(0.15, t + 0.05);

        // Add a low square wave rumble
        thrustOsc = ctx.createOscillator();
        thrustOsc.type = 'square';
        thrustOsc.frequency.value = 40;
        const oscGain = ctx.createGain();
        oscGain.gain.value = 0.06;

        thrustNoise.connect(filter);
        filter.connect(thrustGain);
        thrustOsc.connect(oscGain);
        oscGain.connect(thrustGain);
        thrustGain.connect(masterGain);

        thrustNoise.start(t);
        thrustOsc.start(t);
    }

    function thrustOff() {
        if (!thrustNoise) return;
        const t = now();
        try {
            if (thrustGain) {
                thrustGain.gain.linearRampToValueAtTime(0.001, t + 0.05);
            }
            setTimeout(() => {
                try {
                    if (thrustNoise) { thrustNoise.stop(); thrustNoise = null; }
                    if (thrustOsc) { thrustOsc.stop(); thrustOsc = null; }
                    thrustGain = null;
                } catch (e) {}
            }, 80);
        } catch (e) {
            thrustNoise = null;
            thrustOsc = null;
            thrustGain = null;
        }
    }

    // Explosion - noise burst, pitch varies by asteroid size
    // size: 3=large(deep), 2=medium, 1=small(high)
    function explode(size) {
        if (!initialized || muted) return;
        const t = now();

        const duration = [0.15, 0.25, 0.45][size - 1] || 0.3;
        const freq = [800, 300, 120][size - 1] || 300;

        const buffer = createNoiseBuffer(duration + 0.1);
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(freq * 3, t);
        filter.frequency.exponentialRampToValueAtTime(freq * 0.3, t + duration);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.25, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

        // Add a pitched component for that squeaky character
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.2, t + duration * 0.8);
        const oscGain = ctx.createGain();
        oscGain.gain.setValueAtTime(0.12, t);
        oscGain.gain.exponentialRampToValueAtTime(0.001, t + duration * 0.7);

        noise.connect(filter);
        filter.connect(gain);
        osc.connect(oscGain);
        oscGain.connect(gain);
        gain.connect(masterGain);

        noise.start(t);
        noise.stop(t + duration + 0.1);
        osc.start(t);
        osc.stop(t + duration);
    }

    // Classic thump-thump heartbeat
    function thump() {
        if (!initialized || muted) return;
        const t = now();
        const freq = thumpVariant === 0 ? 55 : 46;
        thumpVariant = 1 - thumpVariant;

        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = freq;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(t);
        osc.stop(t + 0.13);
    }

    function startHeartbeat(speed) {
        stopHeartbeat();
        thumpSpeed = speed || 800;
        thump();
        thumpInterval = setInterval(() => {
            thump();
        }, thumpSpeed);
    }

    function updateHeartbeat(speed) {
        if (speed !== thumpSpeed && thumpInterval) {
            thumpSpeed = speed;
            clearInterval(thumpInterval);
            thumpInterval = setInterval(() => {
                thump();
            }, thumpSpeed);
        }
    }

    function stopHeartbeat() {
        if (thumpInterval) {
            clearInterval(thumpInterval);
            thumpInterval = null;
        }
    }

    // UFO saucer sound - oscillating between two tones
    let saucerOsc1 = null;
    let saucerOsc2 = null;
    let saucerGainNode = null;

    function saucerOn(isSmall) {
        if (!initialized || muted) return;
        if (saucerOsc1) return;
        const t = now();
        const baseFreq = isSmall ? 800 : 400;

        saucerOsc1 = ctx.createOscillator();
        saucerOsc1.type = 'square';
        saucerOsc1.frequency.value = baseFreq;

        saucerOsc2 = ctx.createOscillator();
        saucerOsc2.type = 'square';
        saucerOsc2.frequency.value = baseFreq * 1.5;

        // LFO to switch between the two tones
        const lfo = ctx.createOscillator();
        lfo.frequency.value = isSmall ? 8 : 5;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = baseFreq * 0.3;
        lfo.connect(lfoGain);
        lfoGain.connect(saucerOsc1.frequency);

        saucerGainNode = ctx.createGain();
        saucerGainNode.gain.value = 0.1;

        saucerOsc1.connect(saucerGainNode);
        saucerOsc2.connect(saucerGainNode);
        saucerGainNode.connect(masterGain);

        saucerOsc1.start(t);
        saucerOsc2.start(t);
        lfo.start(t);
    }

    function saucerOff() {
        try {
            if (saucerOsc1) { saucerOsc1.stop(); saucerOsc1 = null; }
            if (saucerOsc2) { saucerOsc2.stop(); saucerOsc2 = null; }
            saucerGainNode = null;
        } catch (e) {
            saucerOsc1 = null;
            saucerOsc2 = null;
            saucerGainNode = null;
        }
    }

    // Extra life jingle - ascending arpeggio
    function extraLife() {
        if (!initialized || muted) return;
        const t = now();
        const notes = [523, 659, 784, 1047]; // C5, E5, G5, C6

        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.value = freq;

            const gain = ctx.createGain();
            const start = t + i * 0.08;
            gain.gain.setValueAtTime(0.15, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.12);

            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(start);
            osc.stop(start + 0.13);
        });
    }

    // Hyperspace warp sound
    function hyperspace() {
        if (!initialized || muted) return;
        const t = now();

        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(200, t);
        osc.frequency.exponentialRampToValueAtTime(2000, t + 0.15);
        osc.frequency.exponentialRampToValueAtTime(80, t + 0.4);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.15, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(t);
        osc.stop(t + 0.45);
    }

    // Game over sound - descending sad tones
    function gameOver() {
        if (!initialized || muted) return;
        const t = now();
        const notes = [440, 370, 311, 261];

        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'triangle';
            osc.frequency.value = freq;

            const gain = ctx.createGain();
            const start = t + i * 0.2;
            gain.gain.setValueAtTime(0.2, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.3);

            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(start);
            osc.stop(start + 0.35);
        });
    }

    // UI click/select sound
    function uiSelect() {
        if (!initialized || muted) return;
        const t = now();
        const osc = ctx.createOscillator();
        osc.type = 'square';
        osc.frequency.setValueAtTime(660, t);
        osc.frequency.setValueAtTime(880, t + 0.04);

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.1, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.08);

        osc.connect(gain);
        gain.connect(masterGain);
        osc.start(t);
        osc.stop(t + 0.09);
    }

    // Level up fanfare
    function levelUp() {
        if (!initialized || muted) return;
        const t = now();
        const notes = [392, 523, 659, 784, 1047];

        notes.forEach((freq, i) => {
            const osc = ctx.createOscillator();
            osc.type = 'square';
            osc.frequency.value = freq;

            const gain = ctx.createGain();
            const start = t + i * 0.06;
            gain.gain.setValueAtTime(0.12, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.15);

            osc.connect(gain);
            gain.connect(masterGain);
            osc.start(start);
            osc.stop(start + 0.16);
        });
    }

    function toggleMute() {
        muted = !muted;
        if (muted) {
            thrustOff();
            saucerOff();
            stopHeartbeat();
        }
        return muted;
    }

    function setVolume(v) {
        if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v));
    }

    return {
        init,
        resume,
        fire,
        thrustOn,
        thrustOff,
        explode,
        startHeartbeat,
        updateHeartbeat,
        stopHeartbeat,
        saucerOn,
        saucerOff,
        extraLife,
        hyperspace,
        gameOver,
        uiSelect,
        levelUp,
        toggleMute,
        setVolume,
        get muted() { return muted; }
    };
})();

