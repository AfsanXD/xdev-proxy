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
    const blockedDomains = ["localhost", "127.0.0.1", "internal.company.com"]
    if (blockedDomains.includes(url.hostname)) {
      return NextResponse.json({ error: "Access to this domain is not allowed" }, { status: 403 })
    }

    // Create request headers that mimic a real browser
    const headers = new Headers({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
      "Accept-Language": "en-US,en;q=0.9",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Site": "none",
      "Sec-Fetch-User": "?1",
      "Upgrade-Insecure-Requests": "1",
    })

    // Forward any cookies from the original request
    const originalCookies = request.headers.get("cookie")
    if (originalCookies) {
      headers.set("Cookie", originalCookies)
    }

    // Fetch the content from the target URL
    const response = await fetch(targetUrl, {
      headers,
      redirect: "follow",
    })

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
    const headersToForward = ["Content-Type", "Content-Length", "Cache-Control", "Expires", "Last-Modified", "ETag"]

    headersToForward.forEach((header) => {
      const value = response.headers.get(header)
      if (value) responseHeaders.set(header, value)
    })

    // Set CORS headers to allow the content to be loaded in the iframe
    responseHeaders.set("Access-Control-Allow-Origin", "*")
    responseHeaders.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    responseHeaders.set("Access-Control-Allow-Headers", "Content-Type, Authorization")

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
      contentType.includes("video/") ||
      contentType.includes("audio/") ||
      contentType.includes("application/pdf") ||
      contentType.includes("application/json")
    ) {
      // For binary content like images, videos, etc., stream it directly
      const blob = await response.blob()
      return new NextResponse(blob, {
        headers: responseHeaders,
      })
    } else {
      // For other content types, just pass through
      const content = await response.text()
      return new NextResponse(content, {
        headers: responseHeaders,
      })
    }
  } catch (error) {
    console.error("Proxy error:", error)
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
  let processedHtml = html
    .replace(/src="\/([^"]*)"/g, `src="${baseUrlString}/$1"`)
    .replace(/href="\/([^"]*)"/g, `href="${baseUrlString}/$1"`)
    .replace(/src="(?!http|\/\/)([^"]*)"/g, `src="${baseUrlPath}$1"`)
    .replace(/href="(?!http|\/\/)([^"]*)"/g, `href="${baseUrlPath}$1"`)

  // Add base tag to head if not present
  if (!processedHtml.includes("<base")) {
    processedHtml = processedHtml.replace(/<head>/i, `<head><base href="${baseUrlString}/">`)
  }

  // Inject our proxy script to handle dynamic content
  const proxyScript = `
    <script>
      // Intercept all fetch requests to route through our proxy
      const originalFetch = window.fetch;
      window.fetch = function(url, options) {
        try {
          const urlObj = new URL(url, window.location.href);
          // Only proxy external URLs
          if (urlObj.origin !== window.location.origin) {
            const proxyUrl = '/api/proxy?url=' + encodeURIComponent(urlObj.href);
            return originalFetch(proxyUrl, options);
          }
        } catch (e) {
          console.error('Error in fetch proxy:', e);
        }
        return originalFetch(url, options);
      };
      
      // Intercept XHR requests
      const originalXhrOpen = XMLHttpRequest.prototype.open;
      XMLHttpRequest.prototype.open = function(method, url, ...rest) {
        try {
          const urlObj = new URL(url, window.location.href);
          if (urlObj.origin !== window.location.origin) {
            const proxyUrl = '/api/proxy?url=' + encodeURIComponent(urlObj.href);
            return originalXhrOpen.call(this, method, proxyUrl, ...rest);
          }
        } catch (e) {
          console.error('Error in XHR proxy:', e);
        }
        return originalXhrOpen.call(this, method, url, ...rest);
      };
    </script>
  `

  // Add our proxy script to the end of the body
  processedHtml = processedHtml.replace(/<\/body>/i, `${proxyScript}</body>`)

  return processedHtml
}

// Handle POST requests for form submissions
export async function POST(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const targetUrl = searchParams.get("url")

  if (!targetUrl) {
    return NextResponse.json({ error: "No URL provided" }, { status: 400 })
  }

  try {
    // Get the request body
    const contentType = request.headers.get("Content-Type") || ""
    let body: any

    if (contentType.includes("application/json")) {
      body = await request.json()
    } else if (contentType.includes("application/x-www-form-urlencoded")) {
      body = await request.formData()
    } else {
      body = await request.text()
    }

    // Forward the POST request to the target URL
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Content-Type": contentType,
      },
      body,
      redirect: "follow",
    })

    // Process the response similar to GET
    const responseContentType = response.headers.get("Content-Type") || ""
    const responseHeaders = new Headers()

    responseHeaders.set("Content-Type", responseContentType)
    responseHeaders.set("Access-Control-Allow-Origin", "*")

    if (responseContentType.includes("text/html")) {
      const html = await response.text()
      const url = new URL(targetUrl)
      const processedHtml = processHtml(html, url)
      return new NextResponse(processedHtml, { headers: responseHeaders })
    } else {
      const content = await response.text()
      return new NextResponse(content, { headers: responseHeaders })
    }
  } catch (error) {
    console.error("Proxy error:", error)
    return NextResponse.json({ error: "Failed to process the request" }, { status: 500 })
  }
}

// Handle OPTIONS requests for CORS preflight
export async function OPTIONS() {
  const headers = new Headers({
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  })

  return new NextResponse(null, { headers })
}
