import jsPDF from "jspdf";

/**
 * Builds a readable Markdown transcript of a chat conversation, including
 * sources for each assistant answer.
 */
export function buildChatMarkdown(messages, projectName) {
    const lines = [`# Chat Export — ${projectName || "Project"}`, ""];

    messages.forEach((msg) => {
        if (msg.role === "user") {
            lines.push(`**You:** ${msg.text}`, "");
        } else {
            lines.push(`**Assistant:** ${msg.text}`, "");
            if (msg.sources && msg.sources.length > 0) {
                lines.push("_Sources:_");
                msg.sources.forEach((s) => {
                    lines.push(`- ${s.file_name}${s.page_number != null ? `, page ${s.page_number}` : ""}`);
                });
                lines.push("");
            }
        }
    });

    return lines.join("\n");
}

export function downloadTextFile(filename, content, mimeType = "text/markdown") {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
}

/**
 * Renders the same conversation as a simple paginated PDF using jsPDF.
 * Kept intentionally plain (no styling library) - this is meant to be a
 * readable record of the conversation, not a polished report.
 */
export function downloadChatAsPDF(messages, projectName) {
    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth();
    const margin = 15;
    const maxWidth = pageWidth - margin * 2;
    let y = 20;

    doc.setFontSize(16);
    doc.text(`Chat Export — ${projectName || "Project"}`, margin, y);
    y += 12;
    doc.setFontSize(11);

    const addWrappedText = (text, isBold) => {
        doc.setFont(undefined, isBold ? "bold" : "normal");
        const wrapped = doc.splitTextToSize(text, maxWidth);
        wrapped.forEach((line) => {
            if (y > 280) {
                doc.addPage();
                y = 20;
            }
            doc.text(line, margin, y);
            y += 6;
        });
        y += 3;
    };

    messages.forEach((msg) => {
        if (msg.role === "user") {
            addWrappedText(`You: ${msg.text}`, true);
        } else {
            addWrappedText(`Assistant: ${msg.text}`, false);
            if (msg.sources && msg.sources.length > 0) {
                const sourceLines = msg.sources
                    .map((s) => `${s.file_name}${s.page_number != null ? `, page ${s.page_number}` : ""}`)
                    .join("; ");
                doc.setFontSize(9);
                addWrappedText(`Sources: ${sourceLines}`, false);
                doc.setFontSize(11);
            }
        }
    });

    doc.save(`chat-export-${Date.now()}.pdf`);
}