// =====================================================
// AI STUDY ASSISTANT BACKEND
// Node.js + Express + MySQL + PDF + OCR + Groq AI
// =====================================================

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const Groq = require("groq-sdk");

const { PDFParse } = require("pdf-parse");
const db = require("./db");

dotenv.config();

// =====================================================
// APP
// =====================================================

const app = express();
const PORT = process.env.PORT || 5000;

// =====================================================
// GROQ
// =====================================================

if (!process.env.GROQ_API_KEY) {
    console.warn("WARNING: GROQ_API_KEY is not loaded.");
}

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

const GROQ_MODEL = "openai/gpt-oss-20b";

// =====================================================
// MIDDLEWARE
// =====================================================

app.use(cors({ origin: "*" }));

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
// UPLOAD DIRECTORY
// =====================================================

const uploadDirectory = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDirectory)) {
    fs.mkdirSync(uploadDirectory, {
        recursive: true
    });
}

// =====================================================
// MULTER
// =====================================================

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDirectory);
    },

    filename: function (req, file, cb) {
        const uniqueName =
            Date.now() +
            "-" +
            Math.round(Math.random() * 100000) +
            "-" +
            file.originalname.replace(
                /[^a-zA-Z0-9._-]/g,
                "_"
            );

        cb(null, uniqueName);
    }
});

const upload = multer({
    storage,

    limits: {
        fileSize: 100 * 1024 * 1024
    },

    fileFilter: function (req, file, cb) {
        if (file.mimetype !== "application/pdf") {
            return cb(
                new Error("Only PDF files are allowed.")
            );
        }

        cb(null, true);
    }
});

// =====================================================
// ROOT
// =====================================================

app.get("/", function (req, res) {
    res.json({
        success: true,
        message: "AI Study Assistant backend is running.",
        status: "online",
        database: "MySQL",
        ai: "Groq"
    });
});

// =====================================================
// HEALTH
// =====================================================

app.get("/api/health", async function (req, res) {
    try {
        await db.promise().query("SELECT 1");

        res.json({
            success: true,
            backend: "online",
            database: "connected",
            groq: process.env.GROQ_API_KEY
                ? "configured"
                : "not configured"
        });

    } catch (error) {
        console.error("HEALTH ERROR:", error);

        res.status(500).json({
            success: false,
            backend: "online",
            database: "error"
        });
    }
});

// =====================================================
// TEXT CLEANING
// =====================================================

function cleanText(text) {
    if (!text) {
        return "";
    }

    return String(text)
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{4,}/g, "\n\n")
        .trim();
}

// =====================================================
// CHUNK CREATION
// =====================================================

async function createChunks(documentId, text) {

    const chunkSize = 1200;
    const overlap = 150;

    let start = 0;
    let chunkIndex = 0;

    while (start < text.length) {

        const chunk = text
            .substring(start, start + chunkSize)
            .trim();

        if (chunk.length > 0) {

            await db.promise().query(
                `
                INSERT INTO document_chunks
                (
                    document_id,
                    chunk_index,
                    chunk_text
                )
                VALUES (?, ?, ?)
                `,
                [
                    documentId,
                    chunkIndex,
                    chunk
                ]
            );

            chunkIndex++;
        }

        start += chunkSize - overlap;
    }

    return chunkIndex;
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
                    message: "Please upload a PDF file."
                });
            }

            filePath = req.file.path;

            const originalFileName =
                req.file.originalname;

            console.log(
                "PDF received:",
                originalFileName
            );

            const pdfBuffer =
                fs.readFileSync(filePath);

            const parser =
                new PDFParse({
                    data: pdfBuffer
                });

            const result =
                await parser.getText();

            const extractedText =
                cleanText(result.text);

            await parser.destroy();

            console.log(
                "Extracted characters:",
                extractedText.length
            );

            // ------------------------------------------------
            // SCANNED PDF
            // ------------------------------------------------

            if (extractedText.length < 20) {

                try {
                    fs.unlinkSync(filePath);
                } catch (error) {
                    console.log(
                        "Cleanup failed:",
                        error.message
                    );
                }

                return res.status(400).json({
                    success: false,
                    scanned: true,
                    message:
                        "Scanned/image PDF detected. Browser OCR is required."
                });
            }

            // ------------------------------------------------
            // SAVE DOCUMENT
            // ------------------------------------------------

            const [documentResult] =
                await db.promise().query(
                    `
                    INSERT INTO documents
                    (
                        user_id,
                        file_name,
                        file_path,
                        extracted_text
                    )
                    VALUES (?, ?, ?, ?)
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

            const chunks =
                await createChunks(
                    documentId,
                    extractedText
                );

            res.json({
                success: true,
                message:
                    "PDF uploaded and processed successfully.",
                documentId,
                fileName: originalFileName,
                characters: extractedText.length,
                chunks
            });

        } catch (error) {

            console.error(
                "PDF UPLOAD ERROR:",
                error
            );

            if (
                filePath &&
                fs.existsSync(filePath)
            ) {
                try {
                    fs.unlinkSync(filePath);
                } catch {}
            }

            res.status(500).json({
                success: false,
                message: "Failed to process PDF.",
                error: error.message
            });
        }
    }
);

// =====================================================
// SAVE BROWSER OCR TEXT
// =====================================================

app.post(
    "/api/documents/text",
    async function (req, res) {

        try {

            const {
                fileName,
                text
            } = req.body;

            if (!fileName || !text) {
                return res.status(400).json({
                    success: false,
                    message:
                        "File name and text are required."
                });
            }

            const cleanedText =
                cleanText(text);

            if (cleanedText.length < 20) {
                return res.status(400).json({
                    success: false,
                    message:
                        "OCR text is too short."
                });
            }

            const [documentResult] =
                await db.promise().query(
                    `
                    INSERT INTO documents
                    (
                        user_id,
                        file_name,
                        file_path,
                        extracted_text
                    )
                    VALUES (?, ?, ?, ?)
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

            res.json({
                success: true,
                message:
                    "OCR text saved successfully.",
                documentId,
                fileName,
                characters: cleanedText.length,
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
                error: error.message
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

            const [rows] =
                await db.promise().query(
                    `
                    SELECT
                        id,
                        user_id,
                        file_name,
                        file_path,
                        created_at,
                        CHAR_LENGTH(extracted_text)
                        AS text_length
                    FROM documents
                    ORDER BY id DESC
                    `
                );

            res.json({
                success: true,
                documents: rows
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
                error: error.message
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

            const [rows] =
                await db.promise().query(
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

            if (rows.length === 0) {
                return res.json({
                    success: true,
                    document: null
                });
            }

            res.json({
                success: true,
                document: rows[0]
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
                error: error.message
            });
        }
    }
);

// =====================================================
// SEARCH DOCUMENT
// IMPORTANT: THIS ROUTE MUST COME BEFORE /:id
// =====================================================

app.get(
    "/api/documents/search",
    async function (req, res) {

        try {

            const documentId =
                Number(req.query.documentId);

            const query =
                String(req.query.q || "").trim();

            if (!Number.isInteger(documentId)) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Valid documentId is required."
                });
            }

            if (!query) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Search question is required."
                });
            }

            const words =
                query
                    .toLowerCase()
                    .replace(/[^a-z0-9\s]/g, " ")
                    .split(/\s+/)
                    .filter(
                        word => word.length > 2
                    );

            if (words.length === 0) {
                return res.json({
                    success: true,
                    query,
                    results: []
                });
            }

            const [chunks] =
                await db.promise().query(
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
                chunks.map(chunk => {

                    const lowerText =
                        chunk.chunk_text.toLowerCase();

                    let score = 0;

                    for (const word of words) {

                        const escaped =
                            word.replace(
                                /[.*+?^${}()|[\]\\]/g,
                                "\\$&"
                            );

                        const matches =
                            lowerText.match(
                                new RegExp(
                                    escaped,
                                    "g"
                                )
                            );

                        if (matches) {
                            score += matches.length;
                        }
                    }

                    return {
                        ...chunk,
                        score
                    };
                });

            const results =
                scored
                    .filter(item => item.score > 0)
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
                "SEARCH ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Document search failed.",
                error: error.message
            });
        }
    }
);

// =====================================================
// GROQ AI ASK
// =====================================================

app.post(
    "/api/ai/ask",
    async function (req, res) {

        try {

            const {
                documentId,
                question
            } = req.body;

            // ------------------------------------------------
            // VALIDATION
            // ------------------------------------------------

            if (
                !documentId ||
                !Number.isInteger(Number(documentId))
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Valid documentId is required."
                });
            }

            if (
                !question ||
                !String(question).trim()
            ) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Question is required."
                });
            }

            if (!process.env.GROQ_API_KEY) {
                return res.status(500).json({
                    success: false,
                    message:
                        "Groq API key is not configured."
                });
            }

            const id =
                Number(documentId);

            const userQuestion =
                String(question).trim();

            // ------------------------------------------------
            // SEARCH RELEVANT CHUNKS
            // ------------------------------------------------

            const words =
                userQuestion
                    .toLowerCase()
                    .replace(/[^a-z0-9\s]/g, " ")
                    .split(/\s+/)
                    .filter(
                        word => word.length > 2
                    );

            const [chunks] =
                await db.promise().query(
                    `
                    SELECT
                        id,
                        chunk_index,
                        chunk_text
                    FROM document_chunks
                    WHERE document_id = ?
                    ORDER BY chunk_index ASC
                    `,
                    [id]
                );

            if (chunks.length === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        "No content found for this document."
                });
            }

            // ------------------------------------------------
            // SCORE CHUNKS
            // ------------------------------------------------

            const scored =
                chunks.map(chunk => {

                    const text =
                        chunk.chunk_text.toLowerCase();

                    let score = 0;

                    for (const word of words) {

                        const escaped =
                            word.replace(
                                /[.*+?^${}()|[\]\\]/g,
                                "\\$&"
                            );

                        const matches =
                            text.match(
                                new RegExp(
                                    escaped,
                                    "g"
                                )
                            );

                        if (matches) {
                            score += matches.length;
                        }
                    }

                    return {
                        ...chunk,
                        score
                    };
                });

            const relevantChunks =
                scored
                    .filter(
                        item => item.score > 0
                    )
                    .sort(
                        (a, b) =>
                            b.score - a.score
                    )
                    .slice(0, 6);

            // ------------------------------------------------
            // IF NOTHING MATCHES
            // ------------------------------------------------

            if (relevantChunks.length === 0) {
                return res.json({
                    success: true,
                    answer:
                        "I could not find relevant information for this question in the uploaded question bank.",
                    sources: []
                });
            }

            // ------------------------------------------------
            // BUILD CONTEXT
            // ------------------------------------------------

            const context =
                relevantChunks
                    .map(
                        (chunk, index) =>
                            `SOURCE ${index + 1}:\n${chunk.chunk_text}`
                    )
                    .join("\n\n");

            // ------------------------------------------------
            // GROQ
            // ------------------------------------------------

            const completion =
                await groq.chat.completions.create({

                    model: GROQ_MODEL,

                    temperature: 0.2,

                    max_completion_tokens: 1000,

                    messages: [

                        {
                            role: "system",

                            content:
                                `
You are an AI Study Assistant.

Answer the student's question using ONLY
the provided question-bank context.

If the answer is not available in the
context, clearly say that the information
was not found in the uploaded document.

Do not invent facts.

Give a clear, simple answer suitable for
a college student.

Context:
${context}
`
                        },

                        {
                            role: "user",

                            content:
                                userQuestion
                        }
                    ]
                });

            const answer =
                completion
                    .choices?.[0]
                    ?.message
                    ?.content
                    ?.trim();

            res.json({

                success: true,

                answer:
                    answer ||
                    "No answer was generated.",

                model:
                    GROQ_MODEL,

                sources:
                    relevantChunks.map(
                        chunk => ({
                            chunkId: chunk.id,
                            chunkIndex:
                                chunk.chunk_index,
                            score:
                                chunk.score
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
// GET ONE DOCUMENT
// =====================================================

app.get(
    "/api/documents/:id",
    async function (req, res) {

        try {

            const documentId =
                Number(req.params.id);

            if (!Number.isInteger(documentId)) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid document ID."
                });
            }

            const [rows] =
                await db.promise().query(
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

            if (rows.length === 0) {
                return res.status(404).json({
                    success: false,
                    message:
                        "Document not found."
                });
            }

            res.json({
                success: true,
                document: rows[0]
            });

        } catch (error) {

            console.error(
                "GET DOCUMENT ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Failed to load document."
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
                Number(req.params.id);

            if (!Number.isInteger(documentId)) {
                return res.status(400).json({
                    success: false,
                    message:
                        "Invalid document ID."
                });
            }

            const [result] =
                await db.promise().query(
                    `
                    DELETE FROM documents
                    WHERE id = ?
                    `,
                    [documentId]
                );

            if (result.affectedRows === 0) {
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
                "DELETE ERROR:",
                error
            );

            res.status(500).json({
                success: false,
                message:
                    "Failed to delete document.",
                error: error.message
            });
        }
    }
);

// =====================================================
// MULTER / SERVER ERROR
// =====================================================

app.use(
    function (error, req, res, next) {

        console.error(
            "SERVER ERROR:",
            error
        );

        if (
            error instanceof multer.MulterError &&
            error.code === "LIMIT_FILE_SIZE"
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "PDF is too large. Maximum size is 100 MB."
            });
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
            "MySQL: enabled"
        );

        console.log(
            "PDF upload: enabled"
        );

        console.log(
            "Browser OCR API: enabled"
        );

        console.log(
            "Document search: enabled"
        );

        console.log(
            "Groq AI: enabled"
        );

        console.log(
            "========================================"
        );
    }
);