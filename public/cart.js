const container = document.getElementById("cartItems")
const msgEl = document.getElementById("msg")

/* 🔥 NEW ELEMENTS */
const deliveryTypeEl = document.getElementById("deliveryType")
const addressSectionEl = document.getElementById("addressSection")
const slotSectionEl = document.getElementById("slotSection")
const addressSelectEl = document.getElementById("addressSelect")
const slotSelectEl = document.getElementById("slotSelect")
const totalAmountEl = document.getElementById("totalAmount")

const newAddressFormEl = document.getElementById("newAddressForm")
const deleteAddressBtnEl = document.getElementById("deleteAddressBtn")

const NEW_ADDRESS_VALUE = "__new__"

const addressTypeEl = document.getElementById("addressType")
const customerNameEl = document.getElementById("customerName")
const phoneEl = document.getElementById("phone")
const houseEl = document.getElementById("house")
const areaEl = document.getElementById("area")
const landmarkEl = document.getElementById("landmark")
const cityEl = document.getElementById("city")
const pincodeEl = document.getElementById("pincode")

function formatSavedAddress(a) {
    if (!a) return ""
    const type = a.type ? String(a.type) : "Address"
    const parts = []
    if (a.house) parts.push(a.house)
    if (a.area) parts.push(a.area)
    if (a.city) parts.push(a.city)
    if (a.pincode) parts.push(a.pincode)

    const line = parts.length ? parts.join(", ") : (a.address_line || "")
    return `${type} - ${line}`
}

async function fetchStore(storeId) {
    try {
        const res = await fetch(`http://localhost:3000/store/${storeId}`)
        if (!res.ok) return null
        return await res.json()
    } catch {
        return null
    }
}

function setDeliveryTypeOptions(store) {
    if (!deliveryTypeEl || !store) return

    const deliveryOpt = deliveryTypeEl.querySelector("option[value='delivery']")
    const pickupOpt = deliveryTypeEl.querySelector("option[value='pickup']")

    if (deliveryOpt) {
        deliveryOpt.disabled = !store.delivery_available
        deliveryOpt.style.display = store.delivery_available ? "" : "none"
    }
    if (pickupOpt) {
        pickupOpt.disabled = !store.pickup_available
        pickupOpt.style.display = store.pickup_available ? "" : "none"
    }

    // If current selection is not allowed, switch to allowed one
    if (deliveryTypeEl.value === "delivery" && !store.delivery_available && store.pickup_available) {
        deliveryTypeEl.value = "pickup"
    }
    if (deliveryTypeEl.value === "pickup" && !store.pickup_available && store.delivery_available) {
        deliveryTypeEl.value = "delivery"
    }
}

function getStoreDisplayName(storeId, storeCart, storeData) {
    const fromCart = storeCart && storeCart.storeName ? String(storeCart.storeName) : ""
    const fromServer = storeData && storeData.store_name ? String(storeData.store_name) : ""
    const fromLocal = localStorage.getItem("storeName") || ""
    return fromCart || fromServer || fromLocal || "Store"
}

function setMsg(text) {
    if (msgEl) msgEl.innerText = text || ""
}

function isCustomerLoggedIn() {
    const role = localStorage.getItem("userRole")
    const token = localStorage.getItem("authToken")
    return role === "customer" && !!token
}

function showNewAddressForm(show) {
    if (!newAddressFormEl) return
    newAddressFormEl.style.display = show ? "block" : "none"
}

function showDeleteAddressBtn(show) {
    if (!deleteAddressBtnEl) return
    deleteAddressBtnEl.style.display = show ? "inline-block" : "none"
}

async function deleteSelectedAddress() {
    if (!isCustomerLoggedIn()) {
        setMsg("Please login as a customer")
        return
    }
    const v = String(addressSelectEl?.value || "")
    const id = Number(v)
    if (!Number.isFinite(id)) return

    const ok = confirm("Delete selected address?")
    if (!ok) return

    try {
        const token = localStorage.getItem("authToken")
        const res = await fetch(`http://localhost:3000/user/addresses/${id}`, {
            method: "DELETE",
            headers: { "Authorization": `Bearer ${token}` }
        })
        const data = await res.json().catch(() => null)
        if (!res.ok) {
            setMsg(data?.message || `Could not delete address (HTTP ${res.status})`)
            return
        }
        setMsg(data?.message || "Address deleted")
        localStorage.removeItem("selectedAddressId")
        await loadAddresses()
    } catch {
        setMsg("Could not delete address")
    }
}

function applyDeliveryTypeUi() {
    if (!deliveryTypeEl || !addressSectionEl || !slotSectionEl) return
    if (deliveryTypeEl.value === "pickup") {
        addressSectionEl.style.display = "none"
        slotSectionEl.style.display = "block"
    } else {
        addressSectionEl.style.display = "block"
        slotSectionEl.style.display = "none"
    }
}

function parseUnitPrice(priceText) {
    let match = String(priceText).match(/₹\s*([0-9]+(?:\.[0-9]+)?)/)
    return match ? Number(match[1]) : 0
}

function formatRupees(amount) {
    if (!Number.isFinite(amount)) return "₹0"
    let rounded = Math.round(amount * 100) / 100
    if (Number.isInteger(rounded)) return `₹${rounded}`
    return `₹${rounded.toFixed(2)}`
}

function getCartData() {
    return JSON.parse(localStorage.getItem("storeCarts")) || {}
}

function saveCartData(carts) {
    localStorage.setItem("storeCarts", JSON.stringify(carts))
}

/* 🔥 DELIVERY TOGGLE */
if (deliveryTypeEl) {
    deliveryTypeEl.addEventListener("change", () => {
        applyDeliveryTypeUi()
        renderCart()
    })
}

if (addressSelectEl) {
    addressSelectEl.addEventListener("change", () => {
        const v = String(addressSelectEl.value || "")
        localStorage.setItem("selectedAddressId", v)
        showNewAddressForm(v === NEW_ADDRESS_VALUE)
        showDeleteAddressBtn(!!v && v !== NEW_ADDRESS_VALUE)
    })
}

if (deleteAddressBtnEl) {
    deleteAddressBtnEl.addEventListener("click", deleteSelectedAddress)
}

/* 🔥 LOAD ADDRESS */
async function loadAddresses() {
    if (!addressSelectEl) return

    const token = localStorage.getItem("authToken")
    if (!token || !isCustomerLoggedIn()) {
        addressSelectEl.innerHTML = ""
        const opt = document.createElement("option")
        opt.value = ""
        opt.innerText = "Login to use saved addresses"
        opt.disabled = true
        opt.selected = true
        addressSelectEl.appendChild(opt)
        showNewAddressForm(false)
        showDeleteAddressBtn(false)
        return
    }

    try {
        let res = await fetch("http://localhost:3000/user/addresses", {
            headers: { "Authorization": `Bearer ${token}` }
        })
        let data = await res.json()

        addressSelectEl.innerHTML = ""
        if (!Array.isArray(data) || data.length === 0) {
            let opt = document.createElement("option")
            opt.value = ""
            opt.innerText = "No saved addresses (add one below)"
            opt.disabled = true
            opt.selected = true
            addressSelectEl.appendChild(opt)
            showNewAddressForm(true)
            showDeleteAddressBtn(false)
            return
        }

        data.forEach(a => {
            let opt = document.createElement("option")
            opt.value = a.id
            opt.innerText = formatSavedAddress(a)
            addressSelectEl.appendChild(opt)
        })

        // Add option to create a new address via this form
        const addNewOpt = document.createElement("option")
        addNewOpt.value = NEW_ADDRESS_VALUE
        addNewOpt.innerText = "Add new address…"
        addressSelectEl.appendChild(addNewOpt)

        const savedSelected = String(localStorage.getItem("selectedAddressId") || "")
        const hasSavedSelected = savedSelected && Array.from(addressSelectEl.options).some(o => String(o.value) === savedSelected)
        addressSelectEl.value = hasSavedSelected ? savedSelected : String(data[0].id)
        showNewAddressForm(addressSelectEl.value === NEW_ADDRESS_VALUE)
        showDeleteAddressBtn(!!addressSelectEl.value && addressSelectEl.value !== NEW_ADDRESS_VALUE)
    } catch {}
}

async function saveAddress() {
    const token = localStorage.getItem("authToken")
    if (!token) {
        setMsg("Please login to save address")
        return
    }

    if (!isCustomerLoggedIn()) {
        setMsg("Please login as a customer")
        return
    }

    const type = (addressTypeEl?.value || "").trim()
    const customer_name = (customerNameEl?.value || "").trim()
    const phone = (phoneEl?.value || "").trim()
    const house = (houseEl?.value || "").trim()
    const area = (areaEl?.value || "").trim()
    const landmark = (landmarkEl?.value || "").trim()
    const city = (cityEl?.value || "").trim()
    const pincode = (pincodeEl?.value || "").trim()

    if (!type || !customer_name || !phone || !house || !area || !city || !pincode) {
        setMsg("Please fill all required address details")
        return
    }
    if (!/^\d{10}$/.test(phone)) {
        setMsg("Phone must be exactly 10 digits")
        return
    }
    if (!/^\d{5,10}$/.test(pincode)) {
        setMsg("Pincode must be 5 to 10 digits")
        return
    }

    const ok = confirm("Save this address?")
    if (!ok) return

    try {
        const res = await fetch("http://localhost:3000/user/addresses", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({ type, customer_name, phone, house, area, landmark, city, pincode })
        })

        const data = await res.json().catch(() => null)
        if (!res.ok) {
            setMsg(data?.message || "Could not save address")
            return
        }

        if (houseEl) houseEl.value = ""
        if (areaEl) areaEl.value = ""
        if (landmarkEl) landmarkEl.value = ""
        if (cityEl) cityEl.value = ""
        if (pincodeEl) pincodeEl.value = ""
        setMsg(data.message || "Address saved")
        await loadAddresses()
        if (data.address?.id) {
            addressSelectEl.value = String(data.address.id)
            localStorage.setItem("selectedAddressId", String(data.address.id))
            showNewAddressForm(false)
        }
    } catch {
        setMsg("Could not save address")
    }
}

/* 🔥 LOAD SLOTS */
async function loadSlots(storeId) {
    try {
        let res = await fetch(`http://localhost:3000/store/${storeId}/slots`)
        let data = await res.json()

        slotSelectEl.innerHTML = ""
        if (!Array.isArray(data) || data.length === 0) {
            let opt = document.createElement("option")
            opt.value = ""
            opt.innerText = "No pickup slots available"
            opt.disabled = true
            opt.selected = true
            slotSelectEl.appendChild(opt)
            return
        }

        data.forEach(s => {
            let opt = document.createElement("option")
            opt.value = s.id
            opt.innerText = s.slot_time
            slotSelectEl.appendChild(opt)
        })
    } catch {}
}

function changeItemQty(storeId, itemKey, delta) {
    let carts = getCartData()
    let storeCart = carts[storeId]
    if (!storeCart || typeof storeCart !== "object") return

    let items = storeCart.items
    if (!items || typeof items !== "object") return

    let it = items[itemKey]
    if (!it) return

    let next = (Number(it.qty) || 0) + delta
    if (next <= 0) {
        delete items[itemKey]
        if (Object.keys(items).length === 0) {
            delete carts[storeId]
        }
    } else {
        it.qty = next
    }

    saveCartData(carts)
    renderCart()
}

function clearStoreCart(store) {
    let carts = getCartData()
    if (carts && carts[store]) {
        delete carts[store]
        saveCartData(carts)
    }
    renderCart()
}

function normalizeStoreItems(storeData) {
    if (!storeData) return []

    if (typeof storeData === "object" && !Array.isArray(storeData) && storeData.items) {
        return normalizeStoreItems(storeData.items)
    }

    if (!Array.isArray(storeData) && typeof storeData === "object") {
        return Object.keys(storeData).map(k => {
            let it = storeData[k]
            return {
                key: k,
                name: it.name,
                price: it.price,
                qty: Number(it.qty) || 0,
                quantity: it.quantity || 1,
                unit: it.unit || "piece"
            }
        }).filter(it => it.qty > 0)
    }

    return []
}

/* 🔥 MAIN RENDER WITH DELIVERY LOGIC */
async function renderCart() {
    let carts = getCartData()
    container.innerHTML = ""
    setMsg("")

    let stores = Object.keys(carts || {})
    if (stores.length === 0) {
        container.innerHTML = "<h2>Cart is empty</h2>"
        return
    }

    let grandTotal = 0

    // Determine delivery/pickup availability across stores in cart
    let storeSettings = {}
    for (let storeId of stores) {
        storeSettings[storeId] = await fetchStore(storeId)
    }

    const allowDelivery = stores.every((sid) => {
        const s = storeSettings[sid]
        return !s ? true : !!s.delivery_available
    })
    const allowPickup = stores.every((sid) => {
        const s = storeSettings[sid]
        return !s ? true : !!s.pickup_available
    })

    // Apply availability to UI
    if (deliveryTypeEl) {
        setDeliveryTypeOptions({ delivery_available: allowDelivery, pickup_available: allowPickup })

        if (!allowDelivery && allowPickup) {
            deliveryTypeEl.value = "pickup"
            deliveryTypeEl.disabled = true
        } else if (allowDelivery && !allowPickup) {
            deliveryTypeEl.value = "delivery"
            deliveryTypeEl.disabled = true
        } else {
            deliveryTypeEl.disabled = false
        }

        applyDeliveryTypeUi()
    }

    // If pickup, ensure we show slots for the first store (typical single-store cart)
    if (deliveryTypeEl?.value === "pickup" && stores[0]) {
        const firstStoreData = storeSettings[stores[0]]
        if (!firstStoreData || firstStoreData.pickup_available) {
            await loadSlots(stores[0])
        }
    }

    for (let store of stores) {
        let section = document.createElement("div")
        section.className = "cart-store"

        const storeCart = carts[store]
        let items = normalizeStoreItems(storeCart)
        let storeTotal = 0

        items.forEach(item => {
            let unitPrice = parseUnitPrice(item.price)
            let lineTotal = unitPrice * item.qty
            storeTotal += lineTotal
        })

        /* 🔥 FETCH STORE DELIVERY SETTINGS */
        let deliveryFee = 0
        let storeData = storeSettings[store] || null
        try {

            if (deliveryTypeEl.value === "delivery" && storeData && storeData.delivery_available) {
                if (storeTotal < storeData.min_order_free_delivery) {
                    deliveryFee = storeData.delivery_charge
                }
            }

            if (deliveryTypeEl.value === "pickup" && storeData && storeData.pickup_available) {
                await loadSlots(store)
            }
        } catch {}

        let finalTotal = storeTotal + deliveryFee
        grandTotal += finalTotal

        const storeName = getStoreDisplayName(store, storeCart, storeData)

        // Header
        const header = document.createElement("div")
        header.className = "cart-store-header"
        header.innerHTML = `
            <h2>${storeName}<span>${items.length} item(s)</span></h2>
        `

        const clearBtn = document.createElement("button")
        clearBtn.className = "cart-clear-btn"
        clearBtn.type = "button"
        clearBtn.innerText = "Clear"
        clearBtn.onclick = () => clearStoreCart(store)
        header.appendChild(clearBtn)

        section.appendChild(header)

        // Items list
        items.forEach(item => {
            const unitPrice = parseUnitPrice(item.price)
            const lineTotal = unitPrice * item.qty

            const row = document.createElement("div")
            row.className = "cart-item"

            const left = document.createElement("div")
            left.className = "cart-item-left"
            left.innerHTML = `
                <div class="cart-item-name">${item.name}</div>
                <div class="cart-item-meta">${item.price}</div>
            `

            const right = document.createElement("div")
            right.className = "cart-item-right"

            const stepper = document.createElement("div")
            stepper.className = "qty-stepper"
            stepper.innerHTML = `
                <button type="button" class="qty-btn" data-action="dec" aria-label="Decrease">−</button>
                <span class="qty-value" aria-live="polite">${item.qty}</span>
                <button type="button" class="qty-btn" data-action="inc" aria-label="Increase">+</button>
            `

            const decBtn = stepper.querySelector("[data-action='dec']")
            const incBtn = stepper.querySelector("[data-action='inc']")
            if (decBtn) decBtn.disabled = item.qty <= 0

            if (incBtn) {
                incBtn.onclick = () => changeItemQty(store, item.key, 1)
            }
            if (decBtn) {
                decBtn.onclick = () => changeItemQty(store, item.key, -1)
            }

            const totalEl = document.createElement("div")
            totalEl.className = "cart-item-total"
            totalEl.innerText = formatRupees(lineTotal)

            right.appendChild(stepper)
            right.appendChild(totalEl)

            row.appendChild(left)
            row.appendChild(right)
            section.appendChild(row)
        })

        // Totals
        const breakdown = document.createElement("div")
        breakdown.className = "cart-store-breakdown"
        breakdown.innerHTML = `
            <div><span>Items total</span><strong>${formatRupees(storeTotal)}</strong></div>
            <div><span>Delivery fee</span><strong>${formatRupees(deliveryFee)}</strong></div>
        `
        section.appendChild(breakdown)

        const totalRow = document.createElement("div")
        totalRow.className = "cart-store-total"
        totalRow.innerHTML = `<span>Total</span><span>${formatRupees(finalTotal)}</span>`
        section.appendChild(totalRow)

        const btn = document.createElement("button")
        btn.className = "cart-place-btn"
        btn.type = "button"
        btn.innerText = "Place Order"
        btn.onclick = () => placeOrder(store, deliveryFee)
        section.appendChild(btn)

        container.appendChild(section)
    }

    totalAmountEl.innerText = `${formatRupees(grandTotal)}`
}

/* 🔥 UPDATED ORDER API */
async function placeOrder(storeId, deliveryFee) {
    const token = localStorage.getItem("authToken")

    let carts = getCartData()
    let items = normalizeStoreItems(carts[storeId])

    let payload = {
        store_id: Number(storeId),
        delivery_type: deliveryTypeEl.value,
        address_id: deliveryTypeEl.value === "delivery" ? addressSelectEl.value : null,
        slot_id: deliveryTypeEl.value === "pickup" ? slotSelectEl.value : null,
        delivery_fee: deliveryFee,
        items: items.map(it => ({
            name: it.name,
            qty: it.qty,
            unit_price: parseUnitPrice(it.price)
        }))
    }

    try {
        const storeData = await fetchStore(storeId)
        if (storeData) {
            if (deliveryTypeEl.value === "delivery" && !storeData.delivery_available) {
                setMsg("This store does not offer delivery")
                return
            }
            if (deliveryTypeEl.value === "pickup" && !storeData.pickup_available) {
                setMsg("This store does not offer pickup")
                return
            }
        }

        if (deliveryTypeEl.value === "pickup") {
            if (!slotSelectEl.value) {
                setMsg("Please select a pickup time slot")
                return
            }
        }

        if (deliveryTypeEl.value === "delivery") {
            if (!addressSelectEl.value) {
                setMsg("Please select an address")
                return
            }
        }

        let res = await fetch("http://localhost:3000/orders", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(payload)
        })

        let data = await res.json()

        if (!res.ok) {
            setMsg(data.message || "Order failed")
            return
        }

        clearStoreCart(storeId)
        if (data.order_id) {
            localStorage.setItem("lastOrderId", String(data.order_id))
        }
        window.location.href = `order-confirmation.html${data.order_id ? `?order_id=${encodeURIComponent(data.order_id)}` : ""}`

    } catch {
        setMsg("Order failed")
    }
}

/* INIT */
if (customerNameEl && !customerNameEl.value) {
    const n = localStorage.getItem("userName")
    if (n) customerNameEl.value = n
}
loadAddresses()
renderCart()