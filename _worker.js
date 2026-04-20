/**
 * SplitGasto 2026 — Cloudflare Worker Dinámico
 * Versión: 3.1 — 2026-04-20
 *
 * Responsabilidades:
 *  1. Servir archivos estáticos desde el bucket de assets (raíz del repo)
 *  2. Exponer API REST en /api/* para funciones serverless
 *  3. Integrar Cloudflare Workers AI en /api/ai/*
 *  4. Almacenamiento seguro en R2 en /api/storage/*
 *  5. Rate Limiting por IP/usuario
 *  6. Manejar CORS y cabeceras de seguridad
 *  7. SPA fallback: cualquier ruta desconocida → index.html
 *
 * Bindings requeridos:
 *  - ASSETS: Assets estáticos (Wrangler)
 *  - AI: Cloudflare Workers AI
 *  - SPLITGASTO_BUCKET: R2 Bucket (splitgasto-storage)
 *  - SPLITGASTO_RATE_LIMITER: Rate Limiter (100 req/60s)
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        // ── 0. Rate Limiting global ──────────────────────────────────
        const rateLimitResult = await checkRateLimit(request, env);
        if (!rateLimitResult.success) {
            return jsonResponse(
                {
                    error: 'Demasiadas peticiones',
                    message: 'Has excedido el límite de 100 peticiones por minuto. Intenta de nuevo más tarde.',
                    retryAfter: 60,
                },
                429,
                { 'Retry-After': '60' }
            );
        }

        // ── 1. Rutas de API ──────────────────────────────────────────
        if (path.startsWith('/api/')) {
            return handleAPI(request, env, ctx, path);
        }

        // ── 2. Assets estáticos ──────────────────────────────────────
        try {
            const assetResponse = await env.ASSETS.fetch(request);
            const headers = new Headers(assetResponse.headers);
            setSecurityHeaders(headers);
            return new Response(assetResponse.body, {
                status: assetResponse.status,
                headers,
            });
        } catch (e) {
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
    if (!env.SPLITGASTO_RATE_LIMITER) {
        return { success: true }; // Sin rate limiter configurado, permitir
    }

    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const authHeader = request.headers.get('Authorization');

    // Priorizar usuario autenticado sobre IP
    const key = authHeader
        ? `user:${extractUserIdFromToken(authHeader)}`
        : `ip:${clientIP}`;

    try {
        return await env.SPLITGASTO_RATE_LIMITER.limit({ key });
    } catch {
        return { success: true }; // Si falla el rate limiter, permitir
    }
}

function extractUserIdFromToken(authHeader) {
    // ── IMPORTANTE ──────────────────────────────────────────────────
    // Reemplaza esta función con tu lógica real de autenticación.
    // Por ahora extrae un ID básico del header Authorization.
    // Ejemplos de lo que deberías implementar:
    //   - Verificar JWT y extraer el sub/userId
    //   - Validar sesión contra tu base de datos
    //   - Verificar token contra un servicio de auth externo
    // ─────────────────────────────────────────────────────────────────
    if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        // TODO: Decodificar JWT real y extraer userId
        // Por ahora usamos un hash simple del token como identificador
        return token.slice(0, 16) || 'anonymous';
    }
    return 'anonymous';
}

// ═══════════════════════════════════════════════════════════════════════
// Autenticación
// ═══════════════════════════════════════════════════════════════════════
function requireAuth(request) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return {
            authenticated: false,
            error: jsonResponse(
                { error: 'No autorizado', message: 'Se requiere header Authorization: Bearer <token>' },
                401
            ),
        };
    }

    // ── IMPORTANTE ──────────────────────────────────────────────────
    // Reemplaza esta validación con tu sistema de autenticación real.
    // Este es un placeholder que acepta cualquier token no vacío.
    // Deberías:
    //   1. Verificar la firma del JWT
    //   2. Verificar que no haya expirado
    //   3. Extraer el userId del payload
    //   4. Verificar permisos específicos si es necesario
    // ─────────────────────────────────────────────────────────────────
    const token = authHeader.slice(7);
    if (!token || token.length < 8) {
        return {
            authenticated: false,
            error: jsonResponse(
                { error: 'Token inválido', message: 'El token proporcionado no es válido' },
                401
            ),
        };
    }

    // TODO: Reemplazar con decodificación real del JWT
    const userId = token.slice(0, 16);

    return {
        authenticated: true,
        userId,
        token,
    };
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
            version: env.APP_VERSION ?? '3.1',
            env: env.APP_ENV ?? 'production',
            timestamp: new Date().toISOString(),
            ai_available: !!env.AI,
            r2_available: !!env.SPLITGASTO_BUCKET,
            rate_limiter_available: !!env.SPLITGASTO_RATE_LIMITER,
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

    // ── /api/ai/chat ────────────────────────────────────────────────
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

    // ── /api/ai/classify ────────────────────────────────────────────
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

    // ── /api/ai/summary ─────────────────────────────────────────────
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
// R2 Storage — Almacenamiento seguro de archivos
// ═══════════════════════════════════════════════════════════════════════
async function handleStorage(request, env, path) {
    if (!env.SPLITGASTO_BUCKET) {
        return jsonResponse(
            { error: 'R2 Storage no está habilitado en este entorno' },
            503
        );
    }

    // ── Autenticación requerida para TODAS las operaciones R2 ────────
    const auth = requireAuth(request);
    if (!auth.authenticated) {
        return auth.error;
    }

    const { userId } = auth;
    const method = request.method;

    // ── /api/storage/upload — Subir archivo ─────────────────────────
    if (path === '/api/storage/upload' && method === 'POST') {
        return handleUpload(request, env, userId);
    }

    // ── /api/storage/download/:key — Descargar archivo ──────────────
    if (path.startsWith('/api/storage/download/') && method === 'GET') {
        const key = decodeURIComponent(path.slice('/api/storage/download/'.length));
        return handleDownload(env, userId, key);
    }

    // ── /api/storage/delete/:key — Eliminar archivo ─────────────────
    if (path.startsWith('/api/storage/delete/') && method === 'DELETE') {
        const key = decodeURIComponent(path.slice('/api/storage/delete/'.length));
        return handleDelete(env, userId, key);
    }

    // ── /api/storage/list — Listar archivos del usuario ─────────────
    if (path === '/api/storage/list' && method === 'GET') {
        return handleList(env, userId);
    }

    // ── /api/storage/presigned — Generar URL pre-firmada ────────────
    if (path === '/api/storage/presigned' && method === 'POST') {
        return handlePresigned(request, env, userId);
    }

    // ── /api/storage/info/:key — Info de un archivo ─────────────────
    if (path.startsWith('/api/storage/info/') && method === 'GET') {
        const key = decodeURIComponent(path.slice('/api/storage/info/'.length));
        return handleInfo(env, userId, key);
    }

    return jsonResponse({ error: 'Ruta de storage no encontrada', path }, 404);
}

// ── Subir archivo a R2 ──────────────────────────────────────────────
async function handleUpload(request, env, userId) {
    const contentType = request.headers.get('Content-Type') || '';

    // Soportar multipart/form-data y binary direct
    let fileData, fileName, fileType;

    if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        const file = formData.get('file');
        if (!file) {
            return jsonResponse({ error: 'Campo "file" requerido en el formulario' }, 400);
        }
        fileData = await file.arrayBuffer();
        fileName = formData.get('name') || file.name || 'untitled';
        fileType = file.type || 'application/octet-stream';
    } else {
        // Binary upload directo
        fileData = await request.arrayBuffer();
        fileName = request.headers.get('X-File-Name') || 'untitled';
        fileType = contentType || 'application/octet-stream';
    }

    // ── Validaciones de seguridad ────────────────────────────────────
    const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50 MB
    if (fileData.byteLength > MAX_FILE_SIZE) {
        return jsonResponse(
            { error: 'Archivo demasiado grande', maxSize: '50MB', receivedSize: `${(fileData.byteLength / 1024 / 1024).toFixed(2)}MB` },
            413
        );
    }

    // Tipos de archivo permitidos
    const ALLOWED_TYPES = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
        'application/pdf',
        'text/plain', 'text/csv',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/zip',
    ];
    if (!ALLOWED_TYPES.includes(fileType)) {
        return jsonResponse(
            { error: 'Tipo de archivo no permitido', allowedTypes: ALLOWED_TYPES, receivedType: fileType },
            415
        );
    }

    // Generar clave única: usuarios/{userId}/{timestamp}_{fileName}
    const timestamp = Date.now();
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `usuarios/${userId}/${timestamp}_${safeName}`;

    // Subir a R2 con metadata
    await env.SPLITGASTO_BUCKET.put(key, fileData, {
        httpMetadata: {
            contentType: fileType,
        },
        customMetadata: {
            userId,
            originalName: fileName,
            uploadedAt: new Date().toISOString(),
        },
    });

    return jsonResponse({
        success: true,
        key,
        fileName,
        fileType,
        fileSize: fileData.byteLength,
        message: 'Archivo subido correctamente',
    }, 201);
}

// ── Descargar archivo de R2 ─────────────────────────────────────────
async function handleDownload(env, userId, key) {
    // Verificar que el archivo pertenece al usuario
    if (!isUserFile(userId, key)) {
        return jsonResponse(
            { error: 'Acceso denegado', message: 'No tienes permiso para acceder a este archivo' },
            403
        );
    }

    const object = await env.SPLITGASTO_BUCKET.get
