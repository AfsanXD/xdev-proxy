"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, ArrowRight, RefreshCwIcon as Reload, Home, Globe } from "lucide-react"
import { toast } from "@/components/ui/use-toast"

export function ProxyBrowser() {
  const [url, setUrl] = useState("")
  const [currentUrl, setCurrentUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)

  const navigate = async (targetUrl: string) => {
    if (!targetUrl) return

    // Make sure URL has a protocol
    let processedUrl = targetUrl
    if (!processedUrl.startsWith("http://") && !processedUrl.startsWith("https://")) {
      processedUrl = `https://${processedUrl}`
    }

    try {
      setLoading(true)

      // Update history
      const newHistory = history.slice(0, historyIndex + 1)
      newHistory.push(processedUrl)
      setHistory(newHistory)
      setHistoryIndex(newHistory.length - 1)
      setCurrentUrl(processedUrl)
      setUrl(processedUrl)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to load the requested page",
        variant: "destructive",
      })
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  const goBack = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1)
      setCurrentUrl(history[historyIndex - 1])
      setUrl(history[historyIndex - 1])
    }
  }

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1)
      setCurrentUrl(history[historyIndex + 1])
      setUrl(history[historyIndex + 1])
    }
  }

  const goHome = () => {
    setUrl("")
    setCurrentUrl("")
  }

  const handleRefresh = () => {
    if (currentUrl) {
      navigate(currentUrl)
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    navigate(url)
  }

  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    // Listen for messages from the iframe
    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from our iframe
      if (iframeRef.current && event.source === iframeRef.current.contentWindow) {
        if (event.data.type === "NAVIGATE") {
          // Update URL without triggering navigation
          setUrl(event.data.url)
          setCurrentUrl(event.data.url)

          // Update history
          const newHistory = history.slice(0, historyIndex + 1)
          newHistory.push(event.data.url)
          setHistory(newHistory)
          setHistoryIndex(newHistory.length - 1)
        }
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [history, historyIndex])

  return (
    <div className="flex flex-col h-full w-full">
      <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-800 p-2 border-b">
        <Button variant="ghost" size="icon" onClick={goBack} disabled={historyIndex <= 0} title="Go back">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={goForward}
          disabled={historyIndex >= history.length - 1}
          title="Go forward"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={handleRefresh} disabled={!currentUrl} title="Refresh">
          <Reload className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" onClick={goHome} title="Home">
          <Home className="h-4 w-4" />
        </Button>

        <form onSubmit={handleSubmit} className="flex-1 flex">
          <div className="flex items-center w-full rounded-md border border-input px-3 bg-white dark:bg-gray-900">
            <Globe className="h-4 w-4 text-gray-400 mr-2" />
            <Input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter URL"
              className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0"
            />
          </div>
          <Button type="submit" className="ml-2">
            Go
          </Button>
        </form>
      </div>
      <div className="flex-1 w-full">
        {loading ? (
          <div className="w-full h-full flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-900 dark:border-white"></div>
          </div>
        ) : currentUrl ? (
          <iframe
            ref={iframeRef}
            src={`/api/proxy?url=${encodeURIComponent(currentUrl)}`}
            className="w-full h-full border-0"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-modals allow-orientation-lock allow-pointer-lock allow-presentation allow-top-navigation-by-user-activation"
            allow="accelerometer; autoplay; camera; encrypted-media; fullscreen; geolocation; gyroscope; microphone; midi; payment; picture-in-picture; sync-xhr; usb"
            title="Browser content"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-gray-50 dark:bg-gray-900">
            <Globe className="h-16 w-16 text-gray-300 mb-4" />
            <p className="text-gray-500">Enter a URL in the address bar above to begin browsing</p>
          </div>
        )}
      </div>
    </div>
  )
}
