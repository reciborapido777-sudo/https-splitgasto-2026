/**
 * SplitGasto 2026 — Cliente API centralizado
 * Todas las llamadas al backend pasan por aquí
 */
const SGApi = (function(){

    function getRawToken() {
        try {
            if (window.SGAuth && SGAuth.getToken) {
                const t = SGAuth.getToken();
                if (t) return t;
            }
        } catch (e) {}
        try { return localStorage.getItem('sg_token'); } catch (e) { return null; }
    }

    /* ─── Función Auxiliar de Moneda por Defecto ─── */
    function getDefaultCurrency() {
        return localStorage.getItem('sg_currency') || 'EUR';
    }

    async function request(endpoint, options = {}) {
        const token = getRawToken();
        const headers = {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            ...options.headers
        };

        try {
            const res = await fetch(endpoint, { ...options, headers, cache: 'no-store' });

            if(res.status === 401) {
                try { if (window.SGAuth && SGAuth.logout) SGAuth.logout(); } catch (e) {}
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
            body: JSON.stringify({ email: email.toLowerCase().trim(), password })
        });
    }

    async function addGroupMemberByEmail(groupId, email, role) {
        return request('/api/db/group-members', {
            method: 'POST',
            body: JSON.stringify({ groupId, email: email.toLowerCase().trim(), role: role || 'member' })
        });
    }

    // ── Grupos ────────────────────────────────────────────────────────
    async function getGroups() {
        return request('/api/db/groups');
    }

    async function createGroup(name, currency, members) {
        return request('/api/db/groups', {
            method: 'POST',
            body: JSON.stringify({
                name,
                currency: currency || getDefaultCurrency(),  // ← Modificación Alpha Inyectada
                members: Array.isArray(members) ? members : []
            })
        });
    }

    async function getUserByEmail(email) {
        return request(`/api/db/users?email=${encodeURIComponent(email.toLowerCase().trim())}`);
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

    async function addExpense(groupId, amount, currency, category, description, splitType, payerId, splitDetails) {
        const userId = SGAuth.getUserId();
        const body = { 
            groupId, 
            amount, 
            currency: currency || getDefaultCurrency(),
            category, 
            description, 
            splitType,
            paidBy: payerId || userId
        };
        if (splitDetails && Array.isArray(splitDetails) && splitDetails.length > 0) {
            body.splits = splitDetails.map(d => ({
                userId: d.userId,
                shareAmount: d.value
            }));
        }
        return request('/api/db/expenses', {
            method: 'POST',
            body: JSON.stringify(body)
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
        body: JSON.stringify({ 
            groupId, 
            fromUserId, 
            toUserId, 
            amount, 
            currency: currency || getDefaultCurrency()  // ← añadir
        })
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
        const token = getRawToken();
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder', folder || 'receipts');

        try {
            const res = await fetch('/api/storage/upload', {
                method: 'POST',
                headers: { ...(token ? { 'Authorization': `Bearer ${token}` } : {}) },
                body: formData,
                cache: 'no-store'
            });

            if (res.status === 401) {
                try { if (window.SGAuth && SGAuth.logout) SGAuth.logout(); } catch (e) {}
                return { success: false, error: 'Sesión expirada' };
            }
            return await res.json();
        } catch (err) {
            return { success: false, error: 'Error de conexión' };
        }
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

    async function createStripeCheckout(successUrl, cancelUrl) {
        return request('/api/payments/checkout', {
            method: 'POST',
            body: JSON.stringify({ successUrl, cancelUrl })
        });
    }

    async function createStripePortal(returnUrl) {
        return request('/api/payments/portal', {
            method: 'POST',
            body: JSON.stringify({ returnUrl })
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
        health,
        createStripeCheckout,
        createStripePortal
    };

})();
