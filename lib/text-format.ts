/**
 * Formats a string to fit within a memory card.
 * Inserts line breaks (\n) at spaces or special characters if the current line exceeds maxChars.
 * Words themselves are not broken unless there is no break point available.
 */
export function formatCardText(text: string, maxChars: number = 13): string {
    if (!text) return "";
    if (text.length <= maxChars) return text;

    // Split by whitespace or special characters (, / .), keeping the delimiters
    // Regex captures: 
    // - sequence of whitespace: \s+
    // - sequence of special chars: [,/.]+
    const parts = text.split(/([\s,/\.]+)/).filter((p) => p !== "");

    let lines: string[] = [];
    let currentLine = "";

    for (const part of parts) {
        // If adding this part exceeds maxChars (and we already have text in currentLine), break.
        if (currentLine.length + part.length > maxChars && currentLine.length > 0) {
            lines.push(currentLine.trim());
            // If the part itself is a delimiter, we can either start the next line with it or omit it if it's just space.
            if (/^\s+$/.test(part)) {
                currentLine = "";
            } else {
                currentLine = part.trimStart();
            }
        } else {
            currentLine += part;
        }
    }

    if (currentLine) {
        lines.push(currentLine.trim());
    }

    return lines.join("\n");
}
