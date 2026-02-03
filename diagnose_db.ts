import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function diagnose() {
    const today = new Date().toISOString().split('T')[0]
    console.log(`Checking database for date: ${today}`)

    // Check daily_news_templates
    const { data: templates, error: templateError } = await supabase
        .from('daily_news_templates')
        .select('*')
        .eq('date', today)
        .eq('category', 'world')
        .eq('level', 'B2')

    console.log('\n=== daily_news_templates ===')
    if (templateError) {
        console.error('Error:', templateError)
    } else if (!templates || templates.length === 0) {
        console.log('❌ NO TEMPLATES FOUND for', { date: today, category: 'world', level: 'B2' })

        // Check if ANY templates exist
        const { data: allTemplates } = await supabase
            .from('daily_news_templates')
            .select('date, category, level, id')
            .limit(10)

        console.log('\nSample of existing templates:')
        console.table(allTemplates)
    } else {
        console.log(`✓ Found ${templates.length} templates`)
        templates.forEach(t => {
            console.log(`  - ${t.id}: ${t.title}`)
        })
    }

    // Check daily_news (translations)
    const { data: news, error: newsError } = await supabase
        .from('daily_news')
        .select('*')
        .eq('date', today)
        .eq('category', 'world')
        .eq('level', 'B2')
        .eq('target_language', 'Español')

    console.log('\n=== daily_news (translations) ===')
    if (newsError) {
        console.error('Error:', newsError)
    } else if (!news || news.length === 0) {
        console.log('❌ NO TRANSLATIONS FOUND for', { date: today, category: 'world', level: 'B2', target: 'Español' })
    } else {
        console.log(`✓ Found ${news.length} translations`)
    }
}

diagnose().then(() => process.exit(0)).catch(err => {
    console.error(err)
    process.exit(1)
})
