import { useState, useEffect } from 'react'
import OpenAI from 'openai'
import './App.css'

// Legacy recurrence type for backwards compatibility
type LegacyRecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly'

// Days of the week (0 = Sunday, 6 = Saturday)
type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6

// Recurrence frequency unit
type RecurrenceUnit = 'day' | 'week' | 'month' | 'year'

// Flexible recurrence configuration
interface RecurrenceConfig {
  interval: number // Every X units (e.g., every 2 weeks)
  unit: RecurrenceUnit
  weekDays?: DayOfWeek[] // For weekly: specific days (e.g., [1, 3] = Mon, Wed)
  monthDay?: number // For monthly: specific day (e.g., 15 = 15th of month)
}

// Task recurrence can be legacy string or flexible config
type TaskRecurrence = LegacyRecurrencePattern | RecurrenceConfig | null

// Type guard
const isLegacyRecurrence = (recurrence: TaskRecurrence): recurrence is LegacyRecurrencePattern => {
  return typeof recurrence === 'string'
}

type Complexity = 'easy' | 'medium' | 'hard'

const COMPLEXITY_ORDER: Record<Complexity, number> = {
  easy: 1,
  medium: 2,
  hard: 3
}

type Task = {
  id: number
  text: string
  description?: string
  deadline?: string
  completed: boolean
  completedAt?: string // ISO date string of when task was completed
  recurrence?: TaskRecurrence
  complexity?: Complexity
}

type Quadrant = 'urgent-important' | 'not-urgent-important' | 'urgent-not-important' | 'not-urgent-not-important'

const STORAGE_KEY = 'eisenhower-matrix-tasks'

// Check if a task should be visible (hide completed tasks from previous days)
const isTaskVisible = (task: Task): boolean => {
  if (!task.completed) return true
  if (!task.completedAt) return true // Show completed tasks without completedAt for backwards compatibility
  const today = new Date().toISOString().split('T')[0]
  return task.completedAt === today
}

// Get days in a month
const getDaysInMonth = (date: Date): number => {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate()
}

// Find next occurrence on specified weekdays
const findNextWeekdayOccurrence = (
  baseDate: Date,
  weekInterval: number,
  weekDays: DayOfWeek[]
): string => {
  const sortedDays = [...weekDays].sort((a, b) => a - b)
  const currentDay = baseDate.getDay() as DayOfWeek

  const nextDate = new Date(baseDate)

  // Check if there's another day this week (after current day)
  const nextDayThisWeek = sortedDays.find(d => d > currentDay)

  if (nextDayThisWeek !== undefined && weekInterval === 1) {
    // Move to next day this week
    const daysToAdd = nextDayThisWeek - currentDay
    nextDate.setDate(nextDate.getDate() + daysToAdd)
  } else {
    // Move to first day of next interval week
    const daysUntilNextWeek = 7 - currentDay + sortedDays[0]
    const additionalWeeks = (weekInterval - 1) * 7
    nextDate.setDate(nextDate.getDate() + daysUntilNextWeek + additionalWeeks)
  }

  return nextDate.toISOString().split('T')[0]
}

// Calculate next deadline for legacy patterns
const calculateLegacyNextDeadline = (
  baseDate: Date,
  recurrence: LegacyRecurrencePattern
): string => {
  const nextDate = new Date(baseDate)

  switch (recurrence) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1)
      break
    case 'weekly':
      nextDate.setDate(nextDate.getDate() + 7)
      break
    case 'monthly':
      nextDate.setMonth(nextDate.getMonth() + 1)
      break
    case 'yearly':
      nextDate.setFullYear(nextDate.getFullYear() + 1)
      break
  }

  return nextDate.toISOString().split('T')[0]
}

// Calculate next deadline for flexible patterns
const calculateFlexibleNextDeadline = (
  baseDate: Date,
  config: RecurrenceConfig
): string => {
  const nextDate = new Date(baseDate)
  const { interval, unit, weekDays, monthDay } = config

  switch (unit) {
    case 'day':
      nextDate.setDate(nextDate.getDate() + interval)
      break

    case 'week':
      if (weekDays && weekDays.length > 0) {
        return findNextWeekdayOccurrence(baseDate, interval, weekDays)
      } else {
        nextDate.setDate(nextDate.getDate() + (interval * 7))
      }
      break

    case 'month':
      nextDate.setMonth(nextDate.getMonth() + interval)
      if (monthDay !== undefined && monthDay !== null) {
        const targetDay = Math.min(monthDay, getDaysInMonth(nextDate))
        nextDate.setDate(targetDay)
      }
      break

    case 'year':
      nextDate.setFullYear(nextDate.getFullYear() + interval)
      break
  }

  return nextDate.toISOString().split('T')[0]
}

// Main function to calculate next deadline
const calculateNextDeadline = (
  currentDeadline: string | undefined,
  recurrence: TaskRecurrence
): string => {
  if (!recurrence) {
    throw new Error('Recurrence pattern is required')
  }

  const baseDate = currentDeadline ? new Date(currentDeadline) : new Date()

  // Handle legacy string patterns
  if (isLegacyRecurrence(recurrence)) {
    return calculateLegacyNextDeadline(baseDate, recurrence)
  }

  // Handle flexible config
  return calculateFlexibleNextDeadline(baseDate, recurrence)
}

// Day names for display
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

// Get ordinal suffix (1st, 2nd, 3rd, etc.)
const getOrdinalSuffix = (n: number): string => {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return s[(v - 20) % 10] || s[v] || s[0]
}

// Generate human-readable recurrence description
const getRecurrenceDescription = (recurrence: TaskRecurrence): string => {
  if (!recurrence) return ''

  if (isLegacyRecurrence(recurrence)) {
    const descriptions: Record<LegacyRecurrencePattern, string> = {
      daily: 'Daily',
      weekly: 'Weekly',
      monthly: 'Monthly',
      yearly: 'Yearly'
    }
    return descriptions[recurrence]
  }

  const { interval, unit, weekDays, monthDay } = recurrence

  // Handle weekday-specific patterns
  if (unit === 'week' && weekDays && weekDays.length > 0) {
    const dayList = weekDays.map(d => DAY_NAMES[d]).join(', ')

    if (weekDays.length === 5 && weekDays.every((d, i) => d === i + 1)) {
      return interval === 1 ? 'Weekdays' : `Every ${interval} weeks (weekdays)`
    }

    if (weekDays.length === 2 && weekDays.includes(0) && weekDays.includes(6)) {
      return interval === 1 ? 'Weekends' : `Every ${interval} weeks (weekends)`
    }

    return interval === 1 ? `Every ${dayList}` : `Every ${interval} weeks on ${dayList}`
  }

  // Handle month-day specific patterns
  if (unit === 'month' && monthDay) {
    const suffix = getOrdinalSuffix(monthDay)
    return interval === 1
      ? `${monthDay}${suffix} of each month`
      : `${monthDay}${suffix} every ${interval} months`
  }

  // Simple interval patterns
  if (interval === 1) {
    const simpleLabels: Record<RecurrenceUnit, string> = {
      day: 'Daily',
      week: 'Weekly',
      month: 'Monthly',
      year: 'Yearly'
    }
    return simpleLabels[unit]
  }

  if (interval === 2) {
    const biLabels: Record<RecurrenceUnit, string> = {
      day: 'Every other day',
      week: 'Biweekly',
      month: 'Bimonthly',
      year: 'Biannual'
    }
    return biLabels[unit]
  }

  const unitLabels: Record<RecurrenceUnit, string> = {
    day: 'days',
    week: 'weeks',
    month: 'months',
    year: 'years'
  }

  return `Every ${interval} ${unitLabels[unit]}`
}

// Recurrence form state type
interface RecurrenceFormState {
  enabled: boolean
  preset: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom' | null
  interval: number
  unit: RecurrenceUnit
  weekDays: DayOfWeek[]
  monthDay: number | null
  useSpecificMonthDay: boolean
}

// Default recurrence form state
const defaultRecurrenceForm: RecurrenceFormState = {
  enabled: false,
  preset: null,
  interval: 1,
  unit: 'week',
  weekDays: [],
  monthDay: null,
  useSpecificMonthDay: false
}

// Build RecurrenceConfig from form state
const buildRecurrenceConfig = (formState: RecurrenceFormState): TaskRecurrence => {
  if (!formState.enabled) return null

  // For simple presets, return legacy string for backwards compatibility
  if (formState.preset && formState.preset !== 'custom') {
    return formState.preset // 'daily' | 'weekly' | 'monthly' | 'yearly'
  }

  // Build flexible config
  const config: RecurrenceConfig = {
    interval: formState.interval,
    unit: formState.unit
  }

  if (formState.unit === 'week' && formState.weekDays.length > 0) {
    config.weekDays = formState.weekDays
  }

  if (formState.unit === 'month' && formState.useSpecificMonthDay && formState.monthDay) {
    config.monthDay = formState.monthDay
  }

  return config
}

// Parse recurrence config to form state
const parseRecurrenceToFormState = (recurrence: TaskRecurrence): RecurrenceFormState => {
  if (!recurrence) {
    return { ...defaultRecurrenceForm }
  }

  if (isLegacyRecurrence(recurrence)) {
    const unitMap: Record<LegacyRecurrencePattern, RecurrenceUnit> = {
      daily: 'day',
      weekly: 'week',
      monthly: 'month',
      yearly: 'year'
    }
    return {
      enabled: true,
      preset: recurrence,
      interval: 1,
      unit: unitMap[recurrence],
      weekDays: [],
      monthDay: null,
      useSpecificMonthDay: false
    }
  }

  // Flexible config
  return {
    enabled: true,
    preset: 'custom',
    interval: recurrence.interval,
    unit: recurrence.unit,
    weekDays: recurrence.weekDays || [],
    monthDay: recurrence.monthDay ?? null,
    useSpecificMonthDay: recurrence.monthDay !== undefined
  }
}

function App() {
  const [tasks, setTasks] = useState<Record<Quadrant, Task[]>>(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      return JSON.parse(saved)
    }
    return {
      'urgent-important': [],
      'not-urgent-important': [],
      'urgent-not-important': [],
      'not-urgent-not-important': []
    }
  })
  const [isAiSorting, setIsAiSorting] = useState(false)
  const [editingTask, setEditingTask] = useState<{ task: Task; quadrant: Quadrant } | null>(null)
  const [editForm, setEditForm] = useState({
    text: '',
    description: '',
    deadline: '',
    isUrgent: false,
    isImportant: false,
    recurrence: { ...defaultRecurrenceForm },
    complexity: 'medium' as Complexity
  })

  // FAB and Add Task Modal state
  const [isFabOpen, setIsFabOpen] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ input: '' })
  const [isAddingTask, setIsAddingTask] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks])

  // Close FAB menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (isFabOpen && !target.closest('.fab-container')) {
        setIsFabOpen(false)
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [isFabOpen])

  const addTask = async () => {
    const trimmedInput = addForm.input.trim()

    if (trimmedInput === '') {
      setError('Please describe your task')
      return
    }

    if (trimmedInput.length > 500) {
      setError('Input must be 500 characters or less')
      return
    }

    setIsAddingTask(true)
    setError('')

    try {
      const openai = new OpenAI({
        apiKey: import.meta.env.VITE_OPENAI_API_KEY,
        dangerouslyAllowBrowser: true
      })

      const today = new Date()
      const todayStr = today.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })

      const prompt = `Today's date is: ${todayStr}

Extract task details from this user input and categorize it into an Eisenhower Matrix quadrant.

User input: "${trimmedInput}"

You must respond with ONLY a valid JSON object (no markdown, no explanation) with these exact fields:
{
  "title": "short task title (max 50 chars)",
  "description": "additional details or empty string if none",
  "deadline": "YYYY-MM-DD format or null if no deadline mentioned",
  "quadrant": "one of: urgent-important, not-urgent-important, urgent-not-important, not-urgent-not-important",
  "recurrence": <recurrence pattern - see below>,
  "complexity": "one of: easy, medium, hard"
}

Quadrant rules:
- "urgent-important": Deadlines within 2 days, emergencies, crises, critical issues
- "not-urgent-important": Important goals, deadlines > 2 days away, planning, learning, health
- "urgent-not-important": Minor urgent items, some calls/emails, interruptions
- "not-urgent-not-important": Low priority, trivial tasks, entertainment, time wasters

Recurrence detection - return one of these formats:

1. Simple patterns (return string):
   - "daily": "every day", "daily", "each day"
   - "weekly": "every week", "weekly", "each week"
   - "monthly": "every month", "monthly", "each month"
   - "yearly": "every year", "yearly", "annually"

2. Custom intervals (return object):
   - "every 2 weeks" or "biweekly" → { "interval": 2, "unit": "week" }
   - "every 3 days" → { "interval": 3, "unit": "day" }
   - "every 2 months" → { "interval": 2, "unit": "month" }
   - "every other day" → { "interval": 2, "unit": "day" }

3. Specific weekdays (return object with weekDays array, 0=Sunday, 6=Saturday):
   - "every Monday" → { "interval": 1, "unit": "week", "weekDays": [1] }
   - "every Monday and Wednesday" → { "interval": 1, "unit": "week", "weekDays": [1, 3] }
   - "every Tuesday, Thursday, Saturday" → { "interval": 1, "unit": "week", "weekDays": [2, 4, 6] }
   - "weekdays" or "every weekday" → { "interval": 1, "unit": "week", "weekDays": [1, 2, 3, 4, 5] }
   - "weekends" → { "interval": 1, "unit": "week", "weekDays": [0, 6] }

4. Specific day of month (return object with monthDay):
   - "15th of every month" → { "interval": 1, "unit": "month", "monthDay": 15 }
   - "1st of each month" → { "interval": 1, "unit": "month", "monthDay": 1 }
   - "every month on the 20th" → { "interval": 1, "unit": "month", "monthDay": 20 }

5. No recurrence: return null

Examples:
- "Call mom every Sunday" → { "interval": 1, "unit": "week", "weekDays": [0] }
- "Pay rent on the 1st of every month" → { "interval": 1, "unit": "month", "monthDay": 1 }
- "Team standup every weekday" → { "interval": 1, "unit": "week", "weekDays": [1, 2, 3, 4, 5] }
- "Gym every other day" → { "interval": 2, "unit": "day" }
- "Water plants every 3 days" → { "interval": 3, "unit": "day" }
- "Biweekly payroll" → { "interval": 2, "unit": "week" }

Complexity rules:
- "easy": Quick tasks (< 15 min), simple actions, minimal thinking required
- "medium": Moderate effort (15 min - 2 hours), some planning needed
- "hard": Significant effort (> 2 hours), complex, multiple steps, deep focus required

For recurring tasks: if no explicit deadline is mentioned, set deadline to today's date (${today.toISOString().split('T')[0]}).

Date interpretation:
- "today" = ${today.toISOString().split('T')[0]}
- "tomorrow" = ${new Date(today.getTime() + 86400000).toISOString().split('T')[0]}
- "next week" = ${new Date(today.getTime() + 7 * 86400000).toISOString().split('T')[0]}
- "next month" = ${new Date(today.getFullYear(), today.getMonth() + 1, today.getDate()).toISOString().split('T')[0]}

Respond with ONLY the JSON object.`

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 300
      })

      const result = response.choices[0].message.content?.trim()
      if (!result) throw new Error('No response from AI')

      const parsed = JSON.parse(result) as {
        title: string
        description: string
        deadline: string | null
        quadrant: Quadrant
        recurrence: TaskRecurrence | string | { interval: number; unit: string; weekDays?: number[]; monthDay?: number } | null
        complexity: Complexity
      }

      const validQuadrants: Quadrant[] = ['urgent-important', 'not-urgent-important', 'urgent-not-important', 'not-urgent-not-important']
      const quadrant = validQuadrants.includes(parsed.quadrant) ? parsed.quadrant : 'not-urgent-not-important'

      // Validate recurrence - can be legacy string or flexible config
      const validateRecurrence = (rec: unknown): TaskRecurrence => {
        if (rec === null || rec === undefined) return null

        // Legacy string pattern
        if (typeof rec === 'string') {
          const validLegacy: LegacyRecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly']
          return validLegacy.includes(rec as LegacyRecurrencePattern)
            ? rec as LegacyRecurrencePattern
            : null
        }

        // Flexible config object
        if (typeof rec === 'object') {
          const config = rec as Partial<RecurrenceConfig>

          if (typeof config.interval !== 'number' || config.interval < 1) return null

          const validUnits: RecurrenceUnit[] = ['day', 'week', 'month', 'year']
          if (!validUnits.includes(config.unit as RecurrenceUnit)) return null

          const validated: RecurrenceConfig = {
            interval: Math.max(1, Math.min(99, Math.floor(config.interval))),
            unit: config.unit as RecurrenceUnit
          }

          if (Array.isArray(config.weekDays) && config.weekDays.length > 0) {
            const validDays = config.weekDays.filter(
              d => typeof d === 'number' && d >= 0 && d <= 6
            ) as DayOfWeek[]
            if (validDays.length > 0) {
              validated.weekDays = [...new Set(validDays)].sort((a, b) => a - b)
            }
          }

          if (typeof config.monthDay === 'number' && config.monthDay >= 1 && config.monthDay <= 31) {
            validated.monthDay = config.monthDay
          }

          return validated
        }

        return null
      }

      const recurrence = validateRecurrence(parsed.recurrence)

      const validComplexities: Complexity[] = ['easy', 'medium', 'hard']
      const complexity = validComplexities.includes(parsed.complexity) ? parsed.complexity : 'medium'

      const newTask: Task = {
        id: Date.now(),
        text: parsed.title.slice(0, 100),
        description: parsed.description || undefined,
        deadline: parsed.deadline || undefined,
        completed: false,
        recurrence: recurrence || undefined,
        complexity
      }

      setTasks(prev => ({
        ...prev,
        [quadrant]: [...prev[quadrant], newTask]
      }))

      setAddForm({ input: '' })
      setShowAddModal(false)
    } catch (err) {
      console.error('AI categorization error:', err)
      setError('Failed to process task. Please try again.')
    } finally {
      setIsAddingTask(false)
    }
  }

  const removeTask = (quadrant: Quadrant, taskId: number) => {
    setTasks(prev => ({
      ...prev,
      [quadrant]: prev[quadrant].filter(task => task.id !== taskId)
    }))
  }

  const toggleComplete = (quadrant: Quadrant, taskId: number) => {
    setTasks(prev => {
      const task = prev[quadrant].find(t => t.id === taskId)
      if (!task) return prev

      const isCompleting = !task.completed
      const today = new Date().toISOString().split('T')[0]

      // If completing a recurring task, create the next occurrence
      if (isCompleting && task.recurrence) {
        const nextDeadline = calculateNextDeadline(task.deadline, task.recurrence)
        const nextTask: Task = {
          id: Date.now(),
          text: task.text,
          description: task.description,
          deadline: nextDeadline,
          completed: false,
          recurrence: task.recurrence,
          complexity: task.complexity
        }

        return {
          ...prev,
          [quadrant]: [
            ...prev[quadrant].map(t =>
              t.id === taskId ? { ...t, completed: true, completedAt: today } : t
            ),
            nextTask
          ]
        }
      }

      // Normal toggle for non-recurring tasks or uncompleting
      return {
        ...prev,
        [quadrant]: prev[quadrant].map(t =>
          t.id === taskId ? {
            ...t,
            completed: !t.completed,
            completedAt: isCompleting ? today : undefined
          } : t
        )
      }
    })
  }

  const openEditModal = (task: Task, quadrant: Quadrant) => {
    setEditingTask({ task, quadrant })
    const isUrgent = quadrant === 'urgent-important' || quadrant === 'urgent-not-important'
    const isImportant = quadrant === 'urgent-important' || quadrant === 'not-urgent-important'

    setEditForm({
      text: task.text,
      description: task.description || '',
      deadline: task.deadline || '',
      isUrgent,
      isImportant,
      recurrence: parseRecurrenceToFormState(task.recurrence || null),
      complexity: task.complexity || 'medium'
    })
  }

  const closeEditModal = () => {
    setEditingTask(null)
    setEditForm({
      text: '',
      description: '',
      deadline: '',
      isUrgent: false,
      isImportant: false,
      recurrence: { ...defaultRecurrenceForm },
      complexity: 'medium'
    })
  }

  const saveTaskEdit = () => {
    if (!editingTask) return

    if (editForm.text.trim() === '') {
      setError('Task name cannot be empty')
      return
    }

    let newQuadrant: Quadrant
    if (editForm.isUrgent && editForm.isImportant) {
      newQuadrant = 'urgent-important'
    } else if (!editForm.isUrgent && editForm.isImportant) {
      newQuadrant = 'not-urgent-important'
    } else if (editForm.isUrgent && !editForm.isImportant) {
      newQuadrant = 'urgent-not-important'
    } else {
      newQuadrant = 'not-urgent-not-important'
    }

    const builtRecurrence = buildRecurrenceConfig(editForm.recurrence)
    const updatedTask: Task = {
      ...editingTask.task,
      text: editForm.text.trim(),
      description: editForm.description.trim() || undefined,
      deadline: editForm.deadline || undefined,
      recurrence: builtRecurrence || undefined,
      complexity: editForm.complexity
    }

    if (newQuadrant !== editingTask.quadrant) {
      setTasks(prev => ({
        ...prev,
        [editingTask.quadrant]: prev[editingTask.quadrant].filter(
          task => task.id !== editingTask.task.id
        ),
        [newQuadrant]: [...prev[newQuadrant], updatedTask]
      }))
    } else {
      setTasks(prev => ({
        ...prev,
        [editingTask.quadrant]: prev[editingTask.quadrant].map(task =>
          task.id === editingTask.task.id ? updatedTask : task
        )
      }))
    }

    closeEditModal()
  }

  const autoSortWithAI = async () => {
    setIsFabOpen(false)

    const allTasks: (Task & { currentQuadrant: Quadrant })[] = []
    Object.entries(tasks).forEach(([quadrant, taskList]) => {
      taskList.forEach(task => {
        allTasks.push({ ...task, currentQuadrant: quadrant as Quadrant })
      })
    })

    if (allTasks.length === 0) {
      setError('No tasks to sort')
      return
    }

    setIsAiSorting(true)
    setError('')

    try {
      const openai = new OpenAI({
        apiKey: import.meta.env.VITE_OPENAI_API_KEY,
        dangerouslyAllowBrowser: true
      })

      const today = new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })

      const taskDescriptions = allTasks.map(task => {
        let desc = `Task: ${task.text}`
        if (task.description) desc += `\nDescription: ${task.description}`
        if (task.deadline) desc += `\nDeadline: ${task.deadline}`
        if (task.complexity) desc += `\nCurrent complexity: ${task.complexity}`
        return desc
      }).join('\n\n')

      const prompt = `Today's date is: ${today}

You are helping categorize tasks into an Eisenhower Matrix. The matrix has 4 quadrants:
1. "urgent-important": Tasks that are both urgent and important (Do First) - deadlines today/this week, emergencies, critical issues
2. "not-urgent-important": Tasks that are important but not urgent (Schedule) - long-term goals, future deadlines, strategic work
3. "urgent-not-important": Tasks that are urgent but not important (Delegate) - interruptions, some meetings, non-critical urgent items
4. "not-urgent-not-important": Tasks that are neither urgent nor important (Don't Do) - time wasters, trivial tasks

Consider deadlines when categorizing:
- Tasks with deadlines today or this week are typically urgent
- Tasks with deadlines next month or later are typically not urgent
- Tasks without deadlines should be judged on their inherent urgency and importance

Complexity rules:
- "easy": Quick tasks (< 15 min), simple actions, minimal thinking required
- "medium": Moderate effort (15 min - 2 hours), some planning needed
- "hard": Significant effort (> 2 hours), complex, multiple steps, deep focus required

Here are the tasks to categorize:
${taskDescriptions}

For each task, determine which quadrant it belongs to and assess its complexity. Respond with a JSON array where each element has:
- "text": the exact task text (match it precisely)
- "quadrant": one of "urgent-important", "not-urgent-important", "urgent-not-important", or "not-urgent-not-important"
- "complexity": one of "easy", "medium", or "hard"

Only respond with the JSON array, nothing else.`

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })

      const result = response.choices[0].message.content
      if (!result) throw new Error('No response from AI')

      const categorizedTasks = JSON.parse(result) as { text: string; quadrant: Quadrant; complexity: Complexity }[]

      const newTasks: Record<Quadrant, Task[]> = {
        'urgent-important': [],
        'not-urgent-important': [],
        'urgent-not-important': [],
        'not-urgent-not-important': []
      }

      const validComplexities: Complexity[] = ['easy', 'medium', 'hard']

      categorizedTasks.forEach(categorized => {
        const originalTask = allTasks.find(t => t.text === categorized.text)
        if (originalTask) {
          const complexity = validComplexities.includes(categorized.complexity) ? categorized.complexity : 'medium'
          newTasks[categorized.quadrant].push({
            id: originalTask.id,
            text: originalTask.text,
            description: originalTask.description,
            deadline: originalTask.deadline,
            completed: originalTask.completed,
            recurrence: originalTask.recurrence,
            completedAt: originalTask.completedAt,
            complexity
          })
        }
      })

      setTasks(newTasks)
    } catch (err) {
      console.error('AI sorting error:', err)
      setError('Failed to sort tasks with AI. Please try again.')
    } finally {
      setIsAiSorting(false)
    }
  }

  const openAddModal = () => {
    setIsFabOpen(false)
    setShowAddModal(true)
    setError('')
  }

  const closeAddModal = () => {
    setShowAddModal(false)
    setAddForm({ input: '' })
    setError('')
  }

  // Get visible tasks (filter out completed tasks from previous days)
  const visibleTasks: Record<Quadrant, Task[]> = {
    'urgent-important': tasks['urgent-important'].filter(isTaskVisible),
    'not-urgent-important': tasks['not-urgent-important'].filter(isTaskVisible),
    'urgent-not-important': tasks['urgent-not-important'].filter(isTaskVisible),
    'not-urgent-not-important': tasks['not-urgent-not-important'].filter(isTaskVisible)
  }

  // Get non-empty quadrants (based on visible tasks)
  const nonEmptyQuadrants = (Object.keys(visibleTasks) as Quadrant[]).filter(q => visibleTasks[q].length > 0)
  const totalTasks = Object.values(visibleTasks).reduce((sum, arr) => sum + arr.length, 0)

  const quadrantConfig: Record<Quadrant, { title: string; label: string }> = {
    'urgent-important': { title: 'Do First', label: 'Urgent & Important' },
    'not-urgent-important': { title: 'Schedule', label: 'Not Urgent & Important' },
    'urgent-not-important': { title: 'Delegate', label: 'Urgent & Not Important' },
    'not-urgent-not-important': { title: "Don't Do", label: 'Not Urgent & Not Important' }
  }

  return (
    <div className="app">
      {totalTasks === 0 ? (
        <div className="empty-state">
          <p>Add a task to start</p>
        </div>
      ) : (
        <div className={`matrix quadrants-${nonEmptyQuadrants.length}`}>
          {nonEmptyQuadrants.map(quadrant => (
            <div key={quadrant} className={`quadrant ${quadrant}`}>
              <div className="quadrant-header">
                <h2>{quadrantConfig[quadrant].title}</h2>
                <span className="quadrant-label">{quadrantConfig[quadrant].label}</span>
              </div>
              <ul>
                {[...visibleTasks[quadrant]].sort((a, b) => {
                  // First sort by completion status (incomplete first)
                  const completionDiff = Number(a.completed) - Number(b.completed)
                  if (completionDiff !== 0) return completionDiff

                  // Then sort by complexity (easiest first)
                  const aComplexity = COMPLEXITY_ORDER[a.complexity || 'medium']
                  const bComplexity = COMPLEXITY_ORDER[b.complexity || 'medium']
                  return aComplexity - bComplexity
                }).map(task => (
                  <li key={task.id} className={task.completed ? 'completed' : ''}>
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => toggleComplete(quadrant, task.id)}
                    />
                    <div className="task-content" onClick={() => openEditModal(task, quadrant)}>
                      {task.recurrence && <span className="recurrence-icon">↻</span>}
                      {task.complexity === 'easy' && <span className="complexity-badge complexity-easy">●</span>}
                      {task.complexity === 'hard' && <span className="complexity-badge complexity-hard">●●●</span>}
                      <span className="task-text">{task.text}</span>
                      {task.deadline && <span className="task-deadline">{new Date(task.deadline).toLocaleDateString()}</span>}
                    </div>
                    <button className="delete-btn" onClick={() => removeTask(quadrant, task.id)}>×</button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {/* Floating Action Button */}
      <div className="fab-container">
        {isFabOpen && (
          <div className="fab-menu">
            <button className="fab-menu-item add" onClick={openAddModal}>
              <span className="fab-menu-icon">+</span>
              <span>Add Task</span>
            </button>
            <button className="fab-menu-item ai" onClick={autoSortWithAI} disabled={isAiSorting}>
              <span className="fab-menu-icon">AI</span>
              <span>{isAiSorting ? 'Sorting...' : 'Auto Sort'}</span>
            </button>
          </div>
        )}
        <button
          className={`fab-button ${isFabOpen ? 'open' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            setIsFabOpen(!isFabOpen)
          }}
        >
          <span className="fab-icon">{isFabOpen ? '×' : '+'}</span>
        </button>
      </div>

      {/* AI Sorting Overlay */}
      {isAiSorting && (
        <div className="sorting-overlay">
          <div className="sorting-spinner"></div>
          <p>Sorting with AI...</p>
        </div>
      )}

      {/* Error Toast */}
      {error && (
        <div className="error-toast" onClick={() => setError('')}>
          {error}
        </div>
      )}

      {/* Add Task Modal */}
      {showAddModal && (
        <div className="modal-overlay" onClick={isAddingTask ? undefined : closeAddModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Add Task</h2>
            <div className="modal-form">
              <div className="form-group">
                <textarea
                  value={addForm.input}
                  onChange={(e) => setAddForm({ input: e.target.value })}
                  placeholder="Describe your task... (e.g., 'Submit report by Friday' or 'Learn Spanish for vacation next month')"
                  rows={4}
                  maxLength={500}
                  autoFocus
                  disabled={isAddingTask}
                />
                <span className="char-count">{addForm.input.length}/500</span>
              </div>
              <div className="modal-actions">
                <button onClick={closeAddModal} className="cancel-btn" disabled={isAddingTask}>Cancel</button>
                <button onClick={addTask} className="save-btn" disabled={isAddingTask || !addForm.input.trim()}>
                  {isAddingTask ? 'Processing...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Task Modal */}
      {editingTask && (
        <div className="modal-overlay" onClick={closeEditModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Task</h2>
            <div className="modal-form">
              <div className="form-group">
                <label>Task Name</label>
                <input
                  type="text"
                  value={editForm.text}
                  onChange={(e) => setEditForm({ ...editForm, text: e.target.value })}
                  maxLength={200}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Deadline</label>
                <div className="deadline-field">
                  <input
                    type="date"
                    value={editForm.deadline}
                    onChange={(e) => setEditForm({ ...editForm, deadline: e.target.value })}
                  />
                  {editForm.deadline && (
                    <button
                      type="button"
                      className="clear-deadline-btn"
                      onClick={() => setEditForm({ ...editForm, deadline: '' })}
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <div className="form-group">
                <label>Recurrence</label>
                <select
                  value={editForm.recurrence.enabled
                    ? (editForm.recurrence.preset || 'custom')
                    : 'none'}
                  onChange={(e) => {
                    const value = e.target.value
                    if (value === 'none') {
                      setEditForm({
                        ...editForm,
                        recurrence: { ...defaultRecurrenceForm }
                      })
                    } else if (value === 'custom') {
                      setEditForm({
                        ...editForm,
                        recurrence: {
                          ...editForm.recurrence,
                          enabled: true,
                          preset: 'custom'
                        }
                      })
                    } else {
                      const unitMap: Record<string, RecurrenceUnit> = {
                        daily: 'day',
                        weekly: 'week',
                        monthly: 'month',
                        yearly: 'year'
                      }
                      setEditForm({
                        ...editForm,
                        recurrence: {
                          enabled: true,
                          preset: value as 'daily' | 'weekly' | 'monthly' | 'yearly',
                          interval: 1,
                          unit: unitMap[value],
                          weekDays: [],
                          monthDay: null,
                          useSpecificMonthDay: false
                        }
                      })
                    }
                  }}
                  className="recurrence-select"
                >
                  <option value="none">Does not repeat</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="custom">Custom...</option>
                </select>

                {/* Custom recurrence options */}
                {editForm.recurrence.enabled && editForm.recurrence.preset === 'custom' && (
                  <div className="recurrence-custom">
                    <div className="recurrence-interval">
                      <span>Every</span>
                      <input
                        type="number"
                        min="1"
                        max="99"
                        value={editForm.recurrence.interval}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          recurrence: {
                            ...editForm.recurrence,
                            interval: Math.max(1, parseInt(e.target.value) || 1)
                          }
                        })}
                        className="interval-input"
                      />
                      <select
                        value={editForm.recurrence.unit}
                        onChange={(e) => setEditForm({
                          ...editForm,
                          recurrence: {
                            ...editForm.recurrence,
                            unit: e.target.value as RecurrenceUnit,
                            weekDays: [],
                            monthDay: null,
                            useSpecificMonthDay: false
                          }
                        })}
                        className="unit-select"
                      >
                        <option value="day">day(s)</option>
                        <option value="week">week(s)</option>
                        <option value="month">month(s)</option>
                        <option value="year">year(s)</option>
                      </select>
                    </div>

                    {/* Weekday selector for weekly recurrence */}
                    {editForm.recurrence.unit === 'week' && (
                      <div className="weekday-selector">
                        <label>On these days:</label>
                        <div className="weekday-buttons">
                          {DAY_LETTERS.map((day, index) => (
                            <button
                              key={index}
                              type="button"
                              className={`weekday-btn ${
                                editForm.recurrence.weekDays.includes(index as DayOfWeek)
                                  ? 'selected'
                                  : ''
                              }`}
                              onClick={() => {
                                const currentDays = editForm.recurrence.weekDays
                                const newDays = currentDays.includes(index as DayOfWeek)
                                  ? currentDays.filter(d => d !== index)
                                  : [...currentDays, index as DayOfWeek].sort((a, b) => a - b)
                                setEditForm({
                                  ...editForm,
                                  recurrence: {
                                    ...editForm.recurrence,
                                    weekDays: newDays
                                  }
                                })
                              }}
                            >
                              {day}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Month day selector for monthly recurrence */}
                    {editForm.recurrence.unit === 'month' && (
                      <div className="monthday-selector">
                        <label className="checkbox-label">
                          <input
                            type="checkbox"
                            checked={editForm.recurrence.useSpecificMonthDay}
                            onChange={(e) => setEditForm({
                              ...editForm,
                              recurrence: {
                                ...editForm.recurrence,
                                useSpecificMonthDay: e.target.checked,
                                monthDay: e.target.checked
                                  ? (editForm.recurrence.monthDay || 1)
                                  : null
                              }
                            })}
                          />
                          On specific day of month
                        </label>
                        {editForm.recurrence.useSpecificMonthDay && (
                          <select
                            value={editForm.recurrence.monthDay || 1}
                            onChange={(e) => setEditForm({
                              ...editForm,
                              recurrence: {
                                ...editForm.recurrence,
                                monthDay: parseInt(e.target.value)
                              }
                            })}
                            className="monthday-select"
                          >
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(day => (
                              <option key={day} value={day}>
                                {day}{getOrdinalSuffix(day)}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* Recurrence preview */}
                {editForm.recurrence.enabled && (
                  <div className="recurrence-preview">
                    {getRecurrenceDescription(buildRecurrenceConfig(editForm.recurrence))}
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Complexity</label>
                <select
                  value={editForm.complexity}
                  onChange={(e) => setEditForm({ ...editForm, complexity: e.target.value as Complexity })}
                  className="complexity-select"
                >
                  <option value="easy">Easy (quick task)</option>
                  <option value="medium">Medium (moderate effort)</option>
                  <option value="hard">Hard (significant effort)</option>
                </select>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={3}
                  maxLength={500}
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <div className="checkbox-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={editForm.isUrgent}
                      onChange={(e) => setEditForm({ ...editForm, isUrgent: e.target.checked })}
                    />
                    Urgent
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={editForm.isImportant}
                      onChange={(e) => setEditForm({ ...editForm, isImportant: e.target.checked })}
                    />
                    Important
                  </label>
                </div>
              </div>
              <div className="modal-actions">
                <button onClick={closeEditModal} className="cancel-btn">Cancel</button>
                <button onClick={saveTaskEdit} className="save-btn">Save Changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
