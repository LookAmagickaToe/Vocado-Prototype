import { createClient } from "@supabase/supabase-js"

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkTitles() {
  const { data: news, error } = await supabase
    .from("daily_news")
    .select("id, title, json")
    .limit(5)

  if (error) {
    console.error("Error:", error)
    return
  }

  news.forEach((n, i) => {
    let jsonTitle = "N/A"
    try {
        const p = typeof n.json === 'string' ? JSON.parse(n.json) : n.json
        jsonTitle = p.news?.title || "Missing"
    } catch (e) { jsonTitle = "Parse Error" }

    console.log(`[${i}] DB Column Title: "${n.title}"`)
    console.log(`    JSON Blob Title: "${jsonTitle}"`)
    console.log("---")
  })
}

checkTitles()
