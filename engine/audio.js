/**
 * SplitGasto 2026 — Shared Audio Engine
 * engine/audio.js  v1.0
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

    /** Roulette tick — frequency depends on spin speed */
    function tick(speed) {
        resume();
        var freq = 300 + Math.min(speed * 4000, 900);
        tone(freq, 0.04, 'triangle', 0.12);
    }

    /** Coin metallic ring */
    function coinSpin() {
        resume();
        [1200, 1800, 2400].forEach(function (f, i) {
            tone(f, 0.6, 'sine', 0.10, i * 0.05);
        });
    }

    /** Coin landing thud */
    function coinLand() {
        resume();
        noiseBurst(0.15, 0.5, 25);
        tone(280, 0.15, 'sine', 0.4, 0);
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
