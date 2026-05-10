import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export function useKeyboardNav(siteId: string | null) {
  const router = useRouter()

  useEffect(() => {
    if (!siteId) return
    let gPressed = false
    let timeout: NodeJS.Timeout

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore when typing in input/textarea
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return

      if (e.key === 'g' || e.key === 'G') {
        gPressed = true
        clearTimeout(timeout)
        timeout = setTimeout(() => { gPressed = false }, 800)
        return
      }

      if (!gPressed) return

      const map: Record<string, string> = {
        o: 'overview', t: 'trend', s: 'sources',
        c: 'campaigns', p: 'pages', f: 'funnel',
        r: 'realtime', b: 'bots', u: 'contacts',
        h: 'health', x: 'exports',
      }

      if (map[e.key.toLowerCase()]) {
        e.preventDefault()
        gPressed = false
        router.push(`/dashboard/${siteId}/${map[e.key.toLowerCase()]}`)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [siteId, router])
}
