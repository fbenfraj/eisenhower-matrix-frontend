import type { Task, Quadrant, XpValue, AiScores } from '../types'
import { getStoredToken, clearAuth } from './auth'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3001'

function getAuthHeaders(): HeadersInit {
  const token = getStoredToken()
  const headers: HeadersInit = { 'Content-Type': 'application/json' }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

function handleUnauthorized(response: Response): void {
  if (response.status === 401) {
    clearAuth()
    window.location.href = '/login'
  }
}

export type ApiTask = Task & { quadrant: Quadrant }

export async function fetchTasks(): Promise<ApiTask[]> {
  const response = await fetch(`${API_BASE}/api/tasks`, {
    headers: getAuthHeaders()
  })
  if (!response.ok) {
    handleUnauthorized(response)
    throw new Error('Failed to fetch tasks')
  }
  return response.json()
}

export async function createTask(task: Omit<ApiTask, 'id' | 'completed' | 'completedAt'>): Promise<ApiTask> {
  const response = await fetch(`${API_BASE}/api/tasks`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(task),
  })
  if (!response.ok) {
    handleUnauthorized(response)
    throw new Error('Failed to create task')
  }
  return response.json()
}

export interface UpdateTaskResponse extends ApiTask {
  xpGained?: number
}

export async function updateTask(id: number, updates: Partial<ApiTask>): Promise<UpdateTaskResponse> {
  const response = await fetch(`${API_BASE}/api/tasks/${id}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(updates),
  })
  if (!response.ok) {
    handleUnauthorized(response)
    throw new Error('Failed to update task')
  }
  return response.json()
}

export async function deleteTask(id: number): Promise<void> {
  const response = await fetch(`${API_BASE}/api/tasks/${id}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    handleUnauthorized(response)
    throw new Error('Failed to delete task')
  }
}

export interface ParsedTaskResponse {
  title: string
  description: string
  deadline: string | null
  quadrant: Quadrant
  recurrence: Task['recurrence']
  complexity: Task['complexity']
  aiScores: AiScores
  xp: XpValue
}

export async function parseTaskWithAI(input: string): Promise<ParsedTaskResponse> {
  const response = await fetch(`${API_BASE}/api/ai/parse-task`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ input }),
  })
  if (!response.ok) {
    handleUnauthorized(response)
    throw new Error('Failed to parse task with AI')
  }
  return response.json()
}

interface TaskForSort {
  text: string
  description?: string
  deadline?: string
  complexity?: Task['complexity']
  recurrence?: Task['recurrence']
}

export interface SortedTaskResponse {
  text: string
  quadrant: Quadrant
  complexity: Task['complexity']
  recurrence?: Task['recurrence']
}

export async function sortTasksWithAI(tasks: TaskForSort[]): Promise<SortedTaskResponse[]> {
  const response = await fetch(`${API_BASE}/api/ai/sort-tasks`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ tasks }),
  })
  if (!response.ok) {
    handleUnauthorized(response)
    throw new Error('Failed to sort tasks with AI')
  }
  return response.json()
}

export interface NotificationSettings {
  notificationsEnabled: boolean
  reminderTime: string
  timezone: string
}

export async function getNotificationSettings(): Promise<NotificationSettings> {
  const response = await fetch(`${API_BASE}/api/settings/notifications`, {
    headers: getAuthHeaders()
  })
  if (!response.ok) {
    handleUnauthorized(response)
    throw new Error('Failed to get notification settings')
  }
  return response.json()
}

export async function updateNotificationSettings(settings: Partial<NotificationSettings>): Promise<NotificationSettings> {
  const response = await fetch(`${API_BASE}/api/settings/notifications`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(settings),
  })
  if (!response.ok) {
    handleUnauthorized(response)
    throw new Error('Failed to update notification settings')
  }
  return response.json()
}

export interface YesterdayStats {
  yesterdayCount: number
  yesterdayXp: number
  doCount: number
}

export async function getYesterdayStats(): Promise<YesterdayStats> {
  const response = await fetch(`${API_BASE}/api/push/stats/yesterday`, {
    headers: getAuthHeaders()
  })
  if (!response.ok) {
    handleUnauthorized(response)
    throw new Error('Failed to get yesterday stats')
  }
  return response.json()
}

export interface PushSubscriptionKeys {
  p256dh: string
  auth: string
}

export async function subscribeToPush(endpoint: string, keys: PushSubscriptionKeys, userAgent?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/push/subscribe`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ endpoint, keys, userAgent }),
  })
  if (!response.ok) {
    handleUnauthorized(response)
    throw new Error('Failed to subscribe to push')
  }
}

export async function unsubscribeFromPush(endpoint?: string): Promise<void> {
  const response = await fetch(`${API_BASE}/api/push/unsubscribe`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ endpoint }),
  })
  if (!response.ok) {
    handleUnauthorized(response)
    throw new Error('Failed to unsubscribe from push')
  }
}

export async function sendTestPush(): Promise<void> {
  const response = await fetch(`${API_BASE}/api/push/test`, {
    method: 'POST',
    headers: getAuthHeaders(),
  })
  if (!response.ok) {
    handleUnauthorized(response)
    throw new Error('Failed to send test push')
  }
}
