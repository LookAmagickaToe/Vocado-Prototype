import { supabaseAdmin } from '../lib/supabase/admin'

async function checkTemplates() {
    const date = '2026-02-03'
    const category = 'world'
    const level = 'B2'
    const sourceLanguage = 'Deutsch'

    console.log(`🔍 Checking templates for: ${date}, ${category}, ${level}, ${sourceLanguage}\n`)

    const { data: templates, error } = await supabaseAdmin
        .from('daily_news_templates')
        .select('id, title, date, category, level, source_language')
        .eq('date', date)
        .eq('category', category)
        .eq('level', level)
        .eq('source_language', sourceLanguage)

    if (error) {
        console.error('❌ Error:', error)
        return
    }

    console.log(`📋 Found ${templates?.length || 0} templates:\n`)
    templates?.forEach((t, i) => {
        console.log(`${i + 1}. ${t.title}`)
        console.log(`   ID: ${t.id}\n`)
    })

    // Check all templates for today regardless of filters
    const { data: allTemplates } = await supabaseAdmin
        .from('daily_news_templates')
        .select('id, category, level, source_language')
        .eq('date', date)

    console.log(`\n📊 All templates for ${date}: ${allTemplates?.length || 0}`)
    const byCategory = allTemplates?.reduce((acc, t) => {
        const key = `${t.category}/${t.level}/${t.source_language}`
        acc[key] = (acc[key] || 0) + 1
        return acc
    }, {} as Record<string, number>)

    console.log('\nBreakdown by category/level/language:')
    Object.entries(byCategory || {}).forEach(([key, count]) => {
        console.log(`  ${key}: ${count}`)
    })
}

checkTemplates()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('💥 Error:', error)
        process.exit(1)
    })
