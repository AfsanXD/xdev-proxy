import { type NextRequest, NextResponse } from "next/server"

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
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
    })

    // Add range header if present
    if (rangeHeader) {
      headers.set("Range", rangeHeader)
    }

    // Fetch the media content
    const response = await fetch(url, { headers })

    // Create response headers
    const responseHeaders = new Headers()

    // Copy all headers from the original response
    response.headers.forEach((value, key) => {
      responseHeaders.set(key, value)
    })

    // Set CORS headers
    responseHeaders.set("Access-Control-Allow-Origin", "*")
    responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD")
    responseHeaders.set("Access-Control-Allow-Headers", "Range, Content-Type")
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")

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

// Handle HEAD requests for media content
export async function HEAD(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get("url")

  if (!url) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 })
  }

  try {
    const response = await fetch(url, {
      method: "HEAD",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    })

    const responseHeaders = new Headers()

    // Copy all headers from the original response
    response.headers.forEach((value, key) => {
      responseHeaders.set(key, value)
    })

    // Set CORS headers
    responseHeaders.set("Access-Control-Allow-Origin", "*")
    responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD")
    responseHeaders.set("Access-Control-Allow-Headers", "Range, Content-Type")
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")

    return new NextResponse(null, {
      status: response.status,
      headers: responseHeaders,
    })
  } catch (error) {
    console.error("HEAD request error:", error)
    return NextResponse.json({ error: "Failed to process HEAD request" }, { status: 500 })
  }
}
