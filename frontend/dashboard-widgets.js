(() => {
    const DASHBOARD_ORDER_KEY = "aiStudyDashboardOrder";
    const DASHBOARD_API = window.AI_STUDY_API_BASE;

    document.addEventListener("DOMContentLoaded", () => {
        if (document.body.dataset.dashboardWidgetsReady === "true") return;
        const main = document.querySelector(".app-page-main");
        if (!main) return;

        const oldHeader = main.querySelector(".topbar");
        const welcome = main.querySelector(".welcome");
        const features = main.querySelector(".features");
        const stats = main.querySelector(".stats");
        const quickStart = main.querySelector(".quick-start");
        if (!oldHeader || !welcome || !stats || !quickStart) return;

        document.body.dataset.dashboardWidgetsReady = "true";
        const title = document.createElement("div");
        title.className = "dashboard-heading-row";
        const heading = document.createElement("h1");
        const subtitle = document.createElement("p");
        const status = oldHeader.querySelector(".backend-status");
        heading.textContent = `${greeting()}, ${userName()}`;
        subtitle.textContent = "Learn smarter from your own study materials.";
        title.append(heading, subtitle);
        if (status) title.append(status);
        oldHeader.replaceWith(title);

        welcome.innerHTML = `
            <h2>Study smarter from your own materials.</h2>
            <p>Bring your question banks into one workspace. Ask AI, search your notes, or continue a general study conversation.</p>
            <div class="dashboard-hero-actions">
                <a href="documents.html">Upload PDF <span aria-hidden="true">↗</span></a>
                <a class="secondary" href="ask-ai.html">Ask AI <span aria-hidden="true">↗</span></a>
                <a class="secondary" href="chatbot.html">Open chatbot <span aria-hidden="true">↗</span></a>
            </div>
        `;

        const layout = document.createElement("section");
        layout.id = "dashboardLayout";
        layout.className = "dashboard-layout";
        layout.setAttribute("aria-label", "Dashboard widgets");

        const welcomeWidget = makeWidget("welcome", "Welcome", welcome);
        const assistant = document.createElement("div");
        assistant.className = "assistant-links";
        assistant.innerHTML = `
            <p class="assistant-copy">Pick up where you need help. Your materials stay at the center of the work.</p>
            <a href="ask-ai.html"><span>Ask from a document</span><span aria-hidden="true">↗</span></a>
            <a href="chatbot.html"><span>Start a study chat</span><span aria-hidden="true">↗</span></a>
            <a href="documents.html"><span>Browse your library</span><span aria-hidden="true">↗</span></a>
        `;
        const assistantWidget = makeWidget("assistant", "AI study assistant", assistant);
        const statsWidget = makeWidget("stats", "Workspace overview", stats);

        const recent = document.createElement("div");
        recent.className = "recent-document-list";
        recent.id = "recentDocuments";
        recent.innerHTML = '<div class="recent-empty">Loading your recent documents…</div>';
        const recentBody = document.createElement("div");
        recentBody.append(recent);
        const recentFooter = document.createElement("a");
        recentFooter.className = "widget-footer-link";
        recentFooter.href = "documents.html";
        recentFooter.textContent = "Manage documents →";
        recentBody.append(recentFooter);
        const recentWidget = makeWidget("recent", "Recent documents", recentBody);

        const tools = document.createElement("div");
        tools.className = "features dashboard-launchers";
        tools.innerHTML = `
            <a class="dashboard-launcher" href="documents.html"><span class="launcher-icon">▤</span><span><strong>Documents</strong><small>Upload and manage PDFs</small></span><span aria-hidden="true">↗</span></a>
            <a class="dashboard-launcher" href="ask-ai.html"><span class="launcher-icon">✦</span><span><strong>Ask AI</strong><small>Ground answers in your files</small></span><span aria-hidden="true">↗</span></a>
            <a class="dashboard-launcher" href="chatbot.html"><span class="launcher-icon">◉</span><span><strong>Chatbot</strong><small>Continue a study conversation</small></span><span aria-hidden="true">↗</span></a>
            <a class="dashboard-launcher" href="history.html"><span class="launcher-icon">◷</span><span><strong>History</strong><small>Review available activity</small></span><span aria-hidden="true">↗</span></a>
        `;
        const toolsWidget = makeWidget("tools", "Study workspace", tools);
        const quickWidget = makeWidget("quick", "Quick actions", quickStart);

        for (const widget of [welcomeWidget, assistantWidget, statsWidget, recentWidget, toolsWidget, quickWidget]) {
            layout.append(widget);
        }

        features?.remove();
        main.querySelectorAll(".section-title").forEach(element => element.remove());
        main.append(layout);
        activateWidgets(layout);
        loadRecentDocuments(recent);
    });

    function makeWidget(name, title, content) {
        const widget = document.createElement("article");
        widget.className = "dashboard-widget";
        widget.dataset.widget = name;
        widget.draggable = true;
        widget.tabIndex = 0;
        widget.setAttribute("role", "group");
        widget.setAttribute("aria-label", title);

        const toolbar = document.createElement("div");
        toolbar.className = "widget-toolbar";
        toolbar.innerHTML = `
            <button class="widget-drag-handle" type="button" draggable="true" aria-label="Drag ${escapeHTML(title)} widget" title="Drag to rearrange">⠿</button>
            <h2>${escapeHTML(title)}</h2>
            <button class="widget-move" type="button" data-move="up" aria-label="Move ${escapeHTML(title)} up" title="Move up">↑</button>
            <button class="widget-move" type="button" data-move="down" aria-label="Move ${escapeHTML(title)} down" title="Move down">↓</button>
            <button class="widget-collapse-toggle" type="button" aria-expanded="true" aria-label="Collapse ${escapeHTML(title)}" title="Collapse widget">−</button>
        `;

        const body = document.createElement("div");
        body.className = "widget-body";
        body.append(content);
        widget.append(toolbar, body);
        return widget;
    }

    function activateWidgets(layout) {
        const savedOrder = readOrder();
        if (savedOrder.length) {
            const widgets = new Map([...layout.children].map(widget => [widget.dataset.widget, widget]));
            for (const key of savedOrder) {
                const widget = widgets.get(key);
                if (widget) layout.append(widget);
            }
            for (const [key, widget] of widgets) {
                if (!savedOrder.includes(key)) layout.append(widget);
            }
        }

        let draggedWidget = null;
        layout.addEventListener("dragstart", event => {
            const handle = event.target.closest(".widget-drag-handle");
            if (!handle) {
                event.preventDefault();
                return;
            }
            draggedWidget = handle.closest(".dashboard-widget");
            draggedWidget.classList.add("is-dragging");
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", draggedWidget.dataset.widget);
        });

        layout.addEventListener("dragover", event => {
            if (!draggedWidget) return;
            const target = event.target.closest(".dashboard-widget");
            if (!target || target === draggedWidget) return;
            event.preventDefault();
            layout.querySelectorAll(".is-drop-target").forEach(item => item.classList.remove("is-drop-target"));
            target.classList.add("is-drop-target");
        });

        layout.addEventListener("drop", event => {
            const target = event.target.closest(".dashboard-widget");
            if (!draggedWidget || !target || target === draggedWidget) return;
            event.preventDefault();
            const bounds = target.getBoundingClientRect();
            const after = event.clientY > bounds.top + bounds.height / 2;
            layout.insertBefore(draggedWidget, after ? target.nextSibling : target);
            persistOrder(layout);
        });

        layout.addEventListener("dragend", () => {
            layout.querySelectorAll(".dashboard-widget").forEach(widget => widget.classList.remove("is-dragging", "is-drop-target"));
            draggedWidget = null;
        });

        layout.addEventListener("click", event => {
            const collapse = event.target.closest(".widget-collapse-toggle");
            if (collapse) {
                const widget = collapse.closest(".dashboard-widget");
                const collapsed = widget.classList.toggle("is-collapsed");
                collapse.setAttribute("aria-expanded", String(!collapsed));
                collapse.setAttribute("aria-label", `${collapsed ? "Expand" : "Collapse"} ${widget.getAttribute("aria-label")}`);
                collapse.title = collapsed ? "Expand widget" : "Collapse widget";
                collapse.textContent = collapsed ? "+" : "−";
                return;
            }

            const moveButton = event.target.closest(".widget-move");
            if (!moveButton) return;
            const widget = moveButton.closest(".dashboard-widget");
            const sibling = moveButton.dataset.move === "up" ? widget.previousElementSibling : widget.nextElementSibling;
            if (!sibling) return;
            if (moveButton.dataset.move === "up") layout.insertBefore(widget, sibling);
            else layout.insertBefore(sibling, widget);
            persistOrder(layout);
            widget.focus();
        });

        layout.addEventListener("keydown", event => {
            const widget = event.target.closest(".dashboard-widget");
            if (!widget || event.target.closest("button, a, input")) return;
            if (event.altKey && ["ArrowUp", "ArrowDown"].includes(event.key)) {
                event.preventDefault();
                const button = widget.querySelector(`[data-move="${event.key === "ArrowUp" ? "up" : "down"}"]`);
                button.click();
            }
        });

        layout.querySelectorAll(".widget-collapse-toggle").forEach(button => {
            button.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    button.click();
                }
            });
        });
    }

    async function loadRecentDocuments(container) {
        try {
            const response = await authFetch(`${DASHBOARD_API}/api/documents`, {
                headers: {
                    Authorization: `Bearer ${getAuthToken()}`
                }
            });
            const data = await response.json();
            if (!response.ok) {
                throw apiErrorFromResponse(
                    response,
                    data,
                    "Could not load documents."
                );
            }
            const documents = Array.isArray(data) ? data : Array.isArray(data.documents) ? data.documents : [];
            if (!documents.length) {
                container.innerHTML = '<div class="recent-empty">No study documents yet. Upload a PDF to start your library.</div>';
                return;
            }

            container.replaceChildren();
            for (const documentData of documents.slice(0, 4)) {
                const row = document.createElement("div");
                row.className = "recent-document";
                const icon = document.createElement("span");
                icon.className = "recent-document-icon";
                icon.textContent = "PDF";
                const copy = document.createElement("div");
                copy.className = "recent-document-copy";
                const name = document.createElement("strong");
                name.textContent = documentData.file_name || `Document ${documentData.id}`;
                const meta = document.createElement("span");
                const date = documentData.created_at ? new Date(documentData.created_at).toLocaleDateString() : "Date unavailable";
                const textLength = Number(documentData.text_length || 0);
                meta.textContent = `${date} · ${textLength ? `${textLength.toLocaleString()} characters indexed` : "Text not indexed"}`;
                copy.append(name, meta);
                const actions = document.createElement("div");
                actions.className = "recent-document-actions";
                if (documentData.id != null) {
                    const ask = document.createElement("a");
                    ask.href = `ask-ai.html?documentId=${encodeURIComponent(documentData.id)}`;
                    ask.textContent = "Ask AI";
                    actions.append(ask);
                }
                row.append(icon, copy, actions);
                container.append(row);
            }
        } catch (error) {
            const message = document.createElement("div");
            message.className = "recent-empty";
            message.textContent = apiErrorMessage(
                error,
                "Recent documents are unavailable right now."
            );
            container.replaceChildren(message);
        }
    }

    function readOrder() {
        try {
            const saved = JSON.parse(localStorage.getItem(DASHBOARD_ORDER_KEY) || "[]");
            return Array.isArray(saved) ? saved : [];
        } catch {
            return [];
        }
    }

    function persistOrder(layout) {
        localStorage.setItem(DASHBOARD_ORDER_KEY, JSON.stringify([...layout.children].map(widget => widget.dataset.widget)));
    }

    function userName() {
        try {
            const user = JSON.parse(localStorage.getItem("aiStudyUser") || "null");
            return user?.name?.trim().split(/\s+/)[0] || "there";
        } catch {
            return "there";
        }
    }

    function greeting() {
        const hour = new Date().getHours();
        if (hour < 12) return "Good morning";
        if (hour < 18) return "Good afternoon";
        return "Good evening";
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
