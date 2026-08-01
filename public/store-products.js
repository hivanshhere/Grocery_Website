// storeId localStorage se lena
const storeId = localStorage.getItem("storeId");

if (!storeId) {
    alert("No store selected");
    window.location.href = "stores.html";
}

const container = document.getElementById("productList");

const storeInfoNameEl = document.getElementById("storeInfoName");
const storeInfoDeliveryEl = document.getElementById("storeInfoDelivery");
const storeInfoPickupEl = document.getElementById("storeInfoPickup");
const storeInfoFeeEl = document.getElementById("storeInfoFee");

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getCartData() {
    return JSON.parse(localStorage.getItem("storeCarts")) || {};
}

function saveCartData(carts) {
    localStorage.setItem("storeCarts", JSON.stringify(carts));
}

function buildPriceText(price, quantity, unit) {
    return `₹${price} / ${quantity} ${unit}`;
}

function buildItemKey(name, priceText) {
    return `${name}||${priceText}`;
}

function getQtyInCart(itemKey) {
    const carts = getCartData();
    const storeCart = carts[storeId];
    const items = storeCart && storeCart.items;
    if (!items || typeof items !== "object") return 0;
    const it = items[itemKey];
    return it ? (Number(it.qty) || 0) : 0;
}

function setQtyInCart(itemKey, itemPayload, nextQty) {
    const carts = getCartData();
    const storeName = localStorage.getItem("storeName") || `Store ${storeId}`;

    if (!carts[storeId] || typeof carts[storeId] !== "object") {
        carts[storeId] = { storeName, items: {} };
    }
    if (!carts[storeId].items || typeof carts[storeId].items !== "object") {
        carts[storeId].items = {};
    }

    const items = carts[storeId].items;

    if (nextQty <= 0) {
        delete items[itemKey];
        if (Object.keys(items).length === 0) {
            delete carts[storeId];
        }
        saveCartData(carts);
        return;
    }

    if (!items[itemKey]) {
        items[itemKey] = { ...itemPayload, qty: 0 };
    }

    items[itemKey].qty = nextQty;
    saveCartData(carts);
}

function updateStepperUi(stepperEl, itemKey) {
    const qty = getQtyInCart(itemKey);
    const decBtn = stepperEl.querySelector("[data-action='dec']");
    const qtyEl = stepperEl.querySelector(".qty-value");

    const card = stepperEl.closest(".store-card");
    const addBtn = card ? card.querySelector(".add-to-cart-btn") : null;

    if (qtyEl) qtyEl.innerText = String(qty);
    if (decBtn) decBtn.disabled = qty <= 0;

    // Toggle: show Add-to-Cart when qty is 0, else show stepper
    if (qty <= 0) {
        if (stepperEl) stepperEl.style.display = "none";
        if (addBtn) addBtn.style.display = "inline-block";
    } else {
        if (stepperEl) stepperEl.style.display = "inline-flex";
        if (addBtn) addBtn.style.display = "none";
    }
}

function createProductCard(product) {
    const name = product.name;
    const quantity = product.quantity || 1;
    const unit = product.unit || "piece";
    const priceText = buildPriceText(product.price, quantity, unit);
    const itemKey = buildItemKey(name, priceText);

    const div = document.createElement("div");
    div.classList.add("store-card", "store-card--product");
    const imageMarkup = product.image_url
        ? `<img class="product-card__image" src="${escapeHtml(product.image_url)}" alt="${escapeHtml(name)}">`
        : `<div class="product-card__image product-card__image--empty" aria-hidden="true">No image</div>`;

    div.innerHTML = `
        ${imageMarkup}
        <div class="product-card__top">
            <h3 class="product-card__name">${escapeHtml(name)}</h3>
            <p class="product-card__price">${escapeHtml(priceText)}</p>
        </div>

        <div class="product-card__actions">
            <button type="button" class="add-to-cart-btn">Add to Cart</button>
            <div class="qty-stepper" aria-label="Quantity controls">
                <button type="button" class="qty-btn" data-action="dec" aria-label="Decrease">−</button>
                <span class="qty-value" aria-live="polite">0</span>
                <button type="button" class="qty-btn" data-action="inc" aria-label="Increase">+</button>
            </div>
        </div>
    `;

    const stepper = div.querySelector(".qty-stepper");
    const addBtn = div.querySelector(".add-to-cart-btn");
    const incBtn = div.querySelector("[data-action='inc']");
    const decBtn = div.querySelector("[data-action='dec']");

    const payload = {
        name,
        price: priceText,
        quantity,
        unit,
        image_url: product.image_url || ""
    };

    if (incBtn) {
        incBtn.onclick = () => {
            const current = getQtyInCart(itemKey);
            setQtyInCart(itemKey, payload, current + 1);
            updateStepperUi(stepper, itemKey);
        };
    }

    if (addBtn) {
        addBtn.onclick = () => {
            const current = getQtyInCart(itemKey);
            // First add: go to 1
            setQtyInCart(itemKey, payload, Math.max(1, current + 1));
            updateStepperUi(stepper, itemKey);
        };
    }

    if (decBtn) {
        decBtn.onclick = () => {
            const current = getQtyInCart(itemKey);
            setQtyInCart(itemKey, payload, current - 1);
            updateStepperUi(stepper, itemKey);
        };
    }

    updateStepperUi(stepper, itemKey);
    return div;
}

function renderProducts(data) {
    if (!container) return;

    if (!data || data.length === 0) {
        container.innerHTML = "<h2>No products available</h2>";
        return;
    }

    container.innerHTML = "";
    data.forEach(product => container.appendChild(createProductCard(product)));
}

function renderStoreInfo(store) {
    const storeName = localStorage.getItem("storeName") || store?.store_name || `Store ${storeId}`;

    if (storeInfoNameEl) storeInfoNameEl.innerText = storeName;
    if (storeInfoDeliveryEl) storeInfoDeliveryEl.innerText = `Delivery: ${store?.delivery_available ? "Available" : "Not available"}`;
    if (storeInfoPickupEl) storeInfoPickupEl.innerText = `Pickup: ${store?.pickup_available ? "Available" : "Not available"}`;

    if (storeInfoFeeEl) {
        if (store?.delivery_available) {
            const fee = Number(store.delivery_charge || 0);
            const freeAbove = Number(store.min_order_free_delivery || 0);
            storeInfoFeeEl.innerText = `Delivery fee: ₹${fee} • Free above ₹${freeAbove}`;
        } else {
            storeInfoFeeEl.innerText = "";
        }
    }
}

// DB se products fetch
fetch(`http://localhost:3000/products/${storeId}`)
    .then(res => res.json())
    .then(renderProducts)
    .catch(err => {
        console.log(err);
        if (container) container.innerHTML = "<h2>Error loading products</h2>";
    });

// Fetch store delivery/pickup info
fetch(`http://localhost:3000/store/${storeId}`)
    .then(res => res.json())
    .then(renderStoreInfo)
    .catch(err => {
        console.log(err);
        renderStoreInfo(null);
    });
