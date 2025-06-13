"use client"

import type React from "react"
import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ArrowLeft,
  ArrowRight,
  RefreshCwIcon as Reload,
  Home,
  Globe,
  X,
  BookmarkIcon,
  HistoryIcon,
  Shield,
  Volume2,
  VolumeX,
  Plus,
  Trash2,
} from "lucide-react"
import { toast } from "@/components/ui/use-toast"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

// Define the Tab interface
interface Tab {
  id: string
  url: string
  title: string
  favicon: string
  loading: boolean
  error: string | null
  iframeKey: number
  history: { url: string; title: string; timestamp: number }[]
  historyIndex: number
}

export function ProxyBrowser() {
  // Tab management
  const [tabs, setTabs] = useState<Tab[]>([])
  const [activeTabId, setActiveTabId] = useState<string | null>(null)

  // UI state
  const [url, setUrl] = useState("")
  const [loading, setLoading] = useState(false)
  const [popups, setPopups] = useState<{ id: string; url: string; title: string }[]>([])
  const [activePopupId, setActivePopupId] = useState<string | null>(null)
  const [pageTitle, setPageTitle] = useState("")
  const [bookmarks, setBookmarks] = useState<{ url: string; title: string; favicon: string }[]>([])
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [isMuted, setIsMuted] = useState(false)
  const [isSecure, setIsSecure] = useState(true)
  const [searchQuery, setSearchQuery] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [debugMode, setDebugMode] = useState(false)

  const iframeRef = useRef<HTMLIFrameElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)
  const tabsContainerRef = useRef<HTMLDivElement>(null)

  // Generate unique IDs
  const generateId = () => `id-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`

  // Get the active tab
  const activeTab = tabs.find((tab) => tab.id === activeTabId) || null

  // Load saved state from localStorage on component mount
  useEffect(() => {
    const savedBookmarks = localStorage.getItem("proxy-bookmarks")
    if (savedBookmarks) {
      try {
        setBookmarks(JSON.parse(savedBookmarks))
      } catch (e) {
        console.error("Failed to parse bookmarks:", e)
      }
    }

    // Try to load saved tabs
    const savedTabs = localStorage.getItem("proxy-tabs")
    if (savedTabs) {
      try {
        const parsedTabs = JSON.parse(savedTabs)
        // Regenerate iframe keys to ensure fresh content
        const refreshedTabs = parsedTabs.map((tab: Tab) => ({
          ...tab,
          iframeKey: Date.now() + Math.random(),
          loading: false,
        }))
        setTabs(refreshedTabs)

        const savedActiveTabId = localStorage.getItem("proxy-active-tab")
        if (savedActiveTabId && refreshedTabs.some((tab: Tab) => tab.id === savedActiveTabId)) {
          setActiveTabId(savedActiveTabId)
        } else if (refreshedTabs.length > 0) {
          setActiveTabId(refreshedTabs[0].id)
        }
      } catch (e) {
        console.error("Failed to parse saved tabs:", e)
        createNewTab()
      }
    } else {
      // Create an initial tab if none exist
      createNewTab()
    }
  }, [])

  // Save tabs to localStorage when they change
  useEffect(() => {
    if (tabs.length > 0) {
      localStorage.setItem("proxy-tabs", JSON.stringify(tabs))
    }
    if (activeTabId) {
      localStorage.setItem("proxy-active-tab", activeTabId)
    }
  }, [tabs, activeTabId])

  // Save bookmarks to localStorage when they change
  useEffect(() => {
    localStorage.setItem("proxy-bookmarks", JSON.stringify(bookmarks))
  }, [bookmarks])

  // Update URL input when active tab changes
  useEffect(() => {
    if (activeTab) {
      setUrl(activeTab.url)
      setPageTitle(activeTab.title)
      setLoading(activeTab.loading)
      setIsSecure(activeTab.url.startsWith("https://"))
      setIsSearching(
        activeTab.url.includes("google.com/search") ||
          activeTab.url.includes("bing.com/search") ||
          activeTab.url.includes("duckduckgo.com")
      )
    } else {
      setUrl("")
      setPageTitle("")
      setLoading(false)
      setIsSecure(true)
      setIsSearching(false)
    }
  }, [activeTab])

  // Create a new tab
  const createNewTab = useCallback((tabUrl = "") => {
    const newTabId = generateId()
    const newTab: Tab = {
      id: newTabId,
      url: tabUrl,
      title: tabUrl ? new URL(tabUrl).hostname : "New Tab",
      favicon: "",
      loading: !!tabUrl,
      error: null,
      iframeKey: Date.now(),
      history: tabUrl ? [{ url: tabUrl, title: new URL(tabUrl).hostname, timestamp: Date.now() }] : [],
      historyIndex: tabUrl ? 0 : -1,
    }

    setTabs((prevTabs) => [...prevTabs, newTab])
    setActiveTabId(newTabId)

    // Focus URL input if it's a blank tab
    if (!tabUrl) {
      setTimeout(() => {
        urlInputRef.current?.focus()
      }, 100)
    }

    return newTabId
  }, [])

  // Close a tab
  const closeTab = useCallback(
    (tabId: string) => {
      setTabs((prevTabs) => {
        const tabIndex = prevTabs.findIndex((tab) => tab.id === tabId)
        if (tabIndex === -1) return prevTabs

        const newTabs = [...prevTabs]
        newTabs.splice(tabIndex, 1)

        // If we're closing the active tab, activate another tab
        if (tabId === activeTabId) {
          if (newTabs.length > 0) {
            // Prefer the tab to the right, then left
            const newActiveIndex = Math.min(tabIndex, newTabs.length - 1)
            setActiveTabId(newTabs[newActiveIndex].id)
          } else {
            // If no tabs left, create a new one
            setTimeout(() => createNewTab(), 0)
            setActiveTabId(null)
          }
        }

        return newTabs
      })
    },
    [activeTabId, createNewTab],
  )

  // Update a tab
  const updateTab = useCallback((tabId: string, updates: Partial<Tab>) => {
    setTabs((prevTabs) => prevTabs.map((tab) => (tab.id === tabId ? { ...tab, ...updates } : tab)))
  }, [])

  // Navigate to a URL in the active tab
  const navigate = useCallback(
    (targetUrl: string, addToHistory = true) => {
      if (!targetUrl || !activeTabId) return

      // Reset error state
      updateTab(activeTabId, { error: null })

      // Make sure URL has a protocol
      let processedUrl = targetUrl
      if (!processedUrl.startsWith("http://") && !processedUrl.startsWith("https://")) {
        processedUrl = `https://${processedUrl}`
      }

      try {
        // Update loading state
        updateTab(activeTabId, { loading: true })

        // Update URL state
        setUrl(processedUrl)
        updateTab(activeTabId, { url: processedUrl })

        // Check if the URL is secure (https)
        setIsSecure(processedUrl.startsWith("https://"))

        // Update tab history if needed
        if (addToHistory && activeTab) {
          const newHistoryEntry = {
            url: processedUrl,
            title: activeTab.title || new URL(processedUrl).hostname,
            timestamp: Date.now(),
          }

          const currentHistory = [...activeTab.history]
          let newHistoryIndex = activeTab.historyIndex

          // If we're not at the end of the history, truncate it
          if (activeTab.historyIndex !== activeTab.history.length - 1 && activeTab.historyIndex !== -1) {
            currentHistory.splice(activeTab.historyIndex + 1)
          }

          currentHistory.push(newHistoryEntry)
          newHistoryIndex = currentHistory.length - 1

          updateTab(activeTabId, {
            history: currentHistory,
            historyIndex: newHistoryIndex,
            iframeKey: Date.now(), // Force iframe refresh
          })
        } else {
          // Just refresh the iframe
          updateTab(activeTabId, { iframeKey: Date.now() })
        }

        if (debugMode) {
          console.log(`Navigating to: ${processedUrl}`)
        }
      } catch (error) {
        toast({
          title: "Navigation Error",
          description: "Failed to navigate to the requested page",
          variant: "destructive",
        })
        updateTab(activeTabId, {
          error: "Failed to navigate to the requested page",
          loading: false,
        })
        console.error(error)
      }
    },
    [activeTabId, activeTab, updateTab, debugMode],
  )

  // Go back in the active tab's history
  const goBack = useCallback(() => {
    if (!activeTab || activeTab.historyIndex <= 0) return

    const newIndex = activeTab.historyIndex - 1
    const prevUrl = activeTab.history[newIndex].url

    updateTab(activeTab.id, {
      historyIndex: newIndex,
      url: prevUrl,
      iframeKey: Date.now(),
    })

    setUrl(prevUrl)
  }, [activeTab, updateTab])

  // Go forward in the active tab's history
  const goForward = useCallback(() => {
    if (!activeTab || activeTab.historyIndex >= activeTab.history.length - 1) return

    const newIndex = activeTab.historyIndex + 1
    const nextUrl = activeTab.history[newIndex].url

    updateTab(activeTab.id, {
      historyIndex: newIndex,
      url: nextUrl,
      iframeKey: Date.now(),
    })

    setUrl(nextUrl)
  }, [activeTab, updateTab])

  // Go to the home page
  const goHome = useCallback(() => {
    setUrl("")
    setPageTitle("")
    setActivePopupId(null)

    if (activeTabId) {
      updateTab(activeTabId, {
        url: "",
        title: "New Tab",
        error: null,
        loading: false,
      })
    }
  }, [activeTabId, updateTab])

  // Refresh the active tab
  const handleRefresh = useCallback(() => {
    if (!activeTab || !activeTab.url) return

    updateTab(activeTab.id, {
      loading: true,
      error: null,
      iframeKey: Date.now(),
    })
  }, [activeTab, updateTab])

  // Handle URL form submission
  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()

      // Check if the input is a search query or URL
      const input = url.trim()

      if (input === "") {
        return
      }

      // If it has spaces or doesn't have dots, treat as search query
      if (input.includes(" ") || !input.includes(".")) {
        const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(input)}`
        navigate(searchUrl)
      } else {
        navigate(input)
      }
    },
    [url, navigate],
  )

  // Open a popup
  const openPopup = useCallback(
    (popupUrl: string, title = "") => {
      const id = generateId()
      setPopups([...popups, { id, url: popupUrl, title: title || new URL(popupUrl).hostname }])
      setActivePopupId(id)
    },
    [popups],
  )

  // Close a popup
  const closePopup = useCallback(
    (id: string) => {
      setPopups(popups.filter((popup) => popup.id !== id))
      if (activePopupId === id) {
        setActivePopupId(null)
      }
    },
    [popups, activePopupId],
  )

  // Toggle bookmark for the current URL
  const toggleBookmark = useCallback(() => {
    if (!activeTab || !activeTab.url) return

    const isBookmarked = bookmarks.some((b) => b.url === activeTab.url)

    if (isBookmarked) {
      setBookmarks(bookmarks.filter((b) => b.url !== activeTab.url))
      toast({
        title: "Bookmark removed",
        description: "Page has been removed from bookmarks",
      })
    } else {
      const newBookmark = {
        url: activeTab.url,
        title: activeTab.title || new URL(activeTab.url).hostname,
        favicon: activeTab.favicon || "",
      }
      setBookmarks([...bookmarks, newBookmark])
      toast({
        title: "Bookmark added",
        description: "Page has been added to bookmarks",
      })
    }
  }, [activeTab, bookmarks])

  // Check if the current URL is bookmarked
  const isCurrentUrlBookmarked = activeTab?.url ? bookmarks.some((b) => b.url === activeTab.url) : false

  // Toggle mute for all media
  const toggleMute = useCallback(() => {
    setIsMuted(!isMuted)

    // Try to mute/unmute the iframe content
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          {
            type: "PROXY_COMMAND",
            action: "TOGGLE_MUTE",
            value: !isMuted,
          },
          "*",
        )
      } catch (e) {
        console.error("Failed to send mute command to iframe:", e)
      }
    }
  }, [isMuted])

  // Clear cache and cookies for a fresh browsing experience
  const clearBrowsingData = useCallback(() => {
    if (!activeTabId) return

    // Update the iframe key to force a complete reload
    updateTab(activeTabId, {
      iframeKey: Date.now(),
      loading: true,
    })

    // Try to send a message to the iframe to clear its storage
    if (iframeRef.current && iframeRef.current.contentWindow) {
      try {
        iframeRef.current.contentWindow.postMessage(
          {
            type: "PROXY_COMMAND",
            action: "CLEAR_BROWSING_DATA",
          },
          "*",
        )
      } catch (e) {
        console.error("Failed to send clear data command to iframe:", e)
      }
    }

    toast({
      title: "Browsing data cleared",
      description: "Cache and cookies have been cleared for this tab",
    })
  }, [activeTabId, updateTab])

  // Toggle debug mode
  const toggleDebugMode = useCallback(() => {
    setDebugMode(!debugMode)
    toast({
      title: debugMode ? "Debug mode disabled" : "Debug mode enabled",
      description: debugMode ? "Debug logs will no longer be shown" : "Debug logs will be shown in the console",
    })
  }, [debugMode])

  // Perform a search
  const performSearch = useCallback(() => {
    if (!searchQuery.trim()) return

    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery)}`
    navigate(searchUrl)
    setSearchQuery("")
    setIsSearching(false)
  }, [searchQuery, navigate])

  // Scroll tabs into view when they overflow
  const scrollTabIntoView = useCallback((tabId: string) => {
    if (!tabsContainerRef.current) return

    const tabElement = document.getElementById(`tab-${tabId}`)
    if (tabElement) {
      const container = tabsContainerRef.current
      const tabRect = tabElement.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()

      if (tabRect.left < containerRect.left) {
        container.scrollLeft += tabRect.left - containerRect.left - 10
      } else if (tabRect.right > containerRect.right) {
        container.scrollLeft += tabRect.right - containerRect.right + 10
      }
    }
  }, [])

  // Set active tab and scroll it into view
  const activateTab = useCallback(
    (tabId: string) => {
      setActiveTabId(tabId)
      scrollTabIntoView(tabId)
    },
    [scrollTabIntoView],
  )

  // Listen for messages from the iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Check if the message is from our proxy
      if (event.data && event.data.type === "PROXY_EVENT") {
        if (debugMode) {
          console.log("Received message from iframe:", event.data)
        }

        switch (event.data.action) {
          case "NAVIGATE":
            if (activeTabId) {
              navigate(event.data.url)
            }
            break

          case "OPEN_POPUP":
            openPopup(event.data.url, event.data.title)
            break

          case "LOADING_STATE":
            if (activeTabId) {
              updateTab(activeTabId, { loading: event.data.isLoading })
            }
            break

          case "PAGE_TITLE":
            if (event.data.popupId) {
              // Update popup title
              setPopups((prevPopups) =>
                prevPopups.map((popup) =>
                  popup.id === event.data.popupId ? { ...popup, title: event.data.title || popup.title } : popup,
                ),
              )
            } else if (activeTabId) {
              // Update tab title
              setPageTitle(event.data.title)
              updateTab(activeTabId, { title: event.data.title })

              // Update the title in history if needed
              if (activeTab && activeTab.historyIndex >= 0) {
                const updatedHistory = [...activeTab.history]
                updatedHistory[activeTab.historyIndex] = {
                  ...updatedHistory[activeTab.historyIndex],
                  title: event.data.title,
                }
                updateTab(activeTabId, { history: updatedHistory })
              }
            }
            break

          case "ERROR":
            if (activeTabId) {
              toast({
                title: "Error",
                description: event.data.message,
                variant: "destructive",
              })
              updateTab(activeTabId, {
                error: event.data.message,
                loading: false,
              })
            }
            break

          case "FAVICON":
            if (activeTabId && event.data.favicon) {
              updateTab(activeTabId, { favicon: event.data.favicon })
            }
            break

          case "DEBUG":
            if (debugMode) {
              console.log("Debug from iframe:", event.data.message)
            }
            break
        }
      }
    }

    window.addEventListener("message", handleMessage)
    return () => window.removeEventListener("message", handleMessage)
  }, [activeTabId, activeTab, navigate, openPopup, updateTab, debugMode])

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only handle keyboard shortcuts if not typing in an input
      if (document.activeElement?.tagName === "INPUT") return

      // Ctrl+R or F5 to refresh
      if ((e.ctrlKey && e.key === "r") || e.key === "F5") {
        e.preventDefault()
        handleRefresh()
      }

      // Alt+Left to go back
      if (e.altKey && e.key === "ArrowLeft") {
        e.preventDefault()
        goBack()
      }

      // Alt+Right to go forward
      if (e.altKey && e.key === "ArrowRight") {
        e.preventDefault()
        goForward()
      }

      // Ctrl+D to bookmark
      if (e.ctrlKey && e.key === "d") {
        e.preventDefault()
        toggleBookmark()
      }

      // Ctrl+H to show history
      if (e.ctrlKey && e.key === "h") {
        e.preventDefault()
        setShowHistory(!showHistory)
        setShowBookmarks(false)
      }

      // Ctrl+B to show bookmarks
      if (e.ctrlKey && e.key === "b") {
        e.preventDefault()
        setShowBookmarks(!showBookmarks)
        setShowHistory(false)
      }

      // Escape to close panels
      if (e.key === "Escape") {
        setShowBookmarks(false)
        setShowHistory(false)
        setIsSearching(false)
      }

      // Ctrl+L to focus address bar
      if (e.ctrlKey && e.key === "l") {
        e.preventDefault()
        urlInputRef.current?.focus()
        urlInputRef.current?.select()
      }

      // Ctrl+T to open new tab
      if (e.ctrlKey && e.key === "t") {
        e.preventDefault()
        createNewTab()
      }

      // Ctrl+W to close current tab
      if (e.ctrlKey && e.key === "w") {
        e.preventDefault()
        if (activeTabId) {
          closeTab(activeTabId)
        }
      }

      // Ctrl+Tab to cycle through tabs
      if (e.ctrlKey && e.key === "Tab") {
        e.preventDefault()
        if (tabs.length > 1 && activeTabId) {
          const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId)
          const nextIndex = (currentIndex + 1) % tabs.length
          activateTab(tabs[nextIndex].id)
        }
      }

      // Ctrl+Shift+Tab to cycle through tabs backwards
      if (e.ctrlKey && e.shiftKey && e.key === "Tab") {
        e.preventDefault()
        if (tabs.length > 1 && activeTabId) {
          const currentIndex = tabs.findIndex((tab) => tab.id === activeTabId)
          const prevIndex = (currentIndex - 1 + tabs.length) % tabs.length
          activateTab(tabs[prevIndex].id)
        }
      }

      // Ctrl+1 through Ctrl+9 to switch to specific tabs
      if (e.ctrlKey && !e.shiftKey && !e.altKey && /^[1-9]$/.test(e.key)) {
        e.preventDefault()
        const tabIndex = Number.parseInt(e.key) - 1
        if (tabIndex < tabs.length) {
          activateTab(tabs[tabIndex].id)
        }
      }

      // Alt+D to toggle debug mode
      if (e.altKey && e.key === "d") {
        e.preventDefault()
        toggleDebugMode()
      }
    }

    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [
    goBack,
    goForward,
    handleRefresh,
    showBookmarks,
    showHistory,
    toggleBookmark,
    createNewTab,
    closeTab,
    activeTabId,
    tabs,
    activateTab,
    toggleDebugMode,
  ])

  return (
    <div className="flex flex-col h-full w-full bg-black text-white">
      {/* Tab bar */}
      <div className="flex items-center bg-gray-900 border-b border-gray-700 overflow-hidden">
        <div ref={tabsContainerRef} className="flex-1 flex items-center overflow-x-auto scrollbar-hide">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              id={`tab-${tab.id}`}
              className={`flex items-center min-w-[140px] max-w-[200px] h-9 px-3 py-1 border-r border-gray-700 ${
                activeTabId === tab.id ? "bg-gray-800" : "bg-gray-900 hover:bg-gray-800"
              } cursor-pointer group`}
              onClick={() => activateTab(tab.id)}
            >
              {tab.loading ? (
                <div className="w-4 h-4 mr-2 rounded-full border-2 border-t-transparent border-blue-500 animate-spin" />
              ) : tab.favicon ? (
                <img src={tab.favicon || "/placeholder.svg"} alt="" className="w-4 h-4 mr-2" />
              ) : (
                <Globe className="w-4 h-4 mr-2 text-gray-400" />
              )}
              <div className="flex-1 truncate text-sm">{tab.title || "New Tab"}</div>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100 ml-1"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(tab.id)
                }}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 w-9 flex-shrink-0 border-l border-gray-700"
          onClick={() => createNewTab()}
          title="New Tab (Ctrl+T)"
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {/* Navigation bar */}
      <div className="flex items-center space-x-2 bg-gray-900 p-2 border-b border-gray-700">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={goBack}
                disabled={!activeTab || activeTab.historyIndex <= 0}
                className="text-gray-300 hover:text-white hover:bg-gray-800"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Back (Alt+Left)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={goForward}
                disabled={!activeTab || activeTab.historyIndex >= activeTab.history.length - 1}
                className="text-gray-300 hover:text-white hover:bg-gray-800"
              >
                <ArrowRight className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Forward (Alt+Right)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleRefresh}
                disabled={!activeTab?.url}
                className="text-gray-300 hover:text-white hover:bg-gray-800"
              >
                <Reload className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Refresh (Ctrl+R)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={goHome}
                className="text-gray-300 hover:text-white hover:bg-gray-800"
              >
                <Home className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Home</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <form onSubmit={handleSubmit} className="flex-1 flex">
          <div className="flex items-center w-full rounded-md border border-gray-700 px-3 bg-gray-800 relative">
            {isSecure && <Shield className="h-4 w-4 text-green-500 mr-2" />}
            {!isSecure && activeTab?.url && <Shield className="h-4 w-4 text-yellow-500 mr-2" />}
            {!activeTab?.url && <Globe className="h-4 w-4 text-gray-400 mr-2" />}
            <Input
              ref={urlInputRef}
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Search or enter website name"
              className="flex-1 border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-gray-800 text-white"
            />
            {isSearching && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 absolute right-2"
                onClick={() => setIsSearching(false)}
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
          <Button type="submit" className="ml-2 bg-gray-700 hover:bg-gray-600 text-white">
            Go
          </Button>
        </form>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowBookmarks(!showBookmarks)
                  setShowHistory(false)
                }}
                className={`text-gray-300 hover:text-white hover:bg-gray-800 ${showBookmarks ? "bg-gray-700" : ""}`}
              >
                <BookmarkIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Bookmarks (Ctrl+B)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setShowHistory(!showHistory)
                  setShowBookmarks(false)
                }}
                className={`text-gray-300 hover:text-white hover:bg-gray-800 ${showHistory ? "bg-gray-700" : ""}`}
              >
                <HistoryIcon className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>History (Ctrl+H)</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleMute}
                className="text-gray-300 hover:text-white hover:bg-gray-800"
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>{isMuted ? "Unmute" : "Mute"}</p>
            </TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                onClick={clearBrowsingData}
                className="text-gray-300 hover:text-white hover:bg-gray-800"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>Clear Cache & Cookies</p>
            </TooltipContent>
          </Tooltip>

          {activeTab?.url && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={toggleBookmark}
                  className="text-gray-300 hover:text-white hover:bg-gray-800"
                >
                  <BookmarkIcon
                    className={`h-4 w-4 ${isCurrentUrlBookmarked ? "fill-yellow-400 text-yellow-400" : ""}`}
                  />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{isCurrentUrlBookmarked ? "Remove bookmark (Ctrl+D)" : "Add bookmark (Ctrl+D)"}</p>\
              </TooltipContent>
