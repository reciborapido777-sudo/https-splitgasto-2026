/**
 * SplitGasto 2026 — Shared Audio Engine
 * engine/audio.js  v4.31
 *
 * Web Audio API sound effects — no external files, pure synthesis.
 * All functions are added to the global `SGAudio` object.
 */
(function () {
    'use strict';

    var AudioCtxClass = window.AudioContext || window.webkitAudioContext;
    var _ctx = null;

    function ctx() {
        if (!_ctx) _ctx = new AudioCtxClass();
        return _ctx;
    }

    /** Resume AudioContext after a user gesture (browser autoplay policy) */
    function resume() {
        try { if (_ctx && _ctx.state === 'suspended') _ctx.resume(); } catch (e) {}
    }

    /**
     * Generic tone: oscillator + gain envelope
     * @param {number} freq     Hz
     * @param {number} dur      seconds
     * @param {string} type     oscillator type ('sine'|'triangle'|'square'|'sawtooth')
     * @param {number} vol      peak gain (0–1)
     * @param {number} delay    start delay in seconds from now
     */
    function tone(freq, dur, type, vol, delay) {
        try {
            var c = ctx();
            var t0 = c.currentTime + (delay || 0);
            var osc = c.createOscillator();
            var gain = c.createGain();
            osc.connect(gain);
            gain.connect(c.destination);
            osc.type = type || 'sine';
            osc.frequency.setValueAtTime(freq, t0);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.5, t0 + dur);
            gain.gain.setValueAtTime(vol || 0.2, t0);
            gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
            osc.start(t0);
            osc.stop(t0 + dur);
        } catch (e) {}
    }

    /** White/brown noise burst (card flip, coin land) */
    function noiseBurst(dur, vol, decay) {
        try {
            var c = ctx();
            var sr = c.sampleRate;
            var len = Math.floor(sr * dur);
            var buf = c.createBuffer(1, len, sr);
            var data = buf.getChannelData(0);
            var d = decay || 15;
            for (var i = 0; i < len; i++) {
                data[i] = (Math.random() * 2 - 1) * Math.exp(-d * i / len) * (vol || 0.4);
            }
            var src = c.createBufferSource();
            src.buffer = buf;
            src.connect(c.destination);
            src.start();
        } catch (e) {}
    }

    /** Victory fanfare: ascending major chord */
    function victory() {
        resume();
        [523, 659, 784, 1047].forEach(function (f, i) {
            tone(f, 0.4, 'sine', 0.22, i * 0.12);
        });
    }

    /** Roulette tick — speed 0 (slow) → 1 (fast)
     *  At fast spin: short high-pitched click. At slow: deeper thud.
     */
    function tick(speed) {
        resume();
        var s = Math.min(Math.max(speed || 0, 0), 1);
        var freq = 280 + s * 720;   // 280 Hz slow → 1000 Hz fast
        var dur  = 0.04 - s * 0.02; // shorter at high speed
        var vol  = 0.10 + s * 0.06;
        tone(freq, dur, 'triangle', vol);
        // Add a quiet noise click at high speed
        if (s > 0.4) noiseBurst(0.02, vol * 0.5, 40);
    }

    /** Coin metallic ring — rising shimmer */
    function coinSpin() {
        resume();
        // 3-partial metallic shimmer
        [900, 1400, 2100].forEach(function (f, i) {
            tone(f, 0.8, 'sine', 0.09, i * 0.04);
        });
        // Sub thud at launch
        tone(120, 0.1, 'sine', 0.3, 0);
    }

    /** Coin landing thud + bounce ring */
    function coinLand() {
        resume();
        // Impact thud
        noiseBurst(0.12, 0.55, 30);
        tone(240, 0.12, 'sine', 0.45, 0);
        // Metallic ring decay
        tone(1600, 0.35, 'sine', 0.12, 0.05);
        tone(1100, 0.25, 'sine', 0.08, 0.08);
    }

    /** Card flip */
    function cardFlip() {
        resume();
        noiseBurst(0.10, 0.25, 20);
    }

    /** Dart hit — score-based pitch */
    function dartHit(score) {
        resume();
        var freq = score >= 50 ? 1200 : score >= 25 ? 900 : score > 0 ? 600 : 180;
        var type = score >= 50 ? 'sine' : 'triangle';
        tone(freq, 0.15, type, 0.28);
    }

    /** UI click feedback */
    function click() {
        resume();
        tone(600, 0.06, 'triangle', 0.12);
    }

    window.SGAudio = {
        resume: resume,
        tone: tone,
        noiseBurst: noiseBurst,
        victory: victory,
        tick: tick,
        coinSpin: coinSpin,
        coinLand: coinLand,
        cardFlip: cardFlip,
        dartHit: dartHit,
        click: click
    };
})();
