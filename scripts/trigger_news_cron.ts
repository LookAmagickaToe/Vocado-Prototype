/**
 * Script to manually trigger the news cron job
 */

const CRON_SECRET = process.env.CRON_SECRET || 'some_variable_for_security_9e0b'
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

async function triggerCron() {
    console.log('🚀 Triggering news cron job...\n')

    try {
        const response = await fetch(`${BASE_URL}/api/cron/news`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${CRON_SECRET}`,
                'Content-Type': 'application/json'
            }
        })

        if (!response.ok) {
            const text = await response.text()
            throw new Error(`HTTP ${response.status}: ${text}`)
        }

        const result = await response.json()

        console.log('📊 Results:')
        console.log(`   ✅ Processed: ${result.processed}`)
        console.log(`   ❌ Errors: ${result.errors}`)
        console.log(`   ⏭️  Skipped: ${result.skipped}`)

        if (result.details && result.details.length > 0) {
            console.log('\n📋 Details:')
            result.details.forEach((detail: string) => {
                console.log(`   ${detail}`)
            })
        }

        console.log('\n✨ Cron job completed!')
    } catch (error) {
        console.error('💥 Error triggering cron:', error)
        process.exit(1)
    }
}

triggerCron()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('💥 Fatal error:', error)
        process.exit(1)
    })
