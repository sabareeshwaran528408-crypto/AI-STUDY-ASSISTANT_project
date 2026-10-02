(() => {
    document.addEventListener("DOMContentLoaded", () => {
        if (document.querySelector("#fileInput")) enhanceDocuments();
        if (document.querySelector("#answerBox")) enhanceAskAI();
        if (document.querySelector("#chatContainer")) enhanceChat();
        if (document.querySelector("#settingsProfileName")) enhanceSettingsProfile();
    });

    function enhanceDocuments() {
        const fileInput = document.querySelector("#fileInput");
        const dropzone = document.querySelector(".upload-area");
        const chooseButton = document.querySelector("#chooseBtn");
        const list = document.querySelector("#documentsList");
        if (!fileInput || !dropzone || !list) return;

        const toolbar = document.createElement("div");
        toolbar.className = "documents-toolbar";
        toolbar.innerHTML = `
            <label class="documents-search-label">Search library
                <input type="search" class="documents-search" aria-label="Search documents" placeholder="Search filenames or metadata">
            </label>
            <label class="documents-filter-label">Text status
                <select class="documents-filter" aria-label="Filter documents by text status">
                    <option value="all">All documents</option>
                    <option value="indexed">Text indexed</option>
                    <option value="empty">No extracted text</option>
                </select>
            </label>
            <span class="documents-result-count" aria-live="polite"></span>
        `;
        list.parentElement.insertBefore(toolbar, list);
        const search = toolbar.querySelector(".documents-search");
        const filter = toolbar.querySelector(".documents-filter");
        const count = toolbar.querySelector(".documents-result-count");

        const refreshCards = () => {
            const cards = [...list.querySelectorAll(".document-card")];
            let visible = 0;
            for (const card of cards) {
                decorateDocumentCard(card);
                const matchesText = card.dataset.searchText.includes(search.value.trim().toLowerCase());
                const matchesStatus = filter.value === "all" || card.dataset.textStatus === filter.value;
                const show = matchesText && matchesStatus;
                card.hidden = !show;
                if (show) visible++;
            }
            count.textContent = cards.length ? `${visible} of ${cards.length} documents` : "";
        };

        search.addEventListener("input", refreshCards);
        filter.addEventListener("change", refreshCards);
        new MutationObserver(refreshCards).observe(list, { childList: true, subtree: true });
        refreshCards();

        for (const eventName of ["dragenter", "dragover"]) {
            dropzone.addEventListener(eventName, event => {
                event.preventDefault();
                dropzone.classList.add("is-dragging");
            });
        }
        for (const eventName of ["dragleave", "drop"]) {
            dropzone.addEventListener(eventName, event => {
                event.preventDefault();
                dropzone.classList.remove("is-dragging");
            });
        }
        dropzone.addEventListener("drop", event => {
            const file = event.dataTransfer?.files?.[0];
            if (!file) return;
            if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
                const status = document.querySelector("#status");
                if (status) status.textContent = "Please drop a PDF file.";
                return;
            }
            const transfer = new DataTransfer();
            transfer.items.add(file);
            fileInput.files = transfer.files;
            fileInput.dispatchEvent(new Event("change", { bubbles: true }));
            chooseButton?.focus();
        });
    }

    function decorateDocumentCard(card) {
        const name = card.querySelector(".document-name");
        const info = card.querySelector(".document-info");
        const actions = card.querySelector(".document-actions");
        if (!name || !info || !actions) return;

        card.dataset.searchText = `${name.textContent} ${info.textContent}`.toLowerCase();
        const extractedLength = info.textContent.match(/Text:\s*([\d,]+)/i)?.[1]?.replaceAll(",", "") || "0";
        const hasText = Number(extractedLength) > 0;
        card.dataset.textStatus = hasText ? "indexed" : "empty";

        let badge = card.querySelector(".document-text-status");
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "document-text-status";
            name.after(badge);
        }
        const badgeText = hasText ? "Text indexed" : "No extracted text";
        if (badge.textContent !== badgeText) badge.textContent = badgeText;
        const badgeState = hasText ? "ready" : "empty";
        if (badge.dataset.state !== badgeState) badge.dataset.state = badgeState;

        if (!actions.querySelector(".document-view-button")) {
            const button = document.createElement("button");
            button.className = "document-view-button";
            button.type = "button";
            button.textContent = "View details";
            button.setAttribute("aria-expanded", "false");
            button.addEventListener("click", () => {
                const expanded = card.classList.toggle("details-open");
                info.hidden = !expanded;
                button.textContent = expanded ? "Hide details" : "View details";
                button.setAttribute("aria-expanded", String(expanded));
            });
            info.hidden = true;
            actions.prepend(button);
        }
    }

    function enhanceAskAI() {
        const answer = document.querySelector("#answerBox");
        const answerCard = answer.closest(".card");
        if (!answerCard) return;

        const copyButton = document.createElement("button");
        copyButton.className = "answer-copy-button";
        copyButton.type = "button";
        copyButton.textContent = "Copy answer";
        copyButton.disabled = true;
        copyButton.addEventListener("click", async () => {
            const text = answer.innerText.trim();
            if (!text || answer.querySelector(".empty")) return;
            try {
                await navigator.clipboard.writeText(text);
                copyButton.textContent = "Copied";
            } catch {
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(answer);
                selection.removeAllRanges();
                selection.addRange(range);
                copyButton.textContent = "Select and copy";
            }
            window.setTimeout(() => { copyButton.textContent = "Copy answer"; }, 1500);
        });

        const heading = answerCard.querySelector("h2");
        if (heading) {
            const headingRow = document.createElement("div");
            headingRow.className = "answer-heading-row";
            heading.parentNode.insertBefore(headingRow, heading);
            headingRow.append(heading, copyButton);
        }

        const updateCopyState = () => {
            copyButton.disabled = !answer.innerText.trim() || Boolean(answer.querySelector(".empty"));
        };
        new MutationObserver(updateCopyState).observe(answer, { childList: true, subtree: true, characterData: true });
        updateCopyState();
    }

    function enhanceChat() {
        const container = document.querySelector("#chatContainer");
        if (!container) return;
        const addCopyButtons = () => {
            for (const message of container.querySelectorAll(".message.bot")) {
                const bubble = message.querySelector(".bubble");
                if (!bubble || message.querySelector(".message-copy")) continue;
                const button = document.createElement("button");
                button.className = "message-copy";
                button.type = "button";
                button.textContent = "Copy response";
                button.addEventListener("click", async () => {
                    try {
                        await navigator.clipboard.writeText(bubble.innerText.trim());
                        button.textContent = "Copied";
                        window.setTimeout(() => { button.textContent = "Copy response"; }, 1400);
                    } catch {
                        button.textContent = "Copy unavailable";
                    }
                });
                const tools = document.createElement("div");
                tools.className = "message-tools";
                tools.append(button);
                message.querySelector("div")?.append(tools);
            }
        };
        new MutationObserver(addCopyButtons).observe(container, { childList: true, subtree: true });
        addCopyButtons();
    }

    function enhanceSettingsProfile() {
        const nameElement = document.querySelector("#settingsProfileName");
        const emailElement = document.querySelector("#settingsProfileEmail");
        const initialsElement = document.querySelector("#settingsProfileInitials");
        if (!nameElement || !emailElement || !initialsElement) return;

        let user = null;
        try {
            user = JSON.parse(localStorage.getItem("aiStudyUser") || "null");
        } catch {
            user = null;
        }

        const name = user?.name || user?.full_name || "Profile details unavailable";
        const email = user?.email || "No email saved in this browser";
        nameElement.textContent = name;
        emailElement.textContent = email;
        initialsElement.textContent = name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "A";
    }
})();
