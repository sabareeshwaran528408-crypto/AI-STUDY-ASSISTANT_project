(() => {
    const API_BASE = window.AI_STUDY_API_BASE;
    const timeline = document.querySelector("#activityTimeline");
    const search = document.querySelector("#historySearch");
    const status = document.querySelector("#activityStatus");
    let activities = [];

    if (!timeline) return;

    document.addEventListener("DOMContentLoaded", loadActivity);
    search?.addEventListener("input", renderActivity);

    async function loadActivity() {
        try {
            const response = await authFetch(`${API_BASE}/api/documents`, {
                headers: {
                    Authorization: `Bearer ${getAuthToken()}`
                }
            });
            const data = await response.json();
            if (!response.ok) {
                throw apiErrorFromResponse(
                    response,
                    data,
                    "History is unavailable."
                );
            }
            const documents = Array.isArray(data) ? data : Array.isArray(data.documents) ? data.documents : [];
            activities = documents.map(documentData => ({
                kind: "document",
                name: documentData.file_name || `Document ${documentData.id}`,
                id: documentData.id,
                date: documentData.created_at ? new Date(documentData.created_at) : null,
                textLength: Number(documentData.text_length || 0)
            })).sort((left, right) => (right.date?.getTime() || 0) - (left.date?.getTime() || 0));
            renderActivity();
            if (status) status.textContent = activities.length ? `${activities.length} document uploads` : "No saved activity yet";
        } catch (error) {
            timeline.innerHTML = '<div class="activity-empty">Activity could not be loaded. Your uploaded documents remain available in Documents.</div>';
            if (status) {
                status.textContent = apiErrorMessage(
                    error,
                    "History unavailable"
                );
            }
        }
    }

    function renderActivity() {
        const query = search?.value.trim().toLowerCase() || "";
        const matching = activities.filter(activity => activity.name.toLowerCase().includes(query));
        timeline.replaceChildren();

        if (!matching.length) {
            const empty = document.createElement("div");
            empty.className = "activity-empty";
            empty.textContent = activities.length ? "No uploads match this search." : "No uploaded documents to show yet. Upload a study PDF to begin your timeline.";
            timeline.append(empty);
            return;
        }

        const groups = new Map();
        for (const activity of matching) {
            const groupName = dateGroup(activity.date);
            if (!groups.has(groupName)) groups.set(groupName, []);
            groups.get(groupName).push(activity);
        }

        for (const [groupName, items] of groups) {
            const section = document.createElement("section");
            section.className = "activity-day";
            const heading = document.createElement("h2");
            heading.textContent = groupName;
            const list = document.createElement("ol");
            list.className = "activity-list";
            for (const activity of items) list.append(makeActivityItem(activity));
            section.append(heading, list);
            timeline.append(section);
        }
    }

    function makeActivityItem(activity) {
        const item = document.createElement("li");
        item.className = "activity-item";
        const marker = document.createElement("span");
        marker.className = "activity-marker";
        marker.setAttribute("aria-hidden", "true");
        const body = document.createElement("div");
        body.className = "activity-body";
        const heading = document.createElement("strong");
        heading.textContent = activity.name;
        const detail = document.createElement("p");
        detail.textContent = `Uploaded document${activity.textLength ? ` · ${activity.textLength.toLocaleString()} characters extracted` : ""}`;
        body.append(heading, detail);
        const side = document.createElement("div");
        side.className = "activity-side";
        const time = document.createElement("time");
        if (activity.date && !Number.isNaN(activity.date.getTime())) {
            time.dateTime = activity.date.toISOString();
            time.textContent = activity.date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
        } else {
            time.textContent = "Time unavailable";
        }
        side.append(time);
        if (activity.id != null) {
            const link = document.createElement("a");
            link.href = `ask-ai.html?documentId=${encodeURIComponent(activity.id)}`;
            link.textContent = "Ask AI";
            side.append(link);
        }
        item.append(marker, body, side);
        return item;
    }

    function dateGroup(date) {
        if (!date || Number.isNaN(date.getTime())) return "Date unavailable";
        const startToday = new Date();
        startToday.setHours(0, 0, 0, 0);
        const startDate = new Date(date);
        startDate.setHours(0, 0, 0, 0);
        const difference = Math.round((startToday - startDate) / 86400000);
        if (difference <= 0) return "Today";
        if (difference === 1) return "Yesterday";
        return "Earlier";
    }
})();
