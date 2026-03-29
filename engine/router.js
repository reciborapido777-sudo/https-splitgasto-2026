/**
 * SplitGasto 2026 - Master Navigation Router
 * Versión: 4.4 Gold — Clean URLs + GPU Optimized
 * ESTRATEGIA: Rutas absolutas optimizadas para Cloudflare Pages.
 * INTEGRIDAD: Sin mermas. Mantiene los 38 nodos operativos.
 */
const SGRouter = {

    // ─── Mapa de Rutas: ID → Senda Absoluta (Integridad Total) ───────
    routes: {
        'landing':       '/',
        'auth':          '/auth',
        'auth-login':    '/auth',
        'register':      '/register',
        'auth-register': '/register',
        'onboarding':    '/onboarding',
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
        'legal':         '/legal',
        'investors':     '/investors',
        'games':         '/games',
        'game-roulette': '/game-roulette',
        'game-cards':    '/game-cards',
        'game-coin':     '/game-coin',
        'game-darts':    '/game-darts',
        'add-expense':   '/add-expense',
        'create-group':  '/create-group',
        'liquidation':   '/liquidation',
        'rankings':      '/rankings',
        'support':       '/support',
        'friends':       '/friends',
        'invite':        '/invite',
        'error':         '/engine/resilience.html'
    },

    /**
     * Navegación por ID.
     * Sincronización atómica de 200ms para fundido GPU.
     */
    navigate(routeId, origin = null) {
        console.log('[SG Router] Tránsito iniciado ›', routeId);

        if (!this.routes[routeId]) {
            console.warn('[SG Router] Nodo desconocido → Abortando a Dashboard');
            window.location.href = this.routes['dashboard'];
            return;
        }

        const target = this.routes[routeId];

        // Normalización Anti-Bucle (Protección Cloudflare)
        const normalize = p => (p || '/').replace(/\/+$/, '') || '/';
        const currentPath = normalize(window.location.pathname);
        // Tratamos '/' e '/index.html' como el mismo nodo raíz
        const cleanTarget = normalize(target === '/index.html' ? '/' : target);

        if (cleanTarget === currentPath) {
            console.log('[SG Router] Nodo ya activo. Re-sincronizando.');
            window.location.reload();
            return;
        }

        const finalTarget = origin 
            ? `${target}?from=${encodeURIComponent(origin)}` 
            : target;

        // Transición de Élite: Curva Alpha (200ms)
        document.body.style.transition = 'filter 0.2s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease';
        document.body.style.filter = 'blur(20px)';
        document.body.style.opacity = '0';

        setTimeout(() => {
            window.location.href = finalTarget;
        }, 200); 
    },

    /**
     * Retorno Táctico.
     */
    back() {
        const urlParams = new URLSearchParams(window.location.search);
        const from = urlParams.get('from');

        document.body.style.transition = 'filter 0.15s ease, opacity 0.15s ease';
        document.body.style.opacity = '0';
        document.body.style.filter = 'blur(12px)';

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
     * Control de Acceso Premium.
     */
    requirePremium(feature = '') {
        this.showToast(
            feature ? `${feature} es Nivel Élite 👑` : 'Función Premium · Desbloquea el estatus Élite',
            'premium'
        );
        setTimeout(() => this.navigate('membership', 'dashboard'), 1200);
    },

    /**
     * Toast UI: Densidad Visual Gold.
     */
    showToast(message, type = 'success') {
        const colors = {
            success: '#13ecd6',
            error:   '#ef4444',
            info:    '#a855f7',
            warning: '#FF9D42',
            premium: '#FF9D42'
        };
        const color = colors[type] || colors.success;

        const old = document.querySelector('.sg-toast');
        if (old) old.remove();

        const toast = document.createElement('div');
        toast.className = 'sg-toast';
        toast.style.cssText = `
            position:fixed; bottom:115px; left:50%; transform:translate(-50%, 25px);
            z-index:10000; padding:16px 32px; border-radius:20px;
            background:rgba(5,5,5,0.98); border:1px solid rgba(255,255,255,0.08);
            box-shadow:0 30px 60px rgba(0,0,0,0.8); backdrop-filter:blur(30px);
            transition:all 0.4s cubic-bezier(0.16, 1, 0.3, 1);
            opacity:0; white-space:nowrap; pointer-events:none;
        `;
        
        toast.innerHTML = `
            <div style="display:flex;align-items:center;gap:14px">
                <span style="width:10px;height:10px;border-radius:50%;background:${color};
                    box-shadow:0 0 12px ${color};flex-shrink:0"></span>
                <span style="font-size:11px;font-weight:800;text-transform:uppercase;
                    letter-spacing:0.25em;color:#fff;font-family:'Plus Jakarta Sans',sans-serif">${message}</span>
            </div>`;

        document.body.appendChild(toast);
        
        requestAnimationFrame(() => {
            setTimeout(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translate(-50%, 0)';
            }, 10);
        });

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translate(-50%, 15px)';
            setTimeout(() => toast.remove(), 400);
        }, 3500);
    }
};

// ─── Resiliencia de Interfaz (BFcache Fix) ───────────────────────────────────
window.addEventListener('pageshow', (event) => {
    document.body.style.opacity    = '1';
    document.body.style.filter     = 'none';
    document.body.style.transition = '';
});

// Congelación de Objeto: Seguridad en Tiempo de Ejecución
Object.freeze(SGRouter);
console.log('[SG Router] v4.4 Gold operativo ✓');
