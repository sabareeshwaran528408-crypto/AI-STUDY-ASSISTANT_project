/* =========================================================
   AI STUDY ASSISTANT
   GLOBAL SETTINGS.JS
   ========================================================= */

(() => {

    /* =====================================================
       STORAGE
       ===================================================== */

    const STORAGE_KEY = "aiStudyAssistantSettings";


    /* =====================================================
       DEFAULT SETTINGS
       ===================================================== */

    const DEFAULT_SETTINGS = {

        darkMode: false,

        eyeComfort: false,

        fontSize: "medium",

        compactMode: false,

        reduceMotion: false,

        notifications: true,

        autoSave: true

    };


    /* =====================================================
       GET SETTINGS
       ===================================================== */

    function getSettings() {

        try {

            const saved =
                JSON.parse(
                    localStorage.getItem(STORAGE_KEY)
                );

            return {

                ...DEFAULT_SETTINGS,

                ...(saved || {})

            };

        } catch (error) {

            console.warn(
                "Could not load AI Study Assistant settings:",
                error
            );

            return {
                ...DEFAULT_SETTINGS
            };

        }

    }


    /* =====================================================
       SAVE SETTINGS
       ===================================================== */

    function saveSettings(settings) {

        const finalSettings = {

            ...DEFAULT_SETTINGS,

            ...(settings || {})

        };

        localStorage.setItem(

            STORAGE_KEY,

            JSON.stringify(finalSettings)

        );

        applySettings(finalSettings);

        window.dispatchEvent(

            new CustomEvent(
                "aiStudySettingsChanged",
                {
                    detail: finalSettings
                }
            )

        );

    }


    /* =====================================================
       GLOBAL CSS
       ===================================================== */

    function injectGlobalCSS() {

        if (
            document.getElementById(
                "aiStudyGlobalCSS"
            )
        ) {

            return;

        }


        const style =
            document.createElement("style");

        style.id =
            "aiStudyGlobalCSS";


        style.textContent = `


        /* =================================================
           DARK MODE
           ================================================= */

        html[data-dark-mode="on"] body {

            background: #0f172a !important;

            color: #e5e7eb !important;

        }


        html[data-dark-mode="on"] header {

            background: #111827 !important;

            color: #f9fafb !important;

            border-color: #374151 !important;

        }


        html[data-dark-mode="on"] main {

            background: #0f172a !important;

            color: #e5e7eb !important;

        }


        html[data-dark-mode="on"] .card,

        html[data-dark-mode="on"] .feature-card,

        html[data-dark-mode="on"] .document-card,

        html[data-dark-mode="on"] .panel,

        html[data-dark-mode="on"] .box,

        html[data-dark-mode="on"] .upload-box {

            background: #111827 !important;

            color: #e5e7eb !important;

            border-color: #374151 !important;

        }


        html[data-dark-mode="on"] h1,

        html[data-dark-mode="on"] h2,

        html[data-dark-mode="on"] h3,

        html[data-dark-mode="on"] h4 {

            color: #f9fafb !important;

        }


        html[data-dark-mode="on"] p,

        html[data-dark-mode="on"] span,

        html[data-dark-mode="on"] label {

            color: #d1d5db;

        }


        html[data-dark-mode="on"] input,

        html[data-dark-mode="on"] textarea,

        html[data-dark-mode="on"] select {

            background: #1f2937 !important;

            color: #f9fafb !important;

            border-color: #4b5563 !important;

        }


        html[data-dark-mode="on"] .answer,

        html[data-dark-mode="on"] .message {

            background: #1f2937 !important;

            color: #f9fafb !important;

        }



        /* =================================================
           EYE COMFORT MODE
           ================================================= */

        #aiStudyEyeOverlay {

            position: fixed;

            top: 0;

            left: 0;

            width: 100vw;

            height: 100vh;

            background:
                rgba(255, 180, 70, 0.16);

            pointer-events: none;

            z-index: 2147483647;

            display: none;

        }


        html[data-eye-comfort="on"]
        #aiStudyEyeOverlay {

            display: block;

        }



        /* =================================================
           TEXT SIZE - SMALL
           ================================================= */

        html[data-font-size="small"] body {

            font-size: 14px !important;

        }


        html[data-font-size="small"] h1 {

            font-size: 26px !important;

        }


        html[data-font-size="small"] h2 {

            font-size: 21px !important;

        }


        html[data-font-size="small"] h3 {

            font-size: 18px !important;

        }


        html[data-font-size="small"] h4 {

            font-size: 16px !important;

        }


        html[data-font-size="small"] p,

        html[data-font-size="small"] span,

        html[data-font-size="small"] label,

        html[data-font-size="small"] li,

        html[data-font-size="small"] button,

        html[data-font-size="small"] input,

        html[data-font-size="small"] textarea,

        html[data-font-size="small"] select {

            font-size: 14px !important;

        }


        html[data-font-size="small"] .subtitle,

        html[data-font-size="small"] .card-title,

        html[data-font-size="small"] .card-value,

        html[data-font-size="small"] .small,

        html[data-font-size="small"] .logo,

        html[data-font-size="small"] .nav {

            font-size: 14px !important;

        }



        /* =================================================
           TEXT SIZE - MEDIUM
           ================================================= */

        html[data-font-size="medium"] body {

            font-size: 16px !important;

        }


        html[data-font-size="medium"] p,

        html[data-font-size="medium"] label,

        html[data-font-size="medium"] li,

        html[data-font-size="medium"] input,

        html[data-font-size="medium"] textarea,

        html[data-font-size="medium"] select,

        html[data-font-size="medium"] button {

            font-size: 16px;

        }



        /* =================================================
           TEXT SIZE - LARGE
           ================================================= */

        html[data-font-size="large"] body {

            font-size: 19px !important;

        }


        html[data-font-size="large"] h1 {

            font-size: 36px !important;

        }


        html[data-font-size="large"] h2 {

            font-size: 29px !important;

        }


        html[data-font-size="large"] h3 {

            font-size: 23px !important;

        }


        html[data-font-size="large"] h4 {

            font-size: 21px !important;

        }


        html[data-font-size="large"] p,

        html[data-font-size="large"] span,

        html[data-font-size="large"] label,

        html[data-font-size="large"] li,

        html[data-font-size="large"] button,

        html[data-font-size="large"] input,

        html[data-font-size="large"] textarea,

        html[data-font-size="large"] select {

            font-size: 19px !important;

        }


        html[data-font-size="large"] .subtitle,

        html[data-font-size="large"] .card-title,

        html[data-font-size="large"] .small,

        html[data-font-size="large"] .logo,

        html[data-font-size="large"] .nav {

            font-size: 19px !important;

        }


        html[data-font-size="large"] .card-value {

            font-size: 28px !important;

        }



        /* =================================================
           COMPACT MODE
           ================================================= */

        html[data-compact="on"] .layout {

            min-height: auto !important;

        }


        html[data-compact="on"] main {

            padding: 18px !important;

        }


        html[data-compact="on"] .card,

        html[data-compact="on"] .feature-card,

        html[data-compact="on"] .document-card,

        html[data-compact="on"] .panel,

        html[data-compact="on"] .box {

            padding: 14px !important;

            margin-bottom: 10px !important;

        }


        html[data-compact="on"] .grid {

            gap: 10px !important;

        }


        html[data-compact="on"] h1 {

            margin-bottom: 10px !important;

        }



        /* =================================================
           REDUCE MOTION
           ================================================= */

        html[data-reduce-motion="on"] *,

        html[data-reduce-motion="on"] *::before,

        html[data-reduce-motion="on"] *::after {

            animation-duration:
                0.01ms !important;

            animation-iteration-count:
                1 !important;

            transition-duration:
                0.01ms !important;

            scroll-behavior:
                auto !important;

        }



        /* =================================================
           MOBILE
           ================================================= */

        @media (max-width: 650px) {

            html[data-font-size="large"] body {

                font-size: 17px !important;

            }

        }

        `;


        document.head.appendChild(style);

    }


    /* =====================================================
       CREATE EYE COMFORT OVERLAY
       ===================================================== */

    function createEyeOverlay() {

        if (
            document.getElementById(
                "aiStudyEyeOverlay"
            )
        ) {

            return;

        }


        const overlay =
            document.createElement("div");

        overlay.id =
            "aiStudyEyeOverlay";


        document.documentElement.appendChild(
            overlay
        );

    }


    /* =====================================================
       APPLY SETTINGS
       ===================================================== */

    function applySettings(settings) {

        const finalSettings = {

            ...DEFAULT_SETTINGS,

            ...(settings || {})

        };


        const html =
            document.documentElement;


        /* -----------------------------------------------
           DARK MODE
           ----------------------------------------------- */

        html.dataset.darkMode =
            finalSettings.darkMode
                ? "on"
                : "off";


        /* -----------------------------------------------
           EYE COMFORT
           ----------------------------------------------- */

        html.dataset.eyeComfort =
            finalSettings.eyeComfort
                ? "on"
                : "off";


        /* -----------------------------------------------
           FONT SIZE
           ----------------------------------------------- */

        let fontSize =
            finalSettings.fontSize;


        if (
            fontSize !== "small" &&
            fontSize !== "medium" &&
            fontSize !== "large"
        ) {

            fontSize = "medium";

        }


        html.dataset.fontSize =
            fontSize;


        /* -----------------------------------------------
           COMPACT MODE
           ----------------------------------------------- */

        html.dataset.compact =
            finalSettings.compactMode
                ? "on"
                : "off";


        /* -----------------------------------------------
           REDUCE MOTION
           ----------------------------------------------- */

        html.dataset.reduceMotion =
            finalSettings.reduceMotion
                ? "on"
                : "off";


        /* -----------------------------------------------
           NOTIFICATIONS
           ----------------------------------------------- */

        html.dataset.notifications =
            finalSettings.notifications
                ? "on"
                : "off";


        /* -----------------------------------------------
           AUTO SAVE
           ----------------------------------------------- */

        html.dataset.autoSave =
            finalSettings.autoSave
                ? "on"
                : "off";

    }


    /* =====================================================
       RESET SETTINGS
       ===================================================== */

    function resetSettings() {

        localStorage.removeItem(
            STORAGE_KEY
        );


        applySettings(
            DEFAULT_SETTINGS
        );


        window.dispatchEvent(

            new CustomEvent(
                "aiStudySettingsChanged",
                {
                    detail:
                        DEFAULT_SETTINGS
                }
            )

        );

    }


    /* =====================================================
       GLOBAL API
       ===================================================== */

    window.AIStudySettings = {

        get: getSettings,

        save: saveSettings,

        apply: applySettings,

        reset: resetSettings

    };


    /* =====================================================
       APPLY SETTINGS IMMEDIATELY
       ===================================================== */

    const initialSettings =
        getSettings();


    applySettings(
        initialSettings
    );


    /* =====================================================
       DOM READY
       ===================================================== */

    document.addEventListener(
        "DOMContentLoaded",
        () => {

            injectGlobalCSS();

            createEyeOverlay();

            applySettings(
                getSettings()
            );

        }
    );


    /* =====================================================
       STORAGE EVENT
       ===================================================== */

    window.addEventListener(
        "storage",
        (event) => {

            if (
                event.key === STORAGE_KEY
            ) {

                applySettings(
                    getSettings()
                );

            }

        }
    );


    /* =====================================================
       SAME TAB EVENT
       ===================================================== */

    window.addEventListener(
        "aiStudySettingsChanged",
        (event) => {

            if (event.detail) {

                applySettings(
                    event.detail
                );

            }

        }
    );


})();