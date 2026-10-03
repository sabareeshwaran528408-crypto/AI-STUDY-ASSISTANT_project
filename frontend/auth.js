// ===============================
// AI STUDY ASSISTANT AUTH
// ===============================

const AUTH_TOKEN_KEY = "aiStudyAuthToken";
const AUTH_REFRESH_TOKEN_KEY = "aiStudyRefreshToken";
const AUTH_USER_KEY = "aiStudyUser";

let authRefreshPromise = null;

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

function clearStoredAuthSession() {
    localStorage.removeItem(AUTH_TOKEN_KEY);
    localStorage.removeItem(AUTH_REFRESH_TOKEN_KEY);
    localStorage.removeItem(AUTH_USER_KEY);
}

function apiErrorFromResponse(response, data, fallback) {
    let message =
        data?.message ||
        data?.error ||
        fallback ||
        "The request could not be completed.";

    if (response.status === 401) {
        message =
            "Your login session is invalid or expired. Please sign in again.";
    } else if (response.status === 403) {
        message =
            "You do not have permission to perform this action.";
    } else if (response.status >= 500 && !data?.message) {
        message =
            `The backend could not complete the request (HTTP ${response.status}).`;
    }

    const error = new Error(message);
    error.status = response.status;
    return error;
}

function apiErrorMessage(error, fallback) {
    if (error?.status === 401) {
        return "Your login session is invalid or expired. Please sign in again.";
    }

    if (error?.status === 403) {
        return "You do not have permission to perform this action.";
    }

    if (error?.name === "TypeError") {
        return "Unable to reach the backend. Check your network connection, API URL, or CORS settings.";
    }

    return error?.message || fallback || "The request could not be completed.";
}

async function authFetch(input, init = {}) {
    const token = getAuthToken();

    if (!token) {
        clearStoredAuthSession();
        return expiredSessionResponse();
    }

    const response =
        await fetchWithAuthToken(input, init, token);

    if (response.status !== 401) {
        return response;
    }

    const refreshed =
        await refreshAuthSession();

    if (!refreshed) {
        return expiredSessionResponse();
    }

    const refreshedToken = getAuthToken();

    if (!refreshedToken) {
        clearStoredAuthSession();
        return expiredSessionResponse();
    }

    return fetchWithAuthToken(
        input,
        init,
        refreshedToken
    );
}

async function fetchWithAuthToken(input, init, token) {
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", `Bearer ${token}`);

    return fetch(input, {
        ...init,
        headers
    });
}

function refreshAuthSession() {
    if (authRefreshPromise) {
        return authRefreshPromise;
    }

    const refreshToken =
        localStorage.getItem(AUTH_REFRESH_TOKEN_KEY);

    if (!refreshToken) {
        clearStoredAuthSession();
        return Promise.resolve(false);
    }

    authRefreshPromise = (async () => {
        const response = await fetch(
            `${window.AI_STUDY_API_BASE}/api/auth/refresh`,
            {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    refreshToken
                })
            }
        );

        let data = {};

        try {
            data = await response.json();
        } catch {
            data = {};
        }

        if (
            response.status === 400 ||
            response.status === 401
        ) {
            clearStoredAuthSession();
            return false;
        }

        if (!response.ok) {
            throw apiErrorFromResponse(
                response,
                data,
                "Session refresh failed."
            );
        }

        if (!data.token || !data.refreshToken) {
            throw new Error(
                "The backend returned an incomplete refreshed session."
            );
        }

        localStorage.setItem(
            AUTH_TOKEN_KEY,
            data.token
        );
        localStorage.setItem(
            AUTH_REFRESH_TOKEN_KEY,
            data.refreshToken
        );

        return true;
    })().finally(() => {
        authRefreshPromise = null;
    });

    return authRefreshPromise;
}

function expiredSessionResponse() {
    return new Response(
        JSON.stringify({
            success: false,
            message:
                "Your login session is invalid or expired. Please sign in again."
        }),
        {
            status: 401,
            headers: {
                "Content-Type": "application/json"
            }
        }
    );
}

function logout() {
    clearStoredAuthSession();

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
