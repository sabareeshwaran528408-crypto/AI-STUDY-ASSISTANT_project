// =====================================================
// AI STUDY ASSISTANT
// BACKEND SERVER
// Node.js + Express + Supabase Auth + Database
// PDF Processing + Groq AI + n8n
// =====================================================

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const crypto = require("crypto");
const { PDFParse } = require("pdf-parse");
const Groq = require("groq-sdk");
const { createClient } = require("@supabase/supabase-js");

const supabase = require("./supabase");

// =====================================================
// LOAD ENVIRONMENT VARIABLES
// =====================================================

dotenv.config();

// =====================================================
// EXPRESS APP
// =====================================================

const app = express();
const PORT = process.env.PORT || 5000;

// =====================================================
// CONFIGURATION CHECK
// =====================================================

if (!process.env.GROQ_API_KEY) {
    console.warn("WARNING: GROQ_API_KEY is not configured.");
}

if (
    !process.env.SUPABASE_URL ||
    !process.env.SUPABASE_SECRET_KEY ||
    !process.env.SUPABASE_ANON_KEY
) {
    console.warn(
        "WARNING: Supabase environment variables are not configured."
    );
}

// =====================================================
// GROQ AI
// =====================================================

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const GROQ_MODEL = "openai/gpt-oss-20b";

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(
    cors({
        origin: "*"
    })
);

app.use(
    express.json({
        limit: "100mb"
    })
);

app.use(
    express.urlencoded({
        extended: true,
        limit: "100mb"
    })
);

// =====================================================
// SUPABASE AUTHENTICATION MIDDLEWARE
// =====================================================

async function authenticateToken(req, res, next) {

    try {

        if (
            !process.env.SUPABASE_URL ||
            !process.env.SUPABASE_ANON_KEY
        ) {
            console.error(
                "Authentication configuration is incomplete."
            );

            return res.status(500).json({
                success: false,
                message:
                    "Authentication service is not configured."
            });
        }

        const authHeader =
            req.headers.authorization;

        if (!authHeader) {

            return res.status(401).json({
                success: false,
                message:
                    "Authentication required."
            });
        }

        const parts =
            authHeader.split(" ");

        if (
            parts.length !== 2 ||
            parts[0] !== "Bearer"
        ) {

            return res.status(401).json({
                success: false,
                message:
                    "Invalid authentication format."
            });
        }

        const token = parts[1];

        let authResult;

        try {
            authResult =
                await supabase.auth.getUser(token);
        } catch {
            console.error(
                "Supabase token verification request failed."
            );

            return res.status(503).json({
                success: false,
                message:
                    "Authentication service is temporarily unavailable."
            });
        }

        const {
            data: { user },
            error
        } = authResult;

        if (error || !user) {

            if (
                error &&
                error.status !== 400 &&
                error.status !== 401 &&
                error.status !== 403
            ) {
                console.error(
                    "Supabase token verification returned a service error."
                );

                return res.status(503).json({
                    success: false,
                    message:
                        "Authentication service is temporarily unavailable."
                });
            }

            return res.status(401).json({
                success: false,
                message:
                    "Invalid or expired login session."
            });
        }

        req.user = user;
        try {
            req.userSupabase = createClient(
                process.env.SUPABASE_URL,
                process.env.SUPABASE_ANON_KEY,
                {
                    auth: {
                        persistSession: false,
                        autoRefreshToken: false,
                        detectSessionInUrl: false
                    },
                    global: {
                        headers: {
                            Authorization:
                                `Bearer ${token}`
                        }
                    }
                }
            );
        } catch {
            console.error(
                "User-scoped Supabase client configuration failed."
            );

            return res.status(500).json({
                success: false,
                message:
                    "Database access is not configured."
            });
        }

        next();

    } catch {

        console.error("Authentication middleware failed.");

        return res.status(500).json({
            success: false,
            message:
                "Authentication could not be completed."
        });
    }
}

// =====================================================
// SUPABASE USER HELPERS
// =====================================================

async function findSupabaseUserByEmail(email) {

    const {
        data,
        error
    } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000
    });

    if (error) {
        throw error;
    }

    const users =
        data?.users || [];

    return (
        users.find(
            user =>
                String(user.email || "")
                    .toLowerCase() ===
                email.toLowerCase()
        ) || null
    );
}

async function findSupabaseUserByResetTokenHash(
    tokenHash
) {

    const {
        data,
        error
    } = await supabase.auth.admin.listUsers({
        page: 1,
        perPage: 1000
    });

    if (error) {
        throw error;
    }

    const users =
        data?.users || [];

    const now =
        Date.now();

    return (
        users.find(user => {

            const metadata =
                user.app_metadata || {};

            const storedHash =
                metadata.reset_token_hash;

            const storedExpiry =
                Number(
                    metadata.reset_token_expires || 0
                );

            return (
                storedHash === tokenHash &&
                storedExpiry > now
            );

        }) || null
    );
}

// =====================================================
// SIGNUP API
// =====================================================

app.post(
    "/api/auth/signup",
    async function (req, res) {

        try {

            const {
                name,
                email,
                password
            } = req.body;

            if (
                !name ||
                !email ||
                !password
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Name, email and password are required."
                });
            }

            const cleanName =
                String(name).trim();

            const cleanEmail =
                String(email)
                    .trim()
                    .toLowerCase();

            if (cleanName.length < 2) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Name must contain at least 2 characters."
                });
            }

            if (!cleanEmail.includes("@")) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Please enter a valid email address."
                });
            }

            if (
                String(password).length < 6
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Password must contain at least 6 characters."
                });
            }

            // ---------------------------------
            // CREATE SUPABASE AUTH USER
            // ---------------------------------

            const {
                data: authData,
                error: authError
            } =
                await supabase.auth.admin.createUser({

                    email:
                        cleanEmail,

                    password:
                        password,

                    email_confirm:
                        true,

                    user_metadata: {
                        name:
                            cleanName
                    }

                });

            if (authError) {

                console.error(
                    "Supabase signup error:",
                    authError
                );

                const authMessage =
                    String(
                        authError.message || ""
                    ).toLowerCase();

                if (
                    authMessage.includes("already") ||
                    authMessage.includes("exists")
                ) {

                    return res.status(409).json({
                        success: false,
                        message:
                            "An account with this email already exists."
                    });
                }

                return res.status(400).json({
                    success: false,
                    message:
                        authError.message ||
                        "Unable to create account."
                });
            }

            const user =
                authData.user;

            // ---------------------------------
            // CREATE PROFILE
            // ---------------------------------

            const {
                error: profileError
            } =
                await supabase
                    .from("profiles")
                    .upsert(
                        {
                            id:
                                user.id,
                            name:
                                cleanName
                        },
                        {
                            onConflict:
                                "id"
                        }
                    );

            if (profileError) {

                console.error(
                    "Profile creation error:",
                    profileError
                );

                await supabase.auth.admin.deleteUser(
                    user.id
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Account created but profile setup failed."
                });
            }

            // ---------------------------------
            // LOGIN AFTER SIGNUP
            // ---------------------------------

            const {
                data: loginData,
                error: loginError
            } =
                await supabase.auth.signInWithPassword({
                    email:
                        cleanEmail,
                    password:
                        password
                });

            if (
                loginError ||
                !loginData.session
            ) {

                console.error(
                    "Automatic login error:",
                    loginError
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Account created, but automatic login failed."
                });
            }

            return res.status(201).json({

                success: true,

                message:
                    "Account created successfully.",

                token:
                    loginData
                        .session
                        .access_token,

                refreshToken:
                    loginData
                        .session
                        .refresh_token,

                user: {
                    id:
                        user.id,

                    name:
                        cleanName,

                    email:
                        cleanEmail
                }

            });

        } catch (error) {

            console.error(
                "Signup error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Server error while creating account."
            });
        }
    }
);

// =====================================================
// LOGIN API
// =====================================================

app.post(
    "/api/auth/login",
    async function (req, res) {

        try {

            const {
                email,
                password
            } = req.body;

            if (
                !email ||
                !password
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Email and password are required."
                });
            }

            const cleanEmail =
                String(email)
                    .trim()
                    .toLowerCase();

            const {
                data,
                error
            } =
                await supabase.auth.signInWithPassword({
                    email:
                        cleanEmail,
                    password:
                        password
                });

            if (error) {
                console.warn("Supabase login error:", {
                    code: error.code || "unknown",
                    message: error.message || "No message"
                });
            }

            if (
                error ||
                !data.user ||
                !data.session
            ) {

                return res.status(401).json({
                    success: false,
                    message:
                        "Invalid email or password."
                });
            }

            const user =
                data.user;

            const {
                data: profile,
                error: profileError
            } =
                await supabase
                    .from("profiles")
                    .select(
                        "id, name, created_at"
                    )
                    .eq(
                        "id",
                        user.id
                    )
                    .maybeSingle();

            if (profileError) {

                console.error(
                    "Profile fetch error:",
                    profileError
                );
            }

            return res.json({

                success: true,

                message:
                    "Login successful.",

                token:
                    data
                        .session
                        .access_token,

                refreshToken:
                    data
                        .session
                        .refresh_token,

                user: {

                    id:
                        user.id,

                    name:
                        profile?.name ||
                        user.user_metadata?.name ||
                        "",

                    email:
                        user.email

                }

            });

        } catch (error) {

            console.error(
                "Login error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Server error while logging in."
            });
        }
    }
);

// =====================================================
// REFRESH AUTHENTICATION SESSION
// =====================================================

app.post(
    "/api/auth/refresh",
    async function (req, res) {

        const refreshToken =
            typeof req.body?.refreshToken === "string"
                ? req.body.refreshToken.trim()
                : "";

        if (!refreshToken) {
            return res.status(400).json({
                success: false,
                message:
                    "A refresh token is required."
            });
        }

        try {
            const {
                data,
                error
            } = await supabase.auth.refreshSession({
                refresh_token: refreshToken
            });

            if (error || !data.session) {
                return res.status(401).json({
                    success: false,
                    message:
                        "Login session expired. Please sign in again."
                });
            }

            return res.json({
                success: true,
                token:
                    data.session.access_token,
                refreshToken:
                    data.session.refresh_token
            });
        } catch {
            console.error(
                "Supabase session refresh request failed."
            );

            return res.status(503).json({
                success: false,
                message:
                    "Session refresh is temporarily unavailable."
            });
        }
    }
);

// =====================================================
// FORGOT PASSWORD API
// SUPABASE AUTH + N8N
// =====================================================

app.post(
    "/api/auth/forgot-password",
    async function (req, res) {

        try {

            const {
                email
            } = req.body;

            if (!email) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Email is required."
                });
            }

            const cleanEmail =
                String(email)
                    .trim()
                    .toLowerCase();

            const genericMessage =
                "If an account exists with this email, a password reset link has been sent.";

            const user =
                await findSupabaseUserByEmail(
                    cleanEmail
                );

            if (!user) {

                return res.json({
                    success: true,
                    message:
                        genericMessage
                });
            }

            // ---------------------------------
            // CREATE RESET TOKEN
            // ---------------------------------

            const resetToken =
                crypto
                    .randomBytes(32)
                    .toString("hex");

            const tokenHash =
                crypto
                    .createHash("sha256")
                    .update(resetToken)
                    .digest("hex");

            const expiresAt =
                Date.now() +
                15 * 60 * 1000;

            // ---------------------------------
            // SAVE HASH IN SUPABASE
            // ---------------------------------

            const currentAppMetadata =
                user.app_metadata || {};

            const {
                error: metadataError
            } =
                await supabase
                    .auth
                    .admin
                    .updateUserById(
                        user.id,
                        {
                            app_metadata: {
                                ...currentAppMetadata,
                                reset_token_hash:
                                    tokenHash,
                                reset_token_expires:
                                    expiresAt
                            }
                        }
                    );

            if (metadataError) {

                console.error(
                    "Reset-token storage error:",
                    metadataError
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to create password reset request."
                });
            }

            // ---------------------------------
            // RESET LINK
            // ---------------------------------

            const frontendUrl =
                process.env.FRONTEND_URL ||
                "http://localhost:3000";

            const resetLink =
                `${frontendUrl}/reset-password.html?token=${encodeURIComponent(resetToken)}`;

            // ---------------------------------
            // N8N WEBHOOK
            // ---------------------------------

            const n8nWebhook =
                process.env.N8N_RESET_WEBHOOK_URL;

            if (!n8nWebhook) {

                console.error(
                    "N8N_RESET_WEBHOOK_URL is not configured."
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Password reset email service is not configured."
                });
            }

            const n8nResponse =
                await fetch(
                    n8nWebhook,
                    {
                        method:
                            "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body:
                            JSON.stringify({

                                name:
                                    user
                                        .user_metadata
                                        ?.name ||
                                    "Student",

                                email:
                                    user.email,

                                resetLink:
                                    resetLink

                            })
                    }
                );

            if (!n8nResponse.ok) {

                console.error(
                    "n8n webhook failed:",
                    n8nResponse.status
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to send password reset email."
                });
            }

            console.log(
                "Password reset email requested for:",
                user.email
            );

            return res.json({

                success: true,

                message:
                    genericMessage

            });

        } catch (error) {

            console.error(
                "Forgot password error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Server error while processing password reset."
            });
        }
    }
);

// =====================================================
// RESET PASSWORD API
// =====================================================

app.post(
    "/api/auth/reset-password",
    async function (req, res) {

        try {

            const {
                token,
                password
            } = req.body;

            if (
                !token ||
                !password
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Reset token and new password are required."
                });
            }

            if (
                String(password).length < 6
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Password must contain at least 6 characters."
                });
            }

            // ---------------------------------
            // HASH TOKEN
            // ---------------------------------

            const tokenHash =
                crypto
                    .createHash("sha256")
                    .update(token)
                    .digest("hex");

            // ---------------------------------
            // FIND USER
            // ---------------------------------

            const user =
                await findSupabaseUserByResetTokenHash(
                    tokenHash
                );

            if (!user) {

                return res.status(400).json({
                    success: false,
                    message:
                        "This reset link is invalid or expired."
                });
            }

            const currentAppMetadata =
                user.app_metadata || {};

            const {
                reset_token_hash,
                reset_token_expires,
                ...remainingAppMetadata
            } = currentAppMetadata;

            // ---------------------------------
            // UPDATE SUPABASE PASSWORD
            // ---------------------------------

            const {
                error: passwordError
            } =
                await supabase
                    .auth
                    .admin
                    .updateUserById(
                        user.id,
                        {
                            password:
                                password,

                            app_metadata:
                                remainingAppMetadata
                        }
                    );

            if (passwordError) {

                console.error(
                    "Supabase password update error:",
                    passwordError
                );

                return res.status(500).json({
                    success: false,
                    message:
                        "Unable to reset password."
                });
            }

            return res.json({

                success: true,

                message:
                    "Password reset successfully."

            });

        } catch (error) {

            console.error(
                "Reset password error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Server error while resetting password."
            });
        }
    }
);

// =====================================================
// CHECK LOGIN / CURRENT USER
// =====================================================

app.get(
    "/api/auth/me",
    authenticateToken,
    async function (req, res) {

        try {

            const {
                data: profile,
                error: profileError
            } =
                await supabase
                    .from("profiles")
                    .select(
                        "id, name, created_at"
                    )
                    .eq(
                        "id",
                        req.user.id
                    )
                    .maybeSingle();

            if (profileError) {

                console.error(
                    "Profile fetch error:",
                    profileError
                );
            }

            return res.json({

                success: true,

                user: {

                    id:
                        req.user.id,

                    name:
                        profile?.name ||
                        req.user.user_metadata?.name ||
                        "",

                    email:
                        req.user.email,

                    created_at:
                        profile?.created_at ||
                        req.user.created_at

                }

            });

        } catch (error) {

            console.error(
                "Auth check error:",
                error
            );

            return res.status(500).json({
                success: false,
                message:
                    "Unable to verify user."
            });
        }
    }
);

// =====================================================
// UPLOAD DIRECTORY
// =====================================================

const uploadDirectory =
    path.join(
        __dirname,
        "uploads"
    );

if (
    !fs.existsSync(
        uploadDirectory
    )
) {

    fs.mkdirSync(
        uploadDirectory,
        {
            recursive: true
        }
    );
}

// =====================================================
// MULTER CONFIGURATION
// =====================================================

const storage =
    multer.diskStorage({

        destination:
            function (
                req,
                file,
                cb
            ) {

                cb(
                    null,
                    uploadDirectory
                );
            },

        filename:
            function (
                req,
                file,
                cb
            ) {

                const safeName =
                    file.originalname.replace(
                        /[^a-zA-Z0-9._-]/g,
                        "_"
                    );

                const uniqueName =
                    Date.now() +
                    "-" +
                    Math.round(
                        Math.random() * 100000
                    ) +
                    "-" +
                    safeName;

                cb(
                    null,
                    uniqueName
                );
            }
    });

const upload =
    multer({

        storage:
            storage,

        limits: {

            fileSize:
                100 * 1024 * 1024

        },

        fileFilter:
            function (
                req,
                file,
                cb
            ) {

                const isPDF =
                    file.mimetype ===
                    "application/pdf" ||
                    file.originalname
                        .toLowerCase()
                        .endsWith(".pdf");

                if (!isPDF) {

                    return cb(
                        new Error(
                            "Only PDF files are allowed."
                        )
                    );
                }

                cb(
                    null,
                    true
                );
            }
    });

// =====================================================
// ROOT
// =====================================================

app.get(
    "/",
    function (req, res) {

        res.json({

            success:
                true,

            message:
                "AI Study Assistant backend is running.",

            status:
                "online",

            database:
                "Supabase documents + Supabase Auth",

            groqAI:
                Boolean(
                    process.env.GROQ_API_KEY
                )

        });
    }
);

// =====================================================
// HEALTH CHECK
// =====================================================

app.get(
    "/api/health",
    async function (req, res) {

        try {

            const {
                error: databaseError
            } =
                await supabase
                    .from("documents")
                    .select("id")
                    .limit(1);

            if (databaseError) {
                throw databaseError;
            }

            res.json({

                success:
                    true,

                backend:
                    "online",

                database:
                    "Supabase document storage connected",

                groqAI:
                    Boolean(
                        process.env.GROQ_API_KEY
                    ),

                model:
                    GROQ_MODEL

            });

        } catch (error) {

            console.error(
                "HEALTH CHECK ERROR:",
                error
            );

            res.status(500).json({

                success:
                    false,

                backend:
                    "online",

                database:
                    "Supabase document storage error",

                groqAI:
                    Boolean(
                        process.env.GROQ_API_KEY
                    )

            });
        }
    }
);

// =====================================================
// CLEAN TEXT
// =====================================================

function cleanText(text) {

    if (!text) {
        return "";
    }

    return String(text)
        .replace(
            /\r/g,
            ""
        )
        .replace(
            /[ \t]+/g,
            " "
        )
        .replace(
            /\n{4,}/g,
            "\n\n"
        )
        .trim();
}

async function fetchAllSupabaseRows(queryFactory) {

    const pageSize =
        1000;

    const rows =
        [];

    for (
        let offset = 0;
        ;
        offset += pageSize
    ) {

        const {
            data,
            error
        } =
            await queryFactory()
                .range(
                    offset,
                    offset + pageSize - 1
                );

        if (error) {
            throw error;
        }

        const page =
            data || [];

        rows.push(
            ...page
        );

        if (
            page.length < pageSize
        ) {
            return rows;
        }
    }
}

// =====================================================
// CREATE CHUNKS
// =====================================================

async function createChunks(
    userSupabase,
    documentId,
    text
) {

    const chunkSize =
        1200;

    const overlap =
        150;

    const step =
        chunkSize - overlap;

    const rows =
        [];

    let chunkIndex =
        0;

    let start =
        0;

    while (
        start < text.length
    ) {

        const chunk =
            text
                .substring(
                    start,
                    start + chunkSize
                )
                .trim();

        if (chunk.length > 0) {

            rows.push({
                document_id:
                    documentId,
                chunk_index:
                    chunkIndex,
                chunk_text:
                    chunk
            });

            chunkIndex++;
        }

        start += step;
    }

    if (
        rows.length === 0
    ) {
        return 0;
    }

    const batchSize =
        200;

    for (
        let i = 0;
        i < rows.length;
        i += batchSize
    ) {

        const batch =
            rows.slice(
                i,
                i + batchSize
            );

        const {
            error
        } =
            await userSupabase
                .from("document_chunks")
                .insert(batch);

        if (error) {
            throw error;
        }
    }

    return rows.length;
}

// =====================================================
// PDF UPLOAD
// =====================================================

app.post(
    "/api/documents/upload",
    authenticateToken,
    upload.single("document"),
    async function (req, res) {

        let filePath =
            null;

        try {

            if (!req.file) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Please upload a PDF file."
                });
            }

            filePath =
                req.file.path;

            const originalFileName =
                req.file.originalname;

            console.log(
                "PDF received:",
                originalFileName
            );

            console.log(
                "File size:",
                (
                    req.file.size /
                    1024 /
                    1024
                ).toFixed(2),
                "MB"
            );

            const pdfBuffer =
                fs.readFileSync(
                    filePath
                );

            console.log(
                "Reading PDF..."
            );

            const parser =
                new PDFParse({
                    data:
                        pdfBuffer
                });

            const result =
                await parser.getText();

            const extractedText =
                cleanText(
                    result.text
                );

            await parser.destroy();

            console.log(
                "Extracted characters:",
                extractedText.length
            );

            // ---------------------------------
            // SCANNED PDF
            // ---------------------------------

            if (
                extractedText.length < 20
            ) {

                console.log(
                    "Scanned/image PDF detected."
                );

                try {

                    if (
                        fs.existsSync(
                            filePath
                        )
                    ) {

                        fs.unlinkSync(
                            filePath
                        );
                    }

                } catch (cleanupError) {

                    console.log(
                        "Cleanup error:",
                        cleanupError.message
                    );
                }

                return res.status(400).json({

                    success:
                        false,

                    scanned:
                        true,

                    message:
                        "Could not extract enough text from this PDF. It may be scanned/image-based. Browser OCR is required."

                });
            }

            // ---------------------------------
            // SAVE DOCUMENT
            // ---------------------------------

            console.log(
                "Saving document to Supabase..."
            );

            const {
                data: document,
                error: documentError
            } =
                await req.userSupabase
                    .from("documents")
                    .insert({
                        user_id:
                            req.user.id,
                        file_name:
                            originalFileName,
                        file_path:
                            filePath,
                        extracted_text:
                            extractedText
                    })
                    .select("id")
                    .single();

            if (documentError) {
                throw documentError;
            }

            const documentId =
                document.id;

            console.log(
                "Document created:",
                documentId
            );

            console.log(
                "Creating chunks..."
            );

            const chunks =
                await createChunks(
                    req.userSupabase,
                    documentId,
                    extractedText
                );

            console.log(
                "Chunks created:",
                chunks
            );

            return res.json({

                success:
                    true,

                message:
                    "PDF uploaded and processed successfully.",

                documentId:

                    documentId,

                fileName:
                    originalFileName,

                characters:
                    extractedText.length,

                chunks:
                    chunks

            });

        } catch (error) {

            console.error(
                "PDF UPLOAD ERROR:",
                error
            );

            if (filePath) {

                try {

                    if (
                        fs.existsSync(
                            filePath
                        )
                    ) {

                        fs.unlinkSync(
                            filePath
                        );
                    }

                } catch (cleanupError) {

                    console.log(
                        "Cleanup error:",
                        cleanupError.message
                    );
                }
            }

            return res.status(500).json({

                success:
                    false,

                message:
                    "Failed to process PDF.",

                error:
                    error.message

            });
        }
    }
);

// =====================================================
// BROWSER OCR
// =====================================================

app.post(
    "/api/documents/text",
    authenticateToken,
    async function (req, res) {

        try {

            const {
                fileName,
                text
            } = req.body;

            if (
                !fileName ||
                !text
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "File name and text are required."
                });
            }

            const cleanedText =
                cleanText(text);

            if (
                cleanedText.length < 20
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "OCR text is too short."
                });
            }

            console.log(
                "Saving browser OCR:",
                fileName
            );

            console.log(
                "OCR characters:",
                cleanedText.length
            );

            const {
                data: document,
                error: documentError
            } =
                await req.userSupabase
                    .from("documents")
                    .insert({
                        user_id:
                            req.user.id,
                        file_name:
                            fileName,
                        file_path:
                            "browser-ocr",
                        extracted_text:
                            cleanedText
                    })
                    .select("id")
                    .single();

            if (documentError) {
                throw documentError;
            }

            const documentId =
                document.id;

            const chunks =
                await createChunks(
                    req.userSupabase,
                    documentId,
                    cleanedText
                );

            return res.json({

                success:
                    true,

                message:
                    "OCR text saved successfully.",

                documentId:
                    documentId,

                fileName:
                    fileName,

                characters:
                    cleanedText.length,

                chunks:
                    chunks

            });

        } catch (error) {

            console.error(
                "OCR TEXT ERROR:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "Failed to save OCR text.",

                error:
                    error.message

            });
        }
    }
);

// =====================================================
// GET ALL DOCUMENTS
// =====================================================

app.get(
    "/api/documents",
    authenticateToken,
    async function (req, res) {

        try {

            const rows =
                await fetchAllSupabaseRows(
                    () =>
                        req.userSupabase
                            .from("documents")
                            .select(
                                "id, user_id, file_name, file_path, created_at, extracted_text"
                            )
                            .order(
                                "id",
                                {
                                    ascending:
                                        false
                                }
                            )
                            .eq(
                                "user_id",
                                req.user.id
                            )
                );

            const documents =
                rows.map(document => ({
                    id:
                        document.id,
                    user_id:
                        document.user_id,
                    file_name:
                        document.file_name,
                    file_path:
                        document.file_path,
                    created_at:
                        document.created_at,
                    text_length:
                        document.extracted_text === null
                            ? null
                            : Array.from(
                                document.extracted_text || ""
                            ).length
                }));

            return res.json({

                success:
                    true,

                documents:
                    documents

            });

        } catch (error) {

            console.error(
                "GET DOCUMENTS ERROR:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "Failed to load documents.",

                error:
                    error.message

            });
        }
    }
);

// =====================================================
// GET LATEST DOCUMENT
// =====================================================

app.get(
    "/api/documents/latest",
    authenticateToken,
    async function (req, res) {

        try {

            const {
                data: document,
                error
            } =
                await req.userSupabase
                    .from("documents")
                    .select(
                        "id, user_id, file_name, file_path, extracted_text, created_at"
                    )
                    .order(
                        "id",
                        {
                            ascending:
                                false
                        }
                    )
                    .eq(
                        "user_id",
                        req.user.id
                    )
                    .limit(1)
                    .maybeSingle();

            if (error) {
                throw error;
            }

            if (
                !document
            ) {

                return res.json({
                    success: true,
                    document: null
                });
            }

            return res.json({

                success:
                    true,

                document:
                    document

            });

        } catch (error) {

            console.error(
                "LATEST DOCUMENT ERROR:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "Failed to load latest document.",

                error:
                    error.message

            });
        }
    }
);

// =====================================================
// DOCUMENT SEARCH
// IMPORTANT: BEFORE /api/documents/:id
// =====================================================

app.get(
    "/api/documents/search",
    authenticateToken,
    async function (req, res) {

        try {

            const documentId =
                Number(
                    req.query.documentId
                );

            const query =
                String(
                    req.query.q || ""
                ).trim();

            if (
                !Number.isInteger(
                    documentId
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Valid documentId is required."
                });
            }

            if (
                query.length === 0
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Search question is required."
                });
            }

            const words =
                query
                    .toLowerCase()
                    .replace(
                        /[^a-z0-9\s]/g,
                        " "
                    )
                    .split(/\s+/)
                    .filter(
                        word =>
                            word.length > 2
                    );

            if (
                words.length === 0
            ) {

                return res.json({

                    success:
                        true,

                    query:
                        query,

                    results:
                        []

                });
            }

            const {
                data: ownedDocument,
                error: ownershipError
            } =
                await req.userSupabase
                    .from("documents")
                    .select("id")
                    .eq(
                        "id",
                        documentId
                    )
                    .eq(
                        "user_id",
                        req.user.id
                    )
                    .maybeSingle();

            if (ownershipError) {
                throw ownershipError;
            }

            if (!ownedDocument) {
                return res.json({
                    success: true,
                    query,
                    results: []
                });
            }

            const chunks =
                await fetchAllSupabaseRows(
                    () =>
                        req.userSupabase
                            .from("document_chunks")
                            .select(
                                "id, document_id, chunk_index, chunk_text"
                            )
                            .eq(
                                "document_id",
                                documentId
                            )
                            .order(
                                "chunk_index",
                                {
                                    ascending:
                                        true
                                }
                            )
                );

            const scored =
                chunks.map(
                    chunk => {

                        const lowerText =
                            chunk.chunk_text
                                .toLowerCase();

                        let score =
                            0;

                        for (
                            const word
                            of words
                        ) {

                            const matches =
                                lowerText.match(
                                    new RegExp(
                                        escapeRegExp(
                                            word
                                        ),
                                        "g"
                                    )
                                );

                            if (
                                matches
                            ) {

                                score +=
                                    matches.length;
                            }
                        }

                        return {

                            id:
                                chunk.id,

                            document_id:
                                chunk.document_id,

                            chunk_index:
                                chunk.chunk_index,

                            chunk_text:
                                chunk.chunk_text,

                            score:
                                score

                        };
                    }
                );

            const results =
                scored
                    .filter(
                        item =>
                            item.score > 0
                    )
                    .sort(
                        (a, b) =>
                            b.score - a.score
                    )
                    .slice(
                        0,
                        8
                    );

            return res.json({

                success:
                    true,

                query:
                    query,

                results:
                    results

            });

        } catch (error) {

            console.error(
                "DOCUMENT SEARCH ERROR:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "Document search failed.",

                error:
                    error.message

            });
        }
    }
);

// =====================================================
// QUESTION BANK AI
// =====================================================

app.post(
    "/api/ai/ask",
    authenticateToken,
    async function (req, res) {

        try {

            const documentId =
                Number(
                    req.body.documentId
                );

            const question =
                String(
                    req.body.question || ""
                ).trim();

            if (
                !Number.isInteger(
                    documentId
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Valid documentId is required."
                });
            }

            if (!question) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Question is required."
                });
            }

            if (
                !process.env.GROQ_API_KEY
            ) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Groq API key is not configured."
                });
            }

            const {
                data: document,
                error: documentError
            } =
                await req.userSupabase
                    .from("documents")
                    .select(
                        "id, file_name"
                    )
                    .eq(
                        "id",
                        documentId
                    )
                    .eq(
                        "user_id",
                        req.user.id
                    )
                    .limit(1)
                    .maybeSingle();

            if (documentError) {
                throw documentError;
            }

            if (
                !document
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Document not found."
                });
            }

            const words =
                question
                    .toLowerCase()
                    .replace(
                        /[^a-z0-9\s]/g,
                        " "
                    )
                    .split(/\s+/)
                    .filter(
                        word =>
                            word.length > 2
                    );

            const chunks =
                await fetchAllSupabaseRows(
                    () =>
                        req.userSupabase
                            .from("document_chunks")
                            .select(
                                "id, document_id, chunk_index, chunk_text"
                            )
                            .eq(
                                "document_id",
                                documentId
                            )
                            .order(
                                "chunk_index",
                                {
                                    ascending:
                                        true
                                }
                            )
                );

            if (
                chunks.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "No processed content was found for this document."
                });
            }

            const scored =
                chunks.map(
                    chunk => {

                        const lowerText =
                            chunk.chunk_text
                                .toLowerCase();

                        let score =
                            0;

                        for (
                            const word
                            of words
                        ) {

                            const matches =
                                lowerText.match(
                                    new RegExp(
                                        escapeRegExp(
                                            word
                                        ),
                                        "g"
                                    )
                                );

                            if (
                                matches
                            ) {

                                score +=
                                    matches.length;
                            }
                        }

                        return {
                            ...chunk,
                            score
                        };
                    }
                );

            const relevantChunks =
                scored
                    .filter(
                        item =>
                            item.score > 0
                    )
                    .sort(
                        (a, b) =>
                            b.score - a.score
                    )
                    .slice(
                        0,
                        6
                    );

            if (
                relevantChunks.length === 0
            ) {

                return res.json({

                    success:
                        true,

                    question:
                        question,

                    answer:
                        "I could not find relevant information in the selected question bank.",

                    sources:
                        []

                });
            }

            const context =
                relevantChunks
                    .map(
                        (
                            item,
                            index
                        ) =>
                            `SOURCE ${index + 1}\n${item.chunk_text}`
                    )
                    .join(
                        "\n\n---\n\n"
                    );

            const completion =
                await groq.chat.completions.create({

                    model:
                        GROQ_MODEL,

                    temperature:
                        0.2,

                    max_completion_tokens:
                        800,

                    messages: [

                        {
                            role:
                                "system",

                            content:
                                [
                                    "You are the AI Study Assistant for a question-bank application.",
                                    "Answer using only the provided question-bank context.",
                                    "If the context does not contain enough information, clearly say that the answer is not available in the selected question bank.",
                                    "Do not invent facts, questions, page numbers, or answers.",
                                    "Give a clear, student-friendly answer."
                                ].join(
                                    " "
                                )
                        },

                        {
                            role:
                                "user",

                            content:
                                `QUESTION:\n${question}\n\nQUESTION-BANK CONTEXT:\n${context}`
                        }
                    ]
                });

            const answer =
                completion
                    .choices?.[0]
                    ?.message
                    ?.content
                    ?.trim() ||
                "I could not generate an answer.";

            return res.json({

                success:
                    true,

                question:
                    question,

                answer:
                    answer,

                model:
                    GROQ_MODEL,

                documentId:
                    documentId,

                documentName:
                    document.file_name,

                sources:
                    relevantChunks.map(
                        item => ({

                            chunkId:
                                item.id,

                            chunkIndex:
                                item.chunk_index,

                            score:
                                item.score

                        })
                    )
            });

        } catch (error) {

            console.error(
                "GROQ AI ERROR:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "AI answer generation failed.",

                error:
                    error.message

            });
        }
    }
);

// =====================================================
// GENERAL AI CHATBOT
// =====================================================

app.post(
    "/api/chat",
    async function (req, res) {

        try {

            const message =
                String(
                    req.body.message || ""
                ).trim();

            const userName =
                String(
                    req.body.userName || ""
                ).trim();

            const memory =
                Array.isArray(
                    req.body.memory
                )
                    ? req.body.memory
                    : [];

            const memorySummary =
                String(
                    req.body.memorySummary || ""
                ).trim();

            if (!message) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Message is required."
                });
            }

            if (
                !process.env.GROQ_API_KEY
            ) {

                return res.status(500).json({
                    success: false,
                    message:
                        "Groq API key is not configured."
                });
            }

            const safeMemory =
                memory
                    .slice(-12)
                    .map(
                        item => ({

                            role:
                                item.role ===
                                "assistant"
                                    ? "assistant"
                                    : "user",

                            content:
                                String(
                                    item.content || ""
                                ).slice(
                                    0,
                                    3000
                                )

                        })
                    );

            const systemPrompt =
                [

                    "You are AI Study Assistant, a friendly student learning assistant.",

                    "Help with programming, AI, machine learning, databases, mathematics, projects, exams, and general study questions.",

                    "Explain concepts clearly and at a student-friendly level.",

                    "Do not invent information.",

                    "If the user asks about their own project, use the temporary context provided.",

                    userName
                        ? `The student's name is ${userName}.`
                        : "",

                    memorySummary
                        ? `Temporary memory summary: ${memorySummary}`
                        : "",

                    "This memory is temporary for the current browser session."

                ]
                    .filter(
                        Boolean
                    )
                    .join(
                        " "
                    );

            const messages = [

                {
                    role:
                        "system",

                    content:
                        systemPrompt
                },

                ...safeMemory,

                {
                    role:
                        "user",

                    content:
                        message
                }
            ];

            const completion =
                await groq.chat.completions.create({

                    model:
                        GROQ_MODEL,

                    temperature:
                        0.4,

                    max_completion_tokens:
                        1200,

                    messages:
                        messages

                });

            const reply =
                completion
                    .choices?.[0]
                    ?.message
                    ?.content
                    ?.trim() ||
                "Sorry, I could not generate a response.";

            return res.json({

                success:
                    true,

                reply:
                    reply,

                model:
                    GROQ_MODEL

            });

        } catch (error) {

            console.error(
                "CHAT ERROR:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "Chatbot response failed.",

                error:
                    error.message

            });
        }
    }
);

// =====================================================
// GET ONE DOCUMENT
// =====================================================

app.get(
    "/api/documents/:id",
    authenticateToken,
    async function (req, res) {

        try {

            const documentId =
                Number(
                    req.params.id
                );

            if (
                !Number.isInteger(
                    documentId
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid document ID."
                });
            }

            const {
                data: document,
                error
            } =
                await req.userSupabase
                    .from("documents")
                    .select(
                        "id, user_id, file_name, file_path, extracted_text, created_at"
                    )
                    .eq(
                        "id",
                        documentId
                    )
                    .eq(
                        "user_id",
                        req.user.id
                    )
                    .limit(1)
                    .maybeSingle();

            if (error) {
                throw error;
            }

            if (
                !document
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Document not found."
                });
            }

            return res.json({

                success:
                    true,

                document:
                    document

            });

        } catch (error) {

            console.error(
                "GET DOCUMENT ERROR:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "Failed to load document.",

                error:
                    error.message

            });
        }
    }
);

// =====================================================
// DELETE DOCUMENT
// =====================================================

app.delete(
    "/api/documents/:id",
    authenticateToken,
    async function (req, res) {

        try {

            const documentId =
                Number(
                    req.params.id
                );

            if (
                !Number.isInteger(
                    documentId
                )
            ) {

                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid document ID."
                });
            }

            const {
                data: ownedDocument,
                error: ownershipError
            } =
                await req.userSupabase
                    .from("documents")
                    .select("id")
                    .eq(
                        "id",
                        documentId
                    )
                    .eq(
                        "user_id",
                        req.user.id
                    )
                    .maybeSingle();

            if (ownershipError) {
                throw ownershipError;
            }

            if (!ownedDocument) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Document not found."
                });
            }

            const {
                error: chunksError
            } =
                await req.userSupabase
                    .from("document_chunks")
                    .delete()
                    .eq(
                        "document_id",
                        documentId
                    );

            if (chunksError) {
                throw chunksError;
            }

            const {
                data: deletedDocuments,
                error
            } =
                await req.userSupabase
                    .from("documents")
                    .delete()
                    .eq(
                        "id",
                        documentId
                    )
                    .eq(
                        "user_id",
                        req.user.id
                    )
                    .select("id");

            if (error) {
                throw error;
            }

            if (
                !deletedDocuments ||
                deletedDocuments.length === 0
            ) {

                return res.status(404).json({
                    success: false,
                    message:
                        "Document not found."
                });
            }

            return res.json({

                success:
                    true,

                message:
                    "Document deleted successfully.",

                documentId:
                    documentId

            });

        } catch (error) {

            console.error(
                "DELETE DOCUMENT ERROR:",
                error
            );

            return res.status(500).json({

                success:
                    false,

                message:
                    "Failed to delete document.",

                error:
                    error.message

            });
        }
    }
);

// =====================================================
// REGEX ESCAPE
// =====================================================

function escapeRegExp(
    string
) {

    return String(
        string
    ).replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
    );
}

// =====================================================
// MULTER / SERVER ERROR HANDLER
// =====================================================

app.use(
    function (
        error,
        req,
        res,
        next
    ) {

        console.error(
            "SERVER ERROR:",
            error
        );

        if (
            error instanceof
            multer.MulterError
        ) {

            if (
                error.code ===
                "LIMIT_FILE_SIZE"
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        "PDF is too large. Maximum size is 100 MB."

                });
            }

            if (
                error.code ===
                "LIMIT_UNEXPECTED_FILE"
            ) {

                return res.status(400).json({

                    success:
                        false,

                    message:
                        'Unexpected upload field. Use field name "document".'

                });
            }
        }

        return res.status(500).json({

            success:
                false,

            message:
                error.message ||
                "Internal server error."

        });
    }
);

// =====================================================
// START SERVER
// =====================================================

app.listen(
    PORT,
    function () {

        console.log(
            "========================================"
        );

        console.log(
            "AI Study Assistant Backend"
        );

        console.log(
            "========================================"
        );

        console.log(
            `Server running on port ${PORT}`
        );

        console.log(
            "Supabase document storage: configured"
        );

        console.log(
            "Supabase authentication: enabled"
        );

        console.log(
            "PDF upload: enabled"
        );

        console.log(
            "Browser OCR API: enabled"
        );

        console.log(
            "Document API: enabled"
        );

        console.log(
            "Search API: enabled"
        );

        console.log(
            "Authentication API: enabled"
        );

        console.log(
            "Groq AI:",
            process.env.GROQ_API_KEY
                ? "configured"
                : "NOT configured"
        );

        console.log(
            "Groq model:",
            GROQ_MODEL
        );

        console.log(
            "Chatbot API: enabled"
        );

        console.log(
            "Password reset: Supabase + n8n"
        );

        console.log(
            "Optimized chunk insertion: enabled"
        );

        console.log(
            "========================================"
        );
    }
);