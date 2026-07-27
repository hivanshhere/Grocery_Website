const API_BASE = "http://localhost:3000";

const role = localStorage.getItem("userRole");
const token = localStorage.getItem("authToken");

if (role !== "owner" || !token) {
    alert("Please login as a store owner");
    window.location.href = "login.html";
}

const msgEl = document.getElementById("msg");
const storeDisplayNameEl = document.getElementById("storeDisplayName");
const storeDisplayIdEl = document.getElementById("storeDisplayId");
const createStoreSectionEl = document.getElementById("createStoreSection");
const editStoreSectionEl = document.getElementById("editStoreSection");
const editStoreNameInput = document.getElementById("editStoreName");
const addProductBtn = document.getElementById("addProductBtn");
const ownerProductListEl = document.getElementById("ownerProductList");

/* NEW: delivery inputs */
const deliveryAvailableEl = document.getElementById("deliveryAvailable");
const deliveryChargeEl = document.getElementById("deliveryCharge");
const minOrderEl = document.getElementById("minOrder");
const pickupAvailableEl = document.getElementById("pickupAvailable");

let currentStore = null;

function setMsg(text) {
    if (msgEl) msgEl.innerText = text || "";
}

function authHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };
}

async function fetchJson(url, options) {
    const res = await fetch(url, options);
    if (res.status === 401) {
        localStorage.clear();
        window.location.href = "login.html";
        return null;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok) {
        const msg = data && data.message ? data.message : "Server error";
        throw new Error(msg);
    }
    return data;
}

function setStoreUi(store) {
    if (!store) {
        storeDisplayNameEl.innerText = "Not created";
        storeDisplayIdEl.innerText = "—";
        createStoreSectionEl.style.display = "block";
        if (editStoreSectionEl) editStoreSectionEl.style.display = "none";
        addProductBtn.disabled = true;
        addProductBtn.style.opacity = "0.6";
        ownerProductListEl.innerHTML = "";
        return;
    }

    storeDisplayNameEl.innerText = store.store_name;
    storeDisplayIdEl.innerText = store.id;
    createStoreSectionEl.style.display = "none";
    if (editStoreSectionEl) editStoreSectionEl.style.display = "block";
    if (editStoreNameInput) editStoreNameInput.value = store.store_name;
    addProductBtn.disabled = false;
    addProductBtn.style.opacity = "1";

    localStorage.setItem("storeId", String(store.id));
    localStorage.setItem("storeName", String(store.store_name));

    /* NEW: load delivery settings into UI */
    if (deliveryAvailableEl) deliveryAvailableEl.checked = !!store.delivery_available;
    if (deliveryChargeEl) deliveryChargeEl.value = store.delivery_charge || 0;
    if (minOrderEl) minOrderEl.value = store.min_order_free_delivery || 0;
    if (pickupAvailableEl) pickupAvailableEl.checked = !!store.pickup_available;
}

async function updateStoreName() {
    if (!currentStore) {
        setMsg("Create your store first");
        return;
    }

    const store_name = (editStoreNameInput?.value || "").trim();
    if (!store_name) {
        setMsg("Enter store name");
        return;
    }

    try {
        const data = await fetchJson(`${API_BASE}/owner/store`, {
            method: "PATCH",
            headers: authHeaders(),
            body: JSON.stringify({ store_name })
        });

        currentStore = data.store;
        setStoreUi(currentStore);
        setMsg(data.message);
    } catch (e) {
        setMsg(e.message);
    }
}

async function loadStoreAndProducts() {
    setMsg("");
    try {
        const store = await fetchJson(`${API_BASE}/owner/store`, {
            method: "GET",
            headers: authHeaders()
        });
        currentStore = store;
        setStoreUi(store);

        if (!store) return;

        const data = await fetchJson(`${API_BASE}/owner/products`, {
            method: "GET",
            headers: authHeaders()
        });
        renderProducts(data.products || []);
    } catch (e) {
        setMsg(e.message);
    }
}

function renderProducts(products) {
    if (!ownerProductListEl) return;

    if (!products || products.length === 0) {
        ownerProductListEl.innerHTML = "<div class='store-card'><h3>No products yet</h3><p>Add your first product above.</p></div>";
        return;
    }

    ownerProductListEl.innerHTML = "";
    products.forEach(p => {
        const quantity = (p.quantity === undefined || p.quantity === null || p.quantity === "") ? 1 : p.quantity;
        const unit = p.unit || "piece";
        const priceNum = Number(p.price);
        const priceText = Number.isFinite(priceNum) ? priceNum.toFixed(2) : String(p.price ?? "");

        const div = document.createElement("div");
        div.className = "store-card";
        div.innerHTML = `
            <h3>${p.name}</h3>
            <p>Price: ₹${priceText} / ${quantity} ${unit}</p>
            <button type="button">Remove</button>
        `;
        div.querySelector("button").onclick = () => removeProduct(p.id);
        ownerProductListEl.appendChild(div);
    });
}

async function createStore() {
    const store_name = document.getElementById("storeName").value.trim();
    if (!store_name) {
        setMsg("Enter store name");
        return;
    }

    try {
        const data = await fetchJson(`${API_BASE}/owner/store`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ store_name })
        });
        currentStore = data.store;
        setStoreUi(currentStore);
        setMsg(data.message);
        await loadStoreAndProducts();
    } catch (e) {
        setMsg(e.message);
    }
}

/* NEW FUNCTION */
async function saveDeliverySettings() {
    if (!currentStore) {
        setMsg("Create your store first");
        return;
    }

    const data = {
        delivery_available: deliveryAvailableEl.checked,
        delivery_charge: Number(deliveryChargeEl.value) || 0,
        min_order: Number(minOrderEl.value) || 0,
        pickup_available: pickupAvailableEl.checked
    };

    try {
        const res = await fetchJson(`${API_BASE}/api/store/delivery-settings`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(data)
        });

        setMsg(res.message || "Settings saved");
        await loadStoreAndProducts(); // refresh
    } catch (e) {
        setMsg(e.message);
    }
}

async function addProduct() {
    if (!currentStore) {
        setMsg("Create your store first");
        return;
    }

    const name = document.getElementById("pname").value.trim();
    const priceRaw = document.getElementById("pprice").value;
    const quantityRaw = document.getElementById("pquantity").value;
    const unit = document.getElementById("punit").value;

    const price = Number(priceRaw);
    const quantity = Number(quantityRaw);

    if (!name || !Number.isFinite(price) || price < 0 || !Number.isFinite(quantity) || quantity <= 0 || !unit) {
        setMsg("Enter product name, valid price, quantity and unit");
        return;
    }

    try {
        const data = await fetchJson(`${API_BASE}/owner/products`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ name, price, quantity, unit })
        });
        setMsg(data.message);
        document.getElementById("pname").value = "";
        document.getElementById("pprice").value = "";
        document.getElementById("pquantity").value = "";
        document.getElementById("punit").value = "kg";
        await loadStoreAndProducts();
    } catch (e) {
        setMsg(e.message);
    }
}

async function removeProduct(productId) {
    if (!currentStore) return;
    try {
        const data = await fetchJson(`${API_BASE}/owner/products/${productId}`, {
            method: "DELETE",
            headers: authHeaders()
        });
        setMsg(data.message);
        await loadStoreAndProducts();
    } catch (e) {
        setMsg(e.message);
    }
}

async function logout() {
    try {
        await fetch(`${API_BASE}/auth/logout`, {
            method: "POST",
            headers: authHeaders()
        });
    } catch (e) {}

    localStorage.clear();
    window.location.href = "login.html";
}

loadStoreAndProducts();     