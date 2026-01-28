/**
 * Formats a string to fit within a memory card.
 * Inserts line breaks (\n) at spaces or special characters if the current line exceeds maxChars.
 * Words themselves are not broken unless there is no break point available.
 */
export function formatCardText(text: string, maxChars: number = 13): string {
    if (!text) return "";
    if (text.length < maxChars) return text;

    // Split by whitespace or special characters (, / .), keeping the delimiters
    const parts = text.split(/([\s,/\.]+)/).filter((p) => p !== "");

    let lines: string[] = [];
    let currentLine = "";

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        const nextPart = parts[i + 1] || "";

        // If this part is a delimiter and adding it + the next word would exceed maxChars, break early
        // This keeps delimiters like '/' or ' ' at the start of the next line or makes the break look more natural.
        const isDelimiter = /^[\s,/\.]+$/.test(part);
        const wouldExceedWithNext = currentLine.length + part.length + nextPart.length >= maxChars;

        if (currentLine.length > 0 && isDelimiter && wouldExceedWithNext) {
            lines.push(currentLine.trim());
            // For whitespace, we start fresh. For other delimiters, they start the new line.
            currentLine = part.trimStart();
        } else if (currentLine.length + part.length >= maxChars && currentLine.length > 0) {
            lines.push(currentLine.trim());
            currentLine = part.trimStart();
        } else {
            currentLine += part;
        }
    }

    if (currentLine) {
        lines.push(currentLine.trim());
    }

    return lines.join("\n");
}
