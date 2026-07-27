const API_BASE = "http://localhost:3000";

const role = localStorage.getItem("userRole");
const token = localStorage.getItem("authToken");

if (role !== "admin" || !token) {
    alert("Please login as admin");
    window.location.href = "login.html";
}

const state = {
    users: [],
    stores: [],
    warnings: []
};

function authHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };
}

function setMsg(text, type) {
    const msg = document.getElementById("msg");
    if (!msg) return;
    msg.innerText = text || "";
    msg.classList.remove("msg--success", "msg--error");
    if (type === "success") msg.classList.add("msg--success");
    if (type === "error") msg.classList.add("msg--error");
}

async function fetchJson(url, options) {
    const res = await fetch(url, options);
    if (res.status === 401 || res.status === 403) {
        localStorage.clear();
        window.location.href = "login.html";
        return null;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        throw new Error(data?.message || "Server error");
    }
    return data;
}

function money(value) {
    const amount = Number(value) || 0;
    return `Rs ${amount.toFixed(2)}`;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function renderOverview(data) {
    document.getElementById("customerCount").innerText = data.customers || 0;
    document.getElementById("ownerCount").innerText = data.owners || 0;
    document.getElementById("storeCount").innerText = data.stores || 0;
    document.getElementById("orderCount").innerText = data.orders || 0;
    document.getElementById("revenueCount").innerText = money(data.revenue);
    document.getElementById("warningCount").innerText = data.warnings || 0;
}

function renderUsers() {
    const list = document.getElementById("userList");
    const search = String(document.getElementById("userSearch")?.value || "").toLowerCase();
    const roleFilter = document.getElementById("roleFilter")?.value || "all";

    const users = state.users.filter(user => {
        const matchesRole = roleFilter === "all" || user.role === roleFilter;
        const haystack = `${user.name} ${user.email} ${user.role} ${user.store_name || ""}`.toLowerCase();
        return matchesRole && haystack.includes(search);
    });

    if (!users.length) {
        list.innerHTML = "<div class='empty-state'>No users found.</div>";
        return;
    }

    list.innerHTML = "";
    users.forEach(user => {
        const row = document.createElement("article");
        row.className = "admin-user-card";
        row.innerHTML = `
            <div class="admin-user-card__main">
                <span class="role-pill role-pill--${escapeHtml(user.role)}">${escapeHtml(user.role)}</span>
                <h3>${escapeHtml(user.name)}</h3>
                <p>${escapeHtml(user.email)}</p>
                <p class="admin-meta">
                    ${user.role === "owner" ? `Store: ${escapeHtml(user.store_name || "Not created")}` : `Orders: ${Number(user.order_count) || 0}`}
                    | Warnings: ${Number(user.warning_count) || 0}
                </p>
            </div>
            <div class="admin-actions">
                <input type="text" placeholder="Write warning message" aria-label="Warning for ${escapeHtml(user.name)}">
                <button type="button" class="warn-btn">Warn</button>
                <button type="button" class="danger-btn">Remove</button>
            </div>
        `;

        row.querySelector(".warn-btn").onclick = () => {
            const input = row.querySelector("input");
            sendWarning(user.id, input.value);
        };
        row.querySelector(".danger-btn").onclick = () => removeUser(user);
        list.appendChild(row);
    });
}

function renderStores() {
    const list = document.getElementById("storeList");
    if (!state.stores.length) {
        list.innerHTML = "<div class='empty-state'>No stores registered.</div>";
        return;
    }

    list.innerHTML = state.stores.map(store => `
        <div class="compact-item">
            <strong>${escapeHtml(store.store_name)}</strong>
            <span>Owner: ${escapeHtml(store.owner_name)} (${escapeHtml(store.owner_email)})</span>
            <span>${Number(store.product_count) || 0} products | ${Number(store.order_count) || 0} orders</span>
        </div>
    `).join("");
}

function renderWarnings() {
    const list = document.getElementById("warningList");
    if (!state.warnings.length) {
        list.innerHTML = "<div class='empty-state'>No warnings yet.</div>";
        return;
    }

    list.innerHTML = state.warnings.map(warning => `
        <div class="compact-item">
            <strong>${escapeHtml(warning.user_name)} (${escapeHtml(warning.user_role)})</strong>
            <span>${escapeHtml(warning.message)}</span>
            <span>${new Date(warning.created_at).toLocaleString()}</span>
        </div>
    `).join("");
}

async function loadAdminData() {
    setMsg("");
    try {
        const [overview, users, stores, warnings] = await Promise.all([
            fetchJson(`${API_BASE}/admin/overview`, { headers: authHeaders() }),
            fetchJson(`${API_BASE}/admin/users`, { headers: authHeaders() }),
            fetchJson(`${API_BASE}/admin/stores`, { headers: authHeaders() }),
            fetchJson(`${API_BASE}/admin/warnings`, { headers: authHeaders() })
        ]);

        renderOverview(overview || {});
        state.users = users?.users || [];
        state.stores = stores?.stores || [];
        state.warnings = warnings?.warnings || [];
        renderUsers();
        renderStores();
        renderWarnings();
    } catch (e) {
        setMsg(e.message || "Could not load admin data", "error");
    }
}

async function sendWarning(userId, message) {
    const cleanMessage = String(message || "").trim();
    if (!cleanMessage) {
        setMsg("Enter a warning message first", "error");
        return;
    }

    try {
        const data = await fetchJson(`${API_BASE}/admin/users/${userId}/warnings`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ message: cleanMessage })
        });
        setMsg(data.message || "Warning sent", "success");
        await loadAdminData();
    } catch (e) {
        setMsg(e.message || "Could not send warning", "error");
    }
}

async function removeUser(user) {
    const label = `${user.name} (${user.role})`;
    if (!confirm(`Remove ${label}? This also removes related store, order, and address data.`)) return;

    try {
        const data = await fetchJson(`${API_BASE}/admin/users/${user.id}`, {
            method: "DELETE",
            headers: authHeaders()
        });
        setMsg(data.message || "User removed", "success");
        await loadAdminData();
    } catch (e) {
        setMsg(e.message || "Could not remove user", "error");
    }
}

async function logout() {
    try {
        await fetch(`${API_BASE}/auth/logout`, {
            method: "POST",
            headers: authHeaders()
        });
    } catch {
        // ignore
    }
    localStorage.clear();
    window.location.href = "login.html";
}

loadAdminData();
