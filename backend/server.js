// =====================================================
// AI STUDY ASSISTANT
// BACKEND SERVER
// Node.js + Express + MySQL + PDF Processing + Groq AI
// =====================================================

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { PDFParse } = require("pdf-parse");
const Groq = require("groq-sdk");

const db = require("./db");

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

if (!process.env.JWT_SECRET) {
    console.warn("WARNING: JWT_SECRET is not configured.");
}

if (!process.env.GROQ_API_KEY) {
    console.warn("WARNING: GROQ_API_KEY is not configured.");
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
// AUTHENTICATION MIDDLEWARE
// =====================================================

function authenticateToken(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader) {
            return res.status(401).json({
                success: false,
                message: "Authentication required."
            });
        }

        const parts = authHeader.split(" ");

        if (
            parts.length !== 2 ||
            parts[0] !== "Bearer"
        ) {
            return res.status(401).json({
                success: false,
                message: "Invalid authentication format."
            });
        }

        const token = parts[1];

        if (!process.env.JWT_SECRET) {
            return res.status(500).json({
                success: false,
                message: "JWT secret is not configured."
            });
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        req.user = decoded;

        next();

    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired login session."
        });
    }
}

// =====================================================
// SIGNUP API
// =====================================================

app.post("/api/auth/signup", async (req, res) => {

    try {

        const {
            name,
            email,
            password
        } = req.body;

        // -----------------------------
        // VALIDATION
        // -----------------------------

        if (!name || !email || !password) {

            return res.status(400).json({
                success: false,
                message:
                    "Name, email and password are required."
            });

        }

        const cleanName = name.trim();
        const cleanEmail = email.trim().toLowerCase();

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

        if (password.length < 6) {

            return res.status(400).json({
                success: false,
                message:
                    "Password must contain at least 6 characters."
            });

        }

        // -----------------------------
        // CHECK EXISTING USER
        // -----------------------------

        const [existingUsers] =
            await db.promise().query(
                "SELECT id FROM users WHERE email = ? LIMIT 1",
                [cleanEmail]
            );

        if (existingUsers.length > 0) {

            return res.status(409).json({
                success: false,
                message:
                    "An account with this email already exists."
            });

        }

        // -----------------------------
        // HASH PASSWORD
        // -----------------------------

        const hashedPassword =
            await bcrypt.hash(password, 10);

        // -----------------------------
        // CREATE USER
        // -----------------------------

        const [result] =
            await db.promise().query(
                `
                INSERT INTO users
                (name, email, password)
                VALUES (?, ?, ?)
                `,
                [
                    cleanName,
                    cleanEmail,
                    hashedPassword
                ]
            );

        // -----------------------------
        // CREATE JWT
        // -----------------------------

        const token = jwt.sign(
            {
                id: result.insertId,
                name: cleanName,
                email: cleanEmail
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        // -----------------------------
        // RESPONSE
        // -----------------------------

        res.status(201).json({
            success: true,
            message:
                "Account created successfully.",
            token,
            user: {
                id: result.insertId,
                name: cleanName,
                email: cleanEmail
            }
        });

    } catch (error) {

        console.error(
            "Signup error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Server error while creating account."
        });

    }

});

// =====================================================
// LOGIN API
// =====================================================

app.post("/api/auth/login", async (req, res) => {

    try {

        const {
            email,
            password
        } = req.body;

        // -----------------------------
        // VALIDATION
        // -----------------------------

        if (!email || !password) {

            return res.status(400).json({
                success: false,
                message:
                    "Email and password are required."
            });

        }

        const cleanEmail =
            email.trim().toLowerCase();

        // -----------------------------
        // FIND USER
        // -----------------------------

        const [users] =
            await db.promise().query(
                `
                SELECT
                    id,
                    name,
                    email,
                    password
                FROM users
                WHERE email = ?
                LIMIT 1
                `,
                [cleanEmail]
            );

        if (users.length === 0) {

            return res.status(401).json({
                success: false,
                message:
                    "Invalid email or password."
            });

        }

        const user = users[0];

        // -----------------------------
        // COMPARE PASSWORD
        // -----------------------------

        const passwordMatches =
            await bcrypt.compare(
                password,
                user.password
            );

        if (!passwordMatches) {

            return res.status(401).json({
                success: false,
                message:
                    "Invalid email or password."
            });

        }

        // -----------------------------
        // CREATE TOKEN
        // -----------------------------

        const token = jwt.sign(
            {
                id: user.id,
                name: user.name,
                email: user.email
            },
            process.env.JWT_SECRET,
            {
                expiresIn: "7d"
            }
        );

        // -----------------------------
        // RESPONSE
        // -----------------------------

        res.json({
            success: true,
            message:
                "Login successful.",
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });

    } catch (error) {

        console.error(
            "Login error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Server error while logging in."
        });

    }

});
// =====================================================
// FORGOT PASSWORD API
// =====================================================

app.post("/api/auth/forgot-password", async (req, res) => {

    try {

        const { email } = req.body;

        if (!email) {
            return res.status(400).json({
                success: false,
                message: "Email is required."
            });
        }

        const cleanEmail =
            email.trim().toLowerCase();

        // ---------------------------------------------
        // FIND USER
        // ---------------------------------------------

        const [users] =
            await db.promise().query(
                `
                SELECT
                    id,
                    name,
                    email
                FROM users
                WHERE email = ?
                LIMIT 1
                `,
                [cleanEmail]
            );

        // Always return the same message.
        // This prevents revealing whether an email exists.

        if (users.length === 0) {

            return res.json({
                success: true,
                message:
                    "If an account exists with this email, a password reset link has been sent."
            });

        }

        const user = users[0];

        // ---------------------------------------------
        // CREATE SECURE TOKEN
        // ---------------------------------------------

        const resetToken =
            crypto
                .randomBytes(32)
                .toString("hex");

        // Store only the hash in database

        const tokenHash =
            crypto
                .createHash("sha256")
                .update(resetToken)
                .digest("hex");

        // Token expires in 15 minutes

        const expiresAt =
            new Date(
                Date.now() + 15 * 60 * 1000
            );

        // ---------------------------------------------
        // SAVE TOKEN
        // ---------------------------------------------

        await db.promise().query(
            `
            UPDATE users
            SET
                reset_token = ?,
                reset_token_expires = ?
            WHERE id = ?
            `,
            [
                tokenHash,
                expiresAt,
                user.id
            ]
        );

        // ---------------------------------------------
        // CREATE RESET LINK
        // ---------------------------------------------

        const frontendUrl =
            process.env.FRONTEND_URL ||
            "http://localhost:3000";

        const resetLink =
            `${frontendUrl}/reset-password.html?token=${resetToken}`;

        // ---------------------------------------------
        // SEND TO N8N
        // ---------------------------------------------

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
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        name: user.name,
                        email: user.email,
                        resetLink: resetLink
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

        // ---------------------------------------------
        // SUCCESS
        // ---------------------------------------------

        res.json({
            success: true,
            message:
                "If an account exists with this email, a password reset link has been sent."
        });

    } catch (error) {

        console.error(
            "Forgot password error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Server error while processing password reset."
        });

    }

});
// =====================================================
// RESET PASSWORD API
// =====================================================

app.post("/api/auth/reset-password", async (req, res) => {

    try {

        const {
            token,
            password
        } = req.body;

        if (!token || !password) {

            return res.status(400).json({
                success: false,
                message:
                    "Reset token and new password are required."
            });

        }

        if (password.length < 6) {

            return res.status(400).json({
                success: false,
                message:
                    "Password must contain at least 6 characters."
            });

        }

        // ---------------------------------------------
        // HASH TOKEN
        // ---------------------------------------------

        const tokenHash =
            crypto
                .createHash("sha256")
                .update(token)
                .digest("hex");

        // ---------------------------------------------
        // FIND VALID TOKEN
        // ---------------------------------------------

        const [users] =
            await db.promise().query(
                `
                SELECT
                    id
                FROM users
                WHERE
                    reset_token = ?
                    AND reset_token_expires > NOW()
                LIMIT 1
                `,
                [tokenHash]
            );

        if (users.length === 0) {

            return res.status(400).json({
                success: false,
                message:
                    "This reset link is invalid or expired."
            });

        }

        const userId =
            users[0].id;

        // ---------------------------------------------
        // HASH NEW PASSWORD
        // ---------------------------------------------

        const hashedPassword =
            await bcrypt.hash(
                password,
                10
            );

        // ---------------------------------------------
        // UPDATE PASSWORD
        // ---------------------------------------------

        await db.promise().query(
            `
            UPDATE users
            SET
                password = ?,
                reset_token = NULL,
                reset_token_expires = NULL
            WHERE id = ?
            `,
            [
                hashedPassword,
                userId
            ]
        );

        res.json({
            success: true,
            message:
                "Password reset successfully."
        });

    } catch (error) {

        console.error(
            "Reset password error:",
            error
        );

        res.status(500).json({
            success: false,
            message:
                "Server error while resetting password."
        });

    }

});

// =====================================================
// CHECK LOGIN / CURRENT USER
// =====================================================

app.get(
    "/api/auth/me",
    authenticateToken,
    async (req, res) => {

        try {

            const [users] =
                await db.promise().query(
                    `
                    SELECT
                        id,
                        name,
                        email,
                        created_at
                    FROM users
                    WHERE id = ?
                    LIMIT 1
                    `,
                    [req.user.id]
                );

            if (users.length === 0) {

                return res.status(404).json({
                    success: false,
                    message:
                        "User not found."
                });

            }

            res.json({
                success: true,
                user: users[0]
            });

        } catch (error) {

            console.error(
                "Auth check error:",
                error
            );

            res.status(500).json({
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
    path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDirectory)) {

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

        destination: function (
            req,
            file,
            cb
        ) {

            cb(
                null,
                uploadDirectory
            );

        },

        filename: function (
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

        storage: storage,

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
                    "application/pdf"
                    ||
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

app.get("/", function (req, res) {

    res.json({

        success: true,

        message:
            "AI Study Assistant backend is running.",

        status:
            "online",

        database:
            "MySQL",

        groqAI:
            Boolean(
                process.env.GROQ_API_KEY
            )

    });

});

// =====================================================
// HEALTH CHECK
// =====================================================

app.get(
    "/api/health",
    async function (req, res) {

        try {

            await db
                .promise()
                .query("SELECT 1");

            res.json({

                success: true,

                backend:
                    "online",

                database:
                    "connected",

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

                success: false,

                backend:
                    "online",

                database:
                    "error",

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

// =====================================================
// CREATE CHUNKS
// =====================================================

async function createChunks(
    documentId,
    text
) {

    const chunkSize = 1200;

    const overlap = 150;

    const step =
        chunkSize - overlap;

    const rows = [];

    let chunkIndex = 0;

    let start = 0;

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

            rows.push([
                documentId,
                chunkIndex,
                chunk
            ]);

            chunkIndex++;

        }

        start += step;

    }

    if (rows.length === 0) {
        return 0;
    }

    const batchSize = 200;

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

        await db
            .promise()
            .query(
                `
                INSERT INTO document_chunks
                (
                    document_id,
                    chunk_index,
                    chunk_text
                )
                VALUES ?
                `,
                [batch]
            );

    }

    return rows.length;

}

// =====================================================
// PDF UPLOAD
// =====================================================

app.post(
    "/api/documents/upload",
    upload.single("document"),
    async function (req, res) {

        let filePath = null;

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

            // -----------------------------
            // READ PDF
            // -----------------------------

            const pdfBuffer =
                fs.readFileSync(
                    filePath
                );

            console.log(
                "Reading PDF..."
            );

            // -----------------------------
            // PDF PARSER
            // -----------------------------

            const parser =
                new PDFParse({
                    data: pdfBuffer
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

            // -----------------------------
            // SCANNED PDF
            // -----------------------------

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

                } catch (
                    cleanupError
                ) {

                    console.log(
                        "Cleanup error:",
                        cleanupError.message
                    );

                }

                return res.status(400).json({

                    success: false,

                    scanned: true,

                    message:
                        "Could not extract enough text from this PDF. It may be scanned/image-based. Browser OCR is required."

                });

            }

            // -----------------------------
            // INSERT DOCUMENT
            // -----------------------------

            console.log(
                "Saving document to MySQL..."
            );

            const [
                documentResult
            ] =
                await db
                    .promise()
                    .query(
                        `
                        INSERT INTO documents
                        (
                            user_id,
                            file_name,
                            file_path,
                            extracted_text
                        )
                        VALUES
                        (?, ?, ?, ?)
                        `,
                        [
                            null,
                            originalFileName,
                            filePath,
                            extractedText
                        ]
                    );

            const documentId =
                documentResult.insertId;

            console.log(
                "Document created:",
                documentId
            );

            // -----------------------------
            // CREATE CHUNKS
            // -----------------------------

            console.log(
                "Creating chunks..."
            );

            const chunks =
                await createChunks(
                    documentId,
                    extractedText
                );

            console.log(
                "Chunks created:",
                chunks
            );

            res.json({

                success: true,

                message:
                    "PDF uploaded and processed successfully.",

                documentId,

                fileName:
                    originalFileName,

                characters:
                    extractedText.length,

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

                } catch (
                    cleanupError
                ) {

                    console.log(
                        "Cleanup error:",
                        cleanupError.message
                    );

                }

            }

            res.status(500).json({

                success: false,

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

            const [
                documentResult
            ] =
                await db
                    .promise()
                    .query(
                        `
                        INSERT INTO documents
                        (
                            user_id,
                            file_name,
                            file_path,
                            extracted_text
                        )
                        VALUES
                        (?, ?, ?, ?)
                        `,
                        [
                            null,
                            fileName,
                            "browser-ocr",
                            cleanedText
                        ]
                    );

            const documentId =
                documentResult.insertId;

            const chunks =
                await createChunks(
                    documentId,
                    cleanedText
                );

            console.log(
                "Browser OCR document:",
                documentId
            );

            res.json({

                success: true,

                message:
                    "OCR text saved successfully.",

                documentId,

                fileName,

                characters:
                    cleanedText.length,

                chunks

            });

        } catch (error) {

            console.error(
                "OCR TEXT ERROR:",
                error
            );

            res.status(500).json({

                success: false,

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
    async function (req, res) {

        try {

            const [
                rows
            ] =
                await db
                    .promise()
                    .query(
                        `
                        SELECT
                            id,
                            user_id,
                            file_name,
                            file_path,
                            created_at,
                            CHAR_LENGTH(
                                extracted_text
                            ) AS text_length
                        FROM documents
                        ORDER BY id DESC
                        `
                    );

            res.json({

                success: true,

                documents:
                    rows

            });

        } catch (error) {

            console.error(
                "GET DOCUMENTS ERROR:",
                error
            );

            res.status(500).json({

                success: false,

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
    async function (req, res) {

        try {

            const [
                rows
            ] =
                await db
                    .promise()
                    .query(
                        `
                        SELECT
                            id,
                            user_id,
                            file_name,
                            file_path,
                            extracted_text,
                            created_at
                        FROM documents
                        ORDER BY id DESC
                        LIMIT 1
                        `
                    );

            if (
                rows.length === 0
            ) {

                return res.json({

                    success: true,

                    document:
                        null

                });

            }

            res.json({

                success: true,

                document:
                    rows[0]

            });

        } catch (error) {

            console.error(
                "LATEST DOCUMENT ERROR:",
                error
            );

            res.status(500).json({

                success: false,

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

                    success: true,

                    query,

                    results: []

                });

            }

            const [
                chunks
            ] =
                await db
                    .promise()
                    .query(
                        `
                        SELECT
                            id,
                            document_id,
                            chunk_index,
                            chunk_text
                        FROM document_chunks
                        WHERE document_id = ?
                        ORDER BY chunk_index ASC
                        `,
                        [documentId]
                    );

            const scored =
                chunks.map(
                    chunk => {

                        const lowerText =
                            chunk.chunk_text
                                .toLowerCase();

                        let score = 0;

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
                    .slice(0, 8);

            res.json({

                success: true,

                query,

                results

            });

        } catch (error) {

            console.error(
                "DOCUMENT SEARCH ERROR:",
                error
            );

            res.status(500).json({

                success: false,

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

            // -----------------------------
            // GET DOCUMENT
            // -----------------------------

            const [
                documentRows
            ] =
                await db
                    .promise()
                    .query(
                        `
                        SELECT
                            id,
                            file_name
                        FROM documents
                        WHERE id = ?
                        LIMIT 1
                        `,
                        [documentId]
                    );

            if (
                documentRows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Document not found."

                });

            }

            // -----------------------------
            // QUESTION WORDS
            // -----------------------------

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

            // -----------------------------
            // GET CHUNKS
            // -----------------------------

            const [
                chunks
            ] =
                await db
                    .promise()
                    .query(
                        `
                        SELECT
                            id,
                            document_id,
                            chunk_index,
                            chunk_text
                        FROM document_chunks
                        WHERE document_id = ?
                        ORDER BY chunk_index ASC
                        `,
                        [documentId]
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

            // -----------------------------
            // SCORE CHUNKS
            // -----------------------------

            const scored =
                chunks.map(
                    chunk => {

                        const lowerText =
                            chunk.chunk_text
                                .toLowerCase();

                        let score = 0;

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
                    .slice(0, 6);

            if (
                relevantChunks.length === 0
            ) {

                return res.json({

                    success: true,

                    question,

                    answer:
                        "I could not find relevant information in the selected question bank.",

                    sources: []

                });

            }

            // -----------------------------
            // BUILD CONTEXT
            // -----------------------------

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

            // -----------------------------
            // GROQ
            // -----------------------------

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
                                ].join(" ")

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
                    ?.trim()
                ||
                "I could not generate an answer.";

            res.json({

                success: true,

                question,

                answer,

                model:
                    GROQ_MODEL,

                documentId,

                documentName:
                    documentRows[0]
                        .file_name,

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

            res.status(500).json({

                success: false,

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

            // -----------------------------
            // TEMPORARY MEMORY
            // -----------------------------

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
                    .filter(Boolean)
                    .join(" ");

            // -----------------------------
            // BUILD MESSAGES
            // -----------------------------

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

            // -----------------------------
            // GROQ
            // -----------------------------

            const completion =
                await groq.chat.completions.create({

                    model:
                        GROQ_MODEL,

                    temperature:
                        0.4,

                    max_completion_tokens:
                        1200,

                    messages

                });

            const reply =
                completion
                    .choices?.[0]
                    ?.message
                    ?.content
                    ?.trim()
                ||
                "Sorry, I could not generate a response.";

            res.json({

                success: true,

                reply,

                model:
                    GROQ_MODEL

            });

        } catch (error) {

            console.error(
                "CHAT ERROR:",
                error
            );

            res.status(500).json({

                success: false,

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

            const [
                rows
            ] =
                await db
                    .promise()
                    .query(
                        `
                        SELECT
                            id,
                            user_id,
                            file_name,
                            file_path,
                            extracted_text,
                            created_at
                        FROM documents
                        WHERE id = ?
                        LIMIT 1
                        `,
                        [documentId]
                    );

            if (
                rows.length === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Document not found."

                });

            }

            res.json({

                success: true,

                document:
                    rows[0]

            });

        } catch (error) {

            console.error(
                "GET DOCUMENT ERROR:",
                error
            );

            res.status(500).json({

                success: false,

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

            const [
                result
            ] =
                await db
                    .promise()
                    .query(
                        `
                        DELETE FROM documents
                        WHERE id = ?
                        `,
                        [documentId]
                    );

            if (
                result.affectedRows === 0
            ) {

                return res.status(404).json({

                    success: false,

                    message:
                        "Document not found."

                });

            }

            res.json({

                success: true,

                message:
                    "Document deleted successfully.",

                documentId

            });

        } catch (error) {

            console.error(
                "DELETE DOCUMENT ERROR:",
                error
            );

            res.status(500).json({

                success: false,

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

function escapeRegExp(string) {

    return String(string).replace(
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

                    success: false,

                    message:
                        "PDF is too large. Maximum size is 100 MB."

                });

            }

            if (
                error.code ===
                "LIMIT_UNEXPECTED_FILE"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        'Unexpected upload field. Use field name "document".'

                });

            }

        }

        res.status(500).json({

            success: false,

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
            "MySQL database: configured"
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
            "Optimized chunk insertion: enabled"
        );

        console.log(
            "========================================"
        );

    }
);