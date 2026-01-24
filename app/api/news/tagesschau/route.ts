import { NextResponse } from "next/server"

const TAGESSCHAU_BASE = "https://tagesschau.api.bund.dev/api2/news"
const ALLOWED_RESSORTS = new Set([
  "ausland",
  "wirtschaft",
  "sport",
])

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const rawRessort = (searchParams.get("ressort") || "ausland").toLowerCase()
    const ressort = rawRessort === "world" ? "ausland" : rawRessort
    const query = ALLOWED_RESSORTS.has(ressort) ? `?ressort=${ressort}` : ""

    const response = await fetch(`${TAGESSCHAU_BASE}${query}`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      },
      cache: "no-store",
    })
    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch news (${response.status})` },
        { status: 500 }
      )
    }
    const data = await response.json()
    const items = Array.isArray(data?.news) ? data.news : []
    const mapped = items.map((item: any) => {
      const detailsUrl =
        item?.detailsweb || item?.shareurl || item?.details || item?.link || ""
      return {
        id: item?.externalId || item?.external_id || item?.id || item?.title || detailsUrl,
        title: item?.title || "Sin título",
        teaser: item?.teaser || "",
        date: item?.date || item?.datetime || "",
        url: detailsUrl,
        image:
          item?.teaserImage?.imageVariants?.["1x1-840"] ||
          item?.teaserImage?.imageVariants?.["1x1-720"] ||
          item?.teaserImage?.imageUrl ||
          "",
      }
    })
    return NextResponse.json({ items: mapped })
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch news", details: (error as Error).message },
      { status: 500 }
    )
  }
}
