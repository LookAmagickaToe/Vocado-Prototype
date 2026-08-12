/**
 * Splits a word that is too long for one line into hyphenated chunks.
 * Chunks are balanced so a 22-character word becomes two ~11-character lines
 * rather than a full line plus a stub. Every chunk but the last ends in "-".
 */
function breakLongWord(word: string, maxChars: number): string[] {
    // One character of the budget is spent on the hyphen itself.
    const budget = Math.max(2, maxChars - 1)
    if (word.length <= maxChars) return [word]

    const chunkCount = Math.ceil(word.length / budget)
    const chunkSize = Math.ceil(word.length / chunkCount)

    const chunks: string[] = []
    for (let i = 0; i < word.length; i += chunkSize) {
        const chunk = word.slice(i, i + chunkSize)
        const isLast = i + chunkSize >= word.length
        chunks.push(isLast ? chunk : `${chunk}-`)
    }
    return chunks
}

/**
 * Formats a string to fit within a memory card.
 * Inserts line breaks (\n) at spaces or special characters if the current line exceeds maxChars.
 * Words that are still too long on their own are hyphenated across lines, so a
 * compound like "Menstruationsschmerzen" wraps instead of being shrunk to an
 * unreadable size.
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

    // A single word can still be wider than the card — hyphenate those.
    return lines.flatMap((line) => breakLongWord(line, maxChars)).join("\n");
}
