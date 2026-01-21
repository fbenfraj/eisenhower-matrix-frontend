import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'notification_eligibility'

interface EligibilityData {
  sessions: number
  taskCount: number
  completedCount: number
}

function getStoredData(): EligibilityData {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored)
    }
  } catch {
    // ignore
  }
  return { sessions: 0, taskCount: 0, completedCount: 0 }
}

function storeData(data: EligibilityData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function useNotificationEligibility() {
  const [data, setData] = useState<EligibilityData>(getStoredData)

  useEffect(() => {
    const current = getStoredData()
    const updated = { ...current, sessions: current.sessions + 1 }
    storeData(updated)
    setData(updated)
  }, [])

  const recordTaskAdded = useCallback(() => {
    setData((prev) => {
      const updated = { ...prev, taskCount: prev.taskCount + 1 }
      storeData(updated)
      return updated
    })
  }, [])

  const recordTaskCompleted = useCallback(() => {
    setData((prev) => {
      const updated = { ...prev, completedCount: prev.completedCount + 1 }
      storeData(updated)
      return updated
    })
  }, [])

  const isEligible = data.taskCount >= 3 || data.completedCount >= 1 || data.sessions >= 2

  return {
    isEligible,
    sessions: data.sessions,
    taskCount: data.taskCount,
    completedCount: data.completedCount,
    recordTaskAdded,
    recordTaskCompleted
  }
}
