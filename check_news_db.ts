import { supabaseAdmin } from './lib/supabase/admin'

async function checkNews() {
    const today = new Date().toISOString().slice(0, 10)

    console.log('=== Checking daily_news_templates ===')
    const { data: templates } = await supabaseAdmin
        .from('daily_news_templates')
        .select('id, title, date, category, level')
        .eq('date', today)

    console.log(`Found ${templates?.length || 0} templates for ${today}`)
    templates?.forEach(t => {
        console.log(`  - ${t.id} | ${t.category} | ${t.level} | ${t.title}`)
    })

    console.log('\n=== Checking daily_news (cached translations) ===')
    const { data: news } = await supabaseAdmin
        .from('daily_news')
        .select('id, template_id, target_language, title, json')
        .eq('date', today)

    console.log(`Found ${news?.length || 0} cached translations for ${today}`)
    news?.forEach(n => {
        console.log(`  - ${n.id}`)
        console.log(`    Template: ${n.template_id}`)
        console.log(`    Target: ${n.target_language}`)
        console.log(`    Title: ${n.title}`)

        // Check if json field has news property
        let jsonData = n.json
        if (typeof jsonData === 'string') {
            try {
                jsonData = JSON.parse(jsonData)
            } catch (e) {
                console.log(`    ❌ Failed to parse JSON`)
                return
            }
        }

        if (jsonData && typeof jsonData === 'object') {
            console.log(`    JSON keys: ${Object.keys(jsonData).join(', ')}`)
            if ('news' in jsonData) {
                console.log(`    ✅ Has 'news' property`)
                const newsObj = (jsonData as any).news
                console.log(`       - title: ${newsObj?.title || 'missing'}`)
                console.log(`       - summary length: ${Array.isArray(newsObj?.summary) ? newsObj.summary.length : 0}`)
            } else {
                console.log(`    ❌ Missing 'news' property`)
            }
        }
    })
}

checkNews().catch(console.error)
