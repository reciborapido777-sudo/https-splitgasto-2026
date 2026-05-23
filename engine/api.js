/**
 * SplitGasto 2026 — Cliente API centralizado
 * Todas las llamadas al backend pasan por aquí
 */
const SGApi = (function(){

    async function request(endpoint, options = {}) {
        const token = SGAuth.getToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...options.headers
        };

        try {
            const res = await fetch(endpoint, { ...options, headers });
            if(res.status === 401) {
                SGAuth.logout();
                return { success: false, error: 'Sesión expirada' };
            }
            return await res.json();
        } catch(err) {
            return { success: false, error: 'Error de conexión' };
        }
    }

    // ── Auth ──────────────────────────────────────────────────────────
    // register() eliminado — usar SGAuth.register() que además guarda la sesión

    async function login(email, password) {
        return request('/api/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
    }

    // ── Grupos ────────────────────────────────────────────────────────
    async function getGroups() {
        const userId = SGAuth.getUserId();
        return request(`/api/db/groups?userId=${userId}`);
    }

    async function createGroup(name, currency, members) {
        const userId = SGAuth.getUserId();
        return request('/api/db/groups', {
            method: 'POST',
            body: JSON.stringify({
                name,
                currency: currency || 'EUR',
                userId,
                members: Array.isArray(members) ? members : []
            })
        });
    }

    async function getUserByEmail(email) {
        return request(`/api/db/users?email=${encodeURIComponent(email)}`);
    }

    async function deleteGroup(groupId) {
        return request(`/api/db/groups/${groupId}`, { method: 'DELETE' });
    }

    async function removeGroupMember(groupId, memberUserId) {
        return request(`/api/db/group-members/${groupId}/${memberUserId}`, { method: 'DELETE' });
    }

    async function getGroupMembers(groupId) {
        return request(`/api/db/group-members?groupId=${groupId}`);
    }

    async function addGroupMember(groupId, memberUserId, role) {
        return request('/api/db/group-members', {
            method: 'POST',
            body: JSON.stringify({ groupId, userId: memberUserId, role: role || 'member' })
        });
    }

    // ── Gastos ────────────────────────────────────────────────────────
    async function getExpenses(groupId) {
        return request(`/api/db/expenses?groupId=${groupId}`);
    }

    async function addExpense(groupId, amount, currency, category, description, splitType, payerId) {
        const userId = SGAuth.getUserId();
        // payerId es el UUID del pagador real; si no se pasa, usa el usuario actual
        const paidBy = payerId || userId;
        return request('/api/db/expenses', {
            method: 'POST',
            body: JSON.stringify({ groupId, userId, paidBy, amount, currency, category, description, splitType })
        });
    }

    async function deleteExpense(expenseId) {
        return request(`/api/db/expenses/${expenseId}`, { method: 'DELETE' });
    }

    // ── Saldos / Balances ─────────────────────────────────────────────
    async function getBalances(groupId) {
        return request(`/api/db/balances?groupId=${groupId}`);
    }

    // ── Liquidaciones ─────────────────────────────────────────────────
    async function getSettlements(groupId) {
        return request(`/api/db/settlements?groupId=${groupId}`);
    }

    async function createSettlement(groupId, fromUserId, toUserId, amount, currency) {
        return request('/api/db/settlements', {
            method: 'POST',
            body: JSON.stringify({ groupId, fromUserId, toUserId, amount, currency })
        });
    }

    // ── Perfil ────────────────────────────────────────────────────────
    async function getProfile() {
        const userId = SGAuth.getUserId();
        return request(`/api/db/profile?userId=${userId}`);
    }

    async function updateProfile(name, email, avatar) {
        const userId = SGAuth.getUserId();
        return request('/api/db/profile', {
            method: 'POST',
            body: JSON.stringify({ userId, name, email, avatar })
        });
    }

    // ── Notificaciones ────────────────────────────────────────────────
    async function getNotifications() {
        const userId = SGAuth.getUserId();
        return request(`/api/db/notifications?userId=${userId}`);
    }

    async function markNotificationsRead() {
        const userId = SGAuth.getUserId();
        return request('/api/db/notifications/read', {
            method: 'POST',
            body: JSON.stringify({ userId })
        });
    }



    // ── Storage (R2) ──────────────────────────────────────────────────
    async function uploadFile(file, folder) {
        const userId = SGAuth.getUserId();
        const formData = new FormData();
        formData.append('file', file);
        formData.append('userId', userId);
        formData.append('folder', folder || 'receipts');

        const token = SGAuth.getToken();
        const res = await fetch('/api/storage/upload', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${token}` },
            body: formData
        });
        return res.json();
    }

    async function getSignedUrl(key) {
        return request(`/api/storage/signed-url/${encodeURIComponent(key)}`);
    }

    async function listFiles(folder) {
        const userId = SGAuth.getUserId();
        return request(`/api/storage/list?userId=${userId}&folder=${folder || ''}`);
    }

    async function deleteFile(key) {
        return request(`/api/storage/delete/${encodeURIComponent(key)}`, {
            method: 'DELETE'
        });
    }

    // ── AI ────────────────────────────────────────────────────────────
    async function aiChat(message) {
        return request('/api/ai/chat', {
            method: 'POST',
            body: JSON.stringify({ message })
        });
    }

    async function aiClassify(expense) {
        return request('/api/ai/classify', {
            method: 'POST',
            body: JSON.stringify({ expense })
        });
    }

    async function aiScanTicket(imageBase64) {
        return request('/api/ai/scan-ticket', {
            method: 'POST',
            body: JSON.stringify({ image: imageBase64 })
        });
    }

    async function aiSummary(data) {
        return request('/api/ai/summary', {
            method: 'POST',
            body: JSON.stringify({ data })
        });
    }

    // ── Health ────────────────────────────────────────────────────────
    async function health() {
        return request('/api/health');
    }

    // ── Miembros por email ────────────────────────────────────────────
    async function addGroupMemberByEmail(groupId, email, role) {
        return request('/api/db/group-members', {
            method: 'POST',
            body: JSON.stringify({ groupId, email, role: role || 'member' })
        });
    }

    return {
        login,
        getGroups, createGroup, deleteGroup, getGroupMembers, addGroupMember, addGroupMemberByEmail, removeGroupMember, getUserByEmail,
        getExpenses, addExpense, deleteExpense,
        getBalances,
        getSettlements, createSettlement,
        getProfile, updateProfile,
        getNotifications, markNotificationsRead,
        uploadFile, getSignedUrl, listFiles, deleteFile,
        aiChat, aiClassify, aiScanTicket, aiSummary,
        health
    };


    })();
