/**
 * SplitGasto 2026 - Service Worker v17.0
 * ESTRATEGIA: Network-first para HTML, Cache-first para assets estáticos
 * v10.0: min-h-screen eliminado de body.app-shell (scroll Android+Desktop), grupos/gastos/registro
 *       conectados a API real, scanner guarda gastos, auth-register funcional,
 *       receipt-view guarda como gasto, create-group/add-expense usan SGApi
 */

const CACHE_NAME = 'splitgasto-v17-2026';
const STATIC_ASSETS = [
    // Engine
    'engine/router.js',
    'engine/global.css',
    'engine/audio.js',
    'engine/desktop-fix.js',
    'engine/auth.js',
    'engine/api.js',
    // Icons & Manifest
    'favicon.svg',
    'favicon-32.png',
    'favicon-16.png',
    'apple-touch-icon.png',
    'manifest.json',
    'icons/icon-72.png',
    'icons/icon-96.png',
    'icons/icon-128.png',
    'icons/icon-144.png',
    'icons/icon-192.png',
    'icons/icon-512.png',
    // Auth pages (offline login/register)
    'auth-login.html',
    'auth-register.html',
    // Core app pages (offline navigation)
    'dashboard.html',
    'groups.html',
    'activity.html',
    'profile.html',
    'analytics.html',
    'notifications.html',
    'add-expense.html',
    'create-group.html',
    'receipt-view.html',
    'success.html',
    'scanner.html',
    'split.html'
];

// ── Install: pre-cache static assets ───────────────────────────────────────
self.addEventListener('install', event => {
    console.log('[SW] Installing v17.0…');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(STATIC_ASSETS).catch(err => {
                console.warn('[SW] Some assets failed to pre-cache:', err);
            }))
            .then(() => self.skipWaiting())
    );
});

// ── Activate: delete ALL old caches, claim clients ──────────────────────────
self.addEventListener('activate', event => {
    console.log('[SW] Activating v17.0…');
    event.waitUntil(
        caches.keys()
            .then(keys => Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => {
                        console.log('[SW] Deleting old cache:', key);
                        return caches.delete(key);
                    })
            ))
            .then(() => {
                console.log('[SW] Active. Claiming clients…');
                return self.clients.claim();
            })
    );
});

// ── Message: handle SKIP_WAITING from page ──────────────────────────────────
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW] SKIP_WAITING received → skipWaiting()');
        self.skipWaiting();
    }
});

// ── Fetch: network-first for HTML, cache-first for assets ──────────────────
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Only handle same-origin GET requests
    if (url.origin !== location.origin) return;
    // CRITICAL: Never cache API requests — D1 data must always be fresh
    if (url.pathname.startsWith('/api/')) return;
    if (request.method !== 'GET') return;

    const isHTMLPage = (
        request.mode === 'navigate' ||
        request.headers.get('accept')?.includes('text/html') ||
        url.pathname.endsWith('.html') ||
        url.pathname === '/' ||
        url.pathname === ''
    );

    if (isHTMLPage) {
        // ── Network-first for HTML: always try to get latest ─────────────
        event.respondWith(
            fetch(request, { cache: 'no-store' })
                .then(response => {
                    if (response.ok) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(() => {
                    return caches.match(request)
                        .then(cached => cached || caches.match('dashboard.html'));
                })
        );
    } else {
        // ── Cache-first for static assets ────────────────────────────────
        event.respondWith(
            caches.match(request)
                .then(cached => {
                    if (cached) return cached;
                    return fetch(request).then(response => {
                        if (response.ok) {
                            const clone = response.clone();
                            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                        }
                        return response;
                    });
                })
        );
    }
});

// ── Push Notifications ──────────────────────────────────────────────────────
self.addEventListener('push', event => {
    const data = event.data?.json() || {};
    event.waitUntil(
        self.registration.showNotification(data.title || 'SplitGasto', {
            body: data.body || 'Nueva notificación',
            icon: 'icons/icon-192.png',
            badge: 'favicon-32.png',
            data: { url: data.url || 'dashboard.html' }
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil(
        clients.openWindow(event.notification.data?.url || 'dashboard.html')
    );
});
