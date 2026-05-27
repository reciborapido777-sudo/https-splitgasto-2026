/**
 * SplitGasto 2026 — Cloudflare Worker Dinámico
 * Versión: 4.22 — 2026-05-27
 *
 * Bindings:
 * - env.ASSETS                  → Assets estáticos
 * - env.AI                      → Workers AI + AI Gateway
 * - env.SPLITGASTO_BUCKET       → R2 Bucket (splitgasto-storage)
 * - env.SPLITGASTO_RATE_LIMITER → Rate Limiter (100 req/60s)
 * - env.SPLITGASTO_DB           → D1 Database (splitgasto-db)
 * - env.SPLITGASTO_CACHE        → KV Namespace (splitgasto-cache)
 * - env.JWT_SECRET              → Secret para JWT (obligatorio)
 *
 * Modelos IA:
 * - Chat/Análisis:    @cf/meta/llama-3.1-8b-instruct
 * - Escaneo tickets:  @cf/meta/llama-3.2-11b-vision-instruct
 * - Clasificación:    @cf/meta/llama-3.2-1b-instruct
 */

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;

        if (path.startsWith('/api/')) {
            const rateLimitResult = await checkRateLimit(request, env);
            if (rateLimitResult) return rateLimitResult;
            return handleAPI(request, env, ctx, path);
        }

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
    if (!env.SPLITGASTO_RATE_LIMITER) return null;
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const key = clientIP;
    try {
        const { success } = await env.SPLITGASTO_RATE_LIMITER.limit({ key });
        if (!success) {
            return jsonResponse(
                { error: 'Demasiadas peticiones', message: 'Límite 100 req/min excedido.', retry_after: 60 },
                429,
                request
            );
        }
    } catch (err) {
        console.error('Rate limiter error:', err.message);
    }
    return null;
}

// ═══════════════════════════════════════════════════════════════════════
// API Router
// ═══════════════════════════════════════════════════════════════════════
async function handleAPI(request, env, ctx, path) {
    const method = request.method;
    if (method === 'OPTIONS') return corsResponse(request);
    
    if (path === '/api/health') {
        return jsonResponse({
            status: 'ok',
            app: env.APP_NAME ?? 'SplitGasto 2026',
            version: env.APP_VERSION ?? '4.22',
            env: env.APP_ENV ?? 'production',
            timestamp: new Date().toISOString(),
            ai_available: !!env.AI,
            r2_available: !!env.SPLITGASTO_BUCKET,
            d1_available: !!env.SPLITGASTO_DB,
            kv_available: !!env.SPLITGASTO_CACHE,
            ratelimit_available: !!env.SPLITGASTO_RATE_LIMITER,
        }, 200, request);
    }

    if (path.startsWith('/api/auth/')) return handleAuth(request, env, path);
    if (path === '/api/db/balances') return handleBalances(request, env);
    if (path.startsWith('/api/ai/')) return handleAI(request, env, path);
    if (path.startsWith('/api/storage/')) return handleStorage(request, env, path);
    if (path.startsWith('/api/db/')) return handleDatabase(request, env, path);

    return jsonResponse({ error: 'Endpoint no encontrado', path }, 404, request);
}

// ═══════════════════════════════════════════════════════════════════════
// KV Cache Helpers
// ═══════════════════════════════════════════════════════════════════════
async function getCached(env, key) {
    if (!env.SPLITGASTO_CACHE) return null;
    try {
        return await env.SPLITGASTO_CACHE.get(key, 'json');
    } catch { return null; }
}

async function setCache(env, key, value, ttl = 300) {
    if (!env.SPLITGASTO_CACHE) return;
    try {
        await env.SPLITGASTO_CACHE.put(key, JSON.stringify(value), { expirationTtl: ttl });
    } catch {}
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash |= 0;
    }
    return hash.toString(36);
}

// ═══════════════════════════════════════════════════════════════════════
// Email Validation
// ═══════════════════════════════════════════════════════════════════════
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ═══════════════════════════════════════════════════════════════════════
// Password Hashing — PBKDF2 con Web Crypto API
// ═══════════════════════════════════════════════════════════════════════
async function hashPassword(password) {
    const enc = new TextEncoder();
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
    );
    const bits = await crypto.subtle.deriveBits(
        { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256
    );
    const saltB64 = btoa(String.fromCharCode(...salt));
    const hashB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
    return `${saltB64}:${hashB64}`;
}

async function verifyPassword(password, storedHash) {
    try {
        const [saltB64, hashB64] = storedHash.split(':');
        if (!saltB64 || !hashB64) return false;
        const enc = new TextEncoder();
        const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
        const key = await crypto.subtle.importKey(
            'raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']
        );
        const bits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' }, key, 256
        );
        const computedB64 = btoa(String.fromCharCode(...new Uint8Array(bits)));
        return computedB64 === hashB64;
    } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════════════
// Auth — JWT con Web Crypto API + PBKDF2 passwords
// ═══════════════════════════════════════════════════════════════════════
function b64Encode(data) {
    return btoa(unescape(encodeURIComponent(data)));
}

function b64Decode(b64) {
    return decodeURIComponent(escape(atob(b64)));
}

function getJwtSecret(env) {
    if (!env.JWT_SECRET) throw new Error('JWT_SECRET no configurado');
    return env.JWT_SECRET;
}

async function signJWT(payload, env) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const now = Math.floor(Date.now() / 1000);
    const data = { ...payload, iat: now, exp: now + 86400 * 7 };
    const enc = new TextEncoder();
    const headerB64 = b64Encode(JSON.stringify(header));
    const payloadB64 = b64Encode(JSON.stringify(data));
    const message = `${headerB64}.${payloadB64}`;
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(getJwtSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)));
    return `${message}.${sigB64}`;
}

async function verifyJWT(token, env) {
    try {
        const parts = token.split('.');
        if (parts.length !== 3) return null;
        const enc = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw', enc.encode(getJwtSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']
        );
        const sig = Uint8Array.from(atob(parts[2]), c => c.charCodeAt(0));
        const valid = await crypto.subtle.verify('HMAC', key, sig, enc.encode(`${parts[0]}.${parts[1]}`));
        if (!valid) return null;
        const payload = JSON.parse(b64Decode(parts[1]));
        if (payload.exp < Date.now() / 1000) return null;
        return payload;
    } catch { return null; }
}

async function getAuthUser(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
    return await verifyJWT(authHeader.substring(7), env);
}

async function requireAuth(request, env) {
    const user = await getAuthUser(request, env);
    if (!user) return { error: jsonResponse({ error: 'No autorizado — token inválido o expirado' }, 401, request), user: null };
    return { error: null, user };
}

function generateRecoveryCode() {
    const array = new Uint32Array(1);
    crypto.getRandomValues(array);
    return (array[0] % 1000000).toString().padStart(6, '0');
}

async function handleAuth(request, env, path) {
    if (!env.SPLITGASTO_DB) return jsonResponse({ error: 'D1 no disponible' }, 503);
    if (!env.JWT_SECRET) return jsonResponse({ error: 'Servicio de autenticación no disponible', detail: 'JWT_SECRET no configurado' }, 503);

    if (path === '/api/auth/register' && request.method === 'POST') {
        let body = {};
        try { body = await request.json(); } catch { return jsonResponse({ error: 'Body JSON inválido' }, 400); }
        const { name, email, password } = body;
        if (!name || !email || !password) return jsonResponse({ error: 'Campos "name", "email", "password" requeridos' }, 400);
        if (!isValidEmail(email)) return jsonResponse({ error: 'Email inválido' }, 400);
        if (password.length < 6) return jsonResponse({ error: 'Contraseña mínimo 6 caracteres' }, 400);
        if (password.length > 128) return jsonResponse({ error: 'Contraseña máximo 128 caracteres' }, 400);

        const normalizedEmail = email.toLowerCase().trim();
        if (!isValidEmail(normalizedEmail)) return jsonResponse({ error: 'Email inválido' }, 400);
        if (name.length > 100) return jsonResponse({ error: 'Nombre máximo 100 caracteres' }, 400);
        if (normalizedEmail.length > 254) return jsonResponse({ error: 'Email demasiado largo' }, 400);

        const existing = await env.SPLITGASTO_DB.prepare('SELECT id FROM users WHERE LOWER(email) = ?').bind(normalizedEmail).first();
        if (existing) return jsonResponse({ error: 'Este email ya está registrado' }, 409);

        const id = crypto.randomUUID();
        const hashedPassword = await hashPassword(password);

        await env.SPLITGASTO_DB.prepare(
            'INSERT INTO users (id, name, email, password_hash, avatar_url) VALUES (?, ?, ?, ?, ?)'
        ).bind(id, name.trim(), normalizedEmail, hashedPassword, '').run();

        const token = await signJWT({ userId: id, email: normalizedEmail }, env);
        return jsonResponse({ success: true, token, user: { id, name: name.trim(), email: normalizedEmail } }, 201);
    }

    if (path === '/api/auth/login' && request.method === 'POST') {
        let body = {};
        try { body = await request.json(); } catch { return jsonResponse({ error: 'Body JSON inválido' }, 400); }
        const { email, password } = body;
        if (!email || !password) return jsonResponse({ error: 'Campos "email" y "password" requeridos' }, 400);

        const normalizedEmail = email.toLowerCase().trim();
        const user = await env.SPLITGASTO_DB.prepare(
            'SELECT id, name, email, password_hash, avatar_url FROM users WHERE LOWER(email) = ?'
        ).bind(normalizedEmail).first();
        if (!user) return jsonResponse({ error: 'Email o contraseña incorrectos' }, 401);

        if (!user.password_hash) return jsonResponse({ error: 'Cuenta sin contraseña. Usa recuperación.' }, 401);
        const validPassword = await verifyPassword(password, user.password_hash);
        if (!validPassword) return jsonResponse({ error: 'Email o contraseña incorrectos' }, 401);

        const token = await signJWT({ userId: user.id, email: user.email }, env);
        return jsonResponse({ success: true, token, user: { id: user.id, name: user.name, email: user.email } });
    }

    if (path === '/api/auth/me' && request.method === 'GET') {
        const { error, user: authUser } = await requireAuth(request, env);
        if (error) return error;

        const user = await env.SPLITGASTO_DB.prepare(
            'SELECT id, name, email, avatar_url FROM users WHERE id = ?'
        ).bind(authUser.userId).first();
        if (!user) return jsonResponse({ error: 'Usuario no encontrado' }, 404);
        return jsonResponse({ success: true, user });
    }

    if (path === '/api/auth/change-password' && request.method === 'POST') {
        const { error, user: authUser } = await requireAuth(request, env);
        if (error) return error;

        let body = {};
        try { body = await request.json(); } catch { return jsonResponse({ error: 'Body JSON inválido' }, 400); }
        const { currentPassword, newPassword } = body;
        if (!currentPassword || !newPassword) return jsonResponse({ error: 'Campos "currentPassword" y "newPassword" requeridos' }, 400);
        if (newPassword.length < 6) return jsonResponse({ error: 'Nueva contraseña mínimo 6 caracteres' }, 400);
        if (newPassword.length > 128) return jsonResponse({ error: 'Contraseña máximo 128 caracteres' }, 400);

        const user = await env.SPLITGASTO_DB.prepare(
            'SELECT password_hash FROM users WHERE id = ?'
        ).bind(authUser.userId).first();
        if (!user || !user.password_hash) return jsonResponse({ error: 'Cuenta sin contraseña' }, 400);

        const validPassword = await verifyPassword(currentPassword, user.password_hash);
        if (!validPassword) return jsonResponse({ error: 'Contraseña actual incorrecta' }, 401);

        const hashedNewPassword = await hashPassword(newPassword);
        await env.SPLITGASTO_DB.prepare(
            'UPDATE users SET password_hash = ? WHERE id = ?'
        ).bind(hashedNewPassword, authUser.userId).run();

        return jsonResponse({ success: true, message: 'Contraseña actualizada' });
    }

    if (path === '/api/auth/forgot-password' && request.method === 'POST') {
        let body = {};
        try { body = await request.json(); } catch { return jsonResponse({ error: 'Body JSON inválido' }, 400); }
        const { email } = body;
        if (!email) return jsonResponse({ error: 'Campo "email" requerido' }, 400);

        const normalizedForgotEmail = email.toLowerCase().trim();
        const user = await env.SPLITGASTO_DB.prepare('SELECT id FROM users WHERE LOWER(email) = ?').bind(normalizedForgotEmail).first();
        if (!user) return jsonResponse({ success: true, message: 'Si el email existe, recibirás un código' });

        if (!env.SPLITGASTO_CACHE) return jsonResponse({ error: 'Sistema de recuperación no disponible' }, 503);

        const code = generateRecoveryCode();
        const codeHash = await hashPassword(code);

        await env.SPLITGASTO_CACHE.put(
            `recovery:${user.id}`,
            JSON.stringify({ codeHash, email, createdAt: Date.now() }),
            { expirationTtl: 900 }
        );

        try {
            await fetch('https://api.mailchannels.net/tx/v1/send', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    personalizations: [{ to: [{ email }] }],
                    from: { email: 'noreply@splitgasto.com', name: 'SplitGasto' },
                    subject: 'Código de recuperación — SplitGasto',
                    content: [{
                        type: 'text/plain',
                        value: `Tu código de recuperación es: ${code}\n\nExpira en 15 minutos.\n\nSi no solicitaste esto, ignora este email.`
                    }],
                }),
            });
        } catch (emailErr) {
            console.error('Error enviando email:', emailErr.message);
        }

        return jsonResponse({ success: true, message: 'Si el email existe, recibirás un código' });
    }

    if (path === '/api/auth/reset-password' && request.method === 'POST') {
        let body = {};
        try { body = await request.json(); } catch { return jsonResponse({ error: 'Body JSON inválido' }, 400); }
        const { userId, code, newPassword } = body;
        if (!userId || !code || !newPassword) return jsonResponse({ error: 'Campos "userId", "code", "newPassword" requeridos' }, 400);
        if (newPassword.length < 6) return jsonResponse({ error: 'Contraseña mínimo 6 caracteres' }, 400);
        // CAMBIO APLICADO: Protección Anti-DoS por CPU bound mitigando payloads de Web Crypto masivos
        if (newPassword.length > 128) return jsonResponse({ error: 'Contraseña máximo 128 caracteres' }, 400);

        if (!env.SPLITGASTO_CACHE) return jsonResponse({ error: 'Sistema de recuperación no disponible' }, 503);

        const stored = await env.SPLITGASTO_CACHE.get(`recovery:${userId}`, 'json');
        if (!stored) return jsonResponse({ error: 'Código expirado o inválido' }, 400);

        const validCode = await verifyPassword(code, stored.codeHash);
        if (!validCode) return jsonResponse({ error: 'Código incorrecto' }, 400);

        const hashedPassword = await hashPassword(newPassword);
        await env.SPLITGASTO_DB.prepare(
            'UPDATE users SET password_hash = ? WHERE id = ?'
        ).bind(hashedPassword, userId).run();

        await env.SPLITGASTO_CACHE.delete(`recovery:${userId}`);

        return jsonResponse({ success: true, message: 'Contraseña restablecida correctamente' });
    }

    return jsonResponse({ error: 'Ruta de auth no encontrada', path }, 404);
}

// ═══════════════════════════════════════════════════════════════════════
// Workers AI — con AI Gateway para optimizar costos
// ═══════════════════════════════════════════════════════════════════════
async function handleAI(request, env, path) {
    if (!env.AI) return jsonResponse({ error: 'Workers AI no disponible' }, 503);
    if (request.method !== 'POST') return jsonResponse({ error: 'Usa POST.' }, 405);

    const { error: authError, user: authUser } = await requireAuth(request, env);
    if (authError) return authError;
    let body = {};
    if (path !== '/api/ai/scan-ticket-upload') {
        try { body = await request.json(); } catch { return jsonResponse({ error: 'Body JSON inválido' }, 400); }
    }

    const gatewayId = env.AI_GATEWAY || '';
    const gatewayOpts = gatewayId ? { gateway: { id: gatewayId, cacheTtl: 3600 } } : {};

    if (path === '/api/ai/chat') {
        const userMessage = body.message || body.prompt || '';
        if (!userMessage) return jsonResponse({ error: 'Campo "message" requerido' }, 400);

        const cacheKey = `ai:chat:${hashString(userMessage)}`;
        const cached = await getCached(env, cacheKey);
        if (cached) return jsonResponse({ ...cached, cached: true });

        const systemPrompt = body.system ||
            'Eres un asistente financiero integrado en SplitGasto 2026. ' +
            'Ayudas a dividir gastos, gestionar deudas y entender finanzas. ' +
            'Responde siempre en español, clara y concisamente.';

        try {
            const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: userMessage },
                ],
                max_tokens: body.max_tokens ?? 512,
                temperature: body.temperature ?? 0.7,
                ...gatewayOpts,
            });
            const response = { success: true, response: result.response, model: '@cf/meta/llama-3.1-8b-instruct' };
            await setCache(env, cacheKey, response, 600);
            return jsonResponse(response);
        } catch (err) {
            return jsonResponse({ error: 'Error en Workers AI', detail: err.message }, 500);
        }
    }

    if (path === '/api/ai/classify') {
        const expense = body.expense || '';
        if (!expense) return jsonResponse({ error: 'Campo "expense" requerido' }, 400);

        const cacheKey = `ai:classify:${hashString(expense)}`;
        const cached = await getCached(env, cacheKey);
        if (cached) return jsonResponse({ ...cached, cached: true });

        try {
            const result = await env.AI.run('@cf/meta/llama-3.2-1b-instruct', {
                messages: [
                    {
                        role: 'system',
                        content: 'Clasifica el gasto en UNA categoría JSON. Opciones: ' +
                            '{"category":"comida"},{"category":"transporte"},{"category":"entretenimiento"},' +
                            '{"category":"alojamiento"},{"category":"compras"},{"category":"salud"},' +
                            '{"category":"servicios"},{"category":"otro"}. Solo responde el JSON.',
                    },
                    { role: 'user', content: expense },
                ],
                max_tokens: 32,
                temperature: 0.1,
                ...gatewayOpts,
            });
            let category = 'otro';
            try {
                const parsed = JSON.parse(result.response);
                category = parsed.category || 'otro';
            } catch {
                const match = result.response.match(/"category"\s*:\s*"([^"]+)"/);
                if (match) category = match[1];
            }
            const response = { success: true, category, expense };
            await setCache(env, cacheKey, response, 3600);
            return jsonResponse(response);
        } catch (err) {
            return jsonResponse({ error: 'Error clasificando', detail: err.message }, 500);
        }
    }

    if (path === '/api/ai/scan-ticket') {
        const { image } = body;
        if (!image) return jsonResponse({ error: 'Campo "image" (base64) requerido' }, 400);
        try {
            const result = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
                messages: [
                    { role: 'system', content: 'Eres un escáner de recibos. Extrae: ' +
                        '{"merchant":"comercio","date":"fecha","total":0.00,' +
                        '"currency":"moneda","items":[{"name":"producto","price":0.00}], ' +
                        '"category":"categoría"}. Responde SOLO JSON válido.' },
                    { role: 'user', content: 'Extrae los datos de este ticket.' },
                ],
                image: `data:image/jpeg;base64,${image}`,
                max_tokens: 512, temperature: 0.1, ...gatewayOpts,
            });
            let ticketData = {};
            try {
                const jsonMatch = result.response.match(/\{[\s\S]*\}/);
                ticketData = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: result.response };
            } catch { ticketData = { raw: result.response }; }

            let receiptKey = null;
            if (env.SPLITGASTO_BUCKET) {
                try {
                    receiptKey = `receipts/${authUser.userId}/${Date.now()}-receipt.jpg`;
                    const binaryString = atob(image);
                    const bytes = new Uint8Array(binaryString.length);
                    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
                    await env.SPLITGASTO_BUCKET.put(receiptKey, bytes, {
                        httpMetadata: { contentType: 'image/jpeg' },
                        customMetadata: { userId: authUser.userId, uploadedAt: new Date().toISOString(), type: 'scanned-receipt' },
                    });
                } catch (uploadErr) { console.error('Error guardando recibo en R2:', uploadErr.message); }
            }
            return jsonResponse({ success: true, data: ticketData, receiptKey, model: '@cf/meta/llama-3.2-11b-vision-instruct' });
        } catch (err) {
            return jsonResponse({ error: 'Error escaneando ticket', detail: err.message }, 500);
        }
    }

    if (path === '/api/ai/summary') {
        const data = body.data || body.expenses || '';
        if (!data) return jsonResponse({ error: 'Campo "data" requerido' }, 400);
        const prompt = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        try {
            const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                messages: [
                    { role: 'system', content: 'Eres un analista financiero. Analiza gastos compartidos y genera ' +
                        'un resumen en español (máx 3 párrafos): quién debe más, categorías principales, ' +
                        'y 2 recomendaciones para ahorrar.' },
                    { role: 'user', content: `Analiza estos gastos:\n${prompt}` },
                ],
                max_tokens: 400, temperature: 0.5, ...gatewayOpts,
            });
            return jsonResponse({ success: true, summary: result.response, model: '@cf/meta/llama-3.1-8b-instruct' });
        } catch (err) {
            return jsonResponse({ error: 'Error generando resumen', detail: err.message }, 500);
        }
    }

    if (path === '/api/ai/scan-ticket-upload') {
        try {
            const formData = await request.formData();
            const image = formData.get('image');
            if (!image) return jsonResponse({ error: 'Campo "image" (archivo) requerido' }, 400);
            const MAX_SIZE = 10 * 1024 * 1024;
            if (image.size > MAX_SIZE) return jsonResponse({ error: 'Imagen excede 10MB' }, 413);
            const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            if (!allowedImageTypes.includes(image.type)) return jsonResponse({ error: `Tipo no permitido: ${image.type}` }, 415);

            let receiptKey = null;
            if (env.SPLITGASTO_BUCKET) {
                receiptKey = `receipts/${authUser.userId}/${Date.now()}-${image.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
                await env.SPLITGASTO_BUCKET.put(receiptKey, image.stream(), {
                    httpMetadata: { contentType: image.type },
                    customMetadata: { userId: authUser.userId, uploadedAt: new Date().toISOString(), type: 'scanned-receipt' },
                });
            }

            const arrayBuffer = await image.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            let binary = '';
            for (let i = 0; i < bytes.length; i += 8192) {
                binary += String.fromCharCode(...bytes.subarray(i, Math.min(i + 8192, bytes.length)));
            }
            const base64 = btoa(binary);

            const aiResult = await env.AI.run('@cf/meta/llama-3.2-11b-vision-instruct', {
                messages: [
                    { role: 'system', content: 'Eres un escáner de recibos. Extrae: ' +
                        '{"merchant":"comercio","date":"fecha","total":0.00,' +
                        '"currency":"moneda","items":[{"name":"producto","price":0.00}], ' +
                        '"category":"categoría"}. Responde SOLO JSON válido.' },
                    { role: 'user', content: 'Extrae los datos de este ticket.' },
                ],
                image: `data:${image.type};base64,${base64}`,
                max_tokens: 512, temperature: 0.1, ...gatewayOpts,
            });

            let ticketData = {};
            try {
                const jsonMatch = aiResult.response.match(/\{[\s\S]*\}/);
                ticketData = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: aiResult.response };
            } catch { ticketData = { raw: aiResult.response }; }

            return jsonResponse({
                success: true, data: ticketData, receiptKey,
                model: '@cf/meta/llama-3.2-11b-vision-instruct',
            });
        } catch (err) {
            return jsonResponse({ error: 'Error escaneando ticket', detail: err.message }, 500);
        }
    }

    return jsonResponse({ error: 'Ruta de AI no encontrada', path }, 404);
}

// ═══════════════════════════════════════════════════════════════════════
// R2 Storage — Almacenamiento seguro
// ═══════════════════════════════════════════════════════════════════════
async function handleStorage(request, env, path) {
    if (!env.SPLITGASTO_BUCKET) return jsonResponse({ error: 'R2 no disponible' }, 503);
    const { error: authError, user: authUser } = await requireAuth(request, env);
    if (authError) return authError;
    const method = request.method;

    if (path === '/api/storage/upload' && method === 'POST') return handleStorageUpload(request, env, authUser);
    if (path.startsWith('/api/storage/download/') && method === 'GET') {
        const key = decodeURIComponent(path.replace('/api/storage/download/', ''));
        return handleStorageDownload(request, env, key, authUser);
    }
    if (path.startsWith('/api/storage/signed-url/') && method === 'GET') {
        const key = decodeURIComponent(path.replace('/api/storage/signed-url/', ''));
        return handleSignedUrl(request, env, key, authUser);
    }
    if (path.startsWith('/api/storage/delete/') && method === 'DELETE') {
        const key = decodeURIComponent(path.replace('/api/storage/delete/', ''));
        return handleStorageDelete(request, env, key, authUser);
    }
    if (path === '/api/storage/list' && method === 'GET') return handleStorageList(request, env, authUser);
    return jsonResponse({ error: 'Ruta de storage no encontrada', path }, 404);
}

async function handleStorageUpload(request, env, authUser) {
    try {
        const contentType = request.headers.get('Content-Type') || '';
        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            const file = formData.get('file');
            const folder = formData.get('folder') || 'general';
            if (!file) return jsonResponse({ error: 'Campo "file" requerido' }, 400);
            const MAX_SIZE = 10 * 1024 * 1024;
            if (file.size > MAX_SIZE) return jsonResponse({ error: 'Archivo excede 10MB' }, 413);
            const allowedTypes = [
                'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                'application/pdf', 'text/plain', 'text/csv',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ];
            if (!allowedTypes.includes(file.type)) return jsonResponse({ error: `Tipo no permitido: ${file.type}` }, 415);
            const timestamp = Date.now();
            const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const key = `usuarios/${authUser.userId}/${folder}/${timestamp}-${sanitizedName}`;
            await env.SPLITGASTO_BUCKET.put(key, file.stream(), {
                httpMetadata: { contentType: file.type },
                customMetadata: { userId: authUser.userId, originalName: file.name, uploadedAt: new Date().toISOString() },
            });
            return jsonResponse({ success: true, key, size: file.size, type: file.type, message: 'Archivo subido' }, 201);
        }
        const body = await request.json();
        const { data, filename, folder, mimeType } = body;
        if (!data || !filename) return jsonResponse({ error: 'Campos "data" y "filename" requeridos' }, 400);
        const fld = folder || 'general';
        const timestamp = Date.now();
        const sanitizedName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
        const key = `usuarios/${authUser.userId}/${fld}/${timestamp}-${sanitizedName}`;
        const binaryString = atob(data);
        const bytes = new Uint8Array(binaryString.length);
        // SINTAXIS CORREGIDA: Paréntesis restaurados correctamente para compilación sin errores
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
        await env.SPLITGASTO_BUCKET.put(key, bytes, {
            httpMetadata: { contentType: mimeType || 'application/octet-stream' },
            customMetadata: { userId: authUser.userId, originalName: filename, uploadedAt: new Date().toISOString() },
        });
        return jsonResponse({ success: true, key, message: 'Archivo subido' }, 201);
    } catch (err) {
        return jsonResponse({ error: 'Error subiendo archivo', detail: err.message }, 500);
    }
}

async function handleStorageDownload(request, env, key, authUser) {
    try {
        if (!key.startsWith(`usuarios/${authUser.userId}/`) && !key.startsWith('receipts/')) {
            return jsonResponse({ error: 'Acceso denegado a este archivo' }, 403);
        }

        if (key.startsWith('receipts/')) {
            const headObj = await env.SPLITGASTO_BUCKET.head(key);
            if (!headObj) return jsonResponse({ error: 'Archivo no encontrado' }, 404);
            if (headObj.customMetadata?.userId !== authUser.userId) {
                return jsonResponse({ error: 'Acceso denegado a este archivo' }, 403);
            }
        }

        const object = await env.SPLITGASTO_BUCKET.get(key);
        if (!object) return jsonResponse({ error: 'Archivo no encontrado' }, 404);
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
        headers.set('Content-Disposition', `attachment; filename="${key.split('/').pop()}"`);
        headers.set('Cache-Control', 'private, max-age=3600');
        setSecurityHeaders(headers);
        return new Response(object.body, { headers });
    } catch (err) {
        return jsonResponse({ error: 'Error descargando', detail: err.message }, 500);
    }
}

async function handleSignedUrl(request, env, key, authUser) {
    try {
        if (!key.startsWith(`usuarios/${authUser.userId}/`) && !key.startsWith('receipts/')) {
            return jsonResponse({ error: 'Acceso denegado' }, 403);
        }

        if (key.startsWith('receipts/')) {
            const headObj = await env.SPLITGASTO_BUCKET.head(key);
            if (!headObj) return jsonResponse({ error: 'Archivo no encontrado' }, 404);
            if (headObj.customMetadata?.userId !== authUser.userId) {
                return jsonResponse({ error: 'Acceso denegado' }, 403);
            }
        }
        
        const signedUrl = await env.SPLITGASTO_BUCKET.createSignedUrl(key, { expiresIn: 3600 });
        return jsonResponse({ success: true, url: signedUrl, expiresIn: 3600, key });
    } catch (err) {
        return jsonResponse({ error: 'Error generando URL', detail: err.message }, 500);
    }
}

async function handleStorageDelete(request, env, key, authUser) {
    try {
        if (!key.startsWith(`usuarios/${authUser.userId}/`)) {
            return jsonResponse({ error: 'Acceso denegado' }, 403);
        }
        const object = await env.SPLITGASTO_BUCKET.head(key);
        if (!object) return jsonResponse({ error: 'Archivo no encontrado' }, 404);
        await env.SPLITGASTO_BUCKET.delete(key);
        return jsonResponse({ success: true, message: 'Archivo eliminado', key });
    } catch (err) {
        return jsonResponse({ error: 'Error eliminando', detail: err.message }, 500);
    }
}

async function handleStorageList(request, env, authUser) {
    try {
        const url = new URL(request.url);
        const folder = url.searchParams.get('folder') || '';
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        const cursor = url.searchParams.get('cursor') || undefined;
        const prefix = `usuarios/${authUser.userId}/${folder}`;
        const listed = await env.SPLITGASTO_BUCKET.list({ prefix, limit: Math.min(limit, 100), cursor });
        const objects = listed.objects.map((obj) => ({
            key: obj.key, size: obj.size,
            uploaded: obj.uploaded.toISOString(),
            type: obj.httpMetadata?.contentType || 'unknown',
        }));
        return jsonResponse({
            success: true, objects, truncated: listed.truncated,
            cursor: listed.truncated ? listed.cursor : null, count: objects.length,
        });
    } catch (err) {
        return jsonResponse({ error: 'Error listando', detail: err.message }, 500);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Balances — Cálculo de deudas
// ═══════════════════════════════════════════════════════════════════════
async function handleBalances(request, env) {
    if (!env.SPLITGASTO_DB) return jsonResponse({ error: 'D1 no disponible' }, 503);
    const { error: authError, user: authUser } = await requireAuth(request, env);
    if (authError) return authError;

    const url = new URL(request.url);
    const groupId = url.searchParams.get('groupId');
    if (!groupId) return jsonResponse({ error: 'Parámetro "groupId" requerido' }, 400);

    const membership = await env.SPLITGASTO_DB.prepare(
        'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
    ).bind(groupId, authUser.userId).first();
    if (!membership) return jsonResponse({ error: 'No perteneces a este grupo' }, 403);

    const cacheKey = `db:balances:${groupId}`;
    const cached = await getCached(env, cacheKey);
    if (cached) return jsonResponse({ ...cached, cached: true });

    const expenses = await env.SPLITGASTO_DB.prepare(
        'SELECT * FROM expenses WHERE group_id = ?'
    ).bind(groupId).all();

    const settlements = await env.SPLITGASTO_DB.prepare(
        'SELECT * FROM settlements WHERE group_id = ?'
    ).bind(groupId).all();

    const members = await env.SPLITGASTO_DB.prepare(
        'SELECT user_id, role FROM group_members WHERE group_id = ?'
    ).bind(groupId).all();

    const balances = {};
    members.results.forEach(m => { balances[m.user_id] = 0; });

    for (const e of expenses.results) {
        const amount = e.amount;
        const paidBy = e.paid_by;
        const splitType = e.split_type || 'equal';
        const memberCount = members.results.length;

        if (balances[paidBy] !== undefined) balances[paidBy] += amount;

        if (splitType === 'equal') {
            const share = amount / memberCount;
            members.results.forEach(m => {
                if (balances[m.user_id] !== undefined) balances[m.user_id] -= share;
            });
        } else if (splitType === 'exact' || splitType === 'percentage' || splitType === 'shares') {
            try {
                const splits = await env.SPLITGASTO_DB.prepare(
                    'SELECT user_id, share_amount FROM expense_splits WHERE expense_id = ?'
                ).bind(e.id).all();

                if (splits.results.length > 0) {
                    splits.results.forEach(s => {
                        if (balances[s.user_id] !== undefined) {
                            if (splitType === 'percentage') {
                                balances[s.user_id] -= (amount * s.share_amount / 100);
                            } else {
                                balances[s.user_id] -= s.share_amount;
                            }
                        }
                    });
                } else {
                    const share = amount / memberCount;
                    members.results.forEach(m => {
                        if (balances[m.user_id] !== undefined) balances[m.user_id] -= share;
                    });
                }
            } catch {
                const share = amount / memberCount;
                members.results.forEach(m => {
                    if (balances[m.user_id] !== undefined) balances[m.user_id] -= share;
                });
            }
        }
    }

    settlements.results.forEach(s => {
        if (balances[s.from_user] !== undefined) balances[s.from_user] += s.amount;
        if (balances[s.to_user] !== undefined) balances[s.to_user] -= s.amount;
    });

    const debtors = [];
    const creditors = [];
    Object.entries(balances).forEach(([userId, balance]) => {
        const rounded = Math.round(balance * 100) / 100;
        if (rounded < -0.01) debtors.push({ userId, amount: Math.abs(rounded) });
        else if (rounded > 0.01) creditors.push({ userId, amount: rounded });
    });
    debtors.sort((a, b) => b.amount - a.amount);
    creditors.sort((a, b) => b.amount - a.amount);

    const debts = [];
    let di = 0, ci = 0;
    while (di < debtors.length && ci < creditors.length) {
        const amount = Math.min(debtors[di].amount, creditors[ci].amount);
        if (amount > 0.01) {
            debts.push({ from: debtors[di].userId, to: creditors[ci].userId, amount: Math.round(amount * 100) / 100 });
        }
        debtors[di].amount -= amount;
        creditors[ci].amount -= amount;
        if (debtors[di].amount < 0.01) di++;
        if (creditors[ci].amount < 0.01) ci++;
    }

    const totalAmount = expenses.results.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    const response = {
        success: true,
        balances,
        debts,
        totalExpenses: expenses.results.length,
        totalAmount: Math.round(totalAmount * 100) / 100
    };
    await setCache(env, cacheKey, response, 10);
    return jsonResponse(response);
}

// ═══════════════════════════════════════════════════════════════════════
// D1 Database — Base de datos con autenticación
// ═══════════════════════════════════════════════════════════════════════
async function handleDatabase(request, env, path) {
    if (!env.SPLITGASTO_DB) return jsonResponse({ error: 'D1 no disponible' }, 503);
    const { error: authError, user: authUser } = await requireAuth(request, env);
    if (authError) return authError;
    const method = request.method;
    let body = {};
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        try { body = await request.json(); } catch { return jsonResponse({ error: 'Body JSON inválido' }, 400); }
    }

    if (path === '/api/db/groups' && method === 'GET') {
        const url = new URL(request.url);
        const userId = url.searchParams.get('userId') || authUser.userId;
        if (userId !== authUser.userId) return jsonResponse({ error: 'Solo puedes ver tus propios grupos' }, 403);
        if (env.SPLITGASTO_CACHE) {
            try { await env.SPLITGASTO_CACHE.delete(`db:groups:${userId}`); } catch {}
        }
        const groups = await env.SPLITGASTO_DB.prepare(
            `SELECT g.*,
                (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) AS member_count
             FROM groups g
             JOIN group_members gm ON g.id = gm.group_id
             WHERE gm.user_id = ?
             ORDER BY COALESCE(g.updated_at, g.created_at, g.id) DESC`
        ).bind(userId).all();
        return jsonResponse({ success: true, groups: groups.results });
    }

    if (path === '/api/db/groups' && method === 'POST') {
        const { name, currency, members } = body;
        if (!name) return jsonResponse({ error: 'Campo "name" requerido' }, 400);
        if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) return jsonResponse({ error: 'Nombre de grupo inválido (máx 100 caracteres)' }, 400);
        const ALLOWED_CURRENCIES = ['EUR', 'USD', 'GBP', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'BRL'];
        const safeCurrency = ALLOWED_CURRENCIES.includes(currency) ? currency : 'EUR';
        const userId = authUser.userId;
        const id = crypto.randomUUID();
        await env.SPLITGASTO_DB.prepare(
            'INSERT INTO groups (id, name, currency, created_by) VALUES (?, ?, ?, ?)'
        ).bind(id, name.trim(), safeCurrency, userId).run();

        await env.SPLITGASTO_DB.prepare(
            'INSERT INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)'
        ).bind(id, userId, 'admin').run();

        if (Array.isArray(members) && members.length > 0) {
            for (const member of members) {
                let memberId = null;
                if (typeof member === 'string' && member.includes('@')) {
                    const user = await env.SPLITGASTO_DB.prepare(
                        'SELECT id FROM users WHERE LOWER(email) = ?'
                    ).bind(member.toLowerCase().trim()).first();
                    if (user) memberId = user.id;
                } else {
                    const exists = await env.SPLITGASTO_DB.prepare(
                        'SELECT id FROM users WHERE id = ?'
                    ).bind(member).first();
                    if (exists) memberId = member;
                }
                if (memberId && memberId !== userId) {
                    try {
                        await env.SPLITGASTO_DB.prepare(
                            'INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)'
                        ).bind(id, memberId, 'member').run();
                    } catch {}
                }
            }
        }

        try { await env.SPLITGASTO_CACHE?.delete(`db:groups:${userId}`); } catch {}
        return jsonResponse({ success: true, id, name, message: 'Grupo creado' }, 201);
    }

    if (path === '/api/db/group-members' && method === 'GET') {
        const url = new URL(request.url);
        const groupId = url.searchParams.get('groupId');
        if (!groupId) return jsonResponse({ error: 'Parámetro "groupId" requerido' }, 400);
        if (env.SPLITGASTO_CACHE) {
            try { await env.SPLITGASTO_CACHE.delete(`db:groups:${authUser.userId}`); } catch {}
            try { await env.SPLITGASTO_CACHE.delete(`db:balances:${groupId}`); } catch {}
        }
        let membership = await env.SPLITGASTO_DB.prepare(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
        ).bind(groupId, authUser.userId).first();
        if (!membership) {
            const group = await env.SPLITGASTO_DB.prepare(
                'SELECT id, created_by FROM groups WHERE id = ?'
            ).bind(groupId).first();
            if (group && group.created_by === authUser.userId) {
                await env.SPLITGASTO_DB.prepare(
                    'INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)'
                ).bind(groupId, authUser.userId, 'admin').run();
                membership = { role: 'admin' };
            } else {
                return jsonResponse({ error: 'No perteneces a este grupo' }, 403);
            }
        }
        const members = await env.SPLITGASTO_DB.prepare(
            `SELECT u.id, u.name, u.email, u.avatar_url, gm.role
             FROM group_members gm
             JOIN users u ON u.id = gm.user_id
             WHERE gm.group_id = ?
             ORDER BY gm.role DESC, u.name ASC`
        ).bind(groupId).all();
        return jsonResponse({ success: true, members: members.results });
    }

    if (path === '/api/db/group-members' && method === 'POST') {
        const { groupId, userId: memberUserId, email: memberEmail, role } = body;
        if (!groupId || (!memberUserId && !memberEmail)) return jsonResponse({ error: 'Campos "groupId" y "userId" o "email" requeridos' }, 400);
        if (env.SPLITGASTO_CACHE) {
            try { await env.SPLITGASTO_CACHE.delete(`db:groups:${authUser.userId}`); } catch {}
        }
        let membership = await env.SPLITGASTO_DB.prepare(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
        ).bind(groupId, authUser.userId).first();
        if (!membership) {
            const grp = await env.SPLITGASTO_DB.prepare(
                'SELECT id, created_by FROM groups WHERE id = ?'
            ).bind(groupId).first();
            if (grp && grp.created_by === authUser.userId) {
                await env.SPLITGASTO_DB.prepare(
                    'INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)'
                ).bind(groupId, authUser.userId, 'admin').run();
                membership = { role: 'admin' };
            } else {
                return jsonResponse({ error: 'No perteneces a este grupo' }, 403);
            }
        }
        if (membership.role !== 'admin') return jsonResponse({ error: 'Solo el admin puede añadir miembros' }, 403);

        let actualMemberUserId = memberUserId;
        if (!actualMemberUserId && memberEmail) {
            const normalizedMemberEmail = memberEmail.toLowerCase().trim();
            if (!isValidEmail(normalizedMemberEmail)) return jsonResponse({ error: 'Email inválido' }, 400);
            const user = await env.SPLITGASTO_DB.prepare(
                'SELECT id FROM users WHERE LOWER(email) = ?'
            ).bind(normalizedMemberEmail).first();
            if (!user) return jsonResponse({ error: 'Usuario no encontrado con ese email' }, 404);
            actualMemberUserId = user.id;
        } else if (actualMemberUserId) {
            const userExists = await env.SPLITGASTO_DB.prepare(
                'SELECT id FROM users WHERE id = ?'
            ).bind(actualMemberUserId).first();
            if (!userExists) return jsonResponse({ error: 'Usuario no encontrado' }, 404);
        }

        await env.SPLITGASTO_DB.prepare(
            'INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)'
        ).bind(groupId, actualMemberUserId, role || 'member').run();

        try { await env.SPLITGASTO_CACHE?.delete(`db:groups:${authUser.userId}`); } catch {}
        try { await env.SPLITGASTO_CACHE?.delete(`db:groups:${actualMemberUserId}`); } catch {}
        try { await env.SPLITGASTO_CACHE?.delete(`db:balances:${groupId}`); } catch {}

        return jsonResponse({ success: true, message: 'Miembro añadido' }, 201);
    }

    if (path === '/api/db/expenses' && method === 'GET') {
        const url = new URL(request.url);
        const groupId = url.searchParams.get('groupId');
        if (!groupId) return jsonResponse({ error: 'Parámetro "groupId" requerido' }, 400);
        const membership = await env.SPLITGASTO_DB.prepare(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
        ).bind(groupId, authUser.userId).first();
        if (!membership) return jsonResponse({ error: 'No perteneces a este grupo' }, 403);
        if (env.SPLITGASTO_CACHE) {
            try { await env.SPLITGASTO_CACHE.delete(`db:expenses:${groupId}`); } catch {}
        }
        const page = parseInt(url.searchParams.get('page') || '1', 10);
        const perPage = Math.min(parseInt(url.searchParams.get('perPage') || '50', 10), 100);
        const offset = (page - 1) * perPage;
        const expenses = await env.SPLITGASTO_DB.prepare(
            'SELECT * FROM expenses WHERE group_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
        ).bind(groupId, perPage, offset).all();
        const total = await env.SPLITGASTO_DB.prepare(
            'SELECT COUNT(*) as count FROM expenses WHERE group_id = ?'
        ).bind(groupId).first();
        return jsonResponse({
            success: true, expenses: expenses.results,
            pagination: { page, perPage, total: total.count, totalPages: Math.ceil(total.count / perPage) },
        });
    }

    if (path === '/api/db/expenses' && method === 'POST') {
        const { groupId, amount, currency, category, description, splitType, paidBy } = body;
        if (!groupId || !amount) return jsonResponse({ error: 'Campos "groupId" y "amount" requeridos' }, 400);
        const parsedAmount = parseFloat(amount);
        if (isNaN(parsedAmount) || parsedAmount <= 0 || parsedAmount > 999999.99) {
            return jsonResponse({ error: 'Importe inválido (debe ser > 0 y < 1.000.000)' }, 400);
        }
        if (description && description.length > 500) return jsonResponse({ error: 'Descripción máximo 500 caracteres' }, 400);
        const ALLOWED_CATEGORIES = ['comida','transporte','entretenimiento','alojamiento','compras','salud','servicios','otro'];
        const safeCategory = ALLOWED_CATEGORIES.includes(category) ? category : 'otro';
        const ALLOWED_SPLIT_TYPES = ['equal','exact','percentage','shares'];
        const safeSplitType = ALLOWED_SPLIT_TYPES.includes(splitType) ? splitType : 'equal';
        const membership = await env.SPLITGASTO_DB.prepare(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
        ).bind(groupId, authUser.userId).first();
        if (!membership) return jsonResponse({ error: 'No perteneces a este grupo' }, 403);
        const actualPaidBy = paidBy || authUser.userId;
        if (actualPaidBy !== authUser.userId) {
            const payerMembership = await env.SPLITGASTO_DB.prepare(
                'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
            ).bind(groupId, actualPaidBy).first();
            if (!payerMembership) return jsonResponse({ error: 'El pagador no pertenece al grupo' }, 400);
        }
        const id = crypto.randomUUID();
        const ALLOWED_CURRENCIES_EXP = ['EUR', 'USD', 'GBP', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'BRL'];
        const safeCurrencyExp = ALLOWED_CURRENCIES_EXP.includes(currency) ? currency : 'EUR';
        await env.SPLITGASTO_DB.prepare(
            'INSERT INTO expenses (id, group_id, paid_by, amount, currency, category, description, split_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(id, groupId, actualPaidBy, parsedAmount, safeCurrencyExp, safeCategory, (description || 'Sin descripción').slice(0, 500), safeSplitType).run();
        if (env.SPLITGASTO_CACHE) {
            try { await env.SPLITGASTO_CACHE.delete(`db:expenses:${groupId}`); } catch {}
            try { await env.SPLITGASTO_CACHE.delete(`db:groups:${authUser.userId}`); } catch {}
            try { await env.SPLITGASTO_CACHE.delete(`db:balances:${groupId}`); } catch {}
        }
        return jsonResponse({ success: true, id, message: 'Gasto registrado' }, 201);
    }

    if (path === '/api/db/settlements' && method === 'GET') {
        const url = new URL(request.url);
        const groupId = url.searchParams.get('groupId');
        if (!groupId) return jsonResponse({ error: 'Parámetro "groupId" requerido' }, 400);
        const membership = await env.SPLITGASTO_DB.prepare(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
        ).bind(groupId, authUser.userId).first();
        if (!membership) return jsonResponse({ error: 'No perteneces a este grupo' }, 403);
        const settlements = await env.SPLITGASTO_DB.prepare(
            'SELECT * FROM settlements WHERE group_id = ? ORDER BY created_at DESC'
        ).bind(groupId).all();
        return jsonResponse({ success: true, settlements: settlements.results });
    }

    if (path === '/api/db/settlements' && method === 'POST') {
        const { groupId, fromUserId, toUserId, amount, currency } = body;
        if (!groupId || !fromUserId || !toUserId || !amount) return jsonResponse({ error: 'Campos "groupId", "fromUserId", "toUserId", "amount" requeridos' }, 400);
        const membership = await env.SPLITGASTO_DB.prepare(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
        ).bind(groupId, authUser.userId).first();
        if (!membership) return jsonResponse({ error: 'No perteneces a este grupo' }, 403);
        const id = crypto.randomUUID();
        await env.SPLITGASTO_DB.prepare(
            'INSERT INTO settlements (id, group_id, from_user, to_user, amount, currency) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(id, groupId, fromUserId, toUserId, amount, currency || 'EUR').run();
        await env.SPLITGASTO_CACHE?.delete(`db:balances:${groupId}`);
        return jsonResponse({ success: true, id, message: 'Liquidación registrada' }, 201);
    }

    if (path === '/api/db/profile' && method === 'GET') {
        const url = new URL(request.url);
        const userId = url.searchParams.get('userId') || authUser.userId;
        if (userId !== authUser.userId) return jsonResponse({ error: 'Solo puedes ver tu propio perfil' }, 403);
        const cacheKey = `db:profile:${userId}`;
        const cached = await getCached(env, cacheKey);
        if (cached) return jsonResponse({ ...cached, cached: true });
        const profile = await env.SPLITGASTO_DB.prepare(
            'SELECT id, name, email, avatar_url FROM users WHERE id = ?'
        ).bind(userId).first();
        if (!profile) return jsonResponse({ error: 'Usuario no encontrado' }, 404);
        const response = { success: true, profile };
        await setCache(env, cacheKey, response, 120);
        return jsonResponse(response);
    }

    if (path === '/api/db/profile' && method === 'POST') {
        const { name, email, avatar } = body;
        if (!name) return jsonResponse({ error: 'Campo "name" requerido' }, 400);
        const userId = authUser.userId;
        const emailToStore = email ? email.toLowerCase().trim() : `${userId}@splitgasto.app`;
        if (email && !isValidEmail(emailToStore)) return jsonResponse({ error: 'Email inválido' }, 400);
        if (name.length > 100) return jsonResponse({ error: 'Nombre máximo 100 caracteres' }, 400);
        await env.SPLITGASTO_DB.prepare(
            'UPDATE users SET name = ?, email = ?, avatar_url = ? WHERE id = ?'
        ).bind(name.trim(), emailToStore, avatar || '', userId).run();
        await env.SPLITGASTO_CACHE?.delete(`db:profile:${userId}`);
        return jsonResponse({ success: true, message: 'Perfil actualizado' });
    }

    if (path === '/api/db/notifications' && method === 'GET') {
        const url = new URL(request.url);
        const userId = url.searchParams.get('userId') || authUser.userId;
        if (userId !== authUser.userId) return jsonResponse({ error: 'Solo puedes ver tus notificaciones' }, 403);
        const notifications = await env.SPLITGASTO_DB.prepare(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
        ).bind(userId).all();
        return jsonResponse({ success: true, notifications: notifications.results });
    }

    if (path === '/api/db/notifications' && method === 'POST') {
        const { title, message, type } = body;
        if (!title) return jsonResponse({ error: 'Campo "title" requerido' }, 400);
        if (title.length > 200) return jsonResponse({ error: 'Título máximo 200 caracteres' }, 400);
        if (message && message.length > 1000) return jsonResponse({ error: 'Mensaje máximo 1000 caracteres' }, 400);
        const ALLOWED_NOTIF_TYPES = ['info', 'success', 'warning', 'error'];
        const safeType = ALLOWED_NOTIF_TYPES.includes(type) ? type : 'info';
        const userId = authUser.userId;
        const id = crypto.randomUUID();
        await env.SPLITGASTO_DB.prepare(
            'INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)'
        ).bind(id, userId, title.slice(0, 200), (message || '').slice(0, 1000), safeType).run();
        return jsonResponse({ success: true, id, message: 'Notificación creada' }, 201);
    }

    if (path === '/api/db/users' && method === 'GET') {
        const url = new URL(request.url);
        const email = url.searchParams.get('email');
        if (!email) return jsonResponse({ error: 'Parámetro "email" requerido' }, 400);
        const normalizedSearchEmail = email.toLowerCase().trim();
        const user = await env.SPLITGASTO_DB.prepare(
            'SELECT id, name, email, avatar_url FROM users WHERE LOWER(email) = ?'
        ).bind(normalizedSearchEmail).first();
        if (!user) return jsonResponse({ success: false, error: 'Usuario no encontrado' }, 404);
        return jsonResponse({ success: true, user });
    }

    if (path.startsWith('/api/db/expenses/') && method === 'DELETE') {
        const expenseId = path.replace('/api/db/expenses/', '');
        if (!expenseId) return jsonResponse({ error: 'ID de gasto requerido' }, 400);

        const expense = await env.SPLITGASTO_DB.prepare(
            'SELECT id, group_id, paid_by FROM expenses WHERE id = ?'
        ).bind(expenseId).first();

        if (!expense) return jsonResponse({ error: 'Gasto no encontrado' }, 404);

        const membership = await env.SPLITGASTO_DB.prepare(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
        ).bind(expense.group_id, authUser.userId).first();

        if (!membership) return jsonResponse({ error: 'No tienes acceso a este gasto' }, 403);

        const canDelete = expense.paid_by === authUser.userId || membership.role === 'admin';
        if (!canDelete) return jsonResponse({ error: 'Solo el pagador o un admin puede eliminar este gasto' }, 403);

        await env.SPLITGASTO_DB.prepare('DELETE FROM expenses WHERE id = ?').bind(expenseId).run();

        if (env.SPLITGASTO_CACHE) {
            await env.SPLITGASTO_CACHE.delete(`db:expenses:${expense.group_id}`);
            await env.SPLITGASTO_CACHE.delete(`db:balances:${expense.group_id}`);
            await env.SPLITGASTO_CACHE.delete(`db:groups:${authUser.userId}`);
        }

        return jsonResponse({ success: true, message: 'Gasto eliminado' });
    }

    if (path.startsWith('/api/db/groups/') && method === 'DELETE') {
        const groupId = path.replace('/api/db/groups/', '');
        if (!groupId) return jsonResponse({ error: 'ID de grupo requerido' }, 400);

        if (env.SPLITGASTO_CACHE) {
            try { await env.SPLITGASTO_CACHE.delete(`db:groups:${authUser.userId}`); } catch {}
        }

        let membership = await env.SPLITGASTO_DB.prepare(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
        ).bind(groupId, authUser.userId).first();

        if (!membership) {
            const group = await env.SPLITGASTO_DB.prepare(
                'SELECT id, created_by FROM groups WHERE id = ?'
            ).bind(groupId).first();
            if (group && group.created_by === authUser.userId) {
                await env.SPLITGASTO_DB.prepare(
                    'INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)'
                ).bind(groupId, authUser.userId, 'admin').run();
                membership = { role: 'admin' };
            } else if (!group) {
                return jsonResponse({ success: true, message: 'Grupo ya eliminado' });
            }
        }

        if (!membership) return jsonResponse({ error: 'No perteneces a este grupo' }, 403);
        if (membership.role !== 'admin') return jsonResponse({ error: 'Solo el admin puede eliminar el grupo' }, 403);

        const membersForCache = await env.SPLITGASTO_DB.prepare(
            'SELECT user_id FROM group_members WHERE group_id = ?'
        ).bind(groupId).all();

        await env.SPLITGASTO_DB.prepare('DELETE FROM expenses WHERE group_id = ?').bind(groupId).run();
        await env.SPLITGASTO_DB.prepare('DELETE FROM settlements WHERE group_id = ?').bind(groupId).run();
        await env.SPLITGASTO_DB.prepare('DELETE FROM group_members WHERE group_id = ?').bind(groupId).run();
        await env.SPLITGASTO_DB.prepare('DELETE FROM groups WHERE id = ?').bind(groupId).run();

        if (env.SPLITGASTO_CACHE) {
            await env.SPLITGASTO_CACHE.delete(`db:balances:${groupId}`);
            await env.SPLITGASTO_CACHE.delete(`db:expenses:${groupId}`);
            for (const m of (membersForCache.results || [])) {
                await env.SPLITGASTO_CACHE.delete(`db:groups:${m.user_id}`);
            }
        }

        return jsonResponse({ success: true, message: 'Grupo eliminado' });
    }

    if (path.startsWith('/api/db/group-members/') && method === 'DELETE') {
        const parts = path.replace('/api/db/group-members/', '').split('/');
        const groupId = parts[0];
        const memberUserId = parts[1];
        if (!groupId || !memberUserId) return jsonResponse({ error: 'groupId y userId requeridos en la ruta' }, 400);

        if (env.SPLITGASTO_CACHE) {
            try { await env.SPLITGASTO_CACHE.delete(`db:groups:${authUser.userId}`); } catch {}
        }

        let membership = await env.SPLITGASTO_DB.prepare(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
        ).bind(groupId, authUser.userId).first();

        if (!membership) {
            const grpCheck = await env.SPLITGASTO_DB.prepare(
                'SELECT id, created_by FROM groups WHERE id = ?'
            ).bind(groupId).first();
            if (grpCheck && grpCheck.created_by === authUser.userId) {
                await env.SPLITGASTO_DB.prepare(
                    'INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)'
                ).bind(groupId, authUser.userId, 'admin').run();
                membership = { role: 'admin' };
            }
        }

        if (!membership) return jsonResponse({ error: 'No perteneces a este grupo' }, 403);

        if (membership.role !== 'admin' && memberUserId !== authUser.userId) {
            return jsonResponse({ error: 'Solo el admin puede eliminar otros miembros' }, 403);
        }

        if (memberUserId === authUser.userId && membership.role === 'admin') {
            const adminCount = await env.SPLITGASTO_DB.prepare(
                "SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ? AND role = 'admin'"
            ).bind(groupId).first();
            if (adminCount && adminCount.cnt <= 1) {
                return jsonResponse({ error: 'No puedes abandonar el grupo siendo el único admin. Elimina el grupo o asigna otro admin primero.' }, 400);
            }
        }

        await env.SPLITGASTO_DB.prepare(
            'DELETE FROM group_members WHERE group_id = ? AND user_id = ?'
        ).bind(groupId, memberUserId).run();

        if (env.SPLITGASTO_CACHE) {
            await env.SPLITGASTO_CACHE.delete(`db:groups:${memberUserId}`);
            await env.SPLITGASTO_CACHE.delete(`db:groups:${authUser.userId}`);
            await env.SPLITGASTO_CACHE.delete(`db:balances:${groupId}`);
        }

        return jsonResponse({ success: true, message: 'Miembro eliminado del grupo' });
    }

    if (path === '/api/db/repair-memberships' && method === 'POST') {
        const userId = authUser.userId;
        const orphanGroups = await env.SPLITGASTO_DB.prepare(
            `SELECT g.id, g.name FROM groups g
             WHERE g.created_by = ?
             AND NOT EXISTS (
                 SELECT 1 FROM group_members gm
                 WHERE gm.group_id = g.id AND gm.user_id = ?
             )`
        ).bind(userId, userId).all();
        let repaired = 0;
        for (const g of (orphanGroups.results || [])) {
            try {
                await env.SPLITGASTO_DB.prepare(
                    'INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)'
                ).bind(g.id, userId, 'admin').run();
                repaired++;
                if (env.SPLITGASTO_CACHE) {
                    try { await env.SPLITGASTO_CACHE.delete(`db:groups:${userId}`); } catch {}
                    try { await env.SPLITGASTO_CACHE.delete(`db:balances:${g.id}`); } catch {}
                }
            } catch {}
        }
        return jsonResponse({
            success: true,
            orphansFound: orphanGroups.results?.length || 0,
            repaired,
            message: repaired > 0 ? `Se repararon ${repaired} grupo(s) huérfano(s)` : 'No se encontraron grupos huérfanos'
        });
    }

    if (path === '/api/db/purge-cache' && method === 'POST') {
        const userId = authUser.userId;
        const userGroups = await env.SPLITGASTO_DB.prepare(
            'SELECT g.id FROM groups g JOIN group_members gm ON g.id = gm.group_id WHERE gm.user_id = ?'
        ).bind(userId).all();
        if (env.SPLITGASTO_CACHE) {
            try { await env.SPLITGASTO_CACHE.delete(`db:groups:${userId}`); } catch {}
            try { await env.SPLITGASTO_CACHE.delete(`db:profile:${userId}`); } catch {}
            for (const g of (userGroups.results || [])) {
                try { await env.SPLITGASTO_CACHE.delete(`db:balances:${g.id}`); } catch {}
                try { await env.SPLITGASTO_CACHE.delete(`db:expenses:${g.id}`); } catch {}
            }
        }
        return jsonResponse({ success: true, message: 'Cache purgada correctamente' });
    }

    if (path === '/api/db/notifications/read' && method === 'POST') {
        const userId = authUser.userId;
        try {
            await env.SPLITGASTO_DB.prepare(
                "UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0"
            ).bind(userId).run();
        } catch {}
        return jsonResponse({ success: true, message: 'Notificaciones marcadas como leídas' });
    }

    return jsonResponse({ error: 'Ruta de base de datos no encontrada', path }, 404);
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════
const ALLOWED_ORIGINS = [
    'https://splitgasto.com',
    'https://www.splitgasto.com',
    'https://https-splitgasto-2026.reciborapido777.workers.dev',
    'https://splitgasto-2026.pages.dev',
];

function getOrigin(request) {
    const origin = request.headers.get('Origin') || '';
    if (ALLOWED_ORIGINS.includes(origin)) return origin;
    if (origin.match(/^https:\/\/[a-z0-9-]+\.reciborapido777\.workers\.dev$/)) return origin;
    if (origin.match(/^https:\/\/[a-z0-9-]+\.splitgasto-2026\.pages\.dev$/)) return origin;
    if (origin.match(/^http:\/\/localhost:\d+$/)) return origin;
    return null;
}

function jsonResponse(data, status = 200, request = null) {
    const origin = request ? getOrigin(request) : null;
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
    };
    if (origin) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Vary'] = 'Origin';
    }
    return new Response(JSON.stringify(data, null, 2), { status, headers });
}

function corsResponse(request) {
    const origin = getOrigin(request);
    if (!origin) {
        return new Response('CORS: Origin not allowed', { status: 403 });
    }
    return new Response(null, {
        status: 204,
        headers: {
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
        },
    });
}

function setSecurityHeaders(headers) {
    headers.set('X-Frame-Options', 'SAMEORIGIN');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    headers.set('Permissions-Policy', 'camera=(self), microphone=(), geolocation=(self)');
    headers.set('Content-Security-Policy',
        "default-src 'self'; " +
        "script-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; " +
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://fonts.gstatic.com; " +
        "font-src 'self' https://fonts.gstatic.com; " +
        "img-src 'self' data: blob: https:; " +
        "connect-src 'self' https://splitgasto.com https://*.splitgasto-2026.pages.dev https://*.reciborapido777.workers.dev; " +
        "frame-ancestors 'none';"
    );
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    const ct = headers.get('Content-Type') || '';
    if (ct.includes('text/html')) {
        headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
}
