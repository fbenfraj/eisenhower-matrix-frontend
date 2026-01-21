import { useState, useEffect } from 'react'
import { getYesterdayStats, type YesterdayStats } from '../services/api'

const DISMISSED_KEY = 'yesterday_recap_dismissed'

function getTodayDateString(): string {
  return new Date().toISOString().split('T')[0]
}

function wasDismissedToday(): boolean {
  const dismissed = localStorage.getItem(DISMISSED_KEY)
  return dismissed === getTodayDateString()
}

function dismissForToday(): void {
  localStorage.setItem(DISMISSED_KEY, getTodayDateString())
}

export function YesterdayRecap() {
  const [stats, setStats] = useState<YesterdayStats | null>(null)
  const [dismissed, setDismissed] = useState(wasDismissedToday)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (dismissed) {
      setLoading(false)
      return
    }

    async function fetchStats() {
      try {
        const data = await getYesterdayStats()
        setStats(data)
      } catch {
        // silently fail
      } finally {
        setLoading(false)
      }
    }

    fetchStats()
  }, [dismissed])

  function handleDismiss() {
    dismissForToday()
    setDismissed(true)
  }

  if (loading || dismissed || !stats) {
    return null
  }

  if (stats.yesterdayCount === 0 && stats.yesterdayXp === 0) {
    return (
      <div className="yesterday-recap">
        <span className="recap-text">Yesterday: nothing cleared. Today is simpler than it looks.</span>
        <button className="recap-dismiss" onClick={handleDismiss}>×</button>
      </div>
    )
  }

  return (
    <div className="yesterday-recap">
      <span className="recap-text">
        Yesterday: {stats.yesterdayCount} task{stats.yesterdayCount !== 1 ? 's' : ''} cleared (+{stats.yesterdayXp} XP)
      </span>
      <button className="recap-dismiss" onClick={handleDismiss}>×</button>
    </div>
  )
}
