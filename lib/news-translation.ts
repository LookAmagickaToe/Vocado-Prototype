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
   - Never swap "source" and "target", even if the original German template is closer to one language.
5. Maintain emoji fields unchanged
6. Keep examples contextually appropriate
7. "summary": Translate to ${targetLanguage}
8. "summary_source": Translate to ${sourceLanguage}
9. First translate "summary". Then keep vocabulary items only when their exact
   "target" word or phrase occurs verbatim in that translated summary. Copy the
   visible/inflected summary form into "target" and use "lemma" separately.
10. Set every vocabulary item's "conjugation" field to null. Conjugation tables
    are generated separately and validated against ${targetLanguage}.

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

    // Translation may legitimately drop a template term when no exact visible
    // equivalent occurs in the translated summary. It must never invent more.
    if (translated.items.length > original.items.length) {
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
