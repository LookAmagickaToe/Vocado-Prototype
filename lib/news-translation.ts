/**
 * Translation utilities for news content
 * Handles translation of German news templates to other languages
 */

export function buildTranslationPrompt(templateJson: any, targetLanguage: string): string {
    return `You are translating a German news article template to ${targetLanguage}.

CRITICAL RULES:
1. Preserve the exact JSON structure
2. Translate ONLY the text values
3. Keep all field names in English
4. For vocabulary items: translate German↔German pairs to ${targetLanguage}↔${targetLanguage}
5. Maintain emoji fields unchanged
6. Keep examples and explanations contextually appropriate

Template to translate:
${JSON.stringify(templateJson, null, 2)}

Return ONLY the translated JSON, no additional text.`
}

export function extractVocabWords(templateJson: any): string[] {
    if (!templateJson.items || !Array.isArray(templateJson.items)) {
        return []
    }

    return templateJson.items
        .map((item: any) => item.primary || item.secondary)
        .filter(Boolean)
}

/**
 * Validates translated JSON matches template structure
 */
export function validateTranslation(original: any, translated: any): boolean {
    // Check both have items array
    if (!Array.isArray(original.items) || !Array.isArray(translated.items)) {
        return false
    }

    // Check same number of vocabulary items
    if (original.items.length !== translated.items.length) {
        return false
    }

    // Check all items have required fields
    return translated.items.every((item: any) =>
        item.primary && item.secondary && item.emoji
    )
}
