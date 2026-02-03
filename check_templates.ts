
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";
dotenv.config({ path: ".env" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseKey) {
    console.error("Missing env vars");
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkTemplates() {
    const today = new Date().toISOString().slice(0, 10);
    console.log("Checking for date:", today);

    const { data, error } = await supabase
        .from("daily_news_templates")
        .select("*")
        .eq("date", today)
        .eq("category", "world")
        .eq("level", "A2");

    if (error) {
        console.error("Error:", error);
    } else {
        console.log(`Found ${data.length} templates for today.`);
        console.log(data);
    }
}

checkTemplates();
