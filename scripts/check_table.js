
const { createClient } = require("@supabase/supabase-js");
const dotenv = require("dotenv");

dotenv.config({ path: ".env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing env vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkTable(tableName) {
    console.log(`Checking table: ${tableName}`);
    const { data, error } = await supabase.from(tableName).select("count", { count: "exact", head: true });
    if (error) {
        console.log(`Error checking ${tableName}:`, error.message);
    } else {
        console.log(`Success! Table '${tableName}' exists.`);
    }
}

async function main() {
    await checkTable("news");
    await checkTable("News");
    await checkTable("daily_news");
    await checkTable("DailyNews");
    await checkTable("articles");
}

main();
