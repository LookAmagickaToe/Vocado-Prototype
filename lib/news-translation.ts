/**
 * Translation utilities for news content
 * Handles translation of German news templates to other languages
 */

export function buildTranslationPrompt(templateJson: any, targetLanguage: string, sourceLanguage: string): string {
    return `You are translating a German news article template.
Target Language (Lesson Language): ${targetLanguage}
Source Language (Native Language): ${sourceLanguage}

CRITICAL RULES:
1. Preserve the exact JSON structure
2. Translate ONLY the text values
3. Keep all field names in English
4. For vocabulary items:
   - "source" field: Translate from German to ${sourceLanguage}
   - "target" field: Translate from German to ${targetLanguage}
   - "explanation": Translate to ${sourceLanguage}
5. Maintain emoji fields unchanged
6. Keep examples contextually appropriate
7. "summary": Translate to ${targetLanguage}
8. "summary_source": Translate to ${sourceLanguage}

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
    // Support both vocab format (primary/secondary) and news format (source/target)
    return translated.items.every((item: any) => {
        const hasVocabFields = item.primary && item.secondary
        const hasNewsFields = item.source && item.target
        return (hasVocabFields || hasNewsFields) && item.emoji
    })
}

export function extractJson(text: string) {
    const start = text.indexOf("{")
    const end = text.lastIndexOf("}")
    if (start >= 0 && end > start) {
        const slice = text.slice(start, end + 1)
        return JSON.parse(slice)
    }
    return JSON.parse(text)
}
