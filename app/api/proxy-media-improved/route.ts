import { type NextRequest, NextResponse } from "next/server"

// This endpoint handles media content with improved capabilities
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const url = searchParams.get("url")
  const type = searchParams.get("type") || "auto"

  if (!url) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 })
  }

  try {
    // Create a comprehensive set of headers to mimic a real browser
    const headers = new Headers({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept: "*/*",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Sec-Fetch-Dest": "empty",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Site": "cross-site",
      "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
    })

    // Forward referer if it exists
    const referer = request.headers.get("referer")
    if (referer) {
      // Extract the original URL from the referer if it's a proxy request
      const refererUrl = new URL(referer)
      const originalReferer = refererUrl.searchParams.get("url")
      if (originalReferer) {
        headers.set("Referer", originalReferer)
      } else {
        headers.set("Referer", referer)
      }
    }

    // Forward cookies if they exist
    const cookies = request.headers.get("cookie")
    if (cookies) {
      headers.set("Cookie", cookies)
    }

    // Forward range header if it exists (for video streaming)
    const rangeHeader = request.headers.get("range")
    if (rangeHeader) {
      headers.set("Range", rangeHeader)
    }

    // Fetch with timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    // Fetch the media content
    const response = await fetch(url, {
      headers,
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId))

    // Create response headers
    const responseHeaders = new Headers()

    // Copy all headers from the original response
    response.headers.forEach((value, key) => {
      responseHeaders.set(key, value)
    })

    // Set CORS headers
    responseHeaders.set("Access-Control-Allow-Origin", "*")
    responseHeaders.set("Access-Control-Allow-Methods", "GET, HEAD")
    responseHeaders.set("Access-Control-Allow-Headers", "Range, Content-Type, Origin, Accept")
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Length, Content-Range, Accept-Ranges")

    // Handle different content types based on the type parameter
    if (type === "image" || (type === "auto" && response.headers.get("Content-Type")?.includes("image/"))) {
      const blob = await response.blob()
      return new NextResponse(blob, {
        headers: responseHeaders,
      })
    } else if (
      type === "video" ||
      type === "audio" ||
      (type === "auto" &&
        (response.headers.get("Content-Type")?.includes("video/") ||
          response.headers.get("Content-Type")?.includes("audio/")))
    ) {
      // For streaming media, return the stream directly
      return new NextResponse(response.body, {
        status: response.status,
        headers: responseHeaders,
      })
    } else {
      // For other content types, return as blob
      const blob = await response.blob()
      return new NextResponse(blob, {
        headers: responseHeaders,
      })
    }
  } catch (error) {
    console.error("Media proxy error:", error)

    // Check if it's an AbortError (timeout)
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json(
        {
          error: "Request timed out",
          details: "The request took too long to complete",
        },
        { status: 504 },
      )
    }

    return NextResponse.json(
      {
        error: "Failed to fetch media content",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
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
