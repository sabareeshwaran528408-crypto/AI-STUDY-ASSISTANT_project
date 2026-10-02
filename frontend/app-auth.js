(() => {
    const pages = {
        "loginForm": {
            title: "Make your study time count.",
            description: "Ask questions from your own material, find useful passages, and keep your study workspace close at hand.",
            points: ["Answers grounded in your uploaded PDFs", "A focused workspace for everyday study", "Pick up where you left off"]
        },
        "signupForm": {
            title: "Build a better study rhythm.",
            description: "Bring your learning materials into one place and use AI to explore them at your own pace.",
            points: ["Keep your question banks together", "Get help from your own study material", "Return to your workspace any time"]
        },
        "forgotPasswordForm": {
            title: "Your workspace is still here.",
            description: "Request a secure reset link and get back to studying with your saved materials and preferences.",
            points: ["Reset links are sent by email", "Your study material stays in place", "Return to sign in when ready"]
        },
        "resetPasswordForm": {
            title: "Set a new way back in.",
            description: "Choose a password that is easy for you to remember and difficult for others to guess.",
            points: ["Use a longer passphrase where possible", "Confirm the new password before saving", "Your reset link is checked securely"]
        }
    };

    document.addEventListener("DOMContentLoaded", () => {
        const form = document.querySelector("form[id]");
        const config = form && pages[form.id];
        if (!config) return;

        const story = document.createElement("aside");
        story.className = "auth-story";
        story.setAttribute("aria-label", "AI Study Assistant");

        const brand = document.createElement("a");
        brand.className = "auth-story-brand";
        brand.href = "index.html";
        brand.innerHTML = '<span class="app-brand-mark" aria-hidden="true">A</span><span>AI Study Assistant</span>';

        const copy = document.createElement("div");
        copy.className = "auth-story-copy";
        const title = document.createElement("h2");
        title.textContent = config.title;
        const description = document.createElement("p");
        description.textContent = config.description;
        const points = document.createElement("div");
        points.className = "auth-story-points";
        for (const point of config.points) {
            const item = document.createElement("span");
            item.textContent = point;
            points.append(item);
        }
        copy.append(title, description, points);

        const footer = document.createElement("div");
        footer.className = "auth-story-foot";
        footer.textContent = "A quieter space for clearer thinking.";
        story.append(brand, copy, footer);
        document.body.prepend(story);

        if (form.id === "resetPasswordForm") addPasswordStrength(form);
    });

    function addPasswordStrength(form) {
        const password = form.querySelector("#password");
        if (!password) return;

        const meter = document.createElement("div");
        meter.className = "password-strength";
        meter.setAttribute("aria-hidden", "true");
        const bar = document.createElement("span");
        meter.append(bar);

        const label = document.createElement("span");
        label.className = "password-strength-label";
        label.id = "passwordStrengthLabel";
        label.setAttribute("aria-live", "polite");
        password.setAttribute("aria-describedby", [password.getAttribute("aria-describedby"), label.id].filter(Boolean).join(" "));

        const group = password.closest(".form-group") || password.parentElement;
        group.append(meter, label);

        const update = () => {
            const value = password.value;
            if (!value) {
                bar.style.width = "0%";
                label.textContent = "";
                return;
            }

            let score = 0;
            if (value.length >= 6) score++;
            if (value.length >= 10) score++;
            if (/[a-z]/.test(value) && /[A-Z]/.test(value)) score++;
            if (/[0-9\W_]/.test(value)) score++;

            const levels = ["Very short", "Weak", "Fair", "Good", "Strong"];
            const colors = ["#a94852", "#a94852", "#b87b2d", "#4778c9", "#315fbd"];
            bar.style.width = `${Math.max(12, score * 25)}%`;
            bar.style.backgroundColor = colors[score];
            label.textContent = `Password strength: ${levels[score]}`;
        };

        password.addEventListener("input", update);
    }
})();
