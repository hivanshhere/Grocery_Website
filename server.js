require("dotenv").config();

const express = require("express");
const cors = require("cors");
const crypto = require("crypto");
const mysql2 = require("mysql2");
const mysql = require("mysql2/promise");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static("public"));

const PORT = Number(process.env.PORT) || 3000;

const DB_HOST = process.env.DB_HOST;
const DB_PORT = Number(process.env.DB_PORT);
const DB_USER = process.env.DB_USER;
const DB_PASSWORD = process.env.DB_PASSWORD;
const DB_NAME = process.env.DB_NAME;

let db;
let dbp;

function asyncHandler(fn) {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}

function userDto(row) {
    if (!row) return null;
    return {
        id: row.id,
        name: row.name,
        email: row.email,
        role: row.role
    };
}

function newToken() {
    return crypto.randomBytes(32).toString("hex");
}

async function ensureDatabaseExists() {
    const conn = await mysql.createConnection({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD
    });
    await conn.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
    await conn.end();
}

function initPool() {
    db = mysql2.createPool({
        host: DB_HOST,
        port: DB_PORT,
        user: DB_USER,
        password: DB_PASSWORD,
        database: DB_NAME,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });
    dbp = db.promise();
}

async function initDb() {
    await dbp.query(`
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            name VARCHAR(50) NOT NULL,
            email VARCHAR(50) NOT NULL,
            password VARCHAR(255) NOT NULL,
            role VARCHAR(20) NOT NULL
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS user_sessions (
            token VARCHAR(128) PRIMARY KEY,
            user_id INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS stores (
            id INT AUTO_INCREMENT PRIMARY KEY,
            owner_id INT NOT NULL,
            store_name VARCHAR(50) NOT NULL,
            delivery_available BOOLEAN DEFAULT 0,
            delivery_charge INT DEFAULT 0,
            min_order_free_delivery INT DEFAULT 0,
            pickup_available BOOLEAN DEFAULT 1
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS products (
            id INT AUTO_INCREMENT PRIMARY KEY,
            store_id INT NOT NULL,
            name VARCHAR(100) NOT NULL,
            price DECIMAL(10,2) NOT NULL,
            quantity DECIMAL(10,2) NOT NULL,
            unit VARCHAR(20) NOT NULL
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS orders (
            id INT AUTO_INCREMENT PRIMARY KEY,
            customer_id INT NOT NULL,
            store_id INT NOT NULL,
            total_amount DECIMAL(10,2) NOT NULL,
            delivery_type VARCHAR(20) NOT NULL,
            address_id INT,
            slot_id INT,
            delivery_fee INT DEFAULT 0
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS order_items (
            id INT AUTO_INCREMENT PRIMARY KEY,
            order_id INT NOT NULL,
            product_name VARCHAR(50) NOT NULL,
            unit_price DECIMAL(10,2) NOT NULL,
            qty INT NOT NULL
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS time_slots (
            id INT AUTO_INCREMENT PRIMARY KEY,
            store_id INT NOT NULL,
            slot_time VARCHAR(50) NOT NULL
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS user_addresses (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            type VARCHAR(20) NOT NULL,
            address_line VARCHAR(255) NOT NULL,
            customer_name VARCHAR(100),
            phone VARCHAR(20),
            house VARCHAR(120),
            area VARCHAR(160),
            landmark VARCHAR(160),
            city VARCHAR(80),
            pincode VARCHAR(10)
        )
    `);

    await dbp.query(`
        CREATE TABLE IF NOT EXISTS admin_warnings (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            admin_id INT NOT NULL,
            message VARCHAR(255) NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `);

    try { await dbp.query("ALTER TABLE users ADD UNIQUE KEY uniq_users_email (email)"); } catch {}
    try { await dbp.query("ALTER TABLE stores ADD UNIQUE KEY uniq_stores_owner (owner_id)"); } catch {}
    try { await dbp.query("ALTER TABLE time_slots ADD UNIQUE KEY uniq_time_slot (store_id, slot_time)"); } catch {}

    const adminEmail = process.env.ADMIN_EMAIL || "admin@freshmart.com";
    const adminPassword = process.env.ADMIN_PASSWORD || "admin123";
    const [admins] = await dbp.query("SELECT id FROM users WHERE role='admin' LIMIT 1");
    if (!admins[0]) {
        try {
            await dbp.query(
                "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'admin')",
                ["Website Admin", adminEmail, adminPassword]
            );
            console.log(`Default admin ready: ${adminEmail}`);
        } catch (e) {
            if (!String(e?.message || "").toLowerCase().includes("duplicate")) throw e;
        }
    }
}

async function requireAuth(req, res, next) {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Login required" });

    const [rows] = await dbp.query(
        `SELECT us.token, u.id, u.name, u.email, u.role
         FROM user_sessions us
         JOIN users u ON u.id = us.user_id
         WHERE us.token=?`,
        [token]
    );

    if (!rows[0]) return res.status(401).json({ message: "Invalid session" });
    req.auth = { token, user: rows[0] };
    next();
}

function requireOwner(req, res, next) {
    if (!req.auth?.user) return res.status(401).json({ message: "Login required" });
    if (req.auth.user.role !== "owner") return res.status(403).json({ message: "Owner access required" });
    next();
}

function requireCustomer(req, res, next) {
    if (!req.auth?.user) return res.status(401).json({ message: "Login required" });
    if (req.auth.user.role !== "customer") return res.status(403).json({ message: "Customer access required" });
    next();
}

function requireAdmin(req, res, next) {
    if (!req.auth?.user) return res.status(401).json({ message: "Login required" });
    if (req.auth.user.role !== "admin") return res.status(403).json({ message: "Admin access required" });
    next();
}

async function getOwnerStore(ownerId) {
    const [rows] = await dbp.query("SELECT * FROM stores WHERE owner_id=?", [ownerId]);
    return rows[0] || null;
}

async function deleteUserAndRelatedData(userId, role) {
    await dbp.query("DELETE FROM user_sessions WHERE user_id=?", [userId]);
    await dbp.query("DELETE FROM admin_warnings WHERE user_id=?", [userId]);

    if (role === "owner") {
        const [stores] = await dbp.query("SELECT id FROM stores WHERE owner_id=?", [userId]);
        for (const store of stores) {
            const [orders] = await dbp.query("SELECT id FROM orders WHERE store_id=?", [store.id]);
            for (const order of orders) {
                await dbp.query("DELETE FROM order_items WHERE order_id=?", [order.id]);
            }
            await dbp.query("DELETE FROM orders WHERE store_id=?", [store.id]);
            await dbp.query("DELETE FROM products WHERE store_id=?", [store.id]);
            await dbp.query("DELETE FROM time_slots WHERE store_id=?", [store.id]);
        }
        await dbp.query("DELETE FROM stores WHERE owner_id=?", [userId]);
    }

    if (role === "customer") {
        const [orders] = await dbp.query("SELECT id FROM orders WHERE customer_id=?", [userId]);
        for (const order of orders) {
            await dbp.query("DELETE FROM order_items WHERE order_id=?", [order.id]);
        }
        await dbp.query("DELETE FROM orders WHERE customer_id=?", [userId]);
        await dbp.query("DELETE FROM user_addresses WHERE user_id=?", [userId]);
    }

    await dbp.query("DELETE FROM users WHERE id=?", [userId]);
}

// ================= AUTH =================
app.post("/auth/register-customer", async (req, res) => {
    const { name, email, password } = req.body || {};
    if (!name || !email || !password) return res.status(400).json({ message: "Missing fields" });

    try {
        const [result] = await dbp.query(
            "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'customer')",
            [name, email, password]
        );

        const userId = result.insertId;
        const token = newToken();
        await dbp.query("INSERT INTO user_sessions (token, user_id) VALUES (?, ?)", [token, userId]);

        res.json({ token, user: { id: userId, name, email, role: "customer" } });
    } catch (e) {
        if (String(e?.message || "").toLowerCase().includes("duplicate")) {
            return res.status(409).json({ message: "Email already registered" });
        }
        res.status(500).json({ message: "Server error" });
    }
});

app.post("/auth/register-owner", asyncHandler(async (req, res) => {
    const { name, email, password, store_name } = req.body || {};
    if (!name || !email || !password || !store_name) return res.status(400).json({ message: "Missing fields" });

    const storeNameCaps = String(store_name).trim().toUpperCase();
    if (!storeNameCaps) return res.status(400).json({ message: "Missing fields" });

    try {
        const [userResult] = await dbp.query(
            "INSERT INTO users (name, email, password, role) VALUES (?, ?, ?, 'owner')",
            [name, email, password]
        );

        const ownerId = userResult.insertId;
        const [storeResult] = await dbp.query(
            "INSERT INTO stores (owner_id, store_name, delivery_available, delivery_charge, min_order_free_delivery, pickup_available) VALUES (?, ?, 0, 0, 0, 1)",
            [ownerId, storeNameCaps]
        );

        const store = {
            id: storeResult.insertId,
            owner_id: ownerId,
            store_name: storeNameCaps,
            delivery_available: 0,
            delivery_charge: 0,
            min_order_free_delivery: 0,
            pickup_available: 1
        };

        const token = newToken();
        await dbp.query("INSERT INTO user_sessions (token, user_id) VALUES (?, ?)", [token, ownerId]);

        res.json({ token, user: { id: ownerId, name, email, role: "owner" }, store });
    } catch (e) {
        if (String(e?.message || "").toLowerCase().includes("duplicate")) {
            return res.status(409).json({ message: "Email already registered" });
        }
        res.status(500).json({ message: "Server error" });
    }
}));

app.post("/auth/login", async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ message: "Missing fields" });

    const [rows] = await dbp.query(
        "SELECT * FROM users WHERE email=? AND password=?",
        [email, password]
    );

    if (!rows[0]) return res.status(401).json({ message: "Invalid credentials" });

    const token = newToken();
    await dbp.query("INSERT INTO user_sessions (token, user_id) VALUES (?, ?)", [token, rows[0].id]);

    const u = userDto(rows[0]);
    const store = u?.role === "owner" ? await getOwnerStore(u.id) : null;
    res.json({ token, user: u, store });
});

app.post("/auth/logout", asyncHandler(async (req, res) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.json({ message: "Logged out" });
    await dbp.query("DELETE FROM user_sessions WHERE token=?", [token]);
    res.json({ message: "Logged out" });
}));

// ================= PUBLIC CUSTOMER-FACING APIs =================
app.get("/stores", asyncHandler(async (req, res) => {
    const [rows] = await dbp.query(
        "SELECT id, store_name, delivery_available, delivery_charge, min_order_free_delivery, pickup_available FROM stores ORDER BY id DESC"
    );
    res.json(rows);
}));

app.get("/store/:storeId", asyncHandler(async (req, res) => {
    const storeId = Number(req.params.storeId);
    if (!Number.isFinite(storeId)) return res.status(400).json({ message: "Invalid store id" });

    const [rows] = await dbp.query(
        "SELECT id, owner_id, store_name, delivery_available, delivery_charge, min_order_free_delivery, pickup_available FROM stores WHERE id=?",
        [storeId]
    );
    if (!rows[0]) return res.status(404).json({ message: "Store not found" });
    res.json(rows[0]);
}));

app.get("/products/:storeId", asyncHandler(async (req, res) => {
    const storeId = Number(req.params.storeId);
    if (!Number.isFinite(storeId)) return res.status(400).json({ message: "Invalid store id" });

    const [rows] = await dbp.query(
        "SELECT id, store_id, name, price, quantity, unit FROM products WHERE store_id=? ORDER BY id DESC",
        [storeId]
    );
    res.json(rows);
}));

app.get("/store/:storeId/slots", asyncHandler(async (req, res) => {
    const storeId = Number(req.params.storeId);
    if (!Number.isFinite(storeId)) return res.status(400).json({ message: "Invalid store id" });
    const [rows] = await dbp.query(
        "SELECT id, store_id, slot_time FROM time_slots WHERE store_id=? ORDER BY id DESC",
        [storeId]
    );
    res.json(rows);
}));

// ================= OWNER APIs =================
app.get("/owner/store", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const store = await getOwnerStore(req.auth.user.id);
    res.json(store || null);
}));

app.post("/owner/store", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const { store_name } = req.body || {};
    if (!store_name) return res.status(400).json({ message: "Store name required" });

    const storeNameCaps = String(store_name).trim().toUpperCase();
    if (!storeNameCaps) return res.status(400).json({ message: "Store name required" });

    const existing = await getOwnerStore(req.auth.user.id);
    if (existing) return res.status(409).json({ message: "Store already exists" });

    const [result] = await dbp.query(
        "INSERT INTO stores (owner_id, store_name, delivery_available, delivery_charge, min_order_free_delivery, pickup_available) VALUES (?, ?, 0, 0, 0, 1)",
        [req.auth.user.id, storeNameCaps]
    );
    const store = await getOwnerStore(req.auth.user.id);
    res.json({ message: "Store created", store: store || { id: result.insertId, store_name: storeNameCaps } });
}));

app.patch("/owner/store", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const { store_name } = req.body || {};
    if (!store_name) return res.status(400).json({ message: "Store name required" });

    const storeNameCaps = String(store_name).trim().toUpperCase();
    if (!storeNameCaps) return res.status(400).json({ message: "Store name required" });

    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(404).json({ message: "Store not found" });

    await dbp.query("UPDATE stores SET store_name=? WHERE owner_id=?", [storeNameCaps, req.auth.user.id]);
    const updated = await getOwnerStore(req.auth.user.id);
    res.json({ message: "Store updated", store: updated });
}));

app.get("/owner/products", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.json({ products: [] });

    const [rows] = await dbp.query(
        "SELECT id, store_id, name, price, quantity, unit FROM products WHERE store_id=? ORDER BY id DESC",
        [store.id]
    );
    res.json({ products: rows });
}));

app.post("/owner/products", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const { name, price, quantity, unit } = req.body || {};
    if (!name || price === undefined || quantity === undefined || !unit) {
        return res.status(400).json({ message: "Missing fields" });
    }

    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(400).json({ message: "Create a store first" });

    await dbp.query(
        "INSERT INTO products (store_id, name, price, quantity, unit) VALUES (?, ?, ?, ?, ?)",
        [store.id, name, price, quantity, unit]
    );
    res.json({ message: "Product added" });
}));

app.delete("/owner/products/:productId", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const productId = Number(req.params.productId);
    if (!Number.isFinite(productId)) return res.status(400).json({ message: "Invalid product id" });

    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(400).json({ message: "Create a store first" });

    const [result] = await dbp.query(
        "DELETE FROM products WHERE id=? AND store_id=?",
        [productId, store.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Product not found" });
    res.json({ message: "Product removed" });
}));

app.post("/api/store/delivery-settings", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const { delivery_available, delivery_charge, min_order, pickup_available } = req.body || {};
    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(400).json({ message: "Create a store first" });

    await dbp.query(
        "UPDATE stores SET delivery_available=?, delivery_charge=?, min_order_free_delivery=?, pickup_available=? WHERE owner_id=?",
        [
            delivery_available ? 1 : 0,
            Number(delivery_charge) || 0,
            Number(min_order) || 0,
            pickup_available ? 1 : 0,
            req.auth.user.id
        ]
    );
    const updated = await getOwnerStore(req.auth.user.id);
    res.json({ message: "Updated", store: updated });
}));

app.get("/owner/slots", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.json({ slots: [] });
    const [rows] = await dbp.query(
        "SELECT id, store_id, slot_time FROM time_slots WHERE store_id=? ORDER BY id DESC",
        [store.id]
    );
    res.json({ slots: rows });
}));

app.post("/owner/slots", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const { slot_time } = req.body || {};
    if (!slot_time) return res.status(400).json({ message: "slot_time required" });

    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(400).json({ message: "Create a store first" });

    try {
        await dbp.query(
            "INSERT INTO time_slots (store_id, slot_time) VALUES (?, ?)",
            [store.id, slot_time]
        );
    } catch (e) {
        if (String(e?.message || "").toLowerCase().includes("duplicate")) {
            return res.status(409).json({ message: "Slot already exists" });
        }
        throw e;
    }

    res.json({ message: "Slot added" });
}));

app.delete("/owner/slots/:slotId", requireAuth, requireOwner, asyncHandler(async (req, res) => {
    const slotId = Number(req.params.slotId);
    if (!Number.isFinite(slotId)) return res.status(400).json({ message: "Invalid slot id" });

    const store = await getOwnerStore(req.auth.user.id);
    if (!store) return res.status(400).json({ message: "Create a store first" });

    const [result] = await dbp.query(
        "DELETE FROM time_slots WHERE id=? AND store_id=?",
        [slotId, store.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Slot not found" });
    res.json({ message: "Slot removed" });
}));

// ================= CUSTOMER APIs =================
app.get("/user/addresses", requireAuth, requireCustomer, asyncHandler(async (req, res) => {
    const [rows] = await dbp.query(
        "SELECT id, user_id, type, address_line, customer_name, phone, house, area, landmark, city, pincode FROM user_addresses WHERE user_id=? ORDER BY id DESC",
        [req.auth.user.id]
    );
    res.json(rows);
}));

app.post("/user/addresses", requireAuth, requireCustomer, asyncHandler(async (req, res) => {
    const { type, customer_name, phone, house, area, landmark, city, pincode } = req.body || {};
    if (!type || !customer_name || !phone || !house || !area || !city || !pincode) {
        return res.status(400).json({ message: "Missing fields" });
    }
    const address_line = [house, area, landmark, city, pincode].filter(Boolean).join(", ");

    const [result] = await dbp.query(
        "INSERT INTO user_addresses (user_id, type, address_line, customer_name, phone, house, area, landmark, city, pincode) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        [req.auth.user.id, type, address_line, customer_name, phone, house, area, landmark || "", city, pincode]
    );

    const [rows] = await dbp.query(
        "SELECT id, user_id, type, address_line, customer_name, phone, house, area, landmark, city, pincode FROM user_addresses WHERE id=?",
        [result.insertId]
    );
    res.json({ message: "Address saved", address: rows[0] });
}));

app.patch("/user/addresses/:addressId", requireAuth, requireCustomer, asyncHandler(async (req, res) => {
    const addressId = Number(req.params.addressId);
    if (!Number.isFinite(addressId)) return res.status(400).json({ message: "Invalid address id" });

    const { type, customer_name, phone, house, area, landmark, city, pincode } = req.body || {};
    if (!type || !customer_name || !phone || !house || !area || !city || !pincode) {
        return res.status(400).json({ message: "Missing fields" });
    }
    const address_line = [house, area, landmark, city, pincode].filter(Boolean).join(", ");

    const [result] = await dbp.query(
        `UPDATE user_addresses
         SET type=?, address_line=?, customer_name=?, phone=?, house=?, area=?, landmark=?, city=?, pincode=?
         WHERE id=? AND user_id=?`,
        [type, address_line, customer_name, phone, house, area, landmark || "", city, pincode, addressId, req.auth.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Address not found" });
    res.json({ message: "Address updated" });
}));

app.delete("/user/addresses/:addressId", requireAuth, requireCustomer, asyncHandler(async (req, res) => {
    const addressId = Number(req.params.addressId);
    if (!Number.isFinite(addressId)) return res.status(400).json({ message: "Invalid address id" });

    const [result] = await dbp.query(
        "DELETE FROM user_addresses WHERE id=? AND user_id=?",
        [addressId, req.auth.user.id]
    );
    if (!result.affectedRows) return res.status(404).json({ message: "Address not found" });
    res.json({ message: "Address deleted" });
}));

app.post("/orders", requireAuth, requireCustomer, asyncHandler(async (req, res) => {
    const { store_id, delivery_type, address_id, slot_id, delivery_fee, items } = req.body || {};
    const storeId = Number(store_id);
    if (!Number.isFinite(storeId)) return res.status(400).json({ message: "Invalid store" });
    if (delivery_type !== "delivery" && delivery_type !== "pickup") {
        return res.status(400).json({ message: "Invalid delivery type" });
    }
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ message: "No items" });
    }

    const fee = Number(delivery_fee) || 0;
    let itemsTotal = 0;
    for (const it of items) {
        const qty = Number(it?.qty);
        const unit_price = Number(it?.unit_price);
        if (!it?.name || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(unit_price) || unit_price < 0) {
            return res.status(400).json({ message: "Invalid items" });
        }
        itemsTotal += qty * unit_price;
    }

    const total_amount = itemsTotal + fee;

    const addressId = address_id === null || address_id === undefined || address_id === "" ? null : Number(address_id);
    const slotId = slot_id === null || slot_id === undefined || slot_id === "" ? null : Number(slot_id);

    const [orderResult] = await dbp.query(
        "INSERT INTO orders (customer_id, store_id, total_amount, delivery_type, address_id, slot_id, delivery_fee) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [req.auth.user.id, storeId, total_amount, delivery_type, addressId, slotId, fee]
    );
    const orderId = orderResult.insertId;

    for (const it of items) {
        await dbp.query(
            "INSERT INTO order_items (order_id, product_name, unit_price, qty) VALUES (?, ?, ?, ?)",
            [orderId, it.name, Number(it.unit_price), Number(it.qty)]
        );
    }

    res.json({ message: "Order placed", order_id: orderId });
}));

// ================= ADMIN APIs =================
app.get("/admin/overview", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const [[userCounts], [storeCounts], [orderCounts], [warningCounts]] = await Promise.all([
        dbp.query(`
            SELECT
                SUM(role='customer') AS customers,
                SUM(role='owner') AS owners,
                SUM(role='admin') AS admins
            FROM users
        `),
        dbp.query("SELECT COUNT(*) AS stores FROM stores"),
        dbp.query("SELECT COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS revenue FROM orders"),
        dbp.query("SELECT COUNT(*) AS warnings FROM admin_warnings")
    ]);

    res.json({
        customers: Number(userCounts[0]?.customers) || 0,
        owners: Number(userCounts[0]?.owners) || 0,
        admins: Number(userCounts[0]?.admins) || 0,
        stores: Number(storeCounts[0]?.stores) || 0,
        orders: Number(orderCounts[0]?.orders) || 0,
        revenue: Number(orderCounts[0]?.revenue) || 0,
        warnings: Number(warningCounts[0]?.warnings) || 0
    });
}));

app.get("/admin/users", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const [rows] = await dbp.query(`
        SELECT
            u.id,
            u.name,
            u.email,
            u.role,
            s.id AS store_id,
            s.store_name,
            COUNT(DISTINCT o.id) AS order_count,
            COUNT(DISTINCT w.id) AS warning_count,
            MAX(w.created_at) AS last_warning_at
        FROM users u
        LEFT JOIN stores s ON s.owner_id = u.id
        LEFT JOIN orders o ON o.customer_id = u.id
        LEFT JOIN admin_warnings w ON w.user_id = u.id
        WHERE u.role IN ('customer', 'owner')
        GROUP BY u.id, u.name, u.email, u.role, s.id, s.store_name
        ORDER BY u.role DESC, u.id DESC
    `);
    res.json({ users: rows });
}));

app.get("/admin/stores", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const [rows] = await dbp.query(`
        SELECT
            s.id,
            s.store_name,
            s.owner_id,
            u.name AS owner_name,
            u.email AS owner_email,
            COUNT(DISTINCT p.id) AS product_count,
            COUNT(DISTINCT o.id) AS order_count
        FROM stores s
        JOIN users u ON u.id = s.owner_id
        LEFT JOIN products p ON p.store_id = s.id
        LEFT JOIN orders o ON o.store_id = s.id
        GROUP BY s.id, s.store_name, s.owner_id, u.name, u.email
        ORDER BY s.id DESC
    `);
    res.json({ stores: rows });
}));

app.get("/admin/warnings", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const [rows] = await dbp.query(`
        SELECT
            w.id,
            w.user_id,
            w.admin_id,
            w.message,
            w.created_at,
            u.name AS user_name,
            u.email AS user_email,
            u.role AS user_role,
            a.name AS admin_name
        FROM admin_warnings w
        JOIN users u ON u.id = w.user_id
        JOIN users a ON a.id = w.admin_id
        ORDER BY w.id DESC
        LIMIT 50
    `);
    res.json({ warnings: rows });
}));

app.post("/admin/users/:userId/warnings", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    const message = String(req.body?.message || "").trim();
    if (!Number.isFinite(userId)) return res.status(400).json({ message: "Invalid user id" });
    if (!message) return res.status(400).json({ message: "Warning message required" });

    const [users] = await dbp.query("SELECT id, role FROM users WHERE id=?", [userId]);
    if (!users[0]) return res.status(404).json({ message: "User not found" });
    if (users[0].role === "admin") return res.status(403).json({ message: "Admin users cannot be warned" });

    await dbp.query(
        "INSERT INTO admin_warnings (user_id, admin_id, message) VALUES (?, ?, ?)",
        [userId, req.auth.user.id, message]
    );
    res.json({ message: "Warning sent" });
}));

app.delete("/admin/users/:userId", requireAuth, requireAdmin, asyncHandler(async (req, res) => {
    const userId = Number(req.params.userId);
    if (!Number.isFinite(userId)) return res.status(400).json({ message: "Invalid user id" });
    if (userId === req.auth.user.id) return res.status(403).json({ message: "You cannot remove yourself" });

    const [users] = await dbp.query("SELECT id, role FROM users WHERE id=?", [userId]);
    if (!users[0]) return res.status(404).json({ message: "User not found" });
    if (users[0].role === "admin") return res.status(403).json({ message: "Admin users cannot be removed here" });

    await deleteUserAndRelatedData(userId, users[0].role);
    res.json({ message: "User removed" });
}));

// ================= ERROR HANDLER =================
app.use((err, req, res, next) => {
    console.error(err);
    if (res.headersSent) return next(err);
    res.status(500).json({ message: "Server error" });
});

// ================= START =================
async function start() {
    try {
        await ensureDatabaseExists();
        initPool();
        await initDb();
        app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    } catch (e) {
        console.error("Failed to start server:", e);
        process.exit(1);
    }
}

start();
