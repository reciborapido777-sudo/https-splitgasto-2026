/**
 * SplitGasto 2026 - Master Navigation Router
 * Versión: 4.3 — Transición sin filter:blur (fix Android Edge/Chrome stacking context)
 * filter:blur en body crea un stacking context que en algunos engines Android
 * (Edge, Chrome WebView) consume los eventos táctiles durante la transición,
 * haciendo que los botones parezcan no funcionar. Reemplazado por opacity-only.
 */
const SGRouter = {
    // ─── Mapa de Nodos con rutas RELATIVAS ──────────────────────────────
    routes: {
        // Core Auth
        'landing':       'index.html',
        'auth':          'auth.html',
        'auth-login':    'auth.html',
        'register':      'register.html',
        'auth-register': 'register.html',
        // Main App
        'dashboard':     'dashboard.html',
        'groups':        'groups.html',
        'activity':      'activity.html',
        'split':         'split.html',
        'success':       'success.html',
        'profile':       'profile.html',
        'membership':    'membership.html',
        'security':      'security.html',
        'notifications': 'notifications.html',
        'receipt':       'receipt-view.html',
        'analytics':     'analytics.html',
        'manual':        'manual.html',
        'scanner':       'scanner.html',
        'vault':         'vault.html',
        'settings':      'settings.html',
        // Legal & Investors
        'legal':         'legal.html',
        'investors':     'investors.html',
        // Games 3D
        'games':         'games.html',
        'game-roulette': 'game-roulette.html',
        'game-cards':    'game-cards.html',
        'game-coin':     'game-coin.html',
        'game-darts':    'game-darts.html',
        // Expense & Group Management
        'add-expense':   'add-expense.html',
        'create-group':  'create-group.html',
        'liquidation':   'liquidation.html',
        // Rankings & Settings
        'rankings':      'rankings.html',
        // Onboarding & Support
        'onboarding':    'onboarding.html',
        'support':       'support.html',
        // Social
        'friends':       'friends.html',
        'invite':        'invite.html',
        // Error / Resilience
        'error':         'engine/resilience.html'
    },

    /**
     * Navega a una página por su ID de ruta
     * Usa rutas relativas compatibles con cualquier despliegue
     * v4.2: añade console.log para diagnóstico en Opera/Edge/Safari
     */
    navigate(routeId, origin = null) {
        // ── Diagnóstico: visible en DevTools de cualquier navegador ──────
        console.log('[SG Router] navigate ›', routeId, origin ? '(from: ' + origin + ')' : '');
        // ── Guard: si la ruta no existe, ir a landing ────────────────────
        if (!this.routes[routeId]) {
            console.warn('[SG Router] Ruta desconocida:', routeId, '→ redirigiendo a landing');
            window.location.href = this.routes['landing'];
            return;
        }
        const target = this.routes[routeId];

        // ── Anti-loop: compara el archivo actual con el destino ───────────
        const currentFile = window.location.pathname.split('/').pop() || 'index.html';
        const cleanTarget = target.split('?')[0];

        if (cleanTarget === currentFile) {
            console.log('[SG Router] Ya en esta página. Reload.');
            if (window.location.search) {
                window.location.href = target;
            } else {
                window.location.reload();
            }
            return;
        }

        // ── Construir URL: añadir ?from= solo si hay origen ──────────────
        const finalTarget = origin ? `${target}?from=${encodeURIComponent(origin)}` : target;
        console.log('[SG Router] → ', finalTarget);

        // ── Transición Visual — opacity-only (sin filter:blur)
        // filter:blur en body crea un stacking context en Android (Edge/Chrome)
        // que consume eventos táctiles durante la transición → botones no responden.
        // opacity solo es seguro: no crea stacking context, funciona en todos los engines.
        document.body.style.transition = 'opacity 0.15s ease';
        document.body.style.opacity = '0';

        setTimeout(() => {
            window.location.href = finalTarget;
        }, 160);
    },

    /**
     * Retorno Táctico v4.2
     * Prioridad: ?from= param → historial del navegador → dashboard
     */
    back() {
        const urlParams = new URLSearchParams(window.location.search);
        const from = urlParams.get('from');

        console.log('[SG Router] back() from=', from || 'none');

        document.body.style.transition = 'opacity 0.12s ease';
        document.body.style.opacity = '0';

        setTimeout(() => {
            if (from && this.routes[from]) {
                const fromTarget = this.routes[from];
                const currentFile = window.location.pathname.split('/').pop() || 'index.html';
                if (fromTarget !== currentFile) {
                    window.location.href = fromTarget;
                } else {
                    window.history.back();
                }
            } else if (window.history.length > 1) {
                window.history.back();
            } else {
                window.location.href = this.routes['dashboard'];
            }
        }, 150);
    },

    /**
     * Navega a premium si la funcionalidad está bloqueada
     */
    requirePremium(feature = '') {
        console.log('[SG Router] requirePremium:', feature || 'generic');
        this.showToast(feature ? `${feature} es Premium 👑` : '¡Función Premium! Desbloquea todo por 2,99€/mes', 'premium');
        setTimeout(() => {
            this.navigate('membership', 'dashboard');
        }, 1200);
    },

    /**
     * Toast de Notificación (v4.2)
     */
    showToast(message, type = 'success') {
        const colors = {
            'success': '#13ecd6',
            'error':   '#ef4444',
            'info':    '#a855f7',
            'warning': '#FF9D42',
            'premium': '#D4AF37'
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

// ─── Restaurar página al entrar / volver (pageshow handles bfcache) ────────
window.addEventListener('pageshow', (event) => {
    // Restore opacity on every page show (including bfcache restores)
    // No filter to reset — we no longer use filter:blur on body
    document.body.style.opacity    = '1';
    document.body.style.transition = '';
    if (event.persisted) {
        console.log('[SG Router] pageshow (bfcache restore)');
    }
});

// ─── Congelar objeto (seguridad: nadie puede modificar las rutas) ──────────
// NOTE: Object.freeze only prevents writes. All reads (navigate, back, etc.)
// work perfectly. This is intentional and safe.
Object.freeze(SGRouter);

// ─── Diagnóstico de carga ─────────────────────────────────────────────────
console.log('[SG Router] v4.3 cargado ✓ —', Object.keys(SGRouter.routes).length, 'rutas');
