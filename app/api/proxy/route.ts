import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  // Get the target URL from query parameters
  const { searchParams } = new URL(request.url)
  const targetUrl = searchParams.get("url")

  if (!targetUrl) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 })
  }

  try {
    // Validate URL
    const url = new URL(targetUrl)

    // For security, you might want to block certain domains
    const blockedDomains = ["localhost", "127.0.0.1", "internal.company.com"]
    if (blockedDomains.includes(url.hostname)) {
      return NextResponse.json({ error: "Access to this domain is not allowed" }, { status: 403 })
    }

    // Fetch the content from the target URL
    const response = await fetch(targetUrl, {
      headers: {
        // Set a user agent so websites don't block the request
        "User-Agent": "Mozilla/5.0 (compatible; ProxyBot/1.0; +https://example.com/bot)",
      },
    })

    // Read the response as text
    const content = await response.text()

    // Create a new response with the content
    return new NextResponse(content, {
      headers: {
        "Content-Type": response.headers.get("Content-Type") || "text/html",
        "Access-Control-Allow-Origin": "*",
      },
    })
  } catch (error) {
    console.error("Proxy error:", error)
    return NextResponse.json({ error: "Failed to fetch the requested URL" }, { status: 500 })
  }
}
