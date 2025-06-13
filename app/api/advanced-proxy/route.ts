import { type NextRequest, NextResponse } from "next/server"
import * as cheerio from "cheerio"
import UAParser from "ua-parser-js"

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

    // Parse user agent for better browser spoofing
    const userAgent = request.headers.get("user-agent") || ""
    const parser = new UAParser(userAgent)
    const uaInfo = parser.getResult()

    // Create a more realistic browser user agent
    const spoofedUserAgent =
      uaInfo.browser.name === "Chrome"
        ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        : uaInfo.browser.name === "Firefox"
          ? "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0"
          : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

    // Create request headers that mimic a real browser
    const headers = new Headers({
      "User-Agent": spoofedUserAgent,
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

      // Process HTML using cheerio for better parsing
      const processedHtml = processHtmlAdvanced(html, url)

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
      const streamUrl = `/api/proxy-media-improved?url=${encodeURIComponent(targetUrl)}`
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
        const processedJs = processJavaScriptAdvanced(content, url)
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

// Advanced HTML processing using cheerio
function processHtmlAdvanced(html: string, baseUrl: URL): string {
  const $ = cheerio.load(html)
  const baseUrlString = baseUrl.origin
  const baseUrlPath = baseUrl.href.substring(0, baseUrl.href.lastIndexOf("/") + 1)

  // Add base tag if not present
  if ($("base").length === 0) {
    $("head").prepend(`<base href="${baseUrlString}/">`)
  }

  // Fix all relative URLs
  $("[src]").each((_, elem) => {
    const src = $(elem).attr("src")
    if (src && !src.startsWith("data:") && !src.startsWith("blob:")) {
      if (src.startsWith("/")) {
        $(elem).attr("src", `${baseUrlString}${src}`)
      } else if (!src.startsWith("http://") && !src.startsWith("https://") && !src.startsWith("//")) {
        $(elem).attr("src", `${baseUrlPath}${src}`)
      }
    }
  })

  $("[href]").each((_, elem) => {
    const href = $(elem).attr("href")
    if (href && !href.startsWith("#") && !href.startsWith("javascript:") && !href.startsWith("data:")) {
      if (href.startsWith("/")) {
        $(elem).attr("href", `${baseUrlString}${href}`)
      } else if (!href.startsWith("http://") && !href.startsWith("https://") && !href.startsWith("//")) {
        $(elem).attr("href", `${baseUrlPath}${href}`)
      }
    }
  })

  $("[srcset]").each((_, elem) => {
    const srcset = $(elem).attr("srcset")
    if (srcset) {
      const newSrcset = srcset
        .split(",")
        .map((src) => {
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
      $(elem).attr("srcset", newSrcset)
    }
  })

  // Fix form actions
  $("form[action]").each((_, elem) => {
    const action = $(elem).attr("action")
    if (action) {
      if (action.startsWith("/")) {
        $(elem).attr("action", `${baseUrlString}${action}`)
      } else if (!action.startsWith("http://") && !action.startsWith("https://") && !action.startsWith("//")) {
        $(elem).attr("action", `${baseUrlPath}${action}`)
      }
    }
  })

  // Fix meta refresh URLs
  $('meta[http-equiv="refresh"]').each((_, elem) => {
    const content = $(elem).attr("content")
    if (content) {
      const match = content.match(/url=(.+)$/i)
      if (match && match[1]) {
        let url = match[1]
        if (url.startsWith("/")) {
          url = `${baseUrlString}${url}`
        } else if (!url.startsWith("http://") && !url.startsWith("https://") && !url.startsWith("//")) {
          url = `${baseUrlPath}${url}`
        }
        const delay = content.split(";")[0]
        $(elem).attr("content", `${delay}; url=${url}`)
      }
    }
  })

  // Fix inline styles with url()
  $("[style]").each((_, elem) => {
    const style = $(elem).attr("style")
    if (style && style.includes("url(")) {
      const newStyle = style
        .replace(/url$$['"]?(?!http|\/\/)([^'")]+)['"]?$$/g, `url('${baseUrlPath}$1')`)
        .replace(/url$$['"]?\/([^'")]+)['"]?$$/g, `url('${baseUrlString}/$1')`)
      $(elem).attr("style", newStyle)
    }
  })

  // Fix style tags
  $("style").each((_, elem) => {
    const css = $(elem).html()
    if (css) {
      const newCss = css
        .replace(/url$$['"]?(?!http|\/\/)([^'")]+)['"]?$$/g, `url('${baseUrlPath}$1')`)
        .replace(/url$$['"]?\/([^'")]+)['"]?$$/g, `url('${baseUrlString}/$1')`)
      $(elem).html(newCss)
    }
  })

  // Inject our proxy script
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
          url: absoluteUrl,
          title: document.title
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
      window.fetch = function(url, options = {}) {
        try {
          if (!url) return originalFetch(url, options);
          
          let urlObj;
          let urlString = '';
          
          if (typeof url === 'string') {
            urlString = url;
            // Handle relative URLs
            if (!url.startsWith('http') && !url.startsWith('/api/') && !url.startsWith('data:')) {
              const base = document.querySelector('base');
              const baseHref = base ? base.href : window.location.origin + '/';
              urlString = new URL(url, baseHref).href;
            }
            urlObj = new URL(urlString, window.location.href);
          } else if (url instanceof Request) {
            urlString = url.url;
            urlObj = new URL(url.url, window.location.href);
          } else {
            return originalFetch(url, options);
          }
          
          // Only proxy external URLs
          if (urlObj.origin !== window.location.origin && !urlString.startsWith('/api/') && !urlString.startsWith('data:')) {
            // Determine which proxy endpoint to use based on the content type
            let proxyUrl = '/api/advanced-proxy?url=' + encodeURIComponent(urlObj.href);
            
            // For media content, use the streaming endpoint
            const mediaExtensions = ['.mp4', '.webm', '.mp3', '.ogg', '.m4a', '.wav', '.avi', '.mov', '.flv'];
            const isMedia = mediaExtensions.some(ext => urlString.toLowerCase().includes(ext));
            
            if (isMedia) {
              proxyUrl = '/api/proxy-media-improved?url=' + encodeURIComponent(urlObj.href);
            }
            
            // Create new options with improved headers
            const newOptions = { ...options };
            
            // Add referer if not present
            if (!newOptions.headers) {
              newOptions.headers = {};
            } else if (newOptions.headers instanceof Headers) {
              // Convert Headers to plain object
              const plainHeaders = {};
              newOptions.headers.forEach((value, key) => {
                plainHeaders[key] = value;
              });
              newOptions.headers = plainHeaders;
            }
            
            // Add referer if not present
            if (!newOptions.headers.referer && !newOptions.headers.Referer) {
              newOptions.headers.referer = window.location.href;
            }
            
            if (url instanceof Request) {
              // Create a new Request with the proxied URL
              const newRequest = new Request(proxyUrl, {
                method: url.method,
                headers: newOptions.headers,
                body: url.body,
                mode: 'cors',
                credentials: url.credentials,
                cache: url.cache,
                redirect: url.redirect
              });
              return originalFetch(newRequest, newOptions);
            } else {
              return originalFetch(proxyUrl, newOptions);
            }
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
            // Handle relative URLs
            if (!url.startsWith('http') && !url.startsWith('/api/') && !url.startsWith('data:')) {
              const base = document.querySelector('base');
              const baseHref = base ? base.href : window.location.origin + '/';
              url = new URL(url, baseHref).href;
            }
            
            const urlObj = new URL(url, window.location.href);
            if (urlObj.origin !== window.location.origin && !url.startsWith('/api/') && !url.startsWith('data:')) {
              // Determine which proxy endpoint to use
              let proxyUrl = '/api/advanced-proxy?url=' + encodeURIComponent(urlObj.href);
              
              // For media content, use the streaming endpoint
              const mediaExtensions = ['.mp4', '.webm', '.mp3', '.ogg', '.m4a', '.wav', '.avi', '.mov', '.flv'];
              const isMedia = mediaExtensions.some(ext => url.toLowerCase().includes(ext));
              
              if (isMedia) {
                proxyUrl = '/api/proxy-media-improved?url=' + encodeURIComponent(urlObj.href);
              }
              
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
          if (!url.startsWith('javascript:') && !url.startsWith('#') && !url.startsWith('data:')) {
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
        
        // Send page title to parent
        window.parent.postMessage({
          type: 'PROXY_EVENT',
          action: 'PAGE_TITLE',
          title: document.title
        }, '*');
        
        // Try to find favicon
        const sendFavicon = () => {
          let faviconUrl = '';
          
          // Check for link rel="icon" or rel="shortcut icon"
          const iconLink = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
          if (iconLink && iconLink.href) {
            faviconUrl = iconLink.href;
          }
          
          // If no icon found, try the default /favicon.ico
          if (!faviconUrl) {
            const base = document.querySelector('base');
            const baseHref = base ? base.href : window.location.origin + '/';
            faviconUrl = new URL('/favicon.ico', baseHref).href;
          }
          
          if (faviconUrl) {
            window.parent.postMessage({
              type: 'PROXY_EVENT',
              action: 'FAVICON',
              favicon: faviconUrl
            }, '*');
          }
        };
        
        // Send favicon info
        setTimeout(sendFavicon, 100);
      });
      
      // Notify parent about page errors
      window.addEventListener('error', function(e) {
        if (e.target.tagName === 'IMG' || e.target.tagName === 'SCRIPT' || e.target.tagName === 'LINK') {
          window.parent.postMessage({
            type: 'PROXY_EVENT',
            action: 'ERROR',
            message: 'Error loading resource: ' + (e.target.src || e.target.href)
          }, '*');
        }
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
              source.setAttribute('src', '/api/proxy-media-improved?url=' + encodeURIComponent(source.src));
            }
          });
          
          // Fix direct src attribute
          if (media.src && !media.src.startsWith('/api/')) {
            media.setAttribute('src', '/api/proxy-media-improved?url=' + encodeURIComponent(media.src));
          }
          
          // Force reload the media element
          media.load();
        });
      });
      
      // Listen for commands from the parent
      window.addEventListener('message', function(event) {
        if (event.data && event.data.type === 'PROXY_COMMAND') {
          switch (event.data.action) {
            case 'GET_TITLE':
              // Send the page title back to the parent
              window.parent.postMessage({
                type: 'PROXY_EVENT',
                action: 'PAGE_TITLE',
                title: document.title,
                popupId: event.data.popupId
              }, '*');
              break;
              
            case 'GET_TITLE_AND_FAVICON':
              // Send the page title back to the parent
              window.parent.postMessage({
                type: 'PROXY_EVENT',
                action: 'PAGE_TITLE',
                title: document.title,
                popupId: event.data.popupId
              }, '*');
              
              // Try to find favicon
              let faviconUrl = '';
              const iconLink = document.querySelector('link[rel="icon"], link[rel="shortcut icon"]');
              if (iconLink && iconLink.href) {
                faviconUrl = iconLink.href;
              }
              
              // If no icon found, try the default /favicon.ico
              if (!faviconUrl) {
                const base = document.querySelector('base');
                const baseHref = base ? base.href : window.location.origin + '/';
                faviconUrl = new URL('/favicon.ico', baseHref).href;
              }
              
              if (faviconUrl) {
                window.parent.postMessage({
                  type: 'PROXY_EVENT',
                  action: 'FAVICON',
                  favicon: faviconUrl
                }, '*');
              }
              break;
              
            case 'TOGGLE_MUTE':
              // Mute/unmute all media elements
              const mediaElements = document.querySelectorAll('video, audio');
              mediaElements.forEach(media => {
                media.muted = event.data.value;
              });
              break;
              
            case 'CLEAR_BROWSING_DATA':
              // Clear localStorage
              try {
                localStorage.clear();
                console.log('localStorage cleared');
              } catch (e) {
                console.error('Failed to clear localStorage:', e);
              }
              
              // Clear sessionStorage
              try {
                sessionStorage.clear();
                console.log('sessionStorage cleared');
              } catch (e) {
                console.error('Failed to clear sessionStorage:', e);
              }
              
              // Clear cookies
              try {
                const cookies = document.cookie.split(";");
                for (let i = 0; i < cookies.length; i++) {
                  const cookie = cookies[i];
                  const eqPos = cookie.indexOf("=");
                  const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim();
                  document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
                }
                console.log('Cookies cleared');
              } catch (e) {
                console.error('Failed to clear cookies:', e);
              }
              
              // Force reload all images
              try {
                const images = document.querySelectorAll('img');
                images.forEach(img => {
                  if (img.src) {
                    const src = img.src;
                    img.src = '';
                    setTimeout(() => { img.src = src; }, 10);
                  }
                });
              } catch (e) {
                console.error('Failed to reload images:', e);
              }
              break;
          }
        }
      });
      
      // Observe DOM changes to fix dynamically added media elements
      if (window.MutationObserver) {
        const observer = new MutationObserver(function(mutations) {
          mutations.forEach(function(mutation) {
            if (mutation.type === 'childList') {
              mutation.addedNodes.forEach(function(node) {
                if (node.nodeName === 'VIDEO' || node.nodeName === 'AUDIO') {
                  const media = node;
                  
                  // Add controls if not present
                  if (!media.hasAttribute('controls')) {
                    media.setAttribute('controls', 'true');
                  }
                  
                  // Fix src attribute
                  if (media.src && !media.src.startsWith('/api/')) {
                    media.setAttribute('src', '/api/proxy-media-improved?url=' + encodeURIComponent(media.src));
                    media.load();
                  }
                }
                
                // Check for iframes and fix their src
                if (node.nodeName === 'IFRAME') {
                  const iframe = node;
                  if (iframe.src && !iframe.src.startsWith('/api/') && !iframe.src.startsWith('data:') && !iframe.src.startsWith('about:')) {
                    iframe.setAttribute('src', '/api/advanced-proxy?url=' + encodeURIComponent(iframe.src));
                  }
                }
              });
            }
          });
        });
        
        observer.observe(document.documentElement, {
          childList: true,
          subtree: true
        });
      }
      
      // Fix meta refresh redirects
      document.addEventListener('DOMContentLoaded', function() {
        const metaRefresh = document.querySelector('meta[http-equiv="refresh"]');
        if (metaRefresh) {
          const content = metaRefresh.getAttribute('content');
          if (content) {
            const match = content.match(/url=(.+)$/i);
            if (match && match[1]) {
              let redirectUrl = match[1];
              
              // Handle relative URLs
              if (!redirectUrl.startsWith('http')) {
                const base = document.querySelector('base');
                const baseHref = base ? base.href : window.location.origin + '/';
                redirectUrl = new URL(redirectUrl, baseHref).href;
              }
              
              // Extract the delay
              const delay = parseInt(content) || 0;
              
              // Schedule the redirect
              setTimeout(function() {
                window.parent.postMessage({
                  type: 'PROXY_EVENT',
                  action: 'NAVIGATE',
                  url: redirectUrl
                }, '*');
              }, delay * 1000);
            }
          }
        }
      });
    </script>
  `

  // Add our proxy script to the end of the body
  if ($("body").length > 0) {
    $("body").append(proxyScript)
  } else {
    $("html").append(`<body>${proxyScript}</body>`)
  }

  return $.html()
}

// Advanced JavaScript processing
function processJavaScriptAdvanced(js: string, baseUrl: URL): string {
  const baseUrlString = baseUrl.origin
  const baseUrlPath = baseUrl.href.substring(0, baseUrl.href.lastIndexOf("/") + 1)

  // Replace URLs in fetch calls
  const processedJs = js
    // Replace fetch("http://example.com/api") with fetch("/api/advanced-proxy?url=http://example.com/api")
    .replace(/fetch\s*\(\s*(['"`])((https?:)?\/\/[^'"`]+)\1/g, "fetch($1/api/advanced-proxy?url=$2$1")
    // Replace XHR open("GET", "http://example.com/api") with open("GET", "/api/advanced-proxy?url=http://example.com/api")
    .replace(
      /\.open\s*\(\s*(['"`])(GET|POST|PUT|DELETE|PATCH)\1\s*,\s*(['"`])((https?:)?\/\/[^'"`]+)\3/g,
      ".open($1$2$1, $3/api/advanced-proxy?url=$4$3",
    )
    // Replace relative URLs in fetch calls
    .replace(/fetch\s*\(\s*(['"`])\/([^'"`]+)\1/g, `fetch($1${baseUrlString}/$2$1`)
    // Replace relative URLs in XHR open calls
    .replace(
      /\.open\s*\(\s*(['"`])(GET|POST|PUT|DELETE|PATCH)\1\s*,\s*(['"`])\/([^'"`]+)\3/g,
      `.open($1$2$1, $3${baseUrlString}/$4$3`,
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

    // Forward the POST request to the target URL with a timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000) // 30 second timeout

    const response = await fetch(targetUrl, {
      method: "POST",
      headers,
      body: request.body,
      redirect: "follow",
      signal: controller.signal,
    }).finally(() => clearTimeout(timeoutId))

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
      const processedHtml = processHtmlAdvanced(html, url)
      return new NextResponse(processedHtml, { headers: responseHeaders })
    } else if (responseContentType.includes("application/json")) {
      const json = await response.text()
      return new NextResponse(json, { headers: responseHeaders })
    } else {
      const content = await response.text()
      return new NextResponse(content, { headers: responseHeaders })
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
