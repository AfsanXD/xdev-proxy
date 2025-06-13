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

    // For security, block certain domains
    const blockedDomains = ["localhost", "127.0.0.1"]
    if (blockedDomains.includes(url.hostname)) {
      return NextResponse.json({ error: "Access to this domain is not allowed" }, { status: 403 })
    }

    // Create request headers that mimic a real browser
    const headers = new Headers({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
      "Sec-Ch-Ua": '"Not_A Brand";v="8", "Chromium";v="120"',
      "Sec-Ch-Ua-Mobile": "?0",
      "Sec-Ch-Ua-Platform": '"Windows"',
    })

    // Forward any cookies from the original request
    const originalCookies = request.headers.get("cookie")
    if (originalCookies) {
      headers.set("Cookie", originalCookies)
    }

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

    // Fetch the content from the target URL with a timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    const response = await fetch(targetUrl, {
      headers,
      redirect: "follow",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId))

    // Check if the response is successful
    if (!response.ok) {
      return NextResponse.json(
        {
          error: `Failed to fetch: ${response.status} ${response.statusText}`,
        },
        { status: response.status },
      )
    }

    // Get content type to handle different types of responses
    const contentType = response.headers.get("Content-Type") || ""

    // Create response headers
    const responseHeaders = new Headers()

    // Copy important headers from the original response
    const headersToForward = [
      "Content-Type",
      "Content-Length",
      "Cache-Control",
      "Expires",
      "Last-Modified",
      "ETag",
      "Content-Disposition",
      "Content-Range",
      "Accept-Ranges",
    ]

    headersToForward.forEach((header) => {
      const value = response.headers.get(header)
      if (value) responseHeaders.set(header, value)
    })

    // Set CORS headers to allow the content to be loaded in the iframe
    responseHeaders.set("Access-Control-Allow-Origin", "*")
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, PUT, DELETE, PATCH")
    responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
    responseHeaders.set("Access-Control-Allow-Credentials", "true")

    // Handle different content types
    if (contentType.includes("text/html")) {
      // For HTML content, we need to modify it to make it work in our proxy
      const html = await response.text()

      // Process HTML to fix relative URLs and other issues
      const processedHtml = processHtml(html, url)

      return new NextResponse(processedHtml, {
        headers: responseHeaders,
      })
    } else if (
      contentType.includes("image/") ||
      contentType.includes("font/") ||
      contentType.includes("application/font") ||
      contentType.includes("application/octet-stream") ||
      contentType.includes("application/pdf")
    ) {
      // For binary content like images, fonts, etc., stream it directly
      const blob = await response.blob()
      return new NextResponse(blob, {
        headers: responseHeaders,
      })
    } else if (contentType.includes("video/") || contentType.includes("audio/")) {
      // For video and audio, use the streaming endpoint
      // Just return a redirect to our streaming endpoint
      const streamUrl = `/api/stream?url=${encodeURIComponent(targetUrl)}`
      responseHeaders.set("Location", streamUrl)
      return new NextResponse(null, {
        status: 302,
        headers: responseHeaders,
      })
    } else if (
      contentType.includes("application/json") ||
      contentType.includes("application/javascript") ||
      contentType.includes("text/")
    ) {
      // For text-based content, process it
      const content = await response.text()

      // If it's JavaScript, we need to process it to proxy API calls
      if (contentType.includes("javascript")) {
        const processedJs = processJavaScript(content, url)
        return new NextResponse(processedJs, {
          headers: responseHeaders,
        })
      }

      return new NextResponse(content, {
        headers: responseHeaders,
      })
    } else {
      // For other content types, stream directly
      return new NextResponse(response.body, {
        headers: responseHeaders,
      })
    }
  } catch (error) {
    console.error("Proxy error:", error)

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
        error: "Failed to fetch the requested URL",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    )
  }
}

// Helper function to process HTML content
function processHtml(html: string, baseUrl: URL): string {
  // Replace relative URLs with absolute ones
  const baseUrlString = baseUrl.origin
  const baseUrlPath = baseUrl.href.substring(0, baseUrl.href.lastIndexOf("/") + 1)

  // Replace relative URLs in src and href attributes
  const processedHtml = html
    .replace(/src="\/([^"]*)"/g, `src="${baseUrlString}/$1"`)
    .replace(/href="\/([^"]*)"/g, `href="${baseUrlString}/$1"`)
    .replace(/src='\/([^']*)'/g, `src='${baseUrlString}/$1'`)
    .replace(/href='\/([^']*)'/g, `href='${baseUrlString}/$1'`)
    .replace(/src="(?!http|\/\/)([^"]*)"/g, `src="${baseUrlPath}$1"`)
    .replace(/href="(?!http|\/\/)([^"]*)"/g, `href="${baseUrlPath}$1"`)
    .replace(/src='(?!http|\/\/)([^']*)'/g, `src='${baseUrlPath}$1'`)
    .replace(/href='(?!http|\/\/)([^']*)'/g, `href='${baseUrlPath}$1'`)
    .replace(/content="\/([^"]*)"/g, `content="${baseUrlString}/$1"`)
    .replace(/content='\/([^']*)'/g, `content='${baseUrlString}/$1'`)
    .replace(/action="\/([^"]*)"/g, `action="${baseUrlString}/$1"`)
    .replace(/action='\/([^']*)'/g, `action='${baseUrlString}/$1'`)
    .replace(/data-src="\/([^"]*)"/g, `data-src="${baseUrlString}/$1"`)
    .replace(/data-src='\/([^']*)'/g, `data-src='${baseUrlString}/$1'`)

    // Fix srcset attributes
    .replace(/srcset="([^"]*)"/g, (match, srcset) => {
      const newSrcset = srcset
        .split(",")
        .map((src: string) => {
          const [url, descriptor] = src.trim().split(/\s+/)
          if (url.startsWith("http") || url.startsWith("//")) {
            return `${url} ${descriptor || ""}`
          } else if (url.startsWith("/")) {
            return `${baseUrlString}${url} ${descriptor || ""}`
          } else {
            return `${baseUrlPath}${url} ${descriptor || ""}`
          }
        })
        .join(", ")
      return `srcset="${newSrcset}"`
