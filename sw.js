/**
 * SplitGasto 2026 - Master Service Worker
 * Versión: 5.2 Gold | Protocolo: Resiliencia Total y Persistencia Alpha
 * ESTRATEGIA: Network-first (HTML/Data) + Cache-first (Assets/UI)
 */

const CACHE_NAME = 'splitgasto-v5-2026';

// Listado de Activos Críticos para el funcionamiento del Núcleo
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
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// 1. INSTALACIÓN: Pre-cacheo atómico de la arquitectura base
self.addEventListener('install', event => {
    console.log('[SW Alpha] Inicializando v5.2...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW Alpha] Sellando activos estáticos en Bóveda...');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
            .catch(err => console.error('[SW Alpha] Error crítico en pre-cache:', err))
    );
});

// 2. ACTIVACIÓN: Purga total de registros obsoletos y toma de control
self.addEventListener('activate', event => {
    console.log('[SW Alpha] Reclamando control del perímetro...');
    event.waitUntil(
        caches.keys().then(keys => {
            return Promise.all(
                keys.filter(key => key !== CACHE_NAME)
                    .map(key => {
                        console.log('[SW Alpha] Eliminando caché obsoleto:', key);
                        return caches.delete(key);
                    })
            );
        }).then(() => self.clients.claim())
    );
});

// 3. MENSAJERÍA: Sincronización forzada desde la Interfaz de Mando
self.addEventListener('message', event => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        console.log('[SW Alpha] Orden de ejecución SKIP_WAITING recibida.');
        self.skipWaiting();
    }
});

// 4. INTERCEPCIÓN (FETCH): Gestión de Tráfico Inteligente
self.addEventListener('fetch', event => {
    const { request } = event;
    const url = new URL(request.url);

    // Ignorar peticiones externas o métodos que no sean GET (Seguridad)
    if (url.origin !== location.origin || request.method !== 'GET') return;

    const isHTML = (
        request.mode === 'navigate' ||
        request.headers.get('accept')?.includes('text/html') ||
        url.pathname.endsWith('.html') ||
        url.pathname === '/'
    );

    if (isHTML) {
        // ESTRATEGIA: NETWORK-FIRST (Garantiza veracidad de saldos)
        event.respondWith(
            fetch(request, { cache: 'no-store' })
                .then(response => {
                    if (response.status === 200) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    }
                    return response;
                })
                .catch(err => {
                    console.warn('[SW Alpha] Modo Offline activado para:', url.pathname);
                    return caches.match(request).then(cached => {
                        // Si no hay caché de la página específica, servir el Dashboard como nodo raíz
                        return cached || caches.match('/dashboard.html') || caches.match('/');
                    });
                })
        );
    } else {
        // ESTRATEGIA: CACHE-FIRST (Aceleración GPU de la Interfaz)
        event.respondWith(
            caches.match(request).then(cached => {
                if (cached) return cached;
                return fetch(request).then(response => {
                    // Solo cachear respuestas válidas y evitar extensiones de navegador
                    if (response.status === 200 && !url.protocol.includes('extension')) {
                        const clone = response.clone();
                        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
                    }
                    return response;
                });
            })
        );
    }
});

// 5. PUSH & NOTIFICACIONES: Protocolo de Comunicación de Élite
self.addEventListener('push', event => {
    let data = { title: 'SplitGasto 2026', body: 'Actualización de Nodo entrante.' };
    try {
        if (event.data) data = event.data.json();
    } catch (e) {
        data.body = event.data.text();
    }

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
    event.waitUntil(
        clients.matchAll({ type: 'window' }).then(clientList => {
            const url = event.notification.data.url;
            for (const client of clientList) {
                if (client.url === url && 'focus' in client) return client.focus();
            }
            if (clients.openWindow) return clients.openWindow(url);
        })
    );
});
