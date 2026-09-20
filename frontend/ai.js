const API_BASE =
    "http://localhost:5000";

const fileInput = document.getElementById("fileInput");
const chooseBtn = document.getElementById("chooseBtn");
const uploadBtn = document.getElementById("uploadBtn");
const fileName = document.getElementById("fileName");
const statusBox = document.getElementById("status");

let selectedFile = null;

chooseBtn.addEventListener("click", () => {
    fileInput.click();
});

fileInput.addEventListener("change", () => {
    selectedFile = fileInput.files[0];

    if (!selectedFile) return;

    if (selectedFile.type !== "application/pdf") {
        statusBox.innerHTML =
            "❌ Please select a PDF file.";
        return;
    }

    fileName.innerHTML =
        `${selectedFile.name} (${(selectedFile.size / 1024 / 1024).toFixed(2)} MB)`;

    statusBox.innerHTML =
        "✅ PDF selected. Click Upload & Process PDF.";
});

uploadBtn.addEventListener("click", async () => {

    if (!selectedFile) {
        statusBox.innerHTML =
            "❌ Please choose a PDF first.";
        return;
    }

    uploadBtn.disabled = true;

    try {

        statusBox.innerHTML =
            "⏳ Uploading PDF to backend...";

        const formData = new FormData();
        formData.append("document", selectedFile);

        const response = await fetch(
            `${API_BASE}/api/documents/upload`,
            {
                method: "POST",
                body: formData
            }
        );

        let data = {};

        try {
            data = await response.json();
        } catch {
            data = {};
        }

        /*
         * NORMAL TEXT PDF
         */
        if (response.ok && data.success) {

            statusBox.innerHTML =
                `✅ PDF processed successfully.<br>
                 Document ID: ${data.documentId || "created"}`;

            await loadLatestDocument();

            uploadBtn.disabled = false;
            return;
        }

        /*
         * SCANNED PDF
         *
         * Backend returns 400 when pdf-parse
         * cannot extract enough text.
         */
        if (
            response.status === 400 &&
            (
                data.message?.toLowerCase().includes("scanned") ||
                data.message?.toLowerCase().includes("image") ||
                data.message?.toLowerCase().includes("extract")
            )
        ) {

            statusBox.innerHTML =
                "📷 Scanned PDF detected.<br>" +
                "⏳ Starting browser OCR...<br>" +
                "Please keep this tab open.";

            await runBrowserOCR(selectedFile);

            uploadBtn.disabled = false;
            return;
        }

        /*
         * OTHER ERROR
         */
        statusBox.innerHTML =
            `❌ Upload failed.<br>${data.message || "Unknown server error"}`;

    } catch (error) {

        console.error(error);

        statusBox.innerHTML =
            `❌ Connection error.<br>${error.message}`;

    }

    uploadBtn.disabled = false;
});


/* =====================================================
   BROWSER OCR
   ===================================================== */

async function runBrowserOCR(file) {

    try {

        statusBox.innerHTML =
            "📖 Reading PDF pages...";

        const arrayBuffer = await file.arrayBuffer();

        const pdf = await pdfjsLib.getDocument({
            data: arrayBuffer
        }).promise;

        const totalPages = pdf.numPages;

        statusBox.innerHTML =
            `📄 PDF loaded: ${totalPages} pages.<br>
             Starting OCR...`;

        /*
         * Create ONE OCR worker.
         * Reuse it for every page.
         */
        const worker =
            await Tesseract.createWorker("eng");

        let completeText = "";

        for (let pageNumber = 1;
             pageNumber <= totalPages;
             pageNumber++) {

            statusBox.innerHTML =
                `🔎 OCR processing page ${pageNumber} of ${totalPages}...<br>
                 ${Math.round(
                     (pageNumber / totalPages) * 100
                 )}% complete`;

            const page =
                await pdf.getPage(pageNumber);

            /*
             * Lower scale reduces RAM usage.
             */
            const viewport =
                page.getViewport({
                    scale: 1.25
                });

            const canvas =
                document.createElement("canvas");

            const context =
                canvas.getContext("2d");

            canvas.width =
                Math.floor(viewport.width);

            canvas.height =
                Math.floor(viewport.height);

            await page.render({
                canvasContext: context,
                viewport: viewport
            }).promise;

            /*
             * OCR current page
             */
            const result =
                await worker.recognize(canvas);

            const pageText =
                result.data.text || "";

            completeText +=
                `\n\n--- PAGE ${pageNumber} ---\n\n` +
                pageText;

            /*
             * Release page memory
             */
            canvas.width = 1;
            canvas.height = 1;
        }

        await worker.terminate();

        completeText =
            cleanOCRText(completeText);

        if (completeText.length < 20) {

            statusBox.innerHTML =
                "❌ OCR could not read enough text from this PDF.";

            return;
        }

        statusBox.innerHTML =
            `✅ OCR completed.<br>
             Extracted ${completeText.length.toLocaleString()} characters.<br>
             Saving to Railway MySQL...`;

        /*
         * Save OCR text to backend
         */
        const saveResponse =
            await fetch(
                `${API_BASE}/api/documents/text`,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        fileName: file.name,
                        text: completeText
                    })
                }
            );

        const saveData =
            await saveResponse.json();

        if (!saveResponse.ok ||
            !saveData.success) {

            throw new Error(
                saveData.message ||
                "OCR text could not be saved."
            );
        }

        statusBox.innerHTML =
            `🎉 PDF processed successfully!<br>
             OCR text saved to Railway MySQL.<br>
             Document ID: ${saveData.documentId}`;

        await loadLatestDocument();

    } catch (error) {

        console.error("OCR ERROR:", error);

        statusBox.innerHTML =
            `❌ OCR failed.<br>
             ${error.message}`;

    }
}


/* =====================================================
   CLEAN OCR TEXT
   ===================================================== */

function cleanOCRText(text) {

    return text
        .replace(/\r/g, "")
        .replace(/[ \t]+/g, " ")
        .replace(/\n{4,}/g, "\n\n")
        .trim();
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

        if (!data.success || !data.document) {
            return;
        }

        const doc = data.document;

        const latest =
            document.getElementById(
                "latestDocument"
            );

        if (latest) {

            latest.innerHTML = `
                <h2>Latest Document</h2>

                <p>
                    📄 <strong>
                    ${escapeHTML(doc.file_name)}
                    </strong>
                </p>

                <p>
                    Document ID:
                    ${doc.id}
                </p>

                <p>
                    Extracted characters:
                    ${(doc.extracted_text || "").length.toLocaleString()}
                </p>

                <p>
                    Uploaded:
                    ${new Date(doc.created_at).toLocaleString()}
                </p>
            `;
        }

    } catch (error) {

        console.error(
            "Latest document error:",
            error
        );
    }
}


/* =====================================================
   HTML SAFETY
   ===================================================== */

function escapeHTML(value) {

    return String(value)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}


/* =====================================================
   BACKEND HEALTH
   ===================================================== */

async function checkBackend() {

    const backendStatus =
        document.getElementById(
            "backendStatus"
        );

    try {

        const response =
            await fetch(
                `${API_BASE}/`
            );

        const data =
            await response.json();

        if (response.ok && data.success) {

            if (backendStatus) {
                backendStatus.innerHTML =
                    "🟢 Backend Connected";
            }

        } else {

            if (backendStatus) {
                backendStatus.innerHTML =
                    "🔴 Backend Error";
            }
        }

    } catch (error) {

        console.error(error);

        if (backendStatus) {
            backendStatus.innerHTML =
                "🔴 Backend Connection Failed";
        }
    }
}


checkBackend();
loadLatestDocument();