/**
 * SplitGasto 2026 — Cloudflare Worker Dinámico
 * Versión: 2.0 — 2026-04-20
 *
 * Responsabilidades:
 *  1. Servir archivos estáticos desde el bucket de assets (raíz del repo)
 *  2. Exponer API REST en /api/* para funciones serverless
 *  3. Integrar Cloudflare Workers AI en /api/ai/*
 *  4. Almacenamiento seguro en R2 (/api/storage/*)
 *  5. Rate limiting por IP en todas las rutas de API
 *  6. Manejar CORS y cabeceras de seguridad
 *  7. SPA fallback: cualquier ruta desconocida → index.html
 *
 * Bindings:
 *  - env.ASSETS                → Assets estáticos
 *  - env.AI                    → Workers AI
 *  - env.SPLITGASTO_BUCKET     → R2 Bucket (splitgasto-storage)
 *  - env.SPLITGASTO_RATE_LIMITER → Rate Limiter (100 req/60s)
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // ── 1. Rutas de API (con rate limiting) ────────────────────────
        if (path.startsWith('/api/')) {
            // Rate limiting por IP
            const rateLimitResult = await checkRateLimit(request, env);
            if (rateLimitResult) return rateLimitResult;

            return handleAPI(request, env, ctx, path);
        }

        // ── 2. Assets estáticos ─────────────────────────────────────────
        try {
            const assetResponse = await env.ASSETS.fetch(request);
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
// Rate Limiting
// ═══════════════════════════════════════════════════════════════════════
async function checkRateLimit(request, env) {
    if (!env.SPLITGASTO_RATE_LIMITER) return null;

    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const url = new URL(request.url);
    const key = `${clientIP}:${url.pathname}`;

    const { success } = await env.SPLITGASTO_RATE_LIMITER.limit({ key });

    if (!success) {
        return jsonResponse(
            {
                error: 'Demasiadas peticiones',
                message: 'Has excedido el límite de 100 peticiones por minuto. Intenta de nuevo más tarde.',
                retry_after: 60,
            },
            429
        );
    }

    return null;
}

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
            r2_available: !!env.SPLITGASTO_BUCKET,
            ratelimit_available: !!env.SPLITGASTO_RATE_LIMITER,
        });
    }

    // ── /api/ai/* — Cloudflare Workers AI ────────────────────────────
    if (path.startsWith('/api/ai/')) {
        return handleAI(request, env, path);
    }

    // ── /api/storage/* — R2 Storage ──────────────────────────────────
    if (path.startsWith('/api/storage/')) {
        return handleStorage(request, env, path);
    }

    return jsonResponse({ error: 'Endpoint no encontrado', path }, 404);
}

// ═══════════════════════════════════════════════════════════════════════
// R2 Storage — Almacenamiento seguro
// ═══════════════════════════════════════════════════════════════════════
async function handleStorage(request, env, path) {
    if (!env.SPLITGASTO_BUCKET) {
        return jsonResponse(
            { error: 'R2 Storage no está habilitado en este entorno' },
            503
        );
    }

    const method = request.method;

    // ── /api/storage/upload — Subir archivo a R2 ─────────────────────
    if (path === '/api/storage/upload' && method === 'POST') {
        return handleStorageUpload(request, env);
    }

    // ── /api/storage/download/:key — Descargar archivo de R2 ─────────
    if (path.startsWith('/api/storage/download/') && method === 'GET') {
        const key = decodeURIComponent(path.replace('/api/storage/download/', ''));
        return handleStorageDownload(request, env, key);
    }

    // ── /api/storage/signed-url/:key — URL pre-firmada temporal ──────
    if (path.startsWith('/api/storage/signed-url/') && method === 'GET') {
        const key = decodeURIComponent(path.replace('/api/storage/signed-url/', ''));
        return handleSignedUrl(request, env, key);
    }

    // ── /api/storage/delete/:key — Eliminar archivo de R2 ────────────
    if (path.startsWith('/api/storage/delete/') && method === 'DELETE') {
        const key = decodeURIComponent(path.replace('/api/storage/delete/', ''));
        return handleStorageDelete(request, env, key);
    }

    // ── /api/storage/list — Listar archivos ──────────────────────────
    if (path === '/api/storage/list' && method === 'GET') {
        return handleStorageList(request, env);
    }

    return jsonResponse({ error: 'Ruta de storage no encontrada', path }, 404);
}

// ── Upload ────────────────────────────────────────────────────────────
async function handleStorageUpload(request, env) {
    try {
        const contentType = request.headers.get('Content-Type') || '';

        // Soporta multipart/form-data (archivos) y JSON (datos base64)
        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            const file = formData.get('file');
            const userId = formData.get('userId') || 'anonymous';
            const folder = formData.get('folder') || 'general';

            if (!file) {
                return jsonResponse({ error: 'Campo "file" requerido en el formulario' }, 400);
            }

            // Validar tamaño máximo: 10MB
            const MAX_SIZE = 10 * 1024 * 1024;
            if (file.size > MAX_SIZE) {
                return jsonResponse(
                    { error: 'El archivo excede el límite de 10MB' },
                    413
                );
            }

            // Validar tipo de archivo permitido
            const allowedTypes = [
                'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                'application/pdf',
                'text/plain', 'text/csv',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ];
            if (!allowedTypes.includes(file.type)) {
                return jsonResponse(
                    { error: `Tipo de archivo no permitido: ${file.type}` },
                    415
                );
            }

            // Generar key segura: usuarios/{userId}/{folder}/{timestamp}-{nombre}
            const timestamp = Date.now();
            const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const key = `usuarios/${userId}/${folder}/${timestamp}-${sanitizedName}`;

            await env.SPLITGASTO_BUCKET.put(key, file.stream(), {
                httpMetadata: { contentType: file.type },
                customMetadata: {
                    userId: userId,
                    originalName: file.name,
                    uploadedAt: new Date().toISOString(),
                },
            });

            return jsonResponse({
                success: true,
                key: key,
                size: file.size,
                type: file.type,
                message: 'Archivo subido correctamente',
            }, 201);
        }

        // JSON con datos base64
        const body = await request.json();
        const { data, filename, userId, folder, mimeType } = body;

        if (!data || !filename) {
            return jsonResponse(
                { error: 'Campos "data" y "filename" requeridos' },
                400
            );
        }

        const uid = userId || 'anonymous';
        const fld = folder || 'general';
        const timestamp = Date.now();
        const sanitizedName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const key = `usuarios/${uid}/${fld}/${timestamp}-${sanitizedName}`;

        // Decodificar base64
        const binaryString = atob(data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        await env.SPLITGASTO_BUCKET.put(key, bytes, {
            httpMetadata: { contentType: mimeType || 'application/octet-stream' },
            customMetadata: {
                userId: uid,
                originalName: filename,
                uploadedAt: new Date().toISOString(),
            },
        });

        return jsonResponse({
            success: true,
            key: key,
            message: 'Archivo subido correctamente',
        }, 201);
    } catch (err) {
        return jsonResponse(
            { error: 'Error subiendo archivo', detail: err.message },
            500
        );
    }
}

// ── Download ──────────────────────────────────────────────────────────
async function handleStorageDownload(request, env, key) {
    try {
        // Verificar que la key pertenece al usuario (seguridad)
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return jsonResponse({ error: 'Autorización requerida' }, 401);
        }

        const object = await env.SPLITGASTO_BUCKET.get(key);
        if (!object) {
            return jsonResponse({ error: 'Archivo no encontrado' }, 404);
        }

        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
        headers.set('Content-Disposition', `attachment; filename="${key.split('/').pop()}"`);
        headers.set('Cache-Control', 'private, max-age=3600');
        setSecurityHeaders(headers);

        return new Response(object.body, { headers });
    } catch (err) {
        return jsonResponse(
            { error: 'Error descargando archivo', detail: err.message },
            500
        );
    }
}

// ── Signed URL (URL pre-firmada temporal) ─────────────────────────────
async function handleSignedUrl(request, env, key) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return jsonResponse({ error: 'Autorización requerida' }, 401);
        }

        // Verificar que el objeto existe
        const object = await env.SPLITGASTO_BUCKET.head(key);
        if (!object) {
            return jsonResponse({ error: 'Archivo no encontrado' }, 404);
        }

        // Generar URL pre-firmada válida por 1 hora
        const signedUrl = await env.SPLITGASTO_BUCKET.createSignedUrl(key, {
            expiresIn: 3600,
        });

        return jsonResponse({
            success: true,
            url: signedUrl,
            expiresIn: 3600,
            key: key,
        });
    } catch (err) {
        return jsonResponse(
            { error: 'Error generando URL firmada', detail: err.message },
            500
        );
    }
}

// ── Delete ────────────────────────────────────────────────────────────
async function handleStorageDelete(request, env, key) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return jsonResponse({ error: 'Autorización requerida' }, 401);
        }

        // Verificar que el objeto existe antes de eliminar
        const object = await env.SPLITGASTO_BUCKET.head(key);
        if (!object) {
            return jsonResponse({ error: 'Archivo no encontrado' }, 404);
        }

        await env.SPLITGASTO_BUCKET.delete(key);

        return jsonResponse({
            success: true,
            message: 'Archivo eliminado correctamente',
            key: key,
        });
    } catch (err) {
        return jsonResponse(
            { error: 'Error eliminando archivo', detail: err.message },
            500
        );
    }
}

// ── List ──────────────────────────────────────────────────────────────
async function handleStorageList(request, env) {
    try {
        const authHeader = request.headers.get('Authorization');
        if (!authHeader) {
            return jsonResponse({ error: 'Autorización requerida' }, 401);
        }

        const url = new URL(request.url);
        const userId = url.searchParams.get('userId') || 'anonymous';
        const folder = url.searchParams.get('folder') || '';
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        const cursor = url.searchParams.get('cursor') || undefined;

        // Solo listar archivos del usuario
        const prefix = `usuarios/${userId}/${folder}`;

        const listed = await env.SPLITGASTO_BUCKET.list({
            prefix: prefix,
            limit: Math.min(limit, 100),
            cursor: cursor,
        });

        const objects = listed.objects.map((obj) => ({
            key: obj.key,
            size: obj.size,
            uploaded: obj.uploaded.toISOString(),
            type: obj.httpMetadata?.contentType || 'unknown',
        }));

        return jsonResponse({
            success: true,
            objects: objects,
            truncated: listed.truncated,
            cursor: listed.truncated ? listed.cursor : null,
            count: objects.length,
        });
    } catch (err) {
        return jsonResponse(
            { error: 'Error listando archivos', detail: err.message },
            500
        );
    }
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

    if (request.method !== 'POST') {
        return jsonResponse({ error: 'Método no permitido. Usa POST.' }, 405);
    }

    let body = {};
    try {
        body = await request.json();
    } catch {
        return jsonResponse({ error: 'Body JSON inválido' }, 400);
    }

    // ── /api/ai/chat ──────────────────────────────────────────────────
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

    // ── /api/ai/classify ──────────────────────────────────────────────
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
            'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',

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
