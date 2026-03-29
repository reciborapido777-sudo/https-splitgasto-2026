/**
 * SplitGasto 2026 - Master Service Worker
 * Versión: 5.2 Gold | Protocolo: Resiliencia Total
 * ESTRATEGIA: Network-first (Veracidad de Datos) + Cache-first (Velocidad de Interfaz)
 */

const CACHE_NAME = 'splitgasto-v5-2026';

// Bóveda de Activos Críticos (Blindaje Total)
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/engine/router.js',
    '/engine/global.css',
    '/manifest.json',
    '/favicon.svg',
    '/favicon-32.png',
    '/favicon-16.png',
    '/apple-touch-icon.png',
    '/icons/icon-72.png',
    '/icons/icon-96.png',
    '/icons/icon-128.png',
    '/icons/icon-144.png',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// 1. INSTALACIÓN: Sellado de la Bóveda Alpha
self.addEventListener('install', event => {
    console.log('[SW Alpha] Inicializando Bóveda v5.2 Gold...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW Alpha] Sellando activos estáticos...');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// 2. ACTIVACIÓN: Purga de protocolos obsoletos
self.addEventListener('activate', event => {
    console.log('[SW Alpha] Reclamando control del perímetro...');
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key !== CACHE_NAME)
                .map(key => {
                    console.log('[SW Alpha] Eliminando caché obsoleto:', key);
                    return caches.delete(key);
                })
        )).then(() => self.clients.claim())
    );
});

// 3. MENSAJERÍA: Orden de ejecución inmediata
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// 4. INTERCEPCIÓN (FETCH): Gestión de Tráfico Inteligente
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Solo gestionar peticiones del mismo origen y método GET
    if (url.origin !== location.origin || request.method !== 'GET') return;

    const isHTML = (
        request.mode === 'navigate' ||
        request.headers.get('accept')?.includes('text/html') ||
        url.pathname.endsWith('.html') ||
        url.pathname === '/'
    );

    if (isHTML) {
        // ESTRATEGIA: NETWORK-FIRST (Garantiza veracidad de saldos financieros)
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
                    // Offline Fallback: Intentar recuperar del caché o servir Dashboard
                    return caches.match(request)
                        .then(cached => cached || caches.match('/dashboard.html') || caches.match('/'));
                })
        );
    } else {
        // ESTRATEGIA: CACHE-FIRST (Aceleración de UI y Assets)
        event.respondWith(
            caches.match(request).then(cached => {
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

// 5. PUSH & NOTIFICACIONES: Protocolo de Comunicación Élite
self.addEventListener('push', event => {
    const data = event.data?.json() || { title: 'SplitGasto 2026', body: 'Actualización de Nodo' };
    event.waitUntil(
        self.registration.showNotification(data.title, {
            body: data.body,
            icon: '/icons/icon-192.png',
            badge: '/favicon-32.png',
            tag: 'alpha-notification',
            data: { url: data.url || '/dashboard' }
        })
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();
    const urlToOpen = new URL(event.notification.data.url, self.location.origin).href;

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // Si ya hay una ventana abierta, enfocarla
            for (let client of windowClients) {
                if (client.url === urlToOpen && 'focus' in client) return client.focus();
            }
            // Si no, abrir una nueva
            if (clients.openWindow) return clients.openWindow(urlToOpen);
        })
    );
});
