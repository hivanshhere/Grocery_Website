function login() {
    let email = document.getElementById("email").value.trim();
    let password = document.getElementById("password").value.trim();
    let msg = document.getElementById("msg");

    if (email === "" || password === "") {
        msg.innerText = "Enter email and password";
        return;
    }

    fetch("http://localhost:3000/auth/login", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({ email, password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.message) {
            msg.innerText = data.message;
            return;
        }

        // New API returns { token, user, store }
        localStorage.setItem("authToken", data.token);
        localStorage.setItem("userId", data.user.id);
        localStorage.setItem("userName", data.user.name);
        localStorage.setItem("userRole", data.user.role);

        if (data.store && data.store.id) {
            localStorage.setItem("storeId", String(data.store.id));
            localStorage.setItem("storeName", String(data.store.store_name || ""));
        }

        const afterLogin = localStorage.getItem("afterLogin");
        if (afterLogin) localStorage.removeItem("afterLogin");

        const isSafeLocalHtml = (value) => {
            if (!value) return false;
            if (value.includes("://")) return false;
            if (value.startsWith("//")) return false;
            return value.endsWith(".html") || value.includes(".html?");
        };

        if (data.user.role === "admin") {
            window.location.href = "admin-dashboard.html";
        } else if (data.user.role === "owner") {
            window.location.href = "owner-dashboard.html";
        } else {
            window.location.href = isSafeLocalHtml(afterLogin) ? afterLogin : "stores.html";
        }
    })
    .catch(err => {
        msg.innerText = "Server error";
        console.log(err);
    });
}
