"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ArrowLeft, ArrowRight, RefreshCwIcon as Reload, Home, Globe, X } from "lucide-react"
import { toast } from "@/components/ui/use-toast"

export function ProxyBrowser() {
  const [url, setUrl] = useState("")
  const [currentUrl, setCurrentUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [history, setHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [popups, setPopups] = useState<{ id: string; url: string }[]>([])
  const [activePopupId, setActivePopupId] = useState<string | null>(null)
  const [mainFrameKey, setMainFrameKey] = useState(Date.now())
  const iframeRef = useRef<HTMLIFrameElement>(null)

  // Generate a unique ID for popups
  const generatePopupId = () => `popup-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

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

      // Force iframe refresh by updating the key
      setMainFrameKey(Date.now())
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
      setMainFrameKey(Date.now())
    }
  }

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1)
      setCurrentUrl(history[historyIndex + 1])
      setUrl(history[historyIndex + 1])
      setMainFrameKey(Date.now())
    }
  }

  const goHome = () => {
    setUrl("")
    setCurrentUrl("")
    setPopups([])
    setActivePopupId(null)
  }

  const handleRefresh = () => {
    if (currentUrl) {
      setMainFrameKey(Date.now())
    }
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    navigate(url)
  }

  const openPopup = (popupUrl: string) => {
    const id = generatePopupId()
    setPopups([...popups, { id, url: popupUrl }])
    setActivePopupId(id)
  }

  const closePopup = (id: string) => {
    setPopups(popups.filter((popup) => popup.id !== id))
    if (activePopupId === id) {
      setActivePopupId(null)
    }
  }

  useEffect(() => {
    // Listen for messages from the iframe
    const handleMessage = (event: MessageEvent) => {
      // Check if the message is from our proxy
      if (event.data && event.data.type === "PROXY_EVENT") {
        switch (event.data.action) {
          case "NAVIGATE":
            setUrl(event.data.url)
            setCurrentUrl(event.data.url)

            // Update history
            const newHistory = history.slice(0, historyIndex + 1)
            newHistory.push(event.data.url)
            setHistory(newHistory)
            setHistoryIndex(newHistory.length - 1)
            break

          case "OPEN_POPUP":
            openPopup(event.data.url)
            break

          case "LOADING_STATE":
            setLoading(event.data.isLoading)
            break

          case "ERROR":
            toast({
              title: "Error",
              description: event.data.message,
              variant: "destructive",
            })
            break
        }
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [history, historyIndex])

  return (
    <div className="flex flex-col h-full w-full bg-black text-white">
      <div className="flex items-center space-x-2 bg-gray-900 p-2 border-b border-gray-700">
        <Button
          variant="ghost"
          size="icon"
          onClick={goBack}
          disabled={historyIndex <= 0}
          title="Go back"
          className="text-gray-300 hover:text-white hover:bg-gray-800"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={goForward}
          disabled={historyIndex >= history.length - 1}
          title="Go forward"
          className="text-gray-300 hover:text-white hover:bg-gray-800"
        >
          <ArrowRight className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={handleRefresh}
          disabled={!currentUrl}
          title="Refresh"
          className="text-gray-300 hover:text-white hover:bg-gray-800"
        >
          <Reload className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={goHome}
          title="Home"
          className="text-gray-300 hover:text-white hover:bg-gray-800"
        >
          <Home className="h-4 w-4" />
        </Button>

        <form onSubmit={handleSubmit} className="flex-1 flex">
          <div className="flex items-center w-full rounded-md border border-gray-700 px-3 bg-gray-800">
            <Globe className="h-4 w-4 text-gray-400 mr-2" />
            <Input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter URL"
              className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-gray-800 text-white"
            />
          </div>
          <Button type="submit" className="ml-2 bg-gray-700 hover:bg-gray-600 text-white">
            Go
          </Button>
        </form>
      </div>

      {/* Popup tabs */}
      {popups.length > 0 && (
        <div className="flex bg-gray-900 border-b border-gray-700 overflow-x-auto">
          <Button
            variant={activePopupId === null ? "default" : "ghost"}
            className={`px-3 py-1 rounded-none ${activePopupId === null ? "bg-gray-700" : "bg-gray-900 text-gray-300"}`}
            onClick={() => setActivePopupId(null)}
          >
            Main
          </Button>
          {popups.map((popup) => (
            <div key={popup.id} className="flex items-center">
              <Button
                variant={activePopupId === popup.id ? "default" : "ghost"}
                className={`px-3 py-1 rounded-none ${activePopupId === popup.id ? "bg-gray-700" : "bg-gray-900 text-gray-300"}`}
                onClick={() => setActivePopupId(popup.id)}
              >
                {new URL(popup.url).hostname.replace("www.", "")}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="p-0 h-6 w-6 rounded-full text-gray-400 hover:text-white"
                onClick={() => closePopup(popup.id)}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <div className="flex-1 w-full bg-black">
        {loading && (
          <div className="absolute top-0 left-0 w-full h-1 bg-gray-800 z-50">
            <div className="h-full bg-blue-500 animate-progress"></div>
          </div>
        )}

        {/* Main content frame */}
        {!activePopupId && (
          <div className="w-full h-full">
            {currentUrl ? (
              <iframe
                key={mainFrameKey}
                ref={iframeRef}
                src={`/api/proxy?url=${encodeURIComponent(currentUrl)}`}
                className="w-full h-full border-0 bg-white"
                sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-modals allow-popups allow-presentation"
                allow="accelerometer; autoplay; camera; encrypted-media; fullscreen; geolocation; gyroscope; microphone; midi; payment; picture-in-picture"
                title="Browser content"
              />
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center p-4 text-center bg-black">
                <Globe className="h-16 w-16 text-gray-600 mb-4" />
                <p className="text-gray-400">Enter a URL in the address bar above to begin browsing</p>
              </div>
            )}
          </div>
        )}

        {/* Popup frames */}
        {popups.map((popup) => (
          <div key={popup.id} className={`w-full h-full ${activePopupId === popup.id ? "block" : "hidden"}`}>
            <iframe
              src={`/api/proxy?url=${encodeURIComponent(popup.url)}`}
              className="w-full h-full border-0 bg-white"
              sandbox="allow-same-origin allow-scripts allow-forms allow-downloads allow-modals allow-popups allow-presentation"
              allow="accelerometer; autoplay; camera; encrypted-media; fullscreen; geolocation; gyroscope; microphone; midi; payment; picture-in-picture"
              title={`Popup content ${popup.id}`}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
