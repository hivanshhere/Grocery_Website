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
const productImageInput = document.getElementById("pimage");
const productImagePreview = document.getElementById("pimagePreview");

/* Delivery settings inputs */
const deliveryAvailableEl = document.getElementById("deliveryAvailable");
const deliveryChargeEl = document.getElementById("deliveryCharge");
const minOrderEl = document.getElementById("minOrder");
const pickupAvailableEl = document.getElementById("pickupAvailable");

/* Slot manager inputs */
const slotTimeInputEl = document.getElementById("slotTimeInput");
const slotListEl = document.getElementById("slotList");

let currentStore = null;

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function setMsg(text) {
    if (!msgEl) return;
    msgEl.innerText = text || "";
    msgEl.classList.remove("msg--success", "msg--error");
}

function setMsgSuccess(text) {
    if (!msgEl) return;
    msgEl.innerText = text || "";
    msgEl.classList.remove("msg--error");
    msgEl.classList.add("msg--success");
}

function setMsgError(text) {
    if (!msgEl) return;
    msgEl.innerText = text || "";
    msgEl.classList.remove("msg--success");
    msgEl.classList.add("msg--error");
}

function authHeaders() {
    return {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`
    };
}

function readProductImage() {
    const file = productImageInput?.files?.[0];
    if (!file) return Promise.resolve("");

    const allowedTypes = ["image/png", "image/jpeg", "image/webp", "image/gif"];
    if (!allowedTypes.includes(file.type)) {
        return Promise.reject(new Error("Choose a PNG, JPG, WEBP, or GIF image"));
    }
    if (file.size > 5 * 1024 * 1024) {
        return Promise.reject(new Error("Product image must be under 5 MB"));
    }

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ""));
        reader.onerror = () => reject(new Error("Could not read product image"));
        reader.readAsDataURL(file);
    });
}

function updateProductImagePreview() {
    const file = productImageInput?.files?.[0];
    if (!productImagePreview) return;

    if (!file) {
        productImagePreview.removeAttribute("src");
        productImagePreview.style.display = "none";
        return;
    }

    readProductImage()
        .then((imageUrl) => {
            productImagePreview.src = imageUrl;
            productImagePreview.style.display = "block";
            setMsg("");
        })
        .catch((e) => {
            productImageInput.value = "";
            productImagePreview.removeAttribute("src");
            productImagePreview.style.display = "none";
            setMsgError(e.message);
        });
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
        if (slotListEl) slotListEl.innerHTML = "";
        return;
    }

    storeDisplayNameEl.innerText = String(store.store_name || "").toUpperCase();
    storeDisplayIdEl.innerText = store.id;
    createStoreSectionEl.style.display = "none";
    if (editStoreSectionEl) editStoreSectionEl.style.display = "block";
    if (editStoreNameInput) editStoreNameInput.value = String(store.store_name || "").toUpperCase();
    addProductBtn.disabled = false;
    addProductBtn.style.opacity = "1";

    localStorage.setItem("storeId", String(store.id));
    localStorage.setItem("storeName", String(store.store_name || "").toUpperCase());

    // Load delivery settings into UI
    if (deliveryAvailableEl) deliveryAvailableEl.checked = !!store.delivery_available;
    if (deliveryChargeEl) deliveryChargeEl.value = store.delivery_charge ?? 0;
    if (minOrderEl) minOrderEl.value = store.min_order_free_delivery ?? 0;
    if (pickupAvailableEl) pickupAvailableEl.checked = !!store.pickup_available;
}

async function updateStoreName() {
    if (!currentStore) {
        setMsg("Create your store first");
        return;
    }

    const store_name = (editStoreNameInput?.value || "").trim().toUpperCase();
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
        setMsgSuccess(data.message);
    } catch (e) {
        setMsgError(e.message);
    }
}

async function loadStoreAndProducts(options) {
    const preserveMsg = !!options?.preserveMsg;
    if (!preserveMsg) setMsg("");
    try {
        const store = await fetchJson(`${API_BASE}/owner/store`, {
            method: "GET",
            headers: authHeaders()
        });
        currentStore = store;
        setStoreUi(store);

        if (!store) return;

        await loadTimeSlots();

        const data = await fetchJson(`${API_BASE}/owner/products`, {
            method: "GET",
            headers: authHeaders()
        });
        renderProducts(data.products || []);
    } catch (e) {
        setMsgError(e.message);
    }
}

function renderTimeSlots(slots) {
    if (!slotListEl) return;

    if (!slots || slots.length === 0) {
        slotListEl.innerHTML = "<div class='help-text'>No pickup slots yet. Add at least one slot so customers can choose pickup time.</div>";
        return;
    }

    slotListEl.innerHTML = "";
    slots.forEach(s => {
        const row = document.createElement("div");
        row.className = "slot-row";
        row.innerHTML = `
            <div class="slot-row__time">${s.slot_time}</div>
            <button type="button" class="slot-row__btn">Remove</button>
        `;
        row.querySelector("button").onclick = () => removeTimeSlot(s.id);
        slotListEl.appendChild(row);
    });
}

async function loadTimeSlots() {
    if (!slotListEl) return;
    if (!currentStore) {
        slotListEl.innerHTML = "";
        return;
    }

    try {
        const data = await fetchJson(`${API_BASE}/owner/slots`, {
            method: "GET",
            headers: authHeaders()
        });
        renderTimeSlots(data.slots || []);
    } catch (e) {
        // keep page usable even if slots fail
        slotListEl.innerHTML = "<div class='help-text'>Could not load slots.</div>";
    }
}

async function addTimeSlot() {
    if (!currentStore) {
        setMsgError("Create your store first");
        return;
    }

    const slot_time = (slotTimeInputEl?.value || "").trim();
    if (!slot_time) {
        setMsgError("Enter a slot time");
        return;
    }

    try {
        const data = await fetchJson(`${API_BASE}/owner/slots`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ slot_time })
        });
        if (slotTimeInputEl) slotTimeInputEl.value = "";
        setMsgSuccess(data.message || "Slot added");
        await loadTimeSlots();
    } catch (e) {
        setMsgError(e.message);
    }
}

async function removeTimeSlot(slotId) {
    if (!currentStore) return;
    try {
        const data = await fetchJson(`${API_BASE}/owner/slots/${slotId}`, {
            method: "DELETE",
            headers: authHeaders()
        });
        setMsgSuccess(data.message || "Slot removed");
        await loadTimeSlots();
    } catch (e) {
        setMsgError(e.message);
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
        div.className = "store-card owner-product-card";
        const imageMarkup = p.image_url
            ? `<img class="product-card__image" src="${escapeHtml(p.image_url)}" alt="${escapeHtml(p.name)}">`
            : `<div class="product-card__image product-card__image--empty" aria-hidden="true">No image</div>`;
        div.innerHTML = `
            ${imageMarkup}
            <h3>${escapeHtml(p.name)}</h3>
            <p>Price: ₹${priceText} / ${quantity} ${unit}</p>
            <button type="button">Remove</button>
        `;
        div.querySelector("button").onclick = () => removeProduct(p.id);
        ownerProductListEl.appendChild(div);
    });
}

async function createStore() {
    const store_name = document.getElementById("storeName").value.trim().toUpperCase();
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
        setMsgSuccess(data.message);
        await loadStoreAndProducts({ preserveMsg: true });
    } catch (e) {
        setMsgError(e.message);
    }
}

function bindUppercaseInput(inputEl) {
    if (!inputEl) return;
    inputEl.addEventListener("input", () => {
        const start = inputEl.selectionStart;
        const end = inputEl.selectionEnd;
        const next = String(inputEl.value || "").toUpperCase();
        if (inputEl.value !== next) inputEl.value = next;
        if (typeof start === "number" && typeof end === "number") {
            inputEl.setSelectionRange(start, end);
        }
    });
}

// Auto-uppercase store name fields (create + edit)
try {
    bindUppercaseInput(document.getElementById("storeName"));
    bindUppercaseInput(document.getElementById("editStoreName"));
} catch {
    // ignore
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
        const image_url = await readProductImage();
        const data = await fetchJson(`${API_BASE}/owner/products`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify({ name, price, quantity, unit, image_url })
        });
        setMsgSuccess(data.message);
        document.getElementById("pname").value = "";
        document.getElementById("pprice").value = "";
        document.getElementById("pquantity").value = "";
        document.getElementById("punit").value = "kg";
        if (productImageInput) productImageInput.value = "";
        if (productImagePreview) {
            productImagePreview.removeAttribute("src");
            productImagePreview.style.display = "none";
        }
        await loadStoreAndProducts({ preserveMsg: true });
    } catch (e) {
        setMsgError(e.message);
    }
}

async function saveDeliverySettings() {
    if (!currentStore) {
        setMsgError("Create your store first");
        return;
    }

    const payload = {
        delivery_available: !!deliveryAvailableEl?.checked,
        delivery_charge: Number(deliveryChargeEl?.value) || 0,
        min_order: Number(minOrderEl?.value) || 0,
        pickup_available: !!pickupAvailableEl?.checked
    };

    try {
        const res = await fetchJson(`${API_BASE}/api/store/delivery-settings`, {
            method: "POST",
            headers: authHeaders(),
            body: JSON.stringify(payload)
        });

        setMsgSuccess((res.message || "Settings saved") + ". Customers will see delivery/pickup info." );
        await loadStoreAndProducts({ preserveMsg: true });
    } catch (e) {
        setMsgError(e.message);
    }
}

async function removeProduct(productId) {
    if (!currentStore) return;
    try {
        const data = await fetchJson(`${API_BASE}/owner/products/${productId}`, {
            method: "DELETE",
            headers: authHeaders()
        });
        setMsgSuccess(data.message);
        await loadStoreAndProducts({ preserveMsg: true });
    } catch (e) {
        setMsgError(e.message);
    }
}

async function logout() {
    try {
        await fetch(`${API_BASE}/auth/logout`, {
            method: "POST",
            headers: authHeaders()
        });
    } catch (e) {
        // ignore
    }

    localStorage.clear();
    window.location.href = "login.html";
}

if (productImageInput) productImageInput.addEventListener("change", updateProductImagePreview);
loadStoreAndProducts();
