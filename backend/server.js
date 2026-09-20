// ============================================================
// AI STUDY ASSISTANT - BACKEND
// ============================================================

// ------------------------------------------------------------
// IMPORTS
// ------------------------------------------------------------

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const pdfParse = require("pdf-parse");
const Groq = require("groq-sdk");

const db = require("./db");

dotenv.config();


// ------------------------------------------------------------
// APP
// ------------------------------------------------------------

const app = express();


// Railway provides PORT.
// Local development uses 5000.

const PORT = process.env.PORT || 5000;


// ------------------------------------------------------------
// GROQ
// ------------------------------------------------------------

if (!process.env.GROQ_API_KEY) {

    console.warn(
        "WARNING: GROQ_API_KEY is not loaded."
    );

}

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});


// Groq model

const GROQ_MODEL =
    "openai/gpt-oss-20b";


// ------------------------------------------------------------
// MIDDLEWARE
// ------------------------------------------------------------

app.use(
    cors({
        origin: true,
        credentials: true
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


// ------------------------------------------------------------
// UPLOAD DIRECTORY
// ------------------------------------------------------------

const uploadsDir =
    path.join(__dirname, "uploads");


if (!fs.existsSync(uploadsDir)) {

    fs.mkdirSync(
        uploadsDir,
        {
            recursive: true
        }
    );

}


// ------------------------------------------------------------
// MULTER
// ------------------------------------------------------------

const storage =
    multer.diskStorage({

        destination:
            function (req, file, cb) {

                cb(
                    null,
                    uploadsDir
                );

            },

        filename:
            function (req, file, cb) {

                const timestamp =
                    Date.now();

                const safeName =
                    file.originalname
                        .replace(
                            /[^a-zA-Z0-9._-]/g,
                            "_"
                        );

                cb(
                    null,
                    `${timestamp}-${safeName}`
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
            function (req, file, cb) {

                const isPDF =
                    file.mimetype ===
                    "application/pdf";

                if (isPDF) {

                    cb(
                        null,
                        true
                    );

                } else {

                    cb(
                        new Error(
                            "Only PDF files are allowed."
                        )
                    );

                }

            }

    });


// ============================================================
// HELPER FUNCTIONS
// ============================================================


// ------------------------------------------------------------
// CLEAN TEXT
// ------------------------------------------------------------

function cleanText(text) {

    if (!text) {

        return "";

    }

    return text
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{3,}/g, "\n\n")
        .trim();

}


// ------------------------------------------------------------
// CREATE CHUNKS
// ------------------------------------------------------------

function createChunks(
    text,
    chunkSize = 1200,
    overlap = 150
) {

    const chunks = [];

    if (!text) {

        return chunks;

    }


    let start = 0;

    let index = 0;


    while (
        start < text.length
    ) {

        const end =
            Math.min(
                start + chunkSize,
                text.length
            );


        const chunk =
            text
                .slice(
                    start,
                    end
                )
                .trim();


        if (chunk) {

            chunks.push({

                chunkIndex:
                    index,

                chunkText:
                    chunk

            });

        }


        index++;


        if (end >= text.length) {

            break;

        }


        start =
            end - overlap;

    }


    return chunks;

}


// ------------------------------------------------------------
// SEARCH SCORE
// ------------------------------------------------------------

function scoreChunk(
    chunkText,
    query
) {

    if (
        !chunkText ||
        !query
    ) {

        return 0;

    }


    const text =
        chunkText.toLowerCase();


    const words =
        query
            .toLowerCase()
            .split(/\s+/)
            .map(
                word =>
                    word.replace(
                        /[^a-z0-9]/g,
                        ""
                    )
            )
            .filter(
                word =>
                    word.length > 2
            );


    let score = 0;


    for (
        const word of words
    ) {

        if (
            text.includes(word)
        ) {

            score++;

        }

    }


    // Exact phrase gets additional weight

    if (
        text.includes(
            query.toLowerCase()
        )
    ) {

        score += 5;

    }


    return score;

}


// ------------------------------------------------------------
// GET DOCUMENT ID
// ------------------------------------------------------------

function getDocumentId(value) {

    const id =
        Number(value);


    if (
        !Number.isInteger(id) ||
        id <= 0
    ) {

        return null;

    }


    return id;

}


// ============================================================
// BASIC ROUTES
// ============================================================


// ------------------------------------------------------------
// ROOT
// ------------------------------------------------------------

app.get(
    "/",
    function (req, res) {

        res.json({

            success: true,

            message:
                "AI Study Assistant backend is running.",

            version:
                "2.0",

            features: [

                "PDF upload",

                "Browser OCR",

                "Document management",

                "Document search",

                "Question Bank AI",

                "Groq Chat Bot"

            ]

        });

    }
);


// ------------------------------------------------------------
// HEALTH
// ------------------------------------------------------------

app.get(
    "/api/health",
    function (req, res) {

        res.json({

            success: true,

            message:
                "Backend is healthy.",

            port:
                PORT,

            mysql:
                "enabled",

            pdfUpload:
                "enabled",

            browserOCR:
                "enabled",

            documentSearch:
                "enabled",

            groqAI:
                process.env.GROQ_API_KEY
                    ? "enabled"
                    : "disabled"

        });

    }
);


// ============================================================
// DOCUMENT UPLOAD
// ============================================================

app.post(
    "/api/documents/upload",
    upload.single("file"),
    async function (req, res) {

        try {

            if (!req.file) {

                return res.status(400).json({

                    success: false,

                    message:
                        "No PDF file uploaded."

                });

            }


            const userId =
                req.body.user_id ||
                req.body.userId ||
                null;


            const filePath =
                req.file.path;


            const originalName =
                req.file.originalname;


            // ------------------------------------------------
            // READ PDF
            // ------------------------------------------------

            const pdfBuffer =
                fs.readFileSync(
                    filePath
                );


            let pdfData;


            try {

                pdfData =
                    await pdfParse(
                        pdfBuffer
                    );

            } catch (pdfError) {

                console.error(
                    "PDF parsing error:",
                    pdfError
                );


                return res.status(400).json({

                    success: false,

                    message:
                        "Could not read this PDF."

                });

            }


            const extractedText =
                cleanText(
                    pdfData.text || ""
                );


            // ------------------------------------------------
            // SCANNED PDF
            // ------------------------------------------------

            if (
                extractedText.length < 20
            ) {

                return res.status(400).json({

                    success: false,

                    scanned: true,

                    message:
                        "This PDF appears to be scanned or image-based. Please use browser OCR."

                });

            }


            // ------------------------------------------------
            // SAVE DOCUMENT
            // ------------------------------------------------

            const [documentResult] =
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
                        VALUES (?, ?, ?, ?)
                        `,
                        [
                            userId,
                            originalName,
                            filePath,
                            extractedText
                        ]
                    );


            const documentId =
                documentResult.insertId;


            // ------------------------------------------------
            // CREATE CHUNKS
            // ------------------------------------------------

            const chunks =
                createChunks(
                    extractedText
                );


            for (
                const chunk of chunks
            ) {

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
                        VALUES (?, ?, ?)
                        `,
                        [
                            documentId,
                            chunk.chunkIndex,
                            chunk.chunkText
                        ]
                    );

            }


            // ------------------------------------------------
            // RESPONSE
            // ------------------------------------------------

            return res.json({

                success: true,

                message:
                    "PDF uploaded successfully.",

                documentId:
                    documentId,

                fileName:
                    originalName,

                extractedCharacters:
                    extractedText.length,

                chunks:
                    chunks.length

            });


        } catch (error) {

            console.error(
                "Upload error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Failed to upload PDF.",

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// BROWSER OCR TEXT SAVE
// ============================================================

app.post(
    "/api/documents/text",
    async function (req, res) {

        try {

            const {
                fileName,
                text,
                user_id,
                userId
            } = req.body;


            // ------------------------------------------------
            // VALIDATION
            // ------------------------------------------------

            if (!fileName) {

                return res.status(400).json({

                    success: false,

                    message:
                        "fileName is required."

                });

            }


            if (
                !text ||
                !text.trim()
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "OCR text is empty."

                });

            }


            const cleanedText =
                cleanText(
                    text
                );


            if (
                cleanedText.length < 20
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "OCR text is too short."

                });

            }


            // ------------------------------------------------
            // SAVE DOCUMENT
            // ------------------------------------------------

            const [documentResult] =
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
                        VALUES (?, ?, ?, ?)
                        `,
                        [
                            user_id ||
                            userId ||
                            null,

                            fileName,

                            null,

                            cleanedText
                        ]
                    );


            const documentId =
                documentResult.insertId;


            // ------------------------------------------------
            // CREATE CHUNKS
            // ------------------------------------------------

            const chunks =
                createChunks(
                    cleanedText
                );


            for (
                const chunk of chunks
            ) {

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
                        VALUES (?, ?, ?)
                        `,
                        [
                            documentId,
                            chunk.chunkIndex,
                            chunk.chunkText
                        ]
                    );

            }


            return res.json({

                success: true,

                message:
                    "OCR document saved successfully.",

                documentId:
                    documentId,

                fileName:
                    fileName,

                extractedCharacters:
                    cleanedText.length,

                chunks:
                    chunks.length

            });


        } catch (error) {

            console.error(
                "OCR save error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Failed to save OCR document.",

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// GET ALL DOCUMENTS
// ============================================================

app.get(
    "/api/documents",
    async function (req, res) {

        try {

            const userId =
                req.query.user_id ||
                req.query.userId ||
                null;


            let rows;


            if (userId) {

                [
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
                                CHAR_LENGTH(extracted_text)
                                AS text_length
                            FROM documents
                            WHERE user_id = ?
                            ORDER BY created_at DESC
                            `,
                            [
                                userId
                            ]
                        );

            } else {

                [
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
                                CHAR_LENGTH(extracted_text)
                                AS text_length
                            FROM documents
                            ORDER BY created_at DESC
                            `
                        );

            }


            return res.json({

                success: true,

                documents:
                    rows

            });


        } catch (error) {

            console.error(
                "Get documents error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Failed to load documents.",

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// GET LATEST DOCUMENT
// ============================================================

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
                            created_at,
                            CHAR_LENGTH(extracted_text)
                            AS text_length
                        FROM documents
                        ORDER BY created_at DESC
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


            return res.json({

                success: true,

                document:
                    rows[0]

            });


        } catch (error) {

            console.error(
                "Latest document error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Failed to load latest document.",

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// SEARCH DOCUMENTS
// IMPORTANT: THIS MUST COME BEFORE /:id
// ============================================================

app.get(
    "/api/documents/search",
    async function (req, res) {

        try {

            const query =
                String(
                    req.query.q ||
                    req.query.query ||
                    ""
                ).trim();


            const documentId =
                getDocumentId(
                    req.query.documentId
                );


            if (!query) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Search query is required."

                });

            }


            let rows;


            if (documentId) {

                [
                    rows
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
                            `,
                            [
                                documentId
                            ]
                        );

            } else {

                [
                    rows
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
                            `
                        );

            }


            const results =
                rows
                    .map(
                        row => ({

                            ...row,

                            score:
                                scoreChunk(
                                    row.chunk_text,
                                    query
                                )

                        })
                    )
                    .filter(
                        row =>
                            row.score > 0
                    )
                    .sort(
                        (a, b) =>
                            b.score -
                            a.score
                    )
                    .slice(
                        0,
                        8
                    );


            return res.json({

                success: true,

                query:
                    query,

                results:
                    results

            });


        } catch (error) {

            console.error(
                "Document search error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Search failed.",

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// GET SINGLE DOCUMENT
// ============================================================

app.get(
    "/api/documents/:id",
    async function (req, res) {

        try {

            const documentId =
                getDocumentId(
                    req.params.id
                );


            if (!documentId) {

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
                        [
                            documentId
                        ]
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


            return res.json({

                success: true,

                document:
                    rows[0]

            });


        } catch (error) {

            console.error(
                "Get document error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Failed to load document.",

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// DELETE DOCUMENT
// ============================================================

app.delete(
    "/api/documents/:id",
    async function (req, res) {

        try {

            const documentId =
                getDocumentId(
                    req.params.id
                );


            if (!documentId) {

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
                            file_path
                        FROM documents
                        WHERE id = ?
                        LIMIT 1
                        `,
                        [
                            documentId
                        ]
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


            const filePath =
                rows[0].file_path;


            // document_chunks are removed
            // automatically because of
            // ON DELETE CASCADE.

            await db
                .promise()
                .query(
                    `
                    DELETE FROM documents
                    WHERE id = ?
                    `,
                    [
                        documentId
                    ]
                );


            // ------------------------------------------------
            // DELETE LOCAL PDF FILE
            // ------------------------------------------------

            if (
                filePath &&
                fs.existsSync(filePath)
            ) {

                try {

                    fs.unlinkSync(
                        filePath
                    );

                } catch (fileError) {

                    console.warn(
                        "Could not delete local file:",
                        fileError.message
                    );

                }

            }


            return res.json({

                success: true,

                message:
                    "Document deleted successfully."

            });


        } catch (error) {

            console.error(
                "Delete document error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Failed to delete document.",

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// ASK AI - QUESTION BANK
// ============================================================

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

            const id =
                getDocumentId(
                    documentId
                );


            if (!id) {

                return res.status(400).json({

                    success: false,

                    message:
                        "A valid documentId is required."

                });

            }


            if (
                !question ||
                typeof question !== "string" ||
                !question.trim()
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter a question."

                });

            }


            const userQuestion =
                question.trim();


            if (
                userQuestion.length > 5000
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Question is too long."

                });

            }


            // ------------------------------------------------
            // GET DOCUMENT
            // ------------------------------------------------

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
                        [
                            id
                        ]
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


            // ------------------------------------------------
            // GET CHUNKS
            // ------------------------------------------------

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
                        [
                            id
                        ]
                    );


            if (
                chunks.length === 0
            ) {

                return res.json({

                    success: true,

                    answer:
                        "I could not find any extracted content in this question bank.",

                    sources: []

                });

            }


            // ------------------------------------------------
            // FIND RELEVANT CHUNKS
            // ------------------------------------------------

            const scoredChunks =
                chunks
                    .map(
                        chunk => ({

                            ...chunk,

                            score:
                                scoreChunk(
                                    chunk.chunk_text,
                                    userQuestion
                                )

                        })
                    )
                    .sort(
                        (a, b) =>
                            b.score -
                            a.score
                    );


            const relevantChunks =
                scoredChunks
                    .filter(
                        chunk =>
                            chunk.score > 0
                    )
                    .slice(
                        0,
                        6
                    );


            // ------------------------------------------------
            // NO RELEVANT CONTENT
            // ------------------------------------------------

            if (
                relevantChunks.length === 0
            ) {

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
                        (chunk, index) => {

                            return `
SOURCE ${index + 1}
Chunk ${chunk.chunk_index}

${chunk.chunk_text}
`;

                        }
                    )
                    .join("\n--------------------\n");


            // ------------------------------------------------
            // GROQ
            // ------------------------------------------------

            if (
                !process.env.GROQ_API_KEY
            ) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Groq API key is not configured."

                });

            }


            const completion =
                await groq.chat.completions.create({

                    model:
                        GROQ_MODEL,

                    temperature:
                        0.2,

                    max_completion_tokens:
                        1000,

                    messages: [

                        {
                            role:
                                "system",

                            content:
                                `
You are an AI Study Assistant.

Answer the student's question using ONLY the provided question-bank context.

Rules:

1. Do not invent information.
2. If the answer is not available in the context, clearly say that it was not found in the uploaded document.
3. Give a clear answer suitable for a college student.
4. Use headings or bullet points when useful.
5. Keep the answer focused on the student's question.

Question Bank Context:

${context}
`
                        },

                        {
                            role:
                                "user",

                            content:
                                userQuestion

                        }

                    ]

                });


            const answer =
                completion
                    ?.choices?.[0]
                    ?.message
                    ?.content;


            if (!answer) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Groq returned an empty answer."

                });

            }


            // ------------------------------------------------
            // RESPONSE
            // ------------------------------------------------

            return res.json({

                success: true,

                answer:
                    answer,

                model:
                    GROQ_MODEL,

                documentId:
                    id,

                documentName:
                    documentRows[0].file_name,

                sources:
                    relevantChunks.map(
                        chunk => ({

                            chunkId:
                                chunk.id,

                            chunkIndex:
                                chunk.chunk_index,

                            score:
                                chunk.score

                        })
                    )

            });


        } catch (error) {

            console.error(
                "Ask AI error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Failed to generate AI answer.",

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// GENERAL CHAT BOT - GROQ
// ============================================================

app.post(
    "/api/chat",
    async function (req, res) {

        try {

            const {
                message
            } = req.body;


            // ------------------------------------------------
            // VALIDATE
            // ------------------------------------------------

            if (
                !message ||
                typeof message !== "string" ||
                !message.trim()
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Please enter a message."

                });

            }


            const userMessage =
                message.trim();


            if (
                userMessage.length > 5000
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "Message is too long. Please keep it under 5000 characters."

                });

            }


            // ------------------------------------------------
            // CHECK GROQ KEY
            // ------------------------------------------------

            if (
                !process.env.GROQ_API_KEY
            ) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Groq API key is not configured on the backend."

                });

            }


            console.log(
                "Chatbot question:",
                userMessage
            );


            // ------------------------------------------------
            // GROQ CHAT
            // ------------------------------------------------

            const completion =
                await groq.chat.completions.create({

                    model:
                        GROQ_MODEL,

                    temperature:
                        0.4,

                    max_completion_tokens:
                        1200,

                    messages: [

                        {
                            role:
                                "system",

                            content:
                                `
You are an AI Study Assistant.

Help college students understand their subjects clearly.

You can help with:

- Programming
- C
- C++
- Python
- JavaScript
- Artificial Intelligence
- Machine Learning
- Data Science
- Algorithms
- Data Structures
- Databases
- MySQL
- Computer Networks
- Operating Systems
- Mathematics
- Exam preparation
- Project development
- General study questions

Rules:

1. Explain concepts clearly and simply.
2. Give examples when useful.
3. For programming questions, provide correct and understandable code.
4. For exam questions, organize answers with headings and key points.
5. Do not invent facts.
6. If you are uncertain, say so.
7. Keep answers useful for a college student.
8. This chatbot is a general AI assistant.
9. It does not automatically know the contents of the user's uploaded PDFs.
10. Do not claim that you searched an uploaded document unless document context was explicitly provided.
`
                        },

                        {
                            role:
                                "user",

                            content:
                                userMessage

                        }

                    ]

                });


            // ------------------------------------------------
            // GET RESPONSE
            // ------------------------------------------------

            const reply =
                completion
                    ?.choices?.[0]
                    ?.message
                    ?.content;


            if (!reply) {

                return res.status(500).json({

                    success: false,

                    message:
                        "Groq returned an empty response."

                });

            }


            // ------------------------------------------------
            // SEND RESPONSE
            // ------------------------------------------------

            return res.json({

                success: true,

                reply:
                    reply,

                model:
                    GROQ_MODEL

            });


        } catch (error) {

            console.error(
                "Groq chatbot error:",
                error
            );


            return res.status(500).json({

                success: false,

                message:
                    "Failed to generate AI response.",

                error:
                    error.message

            });

        }

    }
);


// ============================================================
// MULTER ERROR HANDLER
// ============================================================

app.use(
    function (error, req, res, next) {

        if (
            error instanceof multer.MulterError
        ) {

            if (
                error.code ===
                "LIMIT_FILE_SIZE"
            ) {

                return res.status(400).json({

                    success: false,

                    message:
                        "File is too large. Maximum size is 100 MB."

                });

            }


            return res.status(400).json({

                success: false,

                message:
                    error.message

            });

        }


        if (
            error &&
            error.message ===
            "Only PDF files are allowed."
        ) {

            return res.status(400).json({

                success: false,

                message:
                    error.message

            });

        }


        next(error);

    }
);


// ============================================================
// GENERAL ERROR HANDLER
// ============================================================

app.use(
    function (error, req, res, next) {

        console.error(
            "Unhandled server error:",
            error
        );


        return res.status(500).json({

            success: false,

            message:
                "Internal server error.",

            error:
                error.message

        });

    }
);


// ============================================================
// START SERVER
// ============================================================

app.listen(
    PORT,
    function () {

        console.log("");
        console.log(
            "=========================================="
        );

        console.log(
            "   AI STUDY ASSISTANT BACKEND"
        );

        console.log(
            "=========================================="
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
            "Question Bank AI: " +
            (
                process.env.GROQ_API_KEY
                    ? "enabled"
                    : "disabled"
            )
        );

        console.log(
            "Groq Chat Bot: " +
            (
                process.env.GROQ_API_KEY
                    ? "enabled"
                    : "disabled"
            )
        );

        console.log(
            "=========================================="
        );

        console.log("");

    }
);