import { supabaseAdmin } from '../lib/supabase/admin'

/**
 * Script to fix NULL template_id values in daily_news table
 * Matches entries to templates based on matching fields
 */

async function fixNullTemplateIds() {
    console.log('🔧 Starting template_id fix...\n')

    // First, get all daily_news entries with NULL template_id
    const { data: entriesWithNullId, error: fetchError } = await supabaseAdmin
        .from('daily_news')
        .select('id, date, category, level, source_url, title, source_language')
        .is('template_id', null)

    if (fetchError) {
        console.error('❌ Error fetching entries:', fetchError)
        return
    }

    if (!entriesWithNullId || entriesWithNullId.length === 0) {
        console.log('✅ No entries with NULL template_id found!')
        return
    }

    console.log(`📋 Found ${entriesWithNullId.length} entries with NULL template_id\n`)

    let fixedCount = 0
    let notFoundCount = 0

    // Process each entry
    for (const entry of entriesWithNullId) {
        // Find matching template
        const { data: templates, error: templateError } = await supabaseAdmin
            .from('daily_news_templates')
            .select('id')
            .eq('date', entry.date)
            .eq('category', entry.category)
            .eq('level', entry.level)
            .eq('source_url', entry.source_url)
            .eq('title', entry.title)
            .eq('source_language', entry.source_language)

        if (templateError) {
            console.error(`❌ Error finding template for entry ${entry.id}:`, templateError)
            continue
        }

        if (!templates || templates.length === 0) {
            console.log(`⚠️  No matching template found for: ${entry.title}`)
            notFoundCount++
            continue
        }

        if (templates.length > 1) {
            console.warn(`⚠️  Multiple templates match for: ${entry.title} - using first match`)
        }

        // Update the entry with the template_id
        const { error: updateError } = await supabaseAdmin
            .from('daily_news')
            .update({ template_id: templates[0].id })
            .eq('id', entry.id)

        if (updateError) {
            console.error(`❌ Error updating entry ${entry.id}:`, updateError)
            continue
        }

        console.log(`✅ Fixed: ${entry.title} → template ${templates[0].id}`)
        fixedCount++
    }

    console.log(`\n📊 Results:`)
    console.log(`   ✅ Fixed: ${fixedCount}`)
    console.log(`   ⚠️  Not found: ${notFoundCount}`)
    console.log(`   📋 Total processed: ${entriesWithNullId.length}`)

    // Verify final state
    const { count: remainingNull } = await supabaseAdmin
        .from('daily_news')
        .select('id', { count: 'exact', head: true })
        .is('template_id', null)

    console.log(`\n🔍 Remaining NULL template_id entries: ${remainingNull || 0}`)
}

fixNullTemplateIds()
    .then(() => {
        console.log('\n✨ Script completed!')
        process.exit(0)
    })
    .catch((error) => {
        console.error('\n💥 Script failed:', error)
        process.exit(1)
    })
