(() => {
    const pages = [
        { href: "dashboard.html", label: "Dashboard", icon: "⌂", terms: "overview home" },
        { href: "documents.html", label: "Documents", icon: "▤", terms: "pdf upload files" },
        { href: "ask-ai.html", label: "Ask AI", icon: "✦", terms: "question research" },
        { href: "chatbot.html", label: "Chatbot", icon: "◉", terms: "conversation assistant" },
        { href: "history.html", label: "History", icon: "◷", terms: "activity recent" },
        { href: "tools.html", label: "Tools", icon: "▦", terms: "study launcher" },
        { href: "settings.html", label: "Settings", icon: "⚙", terms: "preferences" }
    ];

    const routeSegment = window.location.pathname.split("/").filter(Boolean).pop() || "index";
    const currentPage = routeSegment.endsWith(".html") ? routeSegment : `${routeSegment}.html`;
    const pageMain = document.querySelector(".main") ||
        document.querySelector(".layout > main") ||
        document.querySelector("main");

    if (!pageMain || !pages.some(page => page.href === currentPage)) return;

    const existingSidebar = document.querySelector(".sidebar");
    const existingLayout = pageMain.closest(".layout");
    const legacyHeader = document.querySelector("body > header");
    const insertionPoint = existingLayout || existingSidebar || pageMain;
    const shell = document.createElement("div");
    shell.className = "app-shell";
    shell.dataset.page = currentPage;

    const sidebar = document.createElement("aside");
    sidebar.className = "app-sidebar";
    sidebar.setAttribute("aria-label", "Main navigation");

    const brand = document.createElement("a");
    brand.className = "app-brand";
    brand.href = "dashboard.html";
    brand.innerHTML = '<span class="app-brand-mark" aria-hidden="true">A</span><span class="app-brand-name">Study<span>space</span></span>';

    const nav = document.createElement("nav");
    nav.className = "app-nav";
    nav.setAttribute("aria-label", "Study workspace");

    const navGroup = document.createElement("div");
    navGroup.className = "app-nav-group";
    const groupLabel = document.createElement("p");
    groupLabel.className = "app-nav-caption";
    groupLabel.textContent = "WORKSPACE";
    navGroup.append(groupLabel);

    for (const page of pages) {
        const link = document.createElement("a");
        link.className = "app-nav-link";
        link.href = page.href;
        link.title = page.label;
        link.dataset.label = page.label;
        link.innerHTML = `<span class="app-nav-icon" aria-hidden="true">${page.icon}</span><span class="app-nav-label">${page.label}</span>`;
        if (page.href === currentPage) {
            link.classList.add("is-active");
            link.setAttribute("aria-current", "page");
        }
        navGroup.append(link);
    }
    nav.append(navGroup);

    const profile = readProfile();
    const profileSection = document.createElement("div");
    profileSection.className = "app-profile";
    const profileMenu = document.createElement("details");
    profileMenu.className = "app-profile-menu";
    const profileSummary = document.createElement("summary");
    profileSummary.className = "app-profile-trigger";
    profileSummary.innerHTML = `<span class="app-avatar" aria-hidden="true">${escapeHTML(initials(profile.name))}</span><span class="app-profile-copy"><strong>${escapeHTML(profile.name)}</strong><span>${escapeHTML(profile.email || "Study profile")}</span></span><span class="app-profile-more" aria-hidden="true">···</span>`;
    profileMenu.append(profileSummary);

    const profileLinks = document.createElement("div");
    profileLinks.className = "app-profile-links";
    profileLinks.innerHTML = '<a href="settings.html">Profile & settings</a>';
    if (typeof window.logout === "function") {
        const logoutButton = document.createElement("button");
        logoutButton.type = "button";
        logoutButton.textContent = "Log out";
        logoutButton.addEventListener("click", window.logout);
        profileLinks.append(logoutButton);
    }
    profileMenu.append(profileLinks);
    profileSection.append(profileMenu);
    sidebar.append(brand, nav, profileSection);

    const workspace = document.createElement("div");
    workspace.className = "app-workspace";

    const header = document.createElement("header");
    header.className = "app-topbar";
    header.innerHTML = `
        <button class="app-icon-button app-menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false" title="Open navigation"><span aria-hidden="true">☰</span></button>
        <button class="app-icon-button app-collapse-toggle" type="button" aria-label="Collapse sidebar" aria-expanded="true" title="Collapse sidebar"><span aria-hidden="true">◀</span></button>
        <a class="app-topbar-brand" href="dashboard.html">AI Study Assistant</a>
        <div class="app-command-search">
            <span aria-hidden="true">⌕</span>
            <input type="search" aria-label="Search workspace pages" aria-keyshortcuts="Control+K" placeholder="Search pages and tools">
            <kbd>Ctrl K</kbd>
            <div class="app-search-results" role="listbox" hidden></div>
        </div>
        <a class="app-history-shortcut" href="history.html" aria-label="Open study history" title="Study history"><span aria-hidden="true">◷</span></a>
    `;

    const scrim = document.createElement("button");
    scrim.className = "app-sidebar-scrim";
    scrim.type = "button";
    scrim.setAttribute("aria-label", "Close navigation");

    const pageContent = document.createElement("div");
    pageContent.className = "app-page-content";
    pageMain.classList.add("app-page-main");

    if (legacyHeader && legacyHeader !== pageMain && !pageMain.contains(legacyHeader)) {
        if (legacyHeader.classList.contains("header")) {
            pageMain.prepend(legacyHeader);
        } else {
            legacyHeader.remove();
        }
    }

    const floatingAssistant = document.createElement("a");
    floatingAssistant.className = "app-floating-ai";
    floatingAssistant.href = "chatbot.html";
    floatingAssistant.setAttribute("aria-label", "Open AI chatbot");
    floatingAssistant.title = "Open AI chatbot";
    floatingAssistant.innerHTML = '<span aria-hidden="true">✦</span><span>Ask AI</span>';

    insertionPoint.parentNode.insertBefore(shell, insertionPoint);
    pageContent.append(pageMain);
    if (existingSidebar) existingSidebar.remove();
    if (existingLayout) existingLayout.remove();
    workspace.append(header, pageContent);
    shell.append(sidebar, workspace, scrim);
    document.body.classList.add("has-app-shell");
    if (currentPage !== "chatbot.html") document.body.append(floatingAssistant);

    const collapseButton = header.querySelector(".app-collapse-toggle");
    const menuButton = header.querySelector(".app-menu-toggle");
    const searchInput = header.querySelector("input[type=search]");
    const searchResults = header.querySelector(".app-search-results");
    const collapseKey = "aiStudySidebarCollapsed";

    if (localStorage.getItem(collapseKey) === "true") setCollapsed(true);

    collapseButton.addEventListener("click", () => {
        setCollapsed(!shell.classList.contains("is-collapsed"));
    });

    menuButton.addEventListener("click", () => {
        const isOpen = shell.classList.toggle("nav-open");
        menuButton.setAttribute("aria-expanded", String(isOpen));
        menuButton.setAttribute("aria-label", isOpen ? "Close navigation" : "Open navigation");
    });

    scrim.addEventListener("click", closeMobileNav);
    nav.addEventListener("click", event => {
        if (event.target.closest("a")) closeMobileNav();
    });

    searchInput.addEventListener("input", updateSearchResults);
    searchInput.addEventListener("focus", updateSearchResults);
    searchInput.addEventListener("keydown", event => {
        if (event.key === "Escape") {
            searchResults.hidden = true;
            searchInput.blur();
        }
        if (event.key === "Enter") {
            const firstLink = searchResults.querySelector("a");
            if (firstLink) window.location.href = firstLink.href;
        }
    });

    document.addEventListener("keydown", event => {
        const isTyping = event.target.matches("input, textarea, select, [contenteditable=true]");
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
            event.preventDefault();
            searchInput.focus();
            searchInput.select();
        } else if (event.key === "/" && !isTyping) {
            event.preventDefault();
            searchInput.focus();
        }
    });

    document.addEventListener("click", event => {
        if (!header.querySelector(".app-command-search").contains(event.target)) {
            searchResults.hidden = true;
        }
        if (!profileMenu.contains(event.target)) profileMenu.open = false;
    });

    function setCollapsed(collapsed) {
        shell.classList.toggle("is-collapsed", collapsed);
        collapseButton.setAttribute("aria-expanded", String(!collapsed));
        collapseButton.setAttribute("aria-label", collapsed ? "Expand sidebar" : "Collapse sidebar");
        collapseButton.title = collapsed ? "Expand sidebar" : "Collapse sidebar";
        collapseButton.querySelector("span").textContent = collapsed ? "▶" : "◀";
        localStorage.setItem(collapseKey, String(collapsed));
    }

    function closeMobileNav() {
        shell.classList.remove("nav-open");
        menuButton.setAttribute("aria-expanded", "false");
        menuButton.setAttribute("aria-label", "Open navigation");
    }

    function updateSearchResults() {
        const query = searchInput.value.trim().toLowerCase();
        const matches = pages.filter(page => `${page.label} ${page.terms}`.toLowerCase().includes(query));
        searchResults.replaceChildren();
        for (const page of matches) {
            const link = document.createElement("a");
            link.className = "app-search-result";
            link.href = page.href;
            link.setAttribute("role", "option");
            link.innerHTML = `<span class="app-nav-icon" aria-hidden="true">${page.icon}</span><span>${page.label}</span><span aria-hidden="true">↗</span>`;
            searchResults.append(link);
        }
        if (!matches.length) {
            const empty = document.createElement("p");
            empty.className = "app-search-empty";
            empty.textContent = "No pages match that search.";
            searchResults.append(empty);
        }
        searchResults.hidden = false;
    }

    function readProfile() {
        try {
            const user = JSON.parse(localStorage.getItem("aiStudyUser") || "null");
            return {
                name: user?.name || user?.full_name || "Your profile",
                email: user?.email || ""
            };
        } catch {
            return { name: "Your profile", email: "" };
        }
    }

    function initials(name) {
        const words = name.trim().split(/\s+/).filter(Boolean);
        return words.slice(0, 2).map(word => word[0]).join("").toUpperCase() || "S";
    }

    function escapeHTML(value) {
        return String(value).replace(/[&<>"']/g, character => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }
})();
