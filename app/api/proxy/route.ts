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
    .replace(/src='\/([^']*)'/g, `src='${baseUrlString}/$1'`)
    .replace(/href='\/([^']*)'/g, `href='${baseUrlString}/$1'`)
    .replace(/src="(?!http|\/\/)([^"]*)"/g, `src="${baseUrlPath}$1"`)
    .replace(/href="(?!http|\/\/)([^"]*)"/g, `href="${baseUrlPath}$1"`)
    .replace(/src='(?!http|\/\/)([^']*)'/g, `src='${baseUrlPath}$1'`)
    .replace(/href='(?!http|\/\/)([^']*)'/g, `href='${baseUrlPath}$1'`)

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
    })

    // Fix inline styles with url()
    .replace(/url$$['"]?(?!http|\/\/)([^'")]+)['"]?$$/g, `url('${baseUrlPath}$1')`)
    .replace(/url$$['"]?\/([^'")]+)['"]?$$/g, `url('${baseUrlString}/$1')`)

  // Add base tag to head if not present
  if (!processedHtml.includes("<base")) {
    processedHtml = processedHtml.replace(/<head>/i, `<head><base href="${baseUrlString}/">`)
  }

  // Inject our proxy script to handle dynamic content
  const proxyScript = `
    <script>
      // Store the original window.open
      const originalWindowOpen = window.open;
      
      // Override window.open to capture popups
      window.open = function(url, name, features) {
        if (!url) return null;
        
        // Resolve relative URLs
        let absoluteUrl = url;
        if (!url.startsWith('http') && !url.startsWith('//')) {
          const base = document.querySelector('base');
          const baseHref = base ? base.href : window.location.origin + '/';
          absoluteUrl = new URL(url, baseHref).href;
        }
        
        // Send message to parent to open in our proxy
        window.parent.postMessage({
          type: 'PROXY_EVENT',
          action: 'OPEN_POPUP',
          url: absoluteUrl
        }, '*');
        
        // Return a mock window object
        return {
          closed: false,
          close: function() { 
            this.closed = true;
          },
          focus: function() {},
          blur: function() {},
          postMessage: function() {}
        };
      };
      
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
          if (url && typeof url === 'string') {
            const urlObj = new URL(url, window.location.href);
            if (urlObj.origin !== window.location.origin) {
              const proxyUrl = '/api/proxy?url=' + encodeURIComponent(urlObj.href);
              return originalXhrOpen.call(this, method, proxyUrl, ...rest);
            }
          }
        } catch (e) {
          console.error('Error in XHR proxy:', e);
        }
        return originalXhrOpen.call(this, method, url, ...rest);
      };
      
      // Intercept link clicks to keep navigation within the proxy
      document.addEventListener('click', function(e) {
        const link = e.target.closest('a');
        if (link && link.href) {
          const url = link.href;
          if (!url.startsWith('javascript:') && !url.startsWith('#')) {
            e.preventDefault();
            window.parent.postMessage({
              type: 'PROXY_EVENT',
              action: 'NAVIGATE',
              url: url
            }, '*');
          }
        }
      }, true);
      
      // Handle form submissions
      document.addEventListener('submit', function(e) {
        const form = e.target;
        if (form.method.toLowerCase() === 'get' && form.action) {
          e.preventDefault();
          
          // Build the URL with form data
          const formData = new FormData(form);
          const url = new URL(form.action);
          for (const [key, value] of formData.entries()) {
            url.searchParams.append(key, value);
          }
          
          window.parent.postMessage({
            type: 'PROXY_EVENT',
            action: 'NAVIGATE',
            url: url.href
          }, '*');
        }
      });
      
      // WebRTC handling
      if (window.RTCPeerConnection) {
        const OrigPeerConnection = window.RTCPeerConnection;
        window.RTCPeerConnection = function(...args) {
          const pc = new OrigPeerConnection(...args);
          
          // Intercept and modify ICE servers if needed
          if (args[0] && args[0].iceServers) {
            console.log('WebRTC: Using custom ICE servers');
          }
          
          return pc;
        };
        window.RTCPeerConnection.prototype = OrigPeerConnection.prototype;
      }
      
      // Notify parent about page load
      window.addEventListener('load', function() {
        window.parent.postMessage({
          type: 'PROXY_EVENT',
          action: 'LOADING_STATE',
          isLoading: false
        }, '*');
      });
      
      // Notify parent about page errors
      window.addEventListener('error', function(e) {
        window.parent.postMessage({
          type: 'PROXY_EVENT',
          action: 'ERROR',
          message: 'Error loading resource: ' + e.target.src || e.target.href
        }, '*');
      }, true);
      
      // Fix video playback issues
      document.addEventListener('DOMContentLoaded', function() {
        // Find all video and audio elements and ensure they can play
        const mediaElements = document.querySelectorAll('video, audio');
        mediaElements.forEach(media => {
          // Add controls if not present
          if (!media.hasAttribute('controls')) {
            media.setAttribute('controls', 'true');
          }
          
          // Fix source elements
          const sources = media.querySelectorAll('source');
          sources.forEach(source => {
            if (source.src && !source.src.startsWith('/api/')) {
              source.setAttribute('src', '/api/stream?url=' + encodeURIComponent(source.src));
            }
          });
          
          // Fix direct src attribute
          if (media.src && !media.src.startsWith('/api/')) {
            media.setAttribute('src', '/api/stream?url=' + encodeURIComponent(media.src));
          }
          
          // Force reload the media element
          media.load();
        });
      });
    </script>
  `

  // Add our proxy script to the end of the body
  if (processedHtml.includes("</body>")) {
    processedHtml = processedHtml.replace("</body>", `${proxyScript}</body>`)
  } else {
    processedHtml += proxyScript
  }

  return processedHtml
}

// Helper function to process JavaScript
function processJavaScript(js: string, baseUrl: URL): string {
  // Replace URLs in fetch calls
  const processedJs = js
    // Replace fetch("http://example.com/api") with fetch("/api/proxy?url=http://example.com/api")
    .replace(/fetch\s*\(\s*(['"`])((https?:)?\/\/[^'"`]+)\1/g, "fetch($1/api/proxy?url=$2$1")
    // Replace XHR open("GET", "http://example.com/api") with open("GET", "/api/proxy?url=http://example.com/api")
    .replace(
      /\.open\s*\(\s*(['"`])(GET|POST|PUT|DELETE|PATCH)\1\s*,\s*(['"`])((https?:)?\/\/[^'"`]+)\3/g,
      ".open($1$2$1, $3/api/proxy?url=$4$3",
    )

  return processedJs
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

    // Create headers for the forwarded request
    const headers = new Headers({
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Content-Type": contentType,
    })

    // Forward cookies
    const cookies = request.headers.get("cookie")
    if (cookies) {
      headers.set("Cookie", cookies)
    }

    // Forward the POST request to the target URL
    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: request.body,
      redirect: "follow",
    })

    // Process the response similar to GET
    const responseContentType = response.headers.get("Content-Type") || ""
    const responseHeaders = new Headers()

    // Copy important headers
    const headersToForward = ["Content-Type", "Content-Length", "Cache-Control", "Set-Cookie"]

    headersToForward.forEach((header) => {
      const value = response.headers.get(header)
      if (value) responseHeaders.set(header, value)
    })

    responseHeaders.set("Access-Control-Allow-Origin", "*")
    responseHeaders.set("Access-Control-Allow-Credentials", "true")

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
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS, PUT, DELETE, PATCH",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Requested-With",
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Max-Age": "86400",
  })

  return new NextResponse(null, { headers })
}
