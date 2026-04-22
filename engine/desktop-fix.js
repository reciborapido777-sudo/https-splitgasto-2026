/**
 * SplitGasto 2026 — Desktop Frame Fix
 * engine/desktop-fix.js  v2.0
 *
 * Applies correct layout constraints on desktop (≥768px).
 * - Does NOT change position:fixed → sticky (causes CSS conflicts).
 * - Instead, sets inline constraints on the fixed nav so it matches
 *   the 1200px app-frame column on desktop.
 * - Handles fixed-top headers to behave within the frame.
 */
(function () {
    'use strict';

    function applyDesktopFix() {
        var isDesktop = window.innerWidth >= 768;
        var frame = document.querySelector('.app-frame');
        if (!frame) return;

        // ── Fixed bottom nav ──────────────────────────────────────────
        var fixedBotEls = frame.querySelectorAll('[class*="fixed bottom"]');
        fixedBotEls.forEach(function (el) {
            if (isDesktop) {
                // Keep position:fixed but constrain to the frame column
                el.style.left = 'auto';
                el.style.right = 'auto';
                el.style.width = frame.getBoundingClientRect().width + 'px';
                el.style.marginLeft = '0';
                el.style.marginRight = '0';
                // horizontally centre the nav bar under the frame
                var frameRect = frame.getBoundingClientRect();
                el.style.left = frameRect.left + 'px';
                el.style.maxWidth = '1200px';
                el.style.borderRadius = '0 0 2rem 2rem';
            } else {
                // Mobile: restore full-width fixed
                el.style.left = '0';
                el.style.right = '0';
                el.style.width = '';
                el.style.maxWidth = '';
                el.style.borderRadius = '';
            }
        });

        // ── Fixed top headers ─────────────────────────────────────────
        var fixedTopEls = frame.querySelectorAll('[class*="fixed top"]');
        fixedTopEls.forEach(function (el) {
            if (isDesktop) {
                var frameRect = frame.getBoundingClientRect();
                el.style.left = frameRect.left + 'px';
                el.style.width = frame.getBoundingClientRect().width + 'px';
                el.style.maxWidth = '1200px';
            } else {
                el.style.left = '0';
                el.style.right = '0';
                el.style.width = '';
                el.style.maxWidth = '';
            }
        });
    }

    // Run immediately if DOM is ready, else wait
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyDesktopFix);
    } else {
        applyDesktopFix();
    }

    // Re-run on resize (debounced)
    var resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(applyDesktopFix, 100);
    });

    // Re-run after fonts/images load (frame size may shift)
    window.addEventListener('load', applyDesktopFix);

    // Expose globally for manual calls
    window.applyDesktopFix = applyDesktopFix;
})();
