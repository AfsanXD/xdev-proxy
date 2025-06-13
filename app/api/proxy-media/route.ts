import { type NextRequest, NextResponse } from "next/server"

// This endpoint handles media content specifically
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get("url")

  if (!url) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 })
  }

  try {
    // Fetch the media content
    const response = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      },
    })

    // Create response headers
    const responseHeaders = new Headers()

    // Copy content type and other important headers
    const contentType = response.headers.get("Content-Type")
    if (contentType) responseHeaders.set("Content-Type", contentType)

    // Set CORS headers
    responseHeaders.set("Access-Control-Allow-Origin", "*")

    // Return the response
    return new NextResponse(response.body, {
      headers: responseHeaders,
    })
  } catch (error) {
    console.error("Media proxy error:", error)
    return NextResponse.json({ error: "Failed to fetch media content" }, { status: 500 })
  }
}
