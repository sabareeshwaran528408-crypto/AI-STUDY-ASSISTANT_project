// ===============================
// AI STUDY ASSISTANT AUTH
// ===============================

const AUTH_TOKEN_KEY = "aiStudyAuthToken";
const AUTH_USER_KEY = "aiStudyUser";

function getAuthToken() {
    return localStorage.getItem(AUTH_TOKEN_KEY);
}

function getCurrentUser() {
    try {
        return JSON.parse(
            localStorage.getItem(AUTH_USER_KEY)
        );
    } catch {
        return null;
    }
}

function logout() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);

    // Optional: clear temporary chatbot memory
    sessionStorage.removeItem("aiStudyAssistantChatMemory");
    sessionStorage.removeItem("aiStudyAssistantUserName");

    window.location.href = "index.html";
}

function requireLogin() {
    const token = getAuthToken();

    if (!token) {
        window.location.href = "index.html";
        return false;
    }

    return true;
}