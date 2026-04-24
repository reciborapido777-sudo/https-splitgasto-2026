/**
 * SplitGasto 2026 — Módulo de Autenticación
 * JWT con Web Crypto API — sin dependencias externas
 */
const SGAuth = (function(){
    const TOKEN_KEY = 'sg_token';
    const USER_KEY = 'sg_user';

    function getToken() {
        return localStorage.getItem(TOKEN_KEY);
    }

    function getUser() {
        try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; }
    }

    function setSession(token, user) {
        localStorage.setItem(TOKEN_KEY, token);
        localStorage.setItem(USER_KEY, JSON.stringify(user));
    }

    function logout() {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
        if(window.SGRouter) SGRouter.navigate('auth-login');
    }

    function isLoggedIn() {
        const token = getToken();
        if(!token) return false;
        try {
            const payload = JSON.parse(atob(token.split('.')[1]));
            return payload.exp > Date.now() / 1000;
        } catch { return false; }
    }

    function getUserId() {
        const user = getUser();
        return user ? user.id : null;
    }

    async function register(name, email, password) {
        const res = await fetch('/api/auth/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, email, password })
        });
        const data = await res.json();
        if(data.success) {
            setSession(data.token, data.user);
        }
        return data;
    }

    async function login(email, password) {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password })
        });
        const data = await res.json();
        if(data.success) {
            setSession(data.token, data.user);
        }
        return data;
    }

    return {
        getToken, getUser, setSession, logout,
        isLoggedIn, getUserId, register, login
    };
})();
