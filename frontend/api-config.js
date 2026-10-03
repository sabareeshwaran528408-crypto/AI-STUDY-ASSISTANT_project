(() => {
    const localHosts = [
        "localhost",
        "127.0.0.1"
    ];

    window.AI_STUDY_API_BASE =
        localHosts.includes(window.location.hostname)
            ? "http://localhost:5000"
            : "https://ai-study-assistant-production-ce2c.up.railway.app";
})();