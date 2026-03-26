/**
 * SplitGasto 2026 - Master Navigation Router
 * Versión: 4.3 — Clean URLs + Cloudflare Pages Optimized
 *
 * STRATEGY: Routes use absolute clean paths (/auth, /dashboard, /groups).
 * CF Pages _redirects maps /auth → /auth.html [200], etc.
 * Absolute paths work from ANY page depth — no relative-path bugs.
 * No /* catch-all in _redirects = no infinite loops possible.
 */
const SGRouter = {

    // ─── Route map: routeId → clean absolute path ────────────────────
    routes: {
        // Landing
        'landing':       '/',
        // Auth
        'auth':          '/auth',
        'auth-login':    '/auth',
        'register':      '/register',
        'auth-register': '/register',
        'onboarding':    '/onboarding',
        // Main App
        'dashboard':     '/dashboard',
        'groups':        '/groups',
        'activity':      '/activity',
        'split':         '/split',
        'success':       '/success',
        'profile':       '/profile',
        'membership':    '/membership',
        'security':      '/security',
        'notifications': '/notifications',
        'receipt':       '/receipt',
        'analytics':     '/analytics',
        'manual':        '/manual',
        'scanner':       '/scanner',
        'vault':         '/vault',
        'settings':      '/settings',
        // Legal & Investors
        'legal':         '/legal',
        'investors':     '/investors',
        // Games
        'games':         '/games',
        'game-roulette': '/game-roulette',
        'game-cards':    '/game-cards',
        'game-coin':     '/game-coin',
        'game-darts':    '/game-darts',
        // Expenses & Groups
        'add-expense':   '/add-expense',
        'create-group':  '/create-group',
        'liquidation':   '/liquidation',
        // Rankings & Settings
        'rankings':      '/rankings',
        // Support
        'support':       '/support',
        // Social
        'friends':       '/friends',
        'invite':        '/invite',
        // Error
        'error':         '/engine/resilience.html'
    },

    /**
     * Navigate by route ID.
     * Uses absolute clean URLs — works from any page on any domain.
     */
    navigate(routeId, origin = null) {
        console.log('[SG Router] navigate ›', routeId, origin ? '(from: ' + origin + ')' : '');

        // Guard: unknown route → go to dashboard
        if (!this.routes[routeId]) {
            console.warn('[SG Router] Unknown route:', routeId, '→ /dashboard');
            window.location.href = this.routes['dashboard'];
            return;
        }

        const target = this.routes[routeId];

        // Anti-loop: compare current pathname (strip trailing slash)
        const currentPath = window.location.pathname.replace(/\/+$/, '') || '/';
        const cleanTarget = target.replace(/\/+$/, '') || '/';

        if (cleanTarget === currentPath) {
            console.log('[SG Router] Already here. Reload.');
            window.location.reload();
            return;
        }

        // Build final URL: append ?from= only if origin provided
        const finalTarget = origin
            ? `${target}?from=${encodeURIComponent(origin)}`
            : target;

        console.log('[SG Router] → ', finalTarget);

        // Visual transition: blur + fade out
        document.body.style.transition = 'filter 0.2s ease, opacity 0.2s ease';
        document.body.style.filter = 'blur(16px)';
        document.body.style.opacity = '0';

        setTimeout(() => {
            window.location.href = finalTarget;
        }, 180);
    },

    /**
     * Navigate back.
     * Priority: ?from= param → browser history → /dashboard
     */
    back() {
        const urlParams = new URLSearchParams(window.location.search);
        const from = urlParams.get('from');

        console.log('[SG Router] back() from=', from || 'none');

        document.body.style.transition = 'filter 0.15s ease, opacity 0.15s ease';
        document.body.style.opacity = '0';
        document.body.style.filter = 'blur(10px)';

        setTimeout(() => {
            if (from && this.routes[from]) {
                window.location.href = this.routes[from];
            } else if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = this.routes['dashboard'];
            }
        }, 150);
    },

    /**
     * Premium gate — show toast then redirect to membership.
     */
    requirePremium(feature = '') {
        console.log('[SG Router] requirePremium:', feature || 'generic');
        this.showToast(
            feature ? `${feature} es Premium 👑` : '¡Función Premium! Desbloquea todo por 2,99€/mes',
            'premium'
        );
        setTimeout(() => {
            this.navigate('membership', 'dashboard');
        }, 1200);
    },

    /**
     * Toast notification.
     */
    showToast(message, type = 'success') {
        const colors = {
            success: '#13ecd6',
            error:   '#ef4444',
            info:    '#a855f7',
            warning: '#FF9D42',
            premium: '#D4AF37'
        };
        const color = colors[type] || colors.success;

        const old = document.querySelector('.sg-toast');
        if (old) old.remove();

        const toast = document.createElement('div');
        toast.className = 'sg-toast';
        toast.style.cssText = `
            position:fixed; bottom:100px; left:50%; transform:translate(-50%,20px);
            z-index:9999; padding:14px 28px; border-radius:999px;
            background:rgba(10,10,10,0.97); border:1px solid rgba(255,255,255,0.1);
            box-shadow:0 20px 50px rgba(0,0,0,0.6); backdrop-filter:blur(24px);
            transition:opacity 0.35s ease, transform 0.35s cubic-bezier(0.16,1,0.3,1);
            opacity:0; white-space:nowrap; pointer-events:none; max-width:90vw;
        `;
        toast.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px">
                <span style="width:8px;height:8px;border-radius:50%;background:${color};
                    box-shadow:0 0 8px ${color};flex-shrink:0"></span>
                <span style="font-size:11px;font-weight:800;text-transform:uppercase;
                    letter-spacing:0.2em;color:#fff">${message}</span>
            </div>`;

        document.body.appendChild(toast);
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translate(-50%, 0)';
            });
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, 10px)';
            setTimeout(() => toast.remove(), 400);
        }, 3200);
    }
};

// ─── Restore page on bfcache restore ────────────────────────────────────────
window.addEventListener('pageshow', (event) => {
    document.body.style.opacity   = '1';
    document.body.style.filter    = 'none';
    document.body.style.transition = '';
    if (event.persisted) {
        console.log('[SG Router] pageshow: bfcache restore');
    }
});

// ─── Freeze: prevent accidental mutations ────────────────────────────────────
Object.freeze(SGRouter);
console.log('[SG Router] v4.3 ready ✓ —', Object.keys(SGRouter.routes).length, 'routes (clean URLs)');
