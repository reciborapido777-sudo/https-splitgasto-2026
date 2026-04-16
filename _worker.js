/**
 * SplitGasto 2026 — Cloudflare Worker Dinámico
 * Versión: 1.1 — 2026-04-16
 *
 * Responsabilidades:
 *  1. Servir archivos estáticos desde el bucket de assets (raíz del repo)
 *  2. Exponer API REST en /api/* para funciones serverless
 *  3. Integrar Cloudflare Workers AI en /api/ai/*
 *  4. Manejar CORS y cabeceras de seguridad
 *  5. SPA fallback: cualquier ruta desconocida → index.html
 *
 * NOTAS de arquitectura:
 *  - assets.directory = "." en wrangler.toml (funciona en Cloudflare CI y GH Actions)
 *  - .assetsignore excluye _worker.js, .git, carpetas de dev, wrangler.toml
 *  - env.ASSETS es el binding automático de Wrangler para assets estáticos
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // ── 1. Rutas de API ──────────────────────────────────────────────
        if (path.startsWith('/api/')) {
            return handleAPI(request, env, ctx, path);
        }

        // ── 2. Assets estáticos (delegado al bucket de assets de Wrangler)
        //    Si el archivo existe en dist/, lo sirve directamente.
        //    Si no existe, sirve index.html (SPA fallback).
        try {
            const assetResponse = await env.ASSETS.fetch(request);

            // Añadir cabeceras de seguridad a todas las respuestas
            const headers = new Headers(assetResponse.headers);
            setSecurityHeaders(headers);

            return new Response(assetResponse.body, {
                status: assetResponse.status,
                headers,
            });
        } catch (e) {
            // Fallback SPA — sirve index.html
            const indexRequest = new Request(
                new URL('/index.html', request.url).toString(),
                request
            );
            try {
                const fallback = await env.ASSETS.fetch(indexRequest);
                const headers = new Headers(fallback.headers);
                setSecurityHeaders(headers);
                return new Response(fallback.body, { status: 200, headers });
            } catch {
                return new Response('SplitGasto — Not Found', { status: 404 });
            }
        }
    },
};

// ═══════════════════════════════════════════════════════════════════════
// API Router
// ═══════════════════════════════════════════════════════════════════════
async function handleAPI(request, env, ctx, path) {
    const method = request.method;

    // CORS preflight
    if (method === 'OPTIONS') {
        return corsResponse();
    }

    // ── /api/health — Estado del Worker ──────────────────────────────
    if (path === '/api/health') {
        return jsonResponse({
            status: 'ok',
            app: env.APP_NAME ?? 'SplitGasto 2026',
            version: env.APP_VERSION ?? '3.0',
            env: env.APP_ENV ?? 'production',
            timestamp: new Date().toISOString(),
            ai_available: !!env.AI,
        });
    }

    // ── /api/ai/* — Cloudflare Workers AI ────────────────────────────
    if (path.startsWith('/api/ai/')) {
        return handleAI(request, env, path);
    }

    return jsonResponse({ error: 'Endpoint no encontrado', path }, 404);
}

// ═══════════════════════════════════════════════════════════════════════
// Cloudflare Workers AI
// ═══════════════════════════════════════════════════════════════════════
async function handleAI(request, env, path) {
    if (!env.AI) {
        return jsonResponse(
            { error: 'Workers AI no está habilitado en este entorno' },
            503
        );
    }

    // Solo POST permitido para AI
    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Método no permitido. Usa POST.' }, 405);
    }

    let body = {};
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'Body JSON inválido' }, 400);
    }

    // ── /api/ai/chat — Chat con @cf/meta/llama-3.1-8b-instruct ──────
    if (path === '/api/ai/chat') {
        const userMessage = body.message || body.prompt || '';
        if (!userMessage) {
            return jsonResponse({ error: 'Campo "message" requerido' }, 400);
        }

        const systemPrompt =
            body.system ||
            'Eres un asistente financiero inteligente integrado en SplitGasto 2026. ' +
            'Ayudas a los usuarios a dividir gastos, gestionar deudas entre amigos ' +
            'y entender sus finanzas personales. Responde siempre en español, ' +
            'de forma clara, amigable y concisa.';

        try {
            const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
                max_tokens: body.max_tokens ?? 512,
                temperature: body.temperature ?? 0.7,
            });

            return jsonResponse({
                success: true,
                response: result.response,
                model: '@cf/meta/llama-3.1-8b-instruct',
            });
        } catch (err) {
            return jsonResponse(
                { error: 'Error en Workers AI', detail: err.message },
                500
            );
        }
    }

    // ── /api/ai/classify — Clasificar categoría de gasto ────────────
    if (path === '/api/ai/classify') {
        const expense = body.expense || '';
        if (!expense) {
            return jsonResponse({ error: 'Campo "expense" requerido' }, 400);
        }

        try {
            const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                messages: [
                    {
                        role: 'system',
                        content:
                            'Eres un clasificador de gastos. Para cada gasto que te diga el usuario, ' +
                            'responde ÚNICAMENTE con una de estas categorías en JSON: ' +
                            '{"category": "comida"}, {"category": "transporte"}, ' +
                            '{"category": "entretenimiento"}, {"category": "alojamiento"}, ' +
                            '{"category": "compras"}, {"category": "salud"}, ' +
                            '{"category": "servicios"}, {"category": "otro"}. ' +
                            'No añadas explicaciones.',
                    },
                    { role: 'user', content: expense },
                ],
                max_tokens: 32,
                temperature: 0.1,
            });

            let category = 'otro';
            try {
                const parsed = JSON.parse(result.response);
                category = parsed.category || 'otro';
            } catch {
                // Intentar extraer la categoría del texto libre
                const match = result.response.match(/"category"\s*:\s*"([^"]+)"/);
                if (match) category = match[1];
            }

            return jsonResponse({ success: true, category, expense });
        } catch (err) {
            return jsonResponse(
                { error: 'Error clasificando gasto', detail: err.message },
                500
            );
        }
    }

    // ── /api/ai/summary — Resumen financiero del grupo ───────────────
    if (path === '/api/ai/summary') {
        const data = body.data || body.expenses || '';
        if (!data) {
            return jsonResponse({ error: 'Campo "data" requerido' }, 400);
        }

        try {
            const prompt =
                typeof data === 'string'
                    ? data
                    : JSON.stringify(data, null, 2);

            const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                messages: [
                    {
                        role: 'system',
                        content:
                            'Eres un analista financiero personal. Analiza los datos de gastos ' +
                            'compartidos entre amigos y genera un resumen conciso en español ' +
                            '(máximo 3 párrafos) con: quién debe más, categorías principales, ' +
                            'y 2 recomendaciones para ahorrar.',
                    },
                    {
                        role: 'user',
                        content: `Analiza estos datos de gastos:\n${prompt}`,
                    },
                ],
                max_tokens: 400,
                temperature: 0.5,
            });

            return jsonResponse({
                success: true,
                summary: result.response,
                model: '@cf/meta/llama-3.1-8b-instruct',
            });
        } catch (err) {
            return jsonResponse(
                { error: 'Error generando resumen', detail: err.message },
                500
            );
        }
    }

    return jsonResponse({ error: 'Ruta de AI no encontrada', path }, 404);
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════
function jsonResponse(data, status = 200) {
    return new Response(JSON.stringify(data, null, 2), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Access-Control-Allow-Origin': '*',
            'X-Content-Type-Options': 'nosniff',
        },
    });
}

function corsResponse() {
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
        },
    });
}

function setSecurityHeaders(headers) {
    headers.set('X-Frame-Options', 'SAMEORIGIN');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set(
        'Permissions-Policy',
        'camera=(), microphone=(), geolocation=()'
    );
    // Cache: HTML sin cache, assets con cache largo
    const ct = headers.get('Content-Type') || '';
    if (ct.includes('text/html')) {
        headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
}
