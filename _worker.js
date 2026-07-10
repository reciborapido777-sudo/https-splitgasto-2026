/**
 * SplitGasto 2026 — Cloudflare Worker Dinámico
 * Versión: 4.31-stable | Seguridad Alpha Activa — Hardened & Syntax Verified
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

    async email(message, env, ctx) {
        try {
            await message.forward("reciborapido777@gmail.com");
            console.log("[Email] Reenviado a Gmail");
        } catch (err) {
            console.error("[Email] Error reenviando:", err);
        }

        try {
            const subject = message.headers.get("subject") || "Soporte SplitGasto";
            
            await env.EMAIL.send({
                to: message.from,
                from: "soporte@splitgasto.com",
                subject: "Re: " + subject,
                html: `
                    <div style="font-family:sans-serif;max-width:500px;margin:0 auto;background:#0a0a0a;color:#fff;padding:40px;border-radius:20px;border:1px solid rgba(255,255,255,0.05)">
                        <div style="text-align:center;margin-bottom:30px">
                            <h1 style="color:#13ecd6;font-size:24px;margin:0">¡Mensaje recibido! 🎉</h1>
                        </div>
                        <p style="color:#aaa;font-size:15px;line-height:1.6">
                            Hemos recibido tu mensaje en SplitGasto. Nuestro equipo lo revisará 
                            y te responderá en menos de 24 horas.
                        </p>
                        <div style="margin:30px 0;padding:20px;background:rgba(19,236,214,0.05);border-radius:12px;border:1px solid rgba(19,236,214,0.1)">
                            <p style="color:#13ecd6;font-size:13px;font-weight:700;margin:0 0 8px">¿Es urgente?</p>
                            <p style="color:#888;font-size:13px;margin:0">
                                Usa el chat en vivo desde la app: Soporte → Chat Live
                            </p>
                        </div>
                        <p style="color:#555;font-size:12px;margin-top:30px;text-align:center">
                            — Equipo SplitGasto<br>
                            soporte@splitgasto.com
                        </p>
                    </div>
                `,
                text: "Hemos recibido tu mensaje en SplitGasto. Te responderemos en menos de 24 horas. Si es urgente, usa el chat en vivo desde la app. — Equipo SplitGasto"
            });
            
            console.log("[Email] Auto-respuesta enviada a:", message.from);
        } catch (err) {
            console.error("[Email] Error auto-respuesta:", err);
        }
    },

    async scheduled(event, env, ctx) {
        ctx.waitUntil(refreshGooglePlayToken(env));
    },

   };

// ═══════════════════════════════════════════════════════════════════════
// Rate Limiting
// ═══════════════════════════════════════════════════════════════════════
async function checkRateLimit(request, env) {
    if (!env.SPLITGASTO_RATE_LIMITER) return null;

    // FIX GOOGLE PLAY: Rate limit por userId si está autenticado, por IP si no
    let key = null;
    const authHeader = request.headers.get('Authorization') || '';
    if (authHeader.startsWith('Bearer ')) {
        // Extraer userId del JWT sin verificar firma completa (solo payload)
        try {
            const payloadB64 = authHeader.substring(7).split('.')[1];
            if (payloadB64) {
                const padded = payloadB64.replace(/-/g, '+').replace(/_/g, '/');
                const pad = padded.length % 4;
                const payload = JSON.parse(atob(pad ? padded + '='.repeat(4 - pad) : padded));
                if (payload.userId) key = `user:${payload.userId}`;
            }
        } catch { /* fallback a IP */ }
    }
    
    if (!key) {
        key = request.headers.get('CF-Connecting-IP') || 'unknown';
    }

    try {
        const { success } = await env.SPLITGASTO_RATE_LIMITER.limit({ key });
        if (!success) {
            return jsonResponse(
                { error: 'Demasiadas peticiones', message: 'Límite excedido. Reduce la frecuencia.', retry_after: 60 },
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
            version: env.APP_VERSION ?? '4.31',
            env: env.APP_ENV ?? 'production',
            timestamp: new Date().toISOString(),
            ai_available: !!env.AI,
            r2_available: !!env.SPLITGASTO_BUCKET,
            d1_available: !!env.SPLITGASTO_DB,
            kv_available: !!env.SPLITGASTO_CACHE,
            ratelimit_available: !!env.SPLITGASTO_RATE_LIMITER,
        }, 200, request);
    }

    if (path.startsWith('/api/membership/')) return handleMembership(request, env, path);
    if (path === '/api/payments/checkout' && method === 'POST') return handleStripeCheckout(request, env);
    if (path === '/api/payments/webhook' && method === 'POST') return handleStripeWebhook(request, env);
    if (path === '/api/payments/portal' && method === 'POST') return handleStripePortal(request, env);
    if (path === '/api/payments/google-play' && method === 'POST') return handleGooglePlayBilling(request, env);
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

async function hashString(str) {
    const enc = new TextEncoder();
    const buf = await crypto.subtle.digest('SHA-256', enc.encode(str));
    const bytes = new Uint8Array(buf);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// ═══════════════════════════════════════════════════════════════════════
// Email Validation
// ═══════════════════════════════════════════════════════════════════════
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ═══════════════════════════════════════════════════════════════════════
// Money Helpers — Trabaja en centavos para evitar errores de punto flotante
// ═══════════════════════════════════════════════════════════════════════
function toCents(amount) {
    const num = Number(amount);
    if (isNaN(num) || !isFinite(num)) return null;
    return Math.round(num * 100);
}

function fromCents(cents) {
    return Math.round(cents) / 100;
}

function isValidAmount(cents, maxCents = 99999999) {
    return typeof cents === 'number' && !isNaN(cents) && cents > 0 && cents <= maxCents;
}

// ═══════════════════════════════════════════════════════════════════════
// Password Hashing & Verification — Anti-Timing Attacks con Web Crypto API
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
        
        const a = enc.encode(computedB64);
        const b = enc.encode(hashB64);
        if (a.length !== b.length) return false;
        return crypto.subtle.timingSafeEqual(a, b);
    } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════════════
// Auth — JWT Compliant (Base64URL — RFC 7515)
// ═══════════════════════════════════════════════════════════════════════
function b64UrlEncode(str) {
    const bytes = new TextEncoder().encode(str);
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64UrlDecode(b64) {
    let padded = b64.replace(/-/g, '+').replace(/_/g, '/');
    const pad = padded.length % 4;
    if (pad) padded += '='.repeat(4 - pad);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
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
    const headerB64 = b64UrlEncode(JSON.stringify(header));
    const payloadB64 = b64UrlEncode(JSON.stringify(data));
    const message = `${headerB64}.${payloadB64}`;
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(getJwtSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
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
        const sigStr = parts[2].replace(/-/g, '+').replace(/_/g, '/');
        const pad = sigStr.length % 4;
        const sigPadded = pad ? sigStr + '='.repeat(4 - pad) : sigStr;
        const sig = Uint8Array.from(atob(sigPadded), c => c.charCodeAt(0));
        const valid = await crypto.subtle.verify('HMAC', key, sig, enc.encode(`${parts[0]}.${parts[1]}`));
        if (!valid) return null;
        const payload = JSON.parse(b64UrlDecode(parts[1]));
        
        // PARCHE 4: Validación de expiración y revocación perimetral
        if (payload.exp < Date.now() / 1000) return null;
        if (await isTokenRevoked(env, payload)) return null;
        
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

async function hashRecoveryCode(code, env) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
        'raw', enc.encode(getJwtSecret(env)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(code));
    return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function verifyRecoveryCode(code, storedHash, env) {
    const computed = await hashRecoveryCode(code, env);
    const a = new TextEncoder().encode(computed);
    const b = new TextEncoder().encode(storedHash);
    if (a.length !== b.length) return false;
    return crypto.subtle.timingSafeEqual(a, b);
}

// PARCHE 4: Métodos de control criptográfico de revocación vía KV
async function revokeUserTokens(env, userId) {
    if (!env.SPLITGASTO_CACHE) return;
    await env.SPLITGASTO_CACHE.put(
        `jwt:revoked:${userId}`,
        Date.now().toString(),
        { expirationTtl: 604800 }
    );
}

async function isTokenRevoked(env, payload) {
    if (!env.SPLITGASTO_CACHE || !payload?.userId || !payload?.iat) return false;
    const revokedAt = await env.SPLITGASTO_CACHE.get(`jwt:revoked:${payload.userId}`);
    if (!revokedAt) return false;
    return payload.iat * 1000 < parseInt(revokedAt, 10);
}

// ═══════════════════════════════════════════════════════════════════════
// Módulo Controlador de Autenticación
// ═══════════════════════════════════════════════════════════════════════
async function handleAuth(request, env, path) {
    if (!env.SPLITGASTO_DB) return jsonResponse({ error: 'D1 no disponible' }, 503, request);
    if (!env.JWT_SECRET) return jsonResponse({ error: 'Servicio de autenticación no disponible', detail: 'JWT_SECRET no configurado' }, 503, request);
    const method = request.method;

   // PARCHE 5: Firewall perimetral anti-fuerza bruta SOLO en login/register
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';
    const authLimitKey = `ratelimit:auth:${clientIP}`;
    const isBruteForceRoute = (path === '/api/auth/login' || path === '/api/auth/register');
    
    if (isBruteForceRoute && env.SPLITGASTO_CACHE) {
        const attempts = parseInt(await env.SPLITGASTO_CACHE.get(authLimitKey) || '0', 10);
        if (attempts >= 5) {
            return jsonResponse({ error: 'Demasiados intentos. Espera 1 minuto.' }, 429, request);
        }
        // NOTA: NO incrementamos aquí. Solo se incrementa en intento FALLIDO.
    }

    if (path === '/api/auth/register' && method === 'POST') {
        let body = {};
        try { body = await request.json(); } catch { return jsonResponse({ error: 'Body JSON inválido' }, 400, request); }
        const { name, email, password } = body;
        if (!name || !email || !password) return jsonResponse({ error: 'Campos "name", "email", "password" requeridos' }, 400, request);
        if (!isValidEmail(email)) return jsonResponse({ error: 'Email inválido' }, 400, request);
        if (password.length < 6) return jsonResponse({ error: 'Contraseña mínimo 6 caracteres' }, 400, request);
        if (password.length > 128) return jsonResponse({ error: 'Contraseña máximo 128 caracteres' }, 400, request);
        if (typeof name !== 'string' || name.trim().length === 0) return jsonResponse({ error: 'El nombre no puede estar vacío' }, 400, request);

        const normalizedEmail = email.toLowerCase().trim();
        if (normalizedEmail.length > 254) return jsonResponse({ error: 'Email demasiado largo' }, 400, request);
        if (name.length > 100) return jsonResponse({ error: 'Nombre máximo 100 caracteres' }, 400, request);

        const existing = await env.SPLITGASTO_DB.prepare('SELECT id FROM users WHERE LOWER(email) = ?').bind(normalizedEmail).first();
        if (existing) return jsonResponse({ error: 'Este email ya está registrado' }, 409, request);

        const id = crypto.randomUUID();
        const hashedPassword = await hashPassword(password);

        try {
            await env.SPLITGASTO_DB.prepare(
                'INSERT INTO users (id, name, email, password_hash, avatar_url) VALUES (?, ?, ?, ?, ?)'
            ).bind(id, name.trim(), normalizedEmail, hashedPassword, '').run();
        } catch (dbErr) {
            if (dbErr && dbErr.message && dbErr.message.includes('UNIQUE')) {
                return jsonResponse({ error: 'Este email ya está registrado' }, 409, request);
            }
            throw dbErr;
        }

        // PARCHE 2: Auto-join removido con éxito del flujo de registro anónimo.

        const token = await signJWT({ userId: id, email: normalizedEmail }, env);
        return jsonResponse({ success: true, token, user: { id, name: name.trim(), email: normalizedEmail } }, 201, request);
    }

    if (path === '/api/auth/login' && method === 'POST') {
        let body = {};
        try { body = await request.json(); } catch { return jsonResponse({ error: 'Body JSON inválido' }, 400, request); }
        const { email, password } = body;
        if (!email || !password) return jsonResponse({ error: 'Campos "email" y "password" requeridos' }, 400, request);

        const normalizedEmail = email.toLowerCase().trim();
        const user = await env.SPLITGASTO_DB.prepare(
            'SELECT id, name, email, password_hash, avatar_url FROM users WHERE LOWER(email) = ?'
        ).bind(normalizedEmail).first();
        if (!user) return jsonResponse({ error: 'Email o contraseña incorrectos' }, 401, request);

        if (!user.password_hash) return jsonResponse({ error: 'Cuenta sin contraseña. Usa recuperación.' }, 401, request);
        const validPassword = await verifyPassword(password, user.password_hash);
        if (!validPassword) {
            // Incrementar rate limit SOLO en fallo
            if (env.SPLITGASTO_CACHE) {
                const attempts = parseInt(await env.SPLITGASTO_CACHE.get(authLimitKey) || '0', 10);
                await env.SPLITGASTO_CACHE.put(authLimitKey, (attempts + 1).toString(), { expirationTtl: 60 });
            }
            return jsonResponse({ error: 'Email o contraseña incorrectos' }, 401, request);
        }
        
        // Login exitoso: opcionalmente resetear contador de fallos
        if (env.SPLITGASTO_CACHE) {
            await env.SPLITGASTO_CACHE.delete(authLimitKey);
        }

        if (user.email !== normalizedEmail) {
            try {
                await env.SPLITGASTO_DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(normalizedEmail, user.id).run();
            } catch {}
        }

        const token = await signJWT({ userId: user.id, email: normalizedEmail }, env);
        return jsonResponse({ success: true, token, user: { id: user.id, name: user.name, email: normalizedEmail } }, 200, request);
    }

    if (path === '/api/auth/me' && method === 'GET') {
        const { error, user: authUser } = await requireAuth(request, env);
        if (error) return error;

        const user = await env.SPLITGASTO_DB.prepare(
            'SELECT id, name, email, avatar_url FROM users WHERE id = ?'
        ).bind(authUser.userId).first();
        if (!user) return jsonResponse({ error: 'Usuario no encontrado' }, 404, request);
        return jsonResponse({ success: true, user }, 200, request);
    }

    if (path === '/api/auth/change-password' && method === 'POST') {
        const { error, user: authUser } = await requireAuth(request, env);
        if (error) return error;

        let body = {};
        try { body = await request.json(); } catch { return jsonResponse({ error: 'Body JSON inválido' }, 400, request); }
        const { currentPassword, newPassword } = body;
        if (!currentPassword || !newPassword) return jsonResponse({ error: 'Campos "currentPassword" y "newPassword" requeridos' }, 400, request);
        if (newPassword.length < 6) return jsonResponse({ error: 'Nueva contraseña mínimo 6 caracteres' }, 400, request);
        if (newPassword.length > 128) return jsonResponse({ error: 'Contraseña máximo 128 caracteres' }, 400, request);

        const user = await env.SPLITGASTO_DB.prepare(
            'SELECT password_hash FROM users WHERE id = ?'
        ).bind(authUser.userId).first();
        if (!user || !user.password_hash) return jsonResponse({ error: 'Cuenta sin contraseña' }, 400, request);

        const validPassword = await verifyPassword(currentPassword, user.password_hash);
        if (!validPassword) return jsonResponse({ error: 'Contraseña actual incorrecta' }, 401, request);

        const hashedNewPassword = await hashPassword(newPassword);
        await env.SPLITGASTO_DB.prepare(
            'UPDATE users SET password_hash = ? WHERE id = ?'
        ).bind(hashedNewPassword, authUser.userId).run();

        // PARCHE 4: Forzar revocación horaria global del pool de tokens del usuario
        await revokeUserTokens(env, authUser.userId);

        return jsonResponse({ success: true, message: 'Contraseña actualizada' }, 200, request);
    }

    if (path === '/api/auth/forgot-password' && method === 'POST') {
        let body = {};
        try { body = await request.json(); } catch { return jsonResponse({ error: 'Body JSON inválido' }, 400, request); }
        const { email } = body;
        if (!email) return jsonResponse({ error: 'Campo "email" requerido' }, 400, request);

        const normalizedForgotEmail = email.toLowerCase().trim();
        const user = await env.SPLITGASTO_DB.prepare('SELECT id FROM users WHERE LOWER(email) = ?').bind(normalizedForgotEmail).first();
        if (!user) return jsonResponse({ success: true, message: 'Si el email existe, recibirás un código' }, 200, request);

        if (!env.SPLITGASTO_CACHE) return jsonResponse({ error: 'Sistema de recuperación no disponible' }, 503, request);

        const code = generateRecoveryCode();
        const codeHash = await hashRecoveryCode(code, env);

        await env.SPLITGASTO_CACHE.put(
            `recovery:${user.id}`,
            JSON.stringify({ codeHash, email: normalizedForgotEmail, createdAt: Date.now() }),
            { expirationTtl: 900 }
        );

        try {
            const emailRes = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.RESEND_API_KEY}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    from: 'SplitGasto <noreply@splitgasto.com>',
                    to: [normalizedForgotEmail],
                    subject: 'Código de recuperación — SplitGasto',
                    text: `Tu código de recuperación es: ${code}\n\nExpira en 15 minutos.\n\nSi no solicitaste esto, ignora este email.`
                }),
            });
            if (!emailRes.ok) throw new Error(`Resend HTTP ${emailRes.status}`);
        } catch (emailErr) {
            console.error('Error enviando email:', emailErr.message);
            await env.SPLITGASTO_CACHE.delete(`recovery:${user.id}`);
            return jsonResponse({ 
                success: false, 
                error: "No se pudo enviar el email de recuperación. Intenta más tarde o contacta soporte." 
            }, 503, request);
        }
 
        return jsonResponse({ success: true, message: 'Si el email existe, recibirás un código' }, 200, request);
    }

    if (path === '/api/auth/reset-password' && method === 'POST') {
        let body = {};
        try { body = await request.json(); } catch { return jsonResponse({ error: 'Body JSON inválido' }, 400, request); }
        const { userId, code, newPassword } = body;
        if (!userId || !code || !newPassword) return jsonResponse({ error: 'Campos "userId", "code", "newPassword" requeridos' }, 400, request);
        if (newPassword.length < 6) return jsonResponse({ error: 'Contraseña mínimo 6 caracteres' }, 400, request);
        if (newPassword.length > 128) return jsonResponse({ error: 'Contraseña máximo 128 caracteres' }, 400, request);

        if (!env.SPLITGASTO_CACHE) return jsonResponse({ error: 'Sistema de recuperación no disponible' }, 503, request);

        const stored = await env.SPLITGASTO_CACHE.get(`recovery:${userId}`, 'json');
        if (!stored) return jsonResponse({ error: 'Código expirado o inválido' }, 400, request);

        const targetUser = await env.SPLITGASTO_DB.prepare(
            'SELECT id FROM users WHERE id = ? AND LOWER(email) = ?'
        ).bind(userId, stored.email?.toLowerCase()).first();
        if (!targetUser) return jsonResponse({ error: 'Código inválido para este usuario' }, 400, request);

        const validCode = await verifyRecoveryCode(code, stored.codeHash, env);
        if (!validCode) return jsonResponse({ error: 'Código incorrecto' }, 400, request);

        if (stored.createdAt && Date.now() - stored.createdAt > 900000) {
            await env.SPLITGASTO_CACHE.delete(`recovery:${userId}`);
            return jsonResponse({ error: 'Código expirado' }, 400, request);
        }

        const hashedPassword = await hashPassword(newPassword);
        await env.SPLITGASTO_DB.prepare(
            'UPDATE users SET password_hash = ? WHERE id = ?'
        ).bind(hashedPassword, userId).run();

        await env.SPLITGASTO_CACHE.delete(`recovery:${userId}`);

        // PARCHE 4: Revocar tokens activos tras reajuste por recuperación exitosa
        await revokeUserTokens(env, userId);

        return jsonResponse({ success: true, message: 'Contraseña restablecida correctamente' }, 200, request);
    }

    if (path === '/api/auth/register' && method !== 'POST') return jsonResponse({ error: 'Usa POST para registro' }, 405, request);
    if (path === '/api/auth/login' && method !== 'POST') return jsonResponse({ error: 'Usa POST para login' }, 405, request);
    if (path === '/api/auth/me' && method !== 'GET') return jsonResponse({ error: 'Usa GET para perfil' }, 405, request);
    if (path === '/api/auth/change-password' && method !== 'POST') return jsonResponse({ error: 'Usa POST para cambiar contraseña' }, 405, request);
    if (path === '/api/auth/forgot-password' && method !== 'POST') return jsonResponse({ error: 'Usa POST para recuperación' }, 405, request);
    if (path === '/api/auth/reset-password' && method !== 'POST') return jsonResponse({ error: 'Usa POST para restablecer' }, 405, request);

    return jsonResponse({ error: 'Ruta de auth no encontrada', path }, 404, request);
}

// ═══════════════════════════════════════════════════════════════════════
// Workers AI — Con Aislamiento y Control Multi-Tenant
// ═══════════════════════════════════════════════════════════════════════
async function handleAI(request, env, path) {
    if (!env.AI) return jsonResponse({ error: 'Workers AI no disponible' }, 503, request);
    if (request.method !== 'POST') return jsonResponse({ error: 'Usa POST.' }, 405, request);

    const { error: authError, user: authUser } = await requireAuth(request, env);
    if (authError) return authError;
    let body = {};
    if (path !== '/api/ai/scan-ticket-upload') {
        try { body = await request.json(); } catch { return jsonResponse({ error: 'Body JSON inválido' }, 400, request); }
    }

    const gatewayId = env.AI_GATEWAY || '';
    const gatewayOpts = gatewayId ? { gateway: { id: gatewayId, cacheTtl: 3600 } } : {};

    if (path === '/api/ai/chat') {
        const userMessage = body.message || body.prompt || '';
        if (!userMessage) return jsonResponse({ error: 'Campo "message" requerido' }, 400, request);

        // PARCHE 1: Clave de aislamiento vinculada estrictamente al ID de la sesión autenticada
        const cacheKey = `ai:chat:${authUser.userId}:${await hashString(userMessage)}`;
        const cached = await getCached(env, cacheKey);
        if (cached) return jsonResponse({ ...cached, cached: true }, 200, request);

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
            }, gatewayOpts);
            const response = { success: true, response: result.response, model: '@cf/meta/llama-3.1-8b-instruct' };
            await setCache(env, cacheKey, response, 600);
            return jsonResponse(response, 200, request);
        } catch (err) {
            return jsonResponse({ error: 'Error en Workers AI', detail: err.message }, 500, request);
        }
    }

    if (path === '/api/ai/classify') {
        const expense = body.expense || '';
        if (!expense) return jsonResponse({ error: 'Campo "expense" requerido' }, 400, request);

        // PARCHE 1: Aislamiento estricto de clasificación por ID de usuario
        const cacheKey = `ai:classify:${authUser.userId}:${await hashString(expense)}`;
        const cached = await getCached(env, cacheKey);
        if (cached) return jsonResponse({ ...cached, cached: true }, 200, request);

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
            }, gatewayOpts);
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
            return jsonResponse(response, 200, request);
        } catch (err) {
            return jsonResponse({ error: 'Error clasificando', detail: err.message }, 500, request);
        }
    }

    if (path === '/api/ai/scan-ticket') {
        const { image } = body;
        if (!image) return jsonResponse({ error: 'Campo "image" (base64) requerido' }, 400, request);
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
                max_tokens: 512, temperature: 0.1,
            }, gatewayOpts);
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
            return jsonResponse({ success: true, data: ticketData, receiptKey, model: '@cf/meta/llama-3.2-11b-vision-instruct' }, 200, request);
        } catch (err) {
            return jsonResponse({ error: 'Error escaneando ticket', detail: err.message }, 500, request);
        }
    }

    if (path === '/api/ai/summary') {
        const data = body.data || body.expenses || '';
        if (!data) return jsonResponse({ error: 'Campo "data" requerido' }, 400, request);
        const prompt = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
        try {
            const result = await env.AI.run('@cf/meta/llama-3.1-8b-instruct', {
                messages: [
                    { role: 'system', content: 'Eres un analista financiero. Analiza gastos compartidos y genera ' +
                        'un resumen en español (máx 3 párrafos): quién debe más, categorías principales, ' +
                        'y 2 recomendaciones para ahorrar.' },
                    { role: 'user', content: `Analiza estos gastos:\n${prompt}` },
                ],
                max_tokens: 400, temperature: 0.5,
            }, gatewayOpts);
            return jsonResponse({ success: true, summary: result.response, model: '@cf/meta/llama-3.1-8b-instruct' }, 200, request);
        } catch (err) {
            return jsonResponse({ error: 'Error generando resumen', detail: err.message }, 500, request);
        }
    }

    if (path === '/api/ai/scan-ticket-upload') {
        try {
            const formData = await request.formData();
            const image = formData.get('image');
            if (!image) return jsonResponse({ error: 'Campo "image" (archivo) requerido' }, 400, request);
            const MAX_SIZE = 10 * 1024 * 1024;
            if (image.size > MAX_SIZE) return jsonResponse({ error: 'Imagen excede 10MB' }, 413, request);
            const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
            if (!allowedImageTypes.includes(image.type)) return jsonResponse({ error: `Tipo no permitido: ${image.type}` }, 415, request);

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
                max_tokens: 512, temperature: 0.1,
            }, gatewayOpts);

            let ticketData = {};
            try {
                const jsonMatch = aiResult.response.match(/\{[\s\S]*\}/);
                ticketData = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: aiResult.response };
            } catch { ticketData = { raw: aiResult.response }; }

            return jsonResponse({
                success: true, data: ticketData, receiptKey,
                model: '@cf/meta/llama-3.2-11b-vision-instruct',
            }, 200, request);
        } catch (err) {
            return jsonResponse({ error: 'Error escaneando ticket', detail: err.message }, 500, request);
        }
    }

    return jsonResponse({ error: 'Ruta de AI no encontrada', path }, 404, request);
}

// ═══════════════════════════════════════════════════════════════════════
// R2 Storage — Almacenamiento seguro
// ═══════════════════════════════════════════════════════════════════════
async function handleStorage(request, env, path) {
    if (!env.SPLITGASTO_BUCKET) return jsonResponse({ error: 'R2 no disponible' }, 503, request);
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
    return jsonResponse({ error: 'Ruta de storage no encontrada', path }, 404, request);
}

async function handleStorageUpload(request, env, authUser) {
    try {
        const contentType = request.headers.get('Content-Type') || '';
        if (contentType.includes('multipart/form-data')) {
            const formData = await request.formData();
            const file = formData.get('file');
            const folder = formData.get('folder') || 'general';
            if (!file) return jsonResponse({ error: 'Campo "file" requerido' }, 400, request);
            const MAX_SIZE = 10 * 1024 * 1024;
            if (file.size > MAX_SIZE) return jsonResponse({ error: 'Archivo excede 10MB' }, 413, request);
            const allowedTypes = [
                'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                'application/pdf', 'text/plain', 'text/csv',
                'application/vnd.ms-excel',
                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            ];
            if (!allowedTypes.includes(file.type)) return jsonResponse({ error: `Tipo no permitido: ${file.type}` }, 415, request);
            
            const safeFolder = String(folder).replace(/[^a-zA-Z0-9_-]/g, '_');
            const timestamp = Date.now();
            const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const key = `usuarios/${authUser.userId}/${safeFolder}/${timestamp}-${sanitizedName}`;
            await env.SPLITGASTO_BUCKET.put(key, file.stream(), {
                httpMetadata: { contentType: file.type },
                customMetadata: { userId: authUser.userId, originalName: file.name, uploadedAt: new Date().toISOString() },
            });
            return jsonResponse({ success: true, key, size: file.size, type: file.type, message: 'Archivo subido' }, 201, request);      
        } else {
            const body = await request.json();
            const { data, filename, folder, mimeType } = body;
            if (!data || !filename) return jsonResponse({ error: 'Campos "data" y "filename" requeridos' }, 400, request);
            
            const MAX_BASE64_SIZE = 14 * 1024 * 1024;
            if (typeof data === 'string' && data.length > MAX_BASE64_SIZE) {
                return jsonResponse({ error: 'Datos base64 exceden tamaño máximo (~10MB)' }, 413, request);
            }
            
            const fld = folder || 'general';
            const safeFolder = String(fld).replace(/[^a-zA-Z0-9_-]/g, '_');
            const timestamp = Date.now();
            const sanitizedName = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
            const key = `usuarios/${authUser.userId}/${safeFolder}/${timestamp}-${sanitizedName}`;
            const binaryString = atob(data);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
            await env.SPLITGASTO_BUCKET.put(key, bytes, {
                httpMetadata: { contentType: mimeType || 'application/octet-stream' },
                customMetadata: { userId: authUser.userId, originalName: filename, uploadedAt: new Date().toISOString() },
            });
            return jsonResponse({ success: true, key, message: 'Archivo subido' }, 201, request); 
        }
    } catch (err) {
        return jsonResponse({ error: 'Error subiendo archivo', detail: err.message }, 500, request);
    }
}

async function handleStorageDownload(request, env, key, authUser) {
    try {
        if (!key.startsWith(`usuarios/${authUser.userId}/`) && !key.startsWith('receipts/')) {
            return jsonResponse({ error: 'Acceso denegado a este archivo' }, 403, request);
        }

        if (key.startsWith('receipts/')) {
            const headObj = await env.SPLITGASTO_BUCKET.head(key);
            if (!headObj) return jsonResponse({ error: 'Archivo no encontrado' }, 404, request);
            if (headObj.customMetadata?.userId !== authUser.userId) {
                return jsonResponse({ error: 'Acceso denegado a este archivo' }, 403, request);
            }
        }

        const object = await env.SPLITGASTO_BUCKET.get(key);
        if (!object) return jsonResponse({ error: 'Archivo no encontrado' }, 404, request);
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
        
        const rawName = key.split('/').pop() || 'download';
        const safeFilename = rawName.replace(/["\\]/g, '_');
        headers.set('Content-Disposition', `attachment; filename="${safeFilename}"`);
        
        headers.set('Cache-Control', 'private, max-age=3600');
        setSecurityHeaders(headers);
        return new Response(object.body, { headers });
    } catch (err) {
        return jsonResponse({ error: 'Error descargando', detail: err.message }, 500, request);
    }
}

async function handleSignedUrl(request, env, key, authUser) {
    try {
        if (!key.startsWith(`usuarios/${authUser.userId}/`) && !key.startsWith('receipts/')) {
            return jsonResponse({ error: 'Acceso denegado' }, 403, request);
        }

        if (key.startsWith('receipts/')) {
            const headObj = await env.SPLITGASTO_BUCKET.head(key);
            if (!headObj) return jsonResponse({ error: 'Archivo no encontrado' }, 404, request);
            if (headObj.customMetadata?.userId !== authUser.userId) {
                return jsonResponse({ error: 'Acceso denegado' }, 403, request);
            }
        }
        
        const downloadPath = `/api/storage/download/${encodeURIComponent(key)}`;
        const url = new URL(request.url);
        const downloadUrl = `${url.origin}${downloadPath}`;

        return jsonResponse({
            success: true,
            url: downloadUrl,
            method: 'authenticated-download',
            note: 'Usa GET con header Authorization: Bearer <token>',
            expiresIn: 3600,
            key,
        }, 200, request);
    } catch (err) {
        return jsonResponse({ error: 'Error generando URL', detail: err.message }, 500, request);
    }
}

async function handleStorageDelete(request, env, key, authUser) {
    try {
        if (key.startsWith(`usuarios/${authUser.userId}/`)) {
            // OK: path propio del usuario
        } else if (key.startsWith('receipts/')) {
            // Verificar ownership vía metadata para receipts
            const headObj = await env.SPLITGASTO_BUCKET.head(key);
            if (!headObj) return jsonResponse({ error: 'Archivo no encontrado' }, 404, request);
            if (headObj.customMetadata?.userId !== authUser.userId) {
                return jsonResponse({ error: 'Acceso denegado' }, 403, request);
            }
        } else {
            return jsonResponse({ error: 'Acceso denegado' }, 403, request);
        }

        const object = await env.SPLITGASTO_BUCKET.head(key);
        if (!object) return jsonResponse({ error: 'Archivo no encontrado' }, 404, request);
        await env.SPLITGASTO_BUCKET.delete(key);
        return jsonResponse({ success: true, message: 'Archivo eliminado', key }, 200, request);
    } catch (err) {
        return jsonResponse({ error: 'Error eliminando archivo', detail: err.message }, 500, request);
    }
}

async function handleStorageList(request, env, authUser) {
    try {
        const url = new URL(request.url);
        const folder = url.searchParams.get('folder') || '';
        const limit = parseInt(url.searchParams.get('limit') || '50', 10);
        const cursor = url.searchParams.get('cursor') || undefined;
        const safeFolder = String(folder).replace(/[^a-zA-Z0-9_-]/g, '_');
        const prefix = `usuarios/${authUser.userId}/${safeFolder}`;
        const listed = await env.SPLITGASTO_BUCKET.list({ prefix, limit: Math.min(limit, 100), cursor });
        const objects = listed.objects.map((obj) => ({
            key: obj.key, size: obj.size,
            uploaded: obj.uploaded.toISOString(),
            type: obj.httpMetadata?.contentType || 'unknown',
        }));
        return jsonResponse({
            success: true, objects, truncated: listed.truncated,
            cursor: listed.truncated ? listed.cursor : null, count: objects.length,
        }, 200, request);
    } catch (err) {
        return jsonResponse({ error: 'Error listando', detail: err.message }, 500, request);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Balances — Cálculo Transaccional Batch de deudas
// ═══════════════════════════════════════════════════════════════════════
async function handleBalances(request, env) {
    if (!env.SPLITGASTO_DB) return jsonResponse({ error: 'D1 no disponible' }, 503, request);
    const { error: authError, user: authUser } = await requireAuth(request, env);
    if (authError) return authError;

    const url = new URL(request.url);
    const groupId = url.searchParams.get('groupId');
    if (!groupId) return jsonResponse({ error: 'Parámetro "groupId" requerido' }, 400, request);

    const membership = await env.SPLITGASTO_DB.prepare(
        'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
    ).bind(groupId, authUser.userId).first();
    if (!membership) return jsonResponse({ error: 'No perteneces a este grupo' }, 403, request);

    const cacheKey = `db:balances:${groupId}`;
    const cached = await getCached(env, cacheKey);
    if (cached) return jsonResponse({ ...cached, cached: true }, 200, request);

    const [expensesResult, settlementsResult, membersResult] = await env.SPLITGASTO_DB.batch([
        env.SPLITGASTO_DB.prepare('SELECT * FROM expenses WHERE group_id = ?').bind(groupId),
        env.SPLITGASTO_DB.prepare('SELECT * FROM settlements WHERE group_id = ?').bind(groupId),
        env.SPLITGASTO_DB.prepare('SELECT user_id, role FROM group_members WHERE group_id = ?').bind(groupId),
    ]);

    const expenses = expensesResult.results;
    const settlements = settlementsResult.results;
    const members = membersResult.results;

    const expenseIds = expenses
        .filter(e => (e.split_type === 'exact' || e.split_type === 'percentage' || e.split_type === 'shares'))
        .map(e => e.id);

    let splitsByExpense = {};
    if (expenseIds.length > 0) {
        const chunks = [];
        for (let i = 0; i < expenseIds.length; i += 50) {
            const chunk = expenseIds.slice(i, i + 50);
            const placeholders = chunk.map(() => '?').join(',');
            chunks.push(
                env.SPLITGASTO_DB.prepare(
                    `SELECT expense_id, user_id, share_amount FROM expense_splits WHERE expense_id IN (${placeholders})`
                ).bind(...chunk)
            );
        }
        const splitResults = await env.SPLITGASTO_DB.batch(chunks);
        for (const batch of splitResults) {
            for (const s of batch.results) {
                if (!splitsByExpense[s.expense_id]) splitsByExpense[s.expense_id] = [];
                splitsByExpense[s.expense_id].push(s);
            }
        }
    }

    const balances = {};
    members.forEach(m => { balances[m.user_id] = 0; });

    for (const e of expenses) {
        const amount = parseFloat(e.amount) || 0;
        const paidBy = e.paid_by;
        const splitType = e.split_type || 'equal';
        const memberCount = members.length;

        if (balances[paidBy] !== undefined) balances[paidBy] += amount;

        if (splitType === 'equal') {
            const share = amount / memberCount;
            members.forEach(m => {
                if (balances[m.user_id] !== undefined) balances[m.user_id] -= share;
            });
        } else if (splitType === 'exact') {
            const splits = splitsByExpense[e.id];
            if (splits && splits.length > 0) {
                splits.forEach(s => {
                    if (balances[s.user_id] !== undefined) {
                        balances[s.user_id] -= parseFloat(s.share_amount) || 0;
                    }
                });
            } else {
                const share = amount / memberCount;
                members.forEach(m => {
                    if (balances[m.user_id] !== undefined) balances[m.user_id] -= share;
                });
            }
        } else if (splitType === 'percentage') {
            const splits = splitsByExpense[e.id];
            if (splits && splits.length > 0) {
                splits.forEach(s => {
                    if (balances[s.user_id] !== undefined) {
                        balances[s.user_id] -= (amount * (parseFloat(s.share_amount) || 0) / 100);
                    }
                });
            } else {
                const share = amount / memberCount;
                members.forEach(m => {
                    if (balances[m.user_id] !== undefined) balances[m.user_id] -= share;
                });
            }
        } else if (splitType === 'shares') {
            const splits = splitsByExpense[e.id];
            if (splits && splits.length > 0) {
                const totalShares = splits.reduce((sum, s) => sum + (parseFloat(s.share_amount) || 0), 0);
                if (totalShares > 0) {
                    splits.forEach(s => {
                        if (balances[s.user_id] !== undefined) {
                            balances[s.user_id] -= (amount * (parseFloat(s.share_amount) || 0) / totalShares);
                        }
                    });
                } else {
                    const share = amount / memberCount;
                    members.forEach(m => {
                        if (balances[m.user_id] !== undefined) balances[m.user_id] -= share;
                    });
                }
            } else {
                const share = amount / memberCount;
                members.forEach(m => {
                    if (balances[m.user_id] !== undefined) balances[m.user_id] -= share;
                });
            }
        }
    }

    settlements.forEach(s => {
        const settlementAmount = parseFloat(s.amount) || 0;
        if (balances[s.from_user] !== undefined) balances[s.from_user] += settlementAmount;
        if (balances[s.to_user] !== undefined) balances[s.to_user] -= settlementAmount;
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

    const totalAmount = expenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
    // Redondear balances antes de enviar para evitar errores de punto flotante
    const roundedBalances = {};
    Object.entries(balances).forEach(([uid, val]) => {
        roundedBalances[uid] = Math.round(val * 100) / 100;
    });

    const response = {
        success: true,
        balances: roundedBalances,
        debts,
        totalExpenses: expenses.length,
        totalAmount: Math.round(totalAmount * 100) / 100
    };
    // TTL reducido a 5s para consistencia transaccional (balances son datos en tiempo real)
    await setCache(env, cacheKey, response, 5);
    return jsonResponse(response, 200, request);
}

// ═══════════════════════════════════════════════════════════════════════
// D1 Database — Base de datos con autenticación
// ═══════════════════════════════════════════════════════════════════════
async function getEffectiveCreator(env, groupId) {
    const grp = await env.SPLITGASTO_DB.prepare(
        'SELECT created_by FROM groups WHERE id = ?'
    ).bind(groupId).first();
    
    if (grp?.created_by) return grp.created_by;
    
    const firstAdmin = await env.SPLITGASTO_DB.prepare(
        "SELECT user_id FROM group_members WHERE group_id = ? AND role = 'admin' ORDER BY created_at ASC LIMIT 1"
    ).bind(groupId).first();
    
    return firstAdmin?.user_id || null;
}

async function handleDatabase(request, env, path) {
    if (!env.SPLITGASTO_DB) return jsonResponse({ error: 'D1 no disponible' }, 503, request);
    const { error: authError, user: authUser } = await requireAuth(request, env);
    if (authError) return authError;
    const method = request.method;
    let body = {};
    if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
        try { body = await request.json(); } catch { return jsonResponse({ error: 'Body JSON inválido' }, 400, request); }
    }

    // PARCHE 2: Endpoint unificado y protegido de adscripción a grupos (Router Completo)
    if (path === '/api/db/join-group' && method === 'POST') {
        const { groupId } = body;
        if (!groupId) return jsonResponse({ error: 'Campo "groupId" requerido' }, 400, request);

        const group = await env.SPLITGASTO_DB.prepare(
            'SELECT id FROM groups WHERE id = ?'
        ).bind(groupId).first();
        if (!group) return jsonResponse({ error: 'Grupo no encontrado' }, 404, request);

        await env.SPLITGASTO_DB.prepare(
            'INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)'
        ).bind(groupId, authUser.userId, 'member').run();

        try { await env.SPLITGASTO_CACHE?.delete(`db:groups:${authUser.userId}`); } catch {}
        try { await env.SPLITGASTO_CACHE?.delete(`db:balances:${groupId}`); } catch {}
        return jsonResponse({ success: true, message: 'Unido al grupo' }, 200, request);
    }

    // ── GROUPS ─────────────────────────────────────────────────────────
    else if (path === '/api/db/groups' && method === 'GET') {
        const url = new URL(request.url);
        const userId = url.searchParams.get('userId') || authUser.userId;
        if (userId !== authUser.userId) return jsonResponse({ error: 'Solo puedes ver tus propios grupos' }, 403, request);
        const groups = await env.SPLITGASTO_DB.prepare(
            `SELECT g.*,
                (SELECT COUNT(*) FROM group_members gm2 WHERE gm2.group_id = g.id) AS member_count
             FROM groups g
             JOIN group_members gm ON g.id = gm.group_id
             WHERE gm.user_id = ?
             ORDER BY COALESCE(g.updated_at, g.created_at, g.id) DESC`
        ).bind(userId).all();
        return jsonResponse({ success: true, groups: groups.results }, 200, request);
    }

    else if (path === '/api/db/groups' && method === 'POST') {
        const { name, currency, members } = body;
        if (!name) return jsonResponse({ error: 'Campo "name" requerido' }, 400, request);
        if (typeof name !== 'string' || name.trim().length === 0 || name.length > 100) return jsonResponse({ error: 'Nombre de grupo inválido (máx 100 caracteres)' }, 400, request);
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
        return jsonResponse({ success: true, id, name, message: 'Grupo creado' }, 201, request);
    }

    // ── GROUP MEMBERS ──────────────────────────────────────────────────
    else if (path === '/api/db/group-members' && method === 'GET') {
        const url = new URL(request.url);
        const groupId = url.searchParams.get('groupId');
        if (!groupId) return jsonResponse({ error: 'Parámetro "groupId" requerido' }, 400, request);
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
                return jsonResponse({ error: 'No perteneces a este grupo' }, 403, request);
            }
        }
        const members = await env.SPLITGASTO_DB.prepare(
            `SELECT u.id, u.name, u.email, u.avatar_url, gm.role
             FROM group_members gm
             JOIN users u ON u.id = gm.user_id
             WHERE gm.group_id = ?
             ORDER BY gm.role DESC, u.name ASC`
        ).bind(groupId).all();
        return jsonResponse({ success: true, members: members.results }, 200, request);
    }

    else if (path === '/api/db/group-members' && method === 'POST') {
        const { groupId, userId: memberUserId, email, memberEmail, role } = body;
        const emailInput = memberEmail || email || '';
        if (!groupId || (!memberUserId && !emailInput)) return jsonResponse({ error: 'Campos "groupId" y "userId" o "email" requeridos' }, 400, request);
        if (env.SPLITGASTO_CACHE) {
            try { await env.SPLITGASTO_CACHE.delete(`db:groups:${authUser.userId}`); } catch {}
        }
        
        const ALLOWED_ROLES = ['admin', 'member'];
        const safeRole = ALLOWED_ROLES.includes(role) ? role : 'member';
        
        let membership = await env.SPLITGASTO_DB.prepare(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
        ).bind(groupId, authUser.userId).first();

        const grp = await env.SPLITGASTO_DB.prepare(
            'SELECT id, created_by FROM groups WHERE id = ?'
        ).bind(groupId).first();

        if (!membership) {
            if (grp && grp.created_by === authUser.userId) {
                await env.SPLITGASTO_DB.prepare(
                    'INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)'
                ).bind(groupId, authUser.userId, 'admin').run();
                membership = { role: 'admin' };
            } else {
                return jsonResponse({ error: 'No perteneces a este grupo' }, 403, request);
            }
        } else if (membership.role !== 'admin') {
            const hasAnyAdmin = await env.SPLITGASTO_DB.prepare(
                "SELECT 1 FROM group_members WHERE group_id = ? AND role = 'admin' LIMIT 1"
            ).bind(groupId).first();
            
            if (grp?.created_by === authUser.userId || !hasAnyAdmin) {
                await env.SPLITGASTO_DB.prepare(
                    'UPDATE group_members SET role = ? WHERE group_id = ? AND user_id = ?'
                ).bind('admin', groupId, authUser.userId).run();
                membership = { role: 'admin' };
            }
        }

        if (membership.role !== 'admin') return jsonResponse({ error: 'Solo el admin puede añadir miembros' }, 403, request);

        let actualMemberUserId = memberUserId;
        if (!actualMemberUserId && emailInput) {
            const normalizedMemberEmail = String(emailInput).toLowerCase().trim();
            if (!isValidEmail(normalizedMemberEmail)) return jsonResponse({ error: 'Email inválido' }, 400, request);
            const user = await env.SPLITGASTO_DB.prepare(
                'SELECT id FROM users WHERE LOWER(email) = ?'
            ).bind(normalizedMemberEmail).first();
            
            if (!user) {
                return jsonResponse({ 
                    success: false, 
                    exists: false, 
                    email: normalizedMemberEmail,
                    message: 'Usuario no registrado. Envía una invitación para unirse al grupo.' 
                }, 200, request);
            }
            
            actualMemberUserId = user.id;
        } else if (actualMemberUserId) {
            const userExists = await env.SPLITGASTO_DB.prepare(
                'SELECT id FROM users WHERE id = ?'
            ).bind(actualMemberUserId).first();
            if (!userExists) return jsonResponse({ error: 'Usuario no encontrado' }, 404, request);
        }

        await env.SPLITGASTO_DB.prepare(
            'INSERT OR IGNORE INTO group_members (group_id, user_id, role) VALUES (?, ?, ?)'
        ).bind(groupId, actualMemberUserId, safeRole).run();

        try { await env.SPLITGASTO_CACHE?.delete(`db:groups:${authUser.userId}`); } catch {}
        try { await env.SPLITGASTO_CACHE?.delete(`db:groups:${actualMemberUserId}`); } catch {}
        try { await env.SPLITGASTO_CACHE?.delete(`db:balances:${groupId}`); } catch {}

        return jsonResponse({ success: true, message: 'Miembro añadido' }, 201, request);
    }

    // ── PROFILE ────────────────────────────────────────────────────────
    // PARCHE 3: Validación atómica de correo único antes de persistir actualizaciones
    else if (path === '/api/db/profile' && method === 'POST') {
        const { name, email, avatar } = body;
        if (!name) return jsonResponse({ error: 'Campo "name" requerido' }, 400, request);
        const userId = authUser.userId;
        
        let emailToStore = undefined;
        if (email !== undefined && email !== null && email !== '') {
            emailToStore = email.toLowerCase().trim();
            if (!isValidEmail(emailToStore)) return jsonResponse({ error: 'Email inválido' }, 400, request);
            
            // NUEVO: Verificar que no esté en uso por otro usuario
            const existing = await env.SPLITGASTO_DB.prepare(
                'SELECT id FROM users WHERE LOWER(email) = ? AND id != ?'
            ).bind(emailToStore, userId).first();
            if (existing) return jsonResponse({ error: 'Este email ya está en uso por otro usuario' }, 409, request);
        }
        
        if (name.length > 100) return jsonResponse({ error: 'Nombre máximo 100 caracteres' }, 400, request);
        
        if (emailToStore !== undefined) {
            await env.SPLITGASTO_DB.prepare(
                'UPDATE users SET name = ?, email = ?, avatar_url = ? WHERE id = ?'
            ).bind(name.trim(), emailToStore, avatar || '', userId).run();
        } else {
            await env.SPLITGASTO_DB.prepare(
                'UPDATE users SET name = ?, avatar_url = ? WHERE id = ?'
            ).bind(name.trim(), avatar || '', userId).run();
        }
        
        await env.SPLITGASTO_CACHE?.delete(`db:profile:${userId}`);
        return jsonResponse({ success: true, message: 'Perfil actualizado' }, 200, request);
    }

    else if (path === '/api/db/profile' && method === 'GET') {
        const url = new URL(request.url);
        const userId = url.searchParams.get('userId') || authUser.userId;
        if (userId !== authUser.userId) return jsonResponse({ error: 'Solo puedes ver tu propio perfil' }, 403, request);
        const cacheKey = `db:profile:${userId}`;
        const cached = await getCached(env, cacheKey);
        if (cached) return jsonResponse({ ...cached, cached: true }, 200, request);
        const profile = await env.SPLITGASTO_DB.prepare(
            'SELECT id, name, email, avatar_url FROM users WHERE id = ?'
        ).bind(userId).first();
        if (!profile) return jsonResponse({ error: 'Usuario no encontrado' }, 404, request);
        const response = { success: true, profile };
        await setCache(env, cacheKey, response, 120);
        return jsonResponse(response, 200, request);
    }

    // ── NOTIFICATIONS ──────────────────────────────────────────────────
    else if (path === '/api/db/notifications' && method === 'GET') {
        const url = new URL(request.url);
        const userId = url.searchParams.get('userId') || authUser.userId;
        if (userId !== authUser.userId) return jsonResponse({ error: 'Solo puedes ver tus notificaciones' }, 403, request);
        const notifications = await env.SPLITGASTO_DB.prepare(
            'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
        ).bind(userId).all();
        return jsonResponse({ success: true, notifications: notifications.results }, 200, request);
    }

    else if (path === '/api/db/notifications' && method === 'POST') {
        const { title, message, type } = body;
        if (!title) return jsonResponse({ error: 'Campo "title" requerido' }, 400, request);
        if (title.length > 200) return jsonResponse({ error: 'Título máximo 200 caracteres' }, 400, request);
        if (message && message.length > 1000) return jsonResponse({ error: 'Mensaje máximo 1000 caracteres' }, 400, request);
        const ALLOWED_NOTIF_TYPES = ['info', 'success', 'warning', 'error'];
        const safeType = ALLOWED_NOTIF_TYPES.includes(type) ? type : 'info';
        const userId = authUser.userId;
        const id = crypto.randomUUID();
        await env.SPLITGASTO_DB.prepare(
            'INSERT INTO notifications (id, user_id, title, message, type) VALUES (?, ?, ?, ?, ?)'
        ).bind(id, userId, title.slice(0, 200), (message || '').slice(0, 1000), safeType).run();
        return jsonResponse({ success: true, id, message: 'Notificación creada' }, 201, request);
    }

    // ── USERS SEARCH (restringido) ─────────────────────────────────────
    else if (path === '/api/db/users' && method === 'GET') {
        const url = new URL(request.url);
        const email = url.searchParams.get('email');
        if (!email) return jsonResponse({ error: 'Parámetro "email" requerido' }, 400, request);
        const normalizedSearchEmail = email.toLowerCase().trim();
        
        const sharedGroup = await env.SPLITGASTO_DB.prepare(
            `SELECT 1 FROM group_members gm1
             JOIN group_members gm2 ON gm1.group_id = gm2.group_id
             JOIN users u ON u.id = gm2.user_id
             WHERE gm1.user_id = ? AND LOWER(u.email) = ?
             LIMIT 1`
        ).bind(authUser.userId, normalizedSearchEmail).first();
        
        if (!sharedGroup) {
            return jsonResponse({ success: false, error: 'Usuario no encontrado' }, 404, request);
        }
        
        const user = await env.SPLITGASTO_DB.prepare(
            'SELECT id, name, email, avatar_url FROM users WHERE LOWER(email) = ?'
        ).bind(normalizedSearchEmail).first();
        if (!user) return jsonResponse({ success: false, error: 'Usuario no encontrado' }, 404, request);
        return jsonResponse({ success: true, user }, 200, request);
    }

    // ── EXPENSES ───────────────────────────────────────────────────────
    else if (path === '/api/db/expenses' && method === 'GET') {
        const url = new URL(request.url);
        const groupId = url.searchParams.get('groupId');
        if (!groupId) return jsonResponse({ error: 'Parámetro "groupId" requerido' }, 400, request);
        const membership = await env.SPLITGASTO_DB.prepare(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
        ).bind(groupId, authUser.userId).first();
        if (!membership) return jsonResponse({ error: 'No perteneces a este grupo' }, 403, request);

        const page = parseInt(url.searchParams.get('page') || '1', 10);
        const perPage = Math.min(parseInt(url.searchParams.get('perPage') || '50', 10), 100);
        const offset = (page - 1) * perPage;

        const [expensesResult, totalResult] = await env.SPLITGASTO_DB.batch([
            env.SPLITGASTO_DB.prepare('SELECT * FROM expenses WHERE group_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?').bind(groupId, perPage, offset),
            env.SPLITGASTO_DB.prepare('SELECT COUNT(*) as count FROM expenses WHERE group_id = ?').bind(groupId),
        ]);

        const expenses = expensesResult.results;
        const total = totalResult.results[0]?.count || 0;

        return jsonResponse({
            success: true,
            expenses,
            pagination: { page, perPage, total, totalPages: Math.ceil(total / perPage) },
        }, 200, request);
    }

    else if (path === '/api/db/expenses' && method === 'POST') {
        const { groupId, amount, currency, category, description, splitType, paidBy, splits } = body;
        if (!groupId || amount === undefined || amount === null) {
            return jsonResponse({ error: 'Campos "groupId" y "amount" requeridos' }, 400, request);
        }
        const amountCents = toCents(amount);
        if (amountCents === null || !isValidAmount(amountCents)) {
            return jsonResponse({ error: 'El importe debe ser mayor que 0' }, 400, request);
        }
        const parsedAmount = fromCents(amountCents);
        if (description && description.length > 500) return jsonResponse({ error: 'Descripción máximo 500 caracteres' }, 400, request);
        const ALLOWED_CATEGORIES = ['comida','transporte','entretenimiento','alojamiento','compras','salud','servicios','otro'];
        const safeCategory = ALLOWED_CATEGORIES.includes(category) ? category : 'otro';
        const ALLOWED_SPLIT_TYPES = ['equal','exact','percentage','shares'];
        const safeSplitType = ALLOWED_SPLIT_TYPES.includes(splitType) ? splitType : 'equal';
        
        const membership = await env.SPLITGASTO_DB.prepare(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
        ).bind(groupId, authUser.userId).first();
        if (!membership) return jsonResponse({ error: 'No perteneces a este grupo' }, 403, request);
        
        const actualPaidBy = paidBy || authUser.userId;
        
        if (actualPaidBy !== authUser.userId && membership.role !== 'admin') {
            return jsonResponse({ error: 'No puedes registrar gastos a nombre de otro usuario' }, 403, request);
        }
        
        if (actualPaidBy !== authUser.userId) {
            const payerMembership = await env.SPLITGASTO_DB.prepare(
                'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
            ).bind(groupId, actualPaidBy).first();
            if (!payerMembership) return jsonResponse({ error: 'El pagador no pertenece al grupo' }, 400, request);
        }
        
        const id = crypto.randomUUID();
        const ALLOWED_CURRENCIES_EXP = ['EUR', 'USD', 'GBP', 'MXN', 'ARS', 'CLP', 'COP', 'PEN', 'BRL'];
        const safeCurrencyExp = ALLOWED_CURRENCIES_EXP.includes(currency) ? currency : 'EUR';
        
        await env.SPLITGASTO_DB.prepare(
            'INSERT INTO expenses (id, group_id, paid_by, amount, currency, category, description, split_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
        ).bind(id, groupId, actualPaidBy, parsedAmount, safeCurrencyExp, safeCategory, (description || 'Sin descripción').slice(0, 500), safeSplitType).run();

        if (safeSplitType !== 'equal' && Array.isArray(splits) && splits.length > 0) {
            const groupMembers = await env.SPLITGASTO_DB.prepare(
                'SELECT user_id FROM group_members WHERE group_id = ?'
            ).bind(groupId).all();
            const memberIds = new Set((groupMembers.results || []).map(m => m.user_id));
            
            const splitInserts = [];
            for (const s of splits) {
                const uid = s.userId || s.user_id;
                const share = parseFloat(s.shareAmount ?? s.share_amount ?? s.amount);
                if (!uid || isNaN(share) || share < 0) continue;
                if (!memberIds.has(uid)) {
                    return jsonResponse({ error: `El usuario ${uid} no pertenece al grupo` }, 400, request);
                }
                splitInserts.push(
                    env.SPLITGASTO_DB.prepare(
                        'INSERT INTO expense_splits (expense_id, user_id, share_amount) VALUES (?, ?, ?)'
                    ).bind(id, uid, share)
                );
            }
            if (splitInserts.length > 0) {
                await env.SPLITGASTO_DB.batch(splitInserts);
            }
        }

        if (env.SPLITGASTO_CACHE) {
            try { await env.SPLITGASTO_CACHE.delete(`db:expenses:${groupId}`); } catch {}
            try { await env.SPLITGASTO_CACHE.delete(`db:groups:${authUser.userId}`); } catch {}
            try { await env.SPLITGASTO_CACHE.delete(`db:balances:${groupId}`); } catch {}
        }
        return jsonResponse({ success: true, id, message: 'Gasto registrado' }, 201, request);
    }

    // ── SETTLEMENTS ────────────────────────────────────────────────────
    else if (path === '/api/db/settlements' && method === 'GET') {
        const url = new URL(request.url);
        const groupId = url.searchParams.get('groupId');
        if (!groupId) return jsonResponse({ error: 'Parámetro "groupId" requerido' }, 400, request);
        const membership = await env.SPLITGASTO_DB.prepare(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
        ).bind(groupId, authUser.userId).first();
        if (!membership) return jsonResponse({ error: 'No perteneces a este grupo' }, 403, request);
        const settlements = await env.SPLITGASTO_DB.prepare(
            'SELECT * FROM settlements WHERE group_id = ? ORDER BY created_at DESC'
        ).bind(groupId).all();
        return jsonResponse({ success: true, settlements: settlements.results }, 200, request);
    }

        else if (path === '/api/db/settlements' && method === 'POST') {
        const { groupId, fromUserId, toUserId, amount, currency } = body;
        if (!groupId || !fromUserId || !toUserId || amount === undefined || amount === null) {
            return jsonResponse({ error: 'Campos "groupId", "fromUserId", "toUserId", "amount" requeridos' }, 400, request);
        }
        
        const amountCents = toCents(amount);
        if (amountCents === null || !isValidAmount(amountCents)) {
            return jsonResponse({ error: 'Importe inválido (debe ser > 0 y < 1.000.000)' }, 400, request);
        }
        const parsedAmount = fromCents(amountCents);
        if (fromUserId === toUserId) {
            return jsonResponse({ error: 'El pagador y el receptor deben ser distintos' }, 400, request);
        }
        
        const membership = await env.SPLITGASTO_DB.prepare(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
        ).bind(groupId, authUser.userId).first();
        if (!membership) return jsonResponse({ error: 'No perteneces a este grupo' }, 403, request);
        
        if (fromUserId !== authUser.userId && membership.role !== 'admin') {
            return jsonResponse({ error: 'Solo puedes registrar tus propias liquidaciones' }, 403, request);
        }
        
        const usersInGroup = await env.SPLITGASTO_DB.prepare(
            'SELECT user_id FROM group_members WHERE group_id = ? AND user_id IN (?, ?)'
        ).bind(groupId, fromUserId, toUserId).all();
        if ((usersInGroup.results || []).length !== 2) {
            return jsonResponse({ error: 'Ambos usuarios deben pertenecer al grupo' }, 400, request);
        }
        
        const id = crypto.randomUUID();
        await env.SPLITGASTO_DB.prepare(
            'INSERT INTO settlements (id, group_id, from_user, to_user, amount, currency) VALUES (?, ?, ?, ?, ?, ?)'
        ).bind(id, groupId, fromUserId, toUserId, parsedAmount, currency || 'EUR').run();
        
        await env.SPLITGASTO_CACHE?.delete(`db:balances:${groupId}`);
        return jsonResponse({ success: true, id, message: 'Liquidación registrada' }, 201, request);
    }

    // ── DELETE EXPENSE ─────────────────────────────────────────────────
    else if (path.startsWith('/api/db/expenses/') && method === 'DELETE') {
        const expenseId = path.replace('/api/db/expenses/', '');
        if (!expenseId) return jsonResponse({ error: 'ID de gasto requerido' }, 400, request);

        const expense = await env.SPLITGASTO_DB.prepare(
            'SELECT id, group_id, paid_by FROM expenses WHERE id = ?'
        ).bind(expenseId).first();

        if (!expense) return jsonResponse({ error: 'Gasto no encontrado' }, 404, request);

        const membership = await env.SPLITGASTO_DB.prepare(
            'SELECT role FROM group_members WHERE group_id = ? AND user_id = ?'
        ).bind(expense.group_id, authUser.userId).first();

        if (!membership) return jsonResponse({ error: 'No tienes acceso a este gasto' }, 403, request);

        const canDelete = expense.paid_by === authUser.userId || membership.role === 'admin';
        if (!canDelete) return jsonResponse({ error: 'Solo el pagador o un admin puede eliminar este gasto' }, 403, request);

        await env.SPLITGASTO_DB.batch([
            env.SPLITGASTO_DB.prepare('DELETE FROM expense_splits WHERE expense_id = ?').bind(expenseId),
            env.SPLITGASTO_DB.prepare('DELETE FROM expenses WHERE id = ?').bind(expenseId),
        ]);

        if (env.SPLITGASTO_CACHE) {
            await env.SPLITGASTO_CACHE.delete(`db:expenses:${expense.group_id}`);
            await env.SPLITGASTO_CACHE.delete(`db:balances:${expense.group_id}`);
            await env.SPLITGASTO_CACHE.delete(`db:groups:${authUser.userId}`);
        }

        return jsonResponse({ success: true, message: 'Gasto eliminado' }, 200, request);
    }

    // ── DELETE GROUP ───────────────────────────────────────────────────
    else if (path.startsWith('/api/db/groups/') && method === 'DELETE') {
        const groupId = path.replace('/api/db/groups/', '');
        if (!groupId) return jsonResponse({ error: 'ID de grupo requerido' }, 400, request);

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
                return jsonResponse({ success: true, message: 'Grupo ya eliminado' }, 200, request);
            }
        }

        if (!membership) return jsonResponse({ error: 'No perteneces a este grupo' }, 403, request);
        if (membership.role !== 'admin') return jsonResponse({ error: 'Solo el admin puede eliminar el grupo' }, 403, request);

        const membersForCache = await env.SPLITGASTO_DB.prepare(
            'SELECT user_id FROM group_members WHERE group_id = ?'
        ).bind(groupId).all();

        await env.SPLITGASTO_DB.batch([
            env.SPLITGASTO_DB.prepare('DELETE FROM expense_splits WHERE expense_id IN (SELECT id FROM expenses WHERE group_id = ?)').bind(groupId),
            env.SPLITGASTO_DB.prepare('DELETE FROM expenses WHERE group_id = ?').bind(groupId),
            env.SPLITGASTO_DB.prepare('DELETE FROM settlements WHERE group_id = ?').bind(groupId),
            env.SPLITGASTO_DB.prepare('DELETE FROM group_members WHERE group_id = ?').bind(groupId),
            env.SPLITGASTO_DB.prepare('DELETE FROM groups WHERE id = ?').bind(groupId),
        ]);

        if (env.SPLITGASTO_CACHE) {
            await env.SPLITGASTO_CACHE.delete(`db:balances:${groupId}`);
            await env.SPLITGASTO_CACHE.delete(`db:expenses:${groupId}`);
            for (const m of (membersForCache.results || [])) {
                await env.SPLITGASTO_CACHE.delete(`db:groups:${m.user_id}`);
            }
        }

        return jsonResponse({ success: true, message: 'Grupo eliminado' }, 200, request);
    }

    // ── DELETE GROUP MEMBER ────────────────────────────────────────────
    else if (path.startsWith('/api/db/group-members/') && method === 'DELETE') {
        const parts = path.replace('/api/db/group-members/', '').split('/');
        const groupId = parts[0];
        const memberUserId = parts[1];
        if (!groupId || !memberUserId) return jsonResponse({ error: 'groupId y userId requeridos en la ruta' }, 400, request);

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

        if (!membership) return jsonResponse({ error: 'No perteneces a este grupo' }, 403, request);

        if (membership.role !== 'admin' && memberUserId !== authUser.userId) {
            return jsonResponse({ error: 'Solo el admin puede eliminar otros miembros' }, 403, request);
        }

        if (memberUserId === authUser.userId && membership.role === 'admin') {
            const adminCount = await env.SPLITGASTO_DB.prepare(
                "SELECT COUNT(*) as cnt FROM group_members WHERE group_id = ? AND role = 'admin'"
            ).bind(groupId).first();
            if (adminCount && adminCount.cnt <= 1) {
                return jsonResponse({ error: 'No puedes abandonar el grupo siendo el único admin. Elimina el grupo o asigna otro admin primero.' }, 400, request);
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

        return jsonResponse({ success: true, message: 'Miembro eliminado del grupo' }, 200, request);
    }

    // ── UTILITIES ──────────────────────────────────────────────────────
    else if (path === '/api/db/repair-memberships' && method === 'POST') {
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
        }, 200, request);
    }

    else if (path === '/api/db/purge-cache' && method === 'POST') {
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
        return jsonResponse({ success: true, message: 'Cache purgada correctamente' }, 200, request);
    }

    else if (path === '/api/db/notifications/read' && method === 'POST') {
        const userId = authUser.userId;
        try {
            await env.SPLITGASTO_DB.prepare(
                "UPDATE notifications SET read = 1 WHERE user_id = ? AND read = 0"
            ).bind(userId).run();
        } catch {}
        return jsonResponse({ success: true, message: 'Notificaciones marcadas como leídas' }, 200, request);
    }

    return jsonResponse({ error: 'Ruta de base de datos no encontrada', path }, 404, request);
}

// ═══════════════════════════════════════════════════════════════════════
// Helpers de Formateo Global e Inyección CORS
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
    // FIX GOOGLE PLAY: WebView móvil
    if (origin === 'capacitor://localhost') return origin;
    if (origin === 'ionic://localhost') return origin;
    if (origin === 'file://') return origin;
    if (origin === '' || origin === 'null') {
        // Las apps WebView a veces envían Origin vacío o 'null'
        const appPlatform = request.headers.get('X-App-Platform') || '';
        if (appPlatform === 'android' || appPlatform === 'ios') return '*';
    }
    return null;
}

function jsonResponse(data, status = 200, request = null) {
    const origin = request ? getOrigin(request) : null;
    const headers = {
        'Content-Type': 'application/json; charset=utf-8',
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'no-store',
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
            'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-App-Platform',
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
        "script-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://fonts.googleapis.com https://fonts.gstatic.com https://embed.tawk.to; " +
        "worker-src 'self' blob:; " +
        "style-src 'self' 'unsafe-inline' https://cdn.tailwindcss.com https://fonts.googleapis.com https://fonts.gstatic.com https://embed.tawk.to; " +
        "font-src 'self' https://fonts.gstatic.com https://embed.tawk.to; " +
        "img-src 'self' data: blob: https:; " +
        "connect-src 'self' blob: https://splitgasto.com https://*.splitgasto-2026.pages.dev https://*.reciborapido777.workers.dev https://api.dicebear.com https://*.tawk.to wss://*.tawk.to; " +
        "frame-ancestors 'none';"
    );
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    const ct = headers.get('Content-Type') || '';
    if (ct.includes('text/html')) {
        headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Membresía — Prueba gratuita de 7 días (persistente en D1)
// ═══════════════════════════════════════════════════════════════════════
async function handleMembership(request, env, path) {
    if (!env.SPLITGASTO_DB) {
        return jsonResponse({ error: 'Servicio de membresía no disponible' }, 503, request);
    }
    const { error: authError, user: authUser } = await requireAuth(request, env);
    if (authError) return authError;
    const method = request.method;

    if (path === '/api/membership/status' && method === 'GET') {
        const status = await getMembershipStatus(env, authUser.userId);
        return jsonResponse({ success: true, ...status }, 200, request);
    }

    if (path === '/api/membership/start-trial' && method === 'POST') {
        const existing = await env.SPLITGASTO_DB.prepare(
            'SELECT started_at, expires_at FROM user_trials WHERE user_id = ?'
        ).bind(authUser.userId).first();

        if (existing) {
            const status = await getMembershipStatus(env, authUser.userId);
            return jsonResponse({ 
                success: true, 
                message: 'Ya tienes una prueba activa o finalizada', 
                ...status 
            }, 200, request);
        }

        const now = Date.now();
        const expiresAt = now + (7 * 24 * 60 * 60 * 1000);

        try {
            await env.SPLITGASTO_DB.prepare(
                'INSERT INTO user_trials (user_id, started_at, expires_at) VALUES (?, ?, ?)'
            ).bind(authUser.userId, now, expiresAt).run();
        } catch (dbErr) {
            if (dbErr.message && dbErr.message.includes('UNIQUE')) {
                const status = await getMembershipStatus(env, authUser.userId);
                return jsonResponse({ 
                    success: true, 
                    message: 'Ya tienes una prueba activa o finalizada', 
                    ...status 
                }, 200, request);
            }
            throw dbErr;
        }

        return jsonResponse({ 
            success: true, 
            message: 'Prueba de 7 días activada correctamente', 
            hasAccess: true,
            type: 'trial',
            active: true,
            activatedAt: new Date(now).toISOString(),
            expiresAt: new Date(expiresAt).toISOString(),
            daysRemaining: 7 
        }, 200, request);
    }

    if (path === '/api/membership/status' && method !== 'GET') {
        return jsonResponse({ error: 'Usa GET para consultar estado' }, 405, request);
    }
    if (path === '/api/membership/start-trial' && method !== 'POST') {
        return jsonResponse({ error: 'Usa POST para activar prueba' }, 405, request);
    }

    return jsonResponse({ error: 'Ruta de membresía no encontrada', path }, 404, request);
}

async function getMembershipStatus(env, userId) {
    // 1. Verificar suscripción de pago (Stripe)
    const activeSub = await env.SPLITGASTO_DB.prepare(`
        SELECT * FROM user_subscriptions 
        WHERE user_id = ? AND status = 'active' AND current_period_end > ?
        ORDER BY created_at DESC LIMIT 1
    `).bind(userId, Date.now()).first();

    if (activeSub) {
        const daysRemaining = Math.ceil((activeSub.current_period_end - Date.now()) / (1000 * 60 * 60 * 24));
        return {
            hasAccess: true,
            type: 'subscription',
            active: true,
            plan: activeSub.plan_name,
            provider: activeSub.provider,
            subscriptionId: activeSub.subscription_id,
            activatedAt: new Date(activeSub.current_period_start).toISOString(),
            expiresAt: new Date(activeSub.current_period_end).toISOString(),
            daysRemaining: Math.max(0, daysRemaining),
            message: 'Membresía Pro activa'
        };
    }

    // 2. Fallback a prueba gratuita
    const trial = await env.SPLITGASTO_DB.prepare(
        'SELECT started_at, expires_at FROM user_trials WHERE user_id = ?'
    ).bind(userId).first();
    
    if (trial) {
        const now = Date.now();
        const expiresAt = trial.expires_at;
        const remaining = expiresAt - now;
        const daysRemaining = Math.ceil(remaining / (1000 * 60 * 60 * 24));

        if (remaining > 0) {
            return { 
                hasAccess: true, 
                type: 'trial', 
                active: true, 
                activatedAt: new Date(trial.started_at).toISOString(),
                expiresAt: new Date(expiresAt).toISOString(),
                daysRemaining: Math.max(0, daysRemaining)
            };
        } else {
            return { 
                hasAccess: false, 
                type: 'trial_expired', 
                active: false, 
                daysRemaining: 0,
                message: 'Tu prueba gratuita ha expirado. Suscríbete para continuar.'
            };
        }
    }

    return { 
        hasAccess: false, 
        type: 'none', 
        active: false, 
        message: 'No tienes una membresía activa. Activa tu prueba gratuita o suscríbete.' 
    };
}

// ═══════════════════════════════════════════════════════════════════════
// Stripe Payments
// ═══════════════════════════════════════════════════════════════════════

async function handleStripeCheckout(request, env) {
    const { error: authError, user: authUser } = await requireAuth(request, env);
    if (authError) return authError;

    if (!env.STRIPE_SECRET_KEY) {
        return jsonResponse({ error: 'Sistema de pagos no configurado' }, 503, request);
    }

    try {
        const body = await request.json().catch(() => ({}));
        const returnUrl = new URL(request.url).origin;
        const successUrl = body.successUrl || `${returnUrl}/membership.html?status=success`;
        const cancelUrl = body.cancelUrl || `${returnUrl}/membership.html?status=cancelled`;
        const priceId = body.priceId || env.STRIPE_PRICE_ID;

        if (!priceId) {
            return jsonResponse({ error: 'Price ID no configurado' }, 503, request);
        }

        // Buscar o crear customer
        const customerSearch = await fetch(
            `https://api.stripe.com/v1/customers/search?query=metadata['user_id']:'${authUser.userId}'`,
            { headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` } }
        );
        const searchData = await customerSearch.json();
        let customerId = searchData.data?.[0]?.id;

        if (!customerId) {
            const customerCreate = await fetch('https://api.stripe.com/v1/customers', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                body: new URLSearchParams({
                    email: authUser.email || '',
                    'metadata[user_id]': authUser.userId
                })
            });
            const custData = await customerCreate.json();
            if (!customerCreate.ok) {
                return jsonResponse({ error: 'Error creando cliente', detail: custData.error?.message }, 502, request);
            }
            customerId = custData.id;
        }

        // Crear Checkout Session (versión pulida)
        const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                'customer': customerId,
                'line_items[0][price]': priceId,
                'line_items[0][quantity]': '1',
                'mode': 'subscription',
                'payment_behavior': 'default_incomplete',
                'automatic_tax[enabled]': 'true',
                'expand[]': 'latest_invoice',
                'subscription_data[trial_period_days]': '7',
                'success_url': successUrl,
                'cancel_url': cancelUrl,

                'subscription_data[metadata][user_id]': authUser.userId,
                'client_reference_id': authUser.userId
            })
        });

        const sessionData = await sessionRes.json();
        if (!sessionRes.ok) {
            return jsonResponse({
                error: 'Error creando checkout',
                detail: sessionData.error?.message || 'Error desconocido'
            }, 502, request);
        }

        return jsonResponse({
            success: true,
            checkoutUrl: sessionData.url,
            sessionId: sessionData.id
        }, 200, request);

    } catch (err) {
        return jsonResponse({ error: 'Error de conexión con el proveedor de pagos' }, 500, request);
    }
}

async function handleStripeWebhook(request, env) {
    if (!env.STRIPE_WEBHOOK_SECRET) {
        return jsonResponse({ error: 'Webhook no configurado' }, 503, request);
    }

    try {
        const signature = request.headers.get('stripe-signature');
        const body = await request.text();
        const isValid = await verifyStripeSignature(body, signature, env.STRIPE_WEBHOOK_SECRET);
        if (!isValid) {
            return jsonResponse({ error: 'Firma inválida' }, 401, request);
        }

        const event = JSON.parse(body);
        console.log('[Stripe Webhook] Evento recibido');

        // Idempotencia: evitar procesar el mismo evento 2 veces
        const eventId = event.id;
        const alreadyProcessed = await env.SPLITGASTO_CACHE?.get(`stripe:event:${eventId}`);
        if (alreadyProcessed) {
            return jsonResponse({ received: true, status: 'already_processed' }, 200, request);
        }
        await env.SPLITGASTO_CACHE?.put(`stripe:event:${eventId}`, '1', {
            expirationTtl: 60 * 60 * 24 // 24h
        });

        if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
            const sub = event.data.object;
            const userId = sub.metadata?.user_id || sub.client_reference_id;
            if (!userId) return jsonResponse({ received: true }, 200, request);

            const status = (sub.status === 'active' || sub.status === 'trialing') ? 'active' : sub.status;
            const now = Date.now();
            const periodStart = (sub.current_period_start ?? sub.start_date ?? Math.floor(now / 1000)) * 1000;
            const periodEnd = (sub.current_period_end ?? sub.trial_end ?? (Math.floor(now / 1000) + 7 * 24 * 60 * 60)) * 1000;

            await env.SPLITGASTO_DB.prepare(`
                INSERT INTO user_subscriptions 
                (id, user_id, provider, subscription_id, order_id, status, plan_name, current_period_start, current_period_end)
                VALUES (?, ?, 'stripe', ?, ?, ?, 'pro', ?, ?)
                ON CONFLICT(subscription_id) DO UPDATE SET
                    status = excluded.status,
                    current_period_start = excluded.current_period_start,
                    current_period_end = excluded.current_period_end,
                    updated_at = strftime('%s', 'now') * 1000
            `).bind(
                crypto.randomUUID(), userId, sub.id, sub.latest_invoice || '', status, periodStart, periodEnd
            ).run();

            await env.SPLITGASTO_CACHE?.delete(`membership:${userId}`);
            return jsonResponse({ received: true, status: 'activated' }, 200, request);
        }

        if (event.type === 'customer.subscription.deleted') {
            const sub = event.data.object;
            await env.SPLITGASTO_DB.prepare(`
                UPDATE user_subscriptions 
                SET status = 'cancelled', updated_at = strftime('%s', 'now') * 1000
                WHERE subscription_id = ?
            `).bind(sub.id).run();
            return jsonResponse({ received: true, status: 'cancelled' }, 200, request);
        }

        return jsonResponse({ received: true }, 200, request);

    } catch (err) {
        return jsonResponse({ error: 'Error procesando webhook' }, 500, request);
    }
}

async function handleStripePortal(request, env) {
    const { error: authError, user: authUser } = await requireAuth(request, env);
    if (authError) return authError;

    try {
        const body = await request.json().catch(() => ({}));
        const returnUrl = body.returnUrl || `${new URL(request.url).origin}/membership.html`;

        const searchRes = await fetch(
            `https://api.stripe.com/v1/customers/search?query=metadata['user_id']:'${authUser.userId}'`,
            { headers: { 'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}` } }
        );
        const searchData = await searchRes.json();
        const customerId = searchData.data?.[0]?.id;

        if (!customerId) {
            return jsonResponse({ error: 'No se encontró cliente de Stripe' }, 404, request);
        }

        const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${env.STRIPE_SECRET_KEY}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({ customer: customerId, return_url: returnUrl })
        });

        const portalData = await portalRes.json();
        if (!portalRes.ok) {
            return jsonResponse({ error: 'Error creando portal', detail: portalData.error?.message }, 502, request);
        }

        return jsonResponse({ success: true, portalUrl: portalData.url }, 200, request);

    } catch (err) {
        return jsonResponse({ error: 'Error de conexión' }, 500, request);
    }
}

async function verifyStripeSignature(payload, signature, secret) {
    if (!signature || !secret) return false;

    try {
        const parts = signature.split(',');
        const sig = {};
        const v1List = [];

        // Parsear todas las partes del header
        parts.forEach(p => {
            const [k, v] = p.split('=');
            const key = k.trim();
            const value = v.trim();
            sig[key] = value;
            if (key === 'v1') v1List.push(value);
        });

        // 1. Protección contra replay attacks (5 minutos)
        const timestamp = parseInt(sig.t, 10);
        const now = Math.floor(Date.now() / 1000);
        if (Math.abs(now - timestamp) > 300) return false;

        // 2. Construir payload firmado
        const signedPayload = `${sig.t}.${payload}`;

        // 3. Firmar con HMAC-SHA256 usando WebCrypto
        const encoder = new TextEncoder();
        const key = await crypto.subtle.importKey(
            'raw',
            encoder.encode(secret),
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['sign']
        );
        const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));

        // 4. Convertir firma a HEX (Stripe usa HEX)
        const computed = Array.from(new Uint8Array(sigBytes))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        // 5. Comparación timing-safe
        const timingSafeEqual = (a, b) => {
            if (a.length !== b.length) return false;
            let result = 0;
            for (let i = 0; i < a.length; i++) {
                result |= a.charCodeAt(i) ^ b.charCodeAt(i);
            }
            return result === 0;
        };

        // 6. Stripe puede enviar múltiples firmas v1
        return v1List.some(v1 => timingSafeEqual(v1, computed));

    } catch {
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Google Play — Renovación automática del Access Token
// ═══════════════════════════════════════════════════════════════════════
async function refreshGooglePlayToken(env) {
    if (!env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY) {
        console.log('[Google Play] Service Account Key no configurada — omitiendo');
        return;
    }

    try {
        const serviceAccount = JSON.parse(env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY);
        const now = Math.floor(Date.now() / 1000);

        // 1. Crear JWT firmado con RS256
        const header = { alg: 'RS256', typ: 'JWT' };
        const payload = {
            iss: serviceAccount.client_email,
            scope: 'https://www.googleapis.com/auth/androidpublisher',
            aud: 'https://oauth2.googleapis.com/token',
            exp: now + 3600,
            iat: now,
        };

        const encodedHeader = b64UrlEncode(JSON.stringify(header));
        const encodedPayload = b64UrlEncode(JSON.stringify(payload));
        const message = `${encodedHeader}.${encodedPayload}`;

        // 2. Importar private key en formato PKCS8
        const pemContents = serviceAccount.private_key
            .replace('-----BEGIN PRIVATE KEY-----', '')
            .replace('-----END PRIVATE KEY-----', '')
            .replace(/\s/g, '');

        const binaryDer = atob(pemContents);
        const derBytes = new Uint8Array(binaryDer.length);
        for (let i = 0; i < binaryDer.length; i++) {
            derBytes[i] = binaryDer.charCodeAt(i);
        }

        const privateKey = await crypto.subtle.importKey(
            'pkcs8',
            derBytes,
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            false,
            ['sign']
        );

        // 3. Firmar el JWT
        const signature = await crypto.subtle.sign(
            { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
            privateKey,
            new TextEncoder().encode(message)
        );

        const sigBytes = new Uint8Array(signature);
        let sigBinary = '';
        sigBytes.forEach(b => sigBinary += String.fromCharCode(b));
        const encodedSignature = btoa(sigBinary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

        const jwt = `${message}.${encodedSignature}`;

        // 4. Intercambiar JWT por access token
        const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
                assertion: jwt,
            }),
        });

        const tokenData = await tokenRes.json();
        if (!tokenRes.ok) {
            throw new Error(`Google OAuth error: ${tokenData.error} — ${tokenData.error_description || ''}`);
        }

        // 5. Guardar en KV con TTL de 45 minutos (el token dura 1 hora)
        if (env.SPLITGASTO_CACHE) {
            await env.SPLITGASTO_CACHE.put(
                'google_play:access_token',
                tokenData.access_token,
                { expirationTtl: 2700 }
            );
        }

        console.log('[Google Play] Token renovado correctamente');
    } catch (err) {
        console.error('[Google Play] Error renovando token:', err.message);
    }
}

async function getGooglePlayAccessToken(env) {
    // 1. Verificar KV primero
    if (env.SPLITGASTO_CACHE) {
        const cached = await env.SPLITGASTO_CACHE.get('google_play:access_token');
        if (cached) return cached;
    }

    // 2. Si no hay token en KV, renovar on-demand
    await refreshGooglePlayToken(env);

    if (env.SPLITGASTO_CACHE) {
        return await env.SPLITGASTO_CACHE.get('google_play:access_token');
    }

    return null;
}

// ═══════════════════════════════════════════════════════════════════════
// Google Play Billing — Verificación server-side de compras
// ═══════════════════════════════════════════════════════════════════════
async function handleGooglePlayBilling(request, env) {
    const { error: authError, user: authUser } = await requireAuth(request, env);
    if (authError) return authError;

 const accessToken = await getGooglePlayAccessToken(env);
    if (!accessToken) {
        return jsonResponse({ error: 'Google Play Billing no configurado. Verifica GOOGLE_PLAY_SERVICE_ACCOUNT_KEY.' }, 503, request);
    }
    
    try {
        const body = await request.json();
        const { packageName, productId, purchaseToken, subscription = true } = body;

        if (!packageName || !productId || !purchaseToken) {
            return jsonResponse({ error: 'Campos packageName, productId y purchaseToken requeridos' }, 400, request);
        }
        
        const apiUrl = subscription
            ? `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/subscriptions/${productId}/tokens/${purchaseToken}`
            : `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}/purchases/products/${productId}/tokens/${purchaseToken}`;

        const verifyRes = await fetch(apiUrl, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!verifyRes.ok) {
            const errData = await verifyRes.json().catch(() => ({}));
            return jsonResponse({ error: 'Compra no válida en Google Play', detail: errData.error?.message }, 400, request);
        }

        const purchaseData = await verifyRes.json();
        // Validación opcional recomendada por Google
        if (purchaseData.acknowledged !== true) {
            console.log('Compra recibida pero no reconocida aún');
        }

        if (subscription && purchaseData.autoRenewing === false) {
            console.log('El usuario ha desactivado la renovación automática');
        }

        if (purchaseData.purchaseState !== 0) {
            return jsonResponse({ error: 'Compra no completada o cancelada' }, 400, request);
        }

        // Guardar/actualizar suscripción en D1
        const nowMs = Date.now();
        const expiryMs = subscription && purchaseData.expiryTimeMillis
            ? parseInt(purchaseData.expiryTimeMillis, 10)
            : nowMs + (365 * 24 * 60 * 60 * 1000);

        await env.SPLITGASTO_DB.prepare(`
            INSERT INTO user_subscriptions 
            (id, user_id, provider, subscription_id, order_id, status, plan_name, current_period_start, current_period_end)
            VALUES (?, ?, 'google_play', ?, ?, 'active', 'pro', ?, ?)
            ON CONFLICT(subscription_id) DO UPDATE SET
                status = excluded.status,
                current_period_end = excluded.current_period_end,
                updated_at = strftime('%s', 'now') * 1000
        `).bind(
            crypto.randomUUID(),
            authUser.userId,
            purchaseToken,
            purchaseData.orderId || '',
            nowMs,
            expiryMs
        ).run();

        await env.SPLITGASTO_CACHE?.delete(`membership:${authUser.userId}`);

        return jsonResponse({
            success: true,
            message: 'Suscripción Google Play verificada y activada',
            expiryTime: new Date(expiryMs).toISOString(),
        }, 200, request);

    } catch (err) {
        return jsonResponse({ error: 'Error verificando compra', detail: err.message }, 500, request);
    }
}
