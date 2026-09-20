/* =====================================================
   AI STUDY ASSISTANT
   Browser PDF OCR + Railway Backend
===================================================== */
const API_BASE = "http://localhost:5000";


let selectedPDF = null;
let ocrCancelled = false;
let ocrWorker = null;


/* =====================================================
   PAGE ELEMENTS
===================================================== */

const pdfFile =
    document.getElementById("pdfFile");

const selectedFile =
    document.getElementById("selectedFile");

const uploadButton =
    document.getElementById("uploadButton");

const message =
    document.getElementById("message");

const progressWrap =
    document.getElementById("progressWrap");

const progressBar =
    document.getElementById("progressBar");

const progressTitle =
    document.getElementById("progressTitle");

const progressPercent =
    document.getElementById("progressPercent");

const progressDetail =
    document.getElementById("progressDetail");

const latestDocument =
    document.getElementById("latestDocument");

const documentStat =
    document.getElementById("documentStat");

const backendStat =
    document.getElementById("backendStat");

const statusText =
    document.getElementById("statusText");

const statusDot =
    document.getElementById("statusDot");


/* =====================================================
   INITIAL SETUP
===================================================== */

document.addEventListener("DOMContentLoaded", () => {

    progressWrap.style.display = "none";

    checkBackend();

    loadLatestDocument();

});


/* =====================================================
   FILE SELECTED
===================================================== */

function fileSelected() {

    const file =
        pdfFile.files[0];

    if (!file) {

        selectedPDF = null;

        selectedFile.textContent =
            "No file selected";

        uploadButton.style.display =
            "none";

        return;
    }


    /* Check PDF */

    if (
        file.type !== "application/pdf" &&
        !file.name.toLowerCase().endsWith(".pdf")
    ) {

        selectedPDF = null;

        selectedFile.textContent =
            "❌ Please select a PDF file.";

        uploadButton.style.display =
            "none";

        return;
    }


    selectedPDF = file;


    const sizeMB =
        file.size / 1024 / 1024;


    selectedFile.innerHTML =
        `
        <strong>${escapeHTML(file.name)}</strong>
        <br>
        <span>${sizeMB.toFixed(2)} MB</span>
        `;


    uploadButton.style.display =
        "inline-block";


    showMessage(
        "PDF selected. Click Upload & Process PDF.",
        "success"
    );

}


/* =====================================================
   UPLOAD PDF
===================================================== */

async function uploadPDF() {

    if (!selectedPDF) {

        showMessage(
            "Please choose a PDF first.",
            "error"
        );

        return;
    }


    uploadButton.disabled =
        true;


    ocrCancelled =
        false;


    progressWrap.style.display =
        "block";


    setProgress(
        0,
        "Preparing PDF...",
        "Checking PDF with backend..."
    );


    try {

        /*
         * First try normal server-side PDF extraction.
         */

        const formData =
            new FormData();

        formData.append(
            "document",
            selectedPDF
        );


        setProgress(
            5,
            "Uploading PDF",
            "Sending PDF to Railway backend..."
        );


        const response =
            await fetch(
                `${API_BASE}/api/documents/upload`,
                {
                    method: "POST",
                    body: formData
                }
            );


        let data = {};

        try {

            data =
                await response.json();

        } catch (error) {

            console.log(
                "Response was not JSON"
            );

        }


        /*
         * NORMAL TEXT PDF
         */

        if (
            response.ok &&
            data.success
        ) {

            setProgress(
                100,
                "Completed",
                "PDF text extracted successfully."
            );


            showMessage(
                "✅ PDF processed successfully.",
                "success"
            );


            await loadLatestDocument();


            uploadButton.disabled =
                false;


            return;
        }


        /*
         * SCANNED PDF
         *
         * Backend cannot extract text.
         * Start browser OCR.
         */

        if (
            response.status === 400 ||
            response.status === 422
        ) {

            const serverMessage =
                data.message || "";


            if (
                serverMessage
                    .toLowerCase()
                    .includes("scanned")
                ||
                serverMessage
                    .toLowerCase()
                    .includes("image")
                ||
                serverMessage
                    .toLowerCase()
                    .includes("extract")
            ) {

                showMessage(
                    "📷 Scanned PDF detected. Starting browser OCR...",
                    "warning"
                );


                await runBrowserOCR(
                    selectedPDF
                );


                uploadButton.disabled =
                    false;


                return;
            }

        }


        /*
         * OTHER SERVER ERROR
         */

        throw new Error(
            data.message ||
            `Server returned HTTP ${response.status}`
        );


    } catch (error) {

        console.error(
            "UPLOAD ERROR:",
            error
        );


        showMessage(
            "❌ " + error.message,
            "error"
        );


        progressWrap.style.display =
            "none";


    }


    uploadButton.disabled =
        false;

}


/* =====================================================
   BROWSER OCR
===================================================== */

async function runBrowserOCR(file) {

    try {

        ocrCancelled =
            false;


        setProgress(
            10,
            "Loading PDF",
            "Reading PDF pages..."
        );


        /*
         * Read PDF into memory.
         */

        const arrayBuffer =
            await file.arrayBuffer();


        /*
         * Load PDF.js document.
         */

        const pdf =
            await pdfjsLib.getDocument({
                data: arrayBuffer
            }).promise;


        const totalPages =
            pdf.numPages;


        console.log(
            "PDF pages:",
            totalPages
        );


        showMessage(
            `📄 Scanned PDF detected: ${totalPages} pages. Browser OCR started.`,
            "warning"
        );


        /*
         * Create ONE Tesseract worker.
         *
         * Important:
         * Do not create a new worker
         * for every page.
         */

        setProgress(
            12,
            "Starting OCR",
            "Loading OCR engine..."
        );


        ocrWorker =
            await Tesseract.createWorker(
                "eng"
            );


        let completeText =
            "";


        /*
         * OCR pages one by one.
         */

        for (
            let pageNumber = 1;
            pageNumber <= totalPages;
            pageNumber++
        ) {


            /*
             * Cancel check
             */

            if (ocrCancelled) {

                throw new Error(
                    "OCR cancelled by user."
                );

            }


            const percent =
                12 +
                Math.floor(
                    (
                        pageNumber /
                        totalPages
                    ) * 83
                );


            setProgress(
                percent,
                `OCR page ${pageNumber} of ${totalPages}`,
                "Reading page..."
            );


            console.log(
                `OCR page ${pageNumber}/${totalPages}`
            );


            /*
             * Get PDF page.
             */

            const page =
                await pdf.getPage(
                    pageNumber
                );


            /*
             * Scale.
             *
             * 1.25 is intentionally used
             * to reduce laptop RAM usage.
             */

            const viewport =
                page.getViewport({
                    scale: 1.25
                });


            /*
             * Create temporary canvas.
             */

            const canvas =
                document.createElement(
                    "canvas"
                );


            const context =
                canvas.getContext(
                    "2d",
                    {
                        willReadFrequently:
                            true
                    }
                );


            canvas.width =
                Math.floor(
                    viewport.width
                );


            canvas.height =
                Math.floor(
                    viewport.height
                );


            /*
             * Render PDF page.
             */

            await page.render({

                canvasContext:
                    context,

                viewport:
                    viewport

            }).promise;


            /*
             * OCR page.
             */

            const result =
                await ocrWorker.recognize(
                    canvas
                );


            const pageText =
                result.data.text ||
                "";


            /*
             * Add page separator.
             */

            completeText +=
                `\n\n===== PAGE ${pageNumber} =====\n\n` +
                pageText;


            /*
             * Release canvas memory.
             */

            canvas.width = 1;
            canvas.height = 1;

            canvas.remove();


            /*
             * Release PDF page.
             */

            page.cleanup();


            /*
             * Allow browser to breathe.
             */

            await sleep(20);

        }


        /*
         * OCR finished.
         */

        setProgress(
            96,
            "OCR completed",
            "Cleaning extracted text..."
        );


        /*
         * Terminate worker.
         */

        if (ocrWorker) {

            await ocrWorker.terminate();

            ocrWorker =
                null;

        }


        /*
         * Clean OCR result.
         */

        completeText =
            cleanOCRText(
                completeText
            );


        console.log(
            "OCR characters:",
            completeText.length
        );


        /*
         * Check OCR result.
         */

        if (
            completeText.length < 20
        ) {

            throw new Error(
                "OCR could not extract enough readable text from this PDF."
            );

        }


        /*
         * Save OCR text to Railway.
         */

        setProgress(
            98,
            "Saving document",
            `Saving ${completeText.length.toLocaleString()} characters to Railway MySQL...`
        );


        const saveResponse =
            await fetch(
                `${API_BASE}/api/documents/text`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body:
                        JSON.stringify({
                            fileName:
                                file.name,

                            text:
                                completeText
                        })
                }
            );


        let saveData = {};

        try {

            saveData =
                await saveResponse.json();

        } catch (error) {

            console.log(
                "Save response not JSON"
            );

        }


        if (
            !saveResponse.ok ||
            !saveData.success
        ) {

            throw new Error(
                saveData.message ||
                `Could not save OCR text. HTTP ${saveResponse.status}`
            );

        }


        /*
         * Success
         */

        setProgress(
            100,
            "Completed",
            "OCR text saved successfully."
        );


        showMessage(
            `🎉 PDF processed successfully! Document ID: ${saveData.documentId}`,
            "success"
        );


        await loadLatestDocument();


    } catch (error) {

        console.error(
            "OCR ERROR:",
            error
        );


        /*
         * Terminate worker if error occurs.
         */

        if (ocrWorker) {

            try {

                await ocrWorker.terminate();

            } catch (e) {

                console.log(e);

            }

            ocrWorker =
                null;

        }


        showMessage(
            "❌ OCR failed: " +
            error.message,
            "error"
        );


        progressDetail.textContent =
            error.message;

    }

}


/* =====================================================
   CANCEL OCR
===================================================== */

function cancelOCR() {

    if (!ocrWorker) {

        progressWrap.style.display =
            "none";

        return;
    }


    ocrCancelled =
        true;


    showMessage(
        "⏹️ Cancelling OCR...",
        "warning"
    );

}


/* =====================================================
   PROGRESS
===================================================== */

function setProgress(
    percent,
    title,
    detail
) {

    const safePercent =
        Math.max(
            0,
            Math.min(
                100,
                percent
            )
        );


    progressBar.style.width =
        safePercent + "%";


    progressPercent.textContent =
        safePercent + "%";


    progressTitle.textContent =
        title;


    progressDetail.textContent =
        detail;


    progressWrap.style.display =
        "block";

}


/* =====================================================
   BACKEND HEALTH
===================================================== */

async function checkBackend() {

    try {

        const response =
            await fetch(
                `${API_BASE}/`,
                {
                    method: "GET"
                }
            );


        const data =
            await response.json();


        if (
            response.ok &&
            data.success
        ) {

            statusText.textContent =
                "Backend Connected";


            backendStat.textContent =
                "Online";


            statusDot.classList.add(
                "online"
            );


        } else {

            throw new Error(
                "Backend returned an error."
            );

        }


    } catch (error) {

        console.error(
            "Backend health error:",
            error
        );


        statusText.textContent =
            "Backend Error";


        backendStat.textContent =
            "Offline";


        statusDot.classList.remove(
            "online"
        );

    }

}


/* =====================================================
   LOAD LATEST DOCUMENT
===================================================== */

async function loadLatestDocument() {

    try {

        const response =
            await fetch(
                `${API_BASE}/api/documents/latest`
            );


        const data =
            await response.json();


        if (
            !response.ok ||
            !data.success ||
            !data.document
        ) {

            documentStat.textContent =
                "None";


            latestDocument.innerHTML =
                `
                <p>
                    No documents found.
                </p>
                `;

            return;
        }


        const doc =
            data.document;


        documentStat.textContent =
            "#" + doc.id;


        const textLength =
            (
                doc.extracted_text ||
                ""
            ).length;


        latestDocument.innerHTML =
            `
            <div class="document-info">

                <p>
                    📄
                    <strong>
                        ${escapeHTML(
                            doc.file_name
                        )}
                    </strong>
                </p>

                <p>
                    Document ID:
                    <strong>
                        ${doc.id}
                    </strong>
                </p>

                <p>
                    Extracted characters:
                    <strong>
                        ${textLength.toLocaleString()}
                    </strong>
                </p>

                <p>
                    Uploaded:
                    ${formatDate(
                        doc.created_at
                    )}
                </p>

            </div>
            `;


    } catch (error) {

        console.error(
            "Latest document error:",
            error
        );


        latestDocument.innerHTML =
            `
            <p>
                ❌ Could not load latest document.
            </p>
            `;

    }

}


/* =====================================================
   CLEAN OCR TEXT
===================================================== */

function cleanOCRText(text) {

    return text

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


/* =====================================================
   ESCAPE HTML
===================================================== */

function escapeHTML(value) {

    return String(value)

        .replaceAll(
            "&",
            "&amp;"
        )

        .replaceAll(
            "<",
            "&lt;"
        )

        .replaceAll(
            ">",
            "&gt;"
        )

        .replaceAll(
            '"',
            "&quot;"
        )

        .replaceAll(
            "'",
            "&#039;"
        );

}


/* =====================================================
   DATE FORMAT
===================================================== */

function formatDate(value) {

    if (!value) {

        return "Unknown";

    }


    const date =
        new Date(value);


    if (
        Number.isNaN(
            date.getTime()
        )
    ) {

        return value;

    }


    return date.toLocaleString();

}


/* =====================================================
   MESSAGE
===================================================== */

function showMessage(
    text,
    type = "info"
) {

    message.textContent =
        text;


    message.className =
        "message " + type;


    message.style.display =
        "block";

}


/* =====================================================
   SLEEP
===================================================== */

function sleep(ms) {

    return new Promise(
        resolve =>
            setTimeout(
                resolve,
                ms
            )
    );

}