(function () {
    try {
        const role = localStorage.getItem("userRole");
        const token = localStorage.getItem("authToken");
        const showAddresses = role === "customer" && !!token;

        const isLoggedIn = !!token;

        document.querySelectorAll('[data-nav="addresses"]').forEach((el) => {
            el.style.display = showAddresses ? "inline-block" : "none";
        });

        // Hide legacy login links once authenticated, but keep the home page button visible.
        document.querySelectorAll('a[href="login.html"]:not(.login-button)').forEach((el) => {
            el.style.display = isLoggedIn ? "none" : "inline-block";
        });
    } catch {
        // ignore
    }
})();
