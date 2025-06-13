import { type NextRequest, NextResponse } from "next/server"

// This endpoint handles streaming media content like videos
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get("url")

  if (!url) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 })
  }

  try {
    // Get range header from request if present (for video streaming)
    const rangeHeader = request.headers.get("range")

    const headers = new Headers({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
    })

    // Add range header if present
    if (rangeHeader) {
      headers.set("Range", rangeHeader)
    }

    // Fetch the media content
    const response = await fetch(url, { headers })

    // Create response headers
    const responseHeaders = new Headers()

    // Copy important headers from the original response
    const headersToForward = ["Content-Type", "Content-Length", "Content-Range", "Accept-Ranges"]

    headersToForward.forEach((header) => {
      const value = response.headers.get(header)
      if (value) responseHeaders.set(header, value)
    })

    // Set CORS headers
    responseHeaders.set("Access-Control-Allow-Origin", "*")

    // Return the response with appropriate status code
    return new NextResponse(response.body, {
      status: response.status,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error("Streaming error:", error)
    return NextResponse.json({ error: "Failed to stream content" }, { status: 500 })
  }
}
