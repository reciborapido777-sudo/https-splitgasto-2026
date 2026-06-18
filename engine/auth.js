/**
 * SplitGasto 2026 — Módulo de Autenticación
 * JWT con Web Crypto API — sin dependencias externas
 */
const SGAuth = (function(){
    const TOKEN_KEY = 'sg_token';
    const USER_KEY = 'sg_user';

    function getToken() {
        try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
    }

    function getUser() {
        try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
    }

    function setSession(token, user) {
        try {
            localStorage.setItem(TOKEN_KEY, token);
            localStorage.setItem(USER_KEY, JSON.stringify(user));
        } catch (e) {
            console.error('[SGAuth] Error guardando sesión:', e);
        }
    }

    function logout() {
        try {
            localStorage.removeItem(TOKEN_KEY);
            localStorage.removeItem(USER_KEY);
        } catch {}
        if(window.SGRouter) SGRouter.navigate('auth-login');
    }

    function isLoggedIn() {
        const token = getToken();
        if(!token) return false;
        try {
            let payload = token.split('.')[1];
            payload = payload.replace(/-/g, '+').replace(/_/g, '/');
            const pad = payload.length % 4;
            if (pad) payload += '='.repeat(4 - pad);
            const decoded = JSON.parse(atob(payload));
            return decoded.exp > Date.now() / 1000;
        } catch { return false; }
    }
  
    function getUserId() {
        const user = getUser();
        return user ? user.id : null;
    }

    async function register(name, email, password) {
        try {
            const normalizedEmail = email.toLowerCase().trim();
            const res = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, email: normalizedEmail, password })
            });
            const data = await res.json();
            if(data.success && data.token && data.user) {
                setSession(data.token, data.user);
            }
            return data;
        } catch (err) {
            return { success: false, error: 'Error de conexión' };
        }
    }

    async function login(email, password) {
        try {
            const normalizedEmail = email.toLowerCase().trim();
            const res = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: normalizedEmail, password })
            });
            const data = await res.json();
            if(data.success && data.token && data.user) {
                setSession(data.token, data.user);
            }
            return data;
        } catch (err) {
            return { success: false, error: 'Error de conexión' };
        }
    }

    async function joinGroup(groupId) {
        if (!groupId) return { success: false, error: 'groupId requerido' };
        const token = getToken();
        if (!token) return { success: false, error: 'No autenticado' };

        try {
            const res = await fetch('/api/db/join-group', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ groupId })
            });
            return await res.json();
        } catch (err) {
            return { success: false, error: 'Error de conexión' };
        }
    }

    async function registerAndJoin(name, email, password, groupId) {
        const reg = await register(name, email, password);
        if (!reg.success) return reg;
        if (groupId) {
            const join = await joinGroup(groupId);
            if (!join.success) {
                return { ...reg, joinWarning: join.error || 'No se pudo unir al grupo' };
            }
            return { ...reg, joinedGroup: groupId };
        }
        return reg;
    }

    return {
        getToken, getUser, setSession, logout,
        isLoggedIn, getUserId,
        register, login,
        joinGroup,
        registerAndJoin
    };
})();

// CRÍTICO: Exponer a window para que el HTML inline y la consela puedan acceder
window.SGAuth = SGAuth;
