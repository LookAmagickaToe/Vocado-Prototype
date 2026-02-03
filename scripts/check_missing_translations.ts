import { supabaseAdmin } from '../lib/supabase/admin'

/**
 * Script to check which templates need translation
 */

async function checkMissingTranslations() {
    const date = '2026-02-03'
    const category = 'world'
    const level = 'B2'
    const sourceLanguage = 'Deutsch'
    const targetLanguage = 'Español'

    console.log('🔍 Checking templates and translations...\n')

    // Get all templates for this date/category/level
    const { data: templates, error: templateError } = await supabaseAdmin
        .from('daily_news_templates')
        .select('id, title, source_language')
        .eq('date', date)
        .eq('category', category)
        .eq('level', level)
        .eq('source_language', sourceLanguage)

    if (templateError) {
        console.error('❌ Error fetching templates:', templateError)
        return
    }

    console.log(`📋 Found ${templates?.length || 0} templates\n`)

    // Get existing translations
    const templateIds = templates?.map(t => t.id) || []
    const { data: translations, error: translationError } = await supabaseAdmin
        .from('daily_news')
        .select('template_id, target_language')
        .in('template_id', templateIds)
        .eq('target_language', targetLanguage)

    if (translationError) {
        console.error('❌ Error fetching translations:', translationError)
        return
    }

    const translatedIds = new Set(translations?.map(t => t.template_id) || [])

    console.log(`✅ Existing translations: ${translatedIds.size}`)
    console.log(`⏳ Need translation: ${templates.length - translatedIds.size}\n`)

    // Show which templates need translation
    templates?.forEach((template, i) => {
        const status = translatedIds.has(template.id) ? '✅' : '❌'
        console.log(`${status} Template ${i + 1}: ${template.title.substring(0, 50)}...`)
    })
}

checkMissingTranslations()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('💥 Error:', error)
        process.exit(1)
    })
