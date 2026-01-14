import { useState, useEffect } from 'react'
import OpenAI from 'openai'
import './App.css'

type Task = {
  id: number
  text: string
  description?: string
  deadline?: string
  completed: boolean
}

type Quadrant = 'urgent-important' | 'not-urgent-important' | 'urgent-not-important' | 'not-urgent-not-important'

const STORAGE_KEY = 'eisenhower-matrix-tasks'

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
  const [inputValue, setInputValue] = useState('')
  const [description, setDescription] = useState('')
  const [deadline, setDeadline] = useState('')
  const [isUrgent, setIsUrgent] = useState(false)
  const [isImportant, setIsImportant] = useState(false)
  const [error, setError] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [isAiSorting, setIsAiSorting] = useState(false)
  const [showBulkInput, setShowBulkInput] = useState(false)
  const [bulkText, setBulkText] = useState('')
  const [isProcessingBulk, setIsProcessingBulk] = useState(false)
  const [editingTask, setEditingTask] = useState<{ task: Task; quadrant: Quadrant } | null>(null)
  const [editForm, setEditForm] = useState({ text: '', description: '', deadline: '', isUrgent: false, isImportant: false })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks))
  }, [tasks])

  const addTask = () => {
    const trimmedValue = inputValue.trim()

    if (trimmedValue === '') {
      setError('Task cannot be empty')
      return
    }

    if (trimmedValue.length > 200) {
      setError('Task must be 200 characters or less')
      return
    }

    // Determine quadrant based on checkboxes
    let quadrant: Quadrant
    if (isUrgent && isImportant) {
      quadrant = 'urgent-important'
    } else if (!isUrgent && isImportant) {
      quadrant = 'not-urgent-important'
    } else if (isUrgent && !isImportant) {
      quadrant = 'urgent-not-important'
    } else {
      quadrant = 'not-urgent-not-important'
    }

    const isDuplicate = tasks[quadrant].some(
      task => task.text.toLowerCase() === trimmedValue.toLowerCase()
    )

    if (isDuplicate) {
      setError('This task already exists in this quadrant')
      return
    }

    const newTask: Task = {
      id: Date.now(),
      text: trimmedValue,
      description: description.trim() || undefined,
      deadline: deadline || undefined,
      completed: false
    }

    setTasks(prev => ({
      ...prev,
      [quadrant]: [...prev[quadrant], newTask]
    }))

    setInputValue('')
    setDescription('')
    setDeadline('')
    setIsUrgent(false)
    setIsImportant(false)
    setError('')
  }

  const removeTask = (quadrant: Quadrant, taskId: number) => {
    setTasks(prev => ({
      ...prev,
      [quadrant]: prev[quadrant].filter(task => task.id !== taskId)
    }))
  }

  const toggleComplete = (quadrant: Quadrant, taskId: number) => {
    setTasks(prev => ({
      ...prev,
      [quadrant]: prev[quadrant].map(task =>
        task.id === taskId ? { ...task, completed: !task.completed } : task
      )
    }))
  }

  const openEditModal = (task: Task, quadrant: Quadrant) => {
    setEditingTask({ task, quadrant })

    // Determine urgent and important from quadrant
    const isUrgent = quadrant === 'urgent-important' || quadrant === 'urgent-not-important'
    const isImportant = quadrant === 'urgent-important' || quadrant === 'not-urgent-important'

    setEditForm({
      text: task.text,
      description: task.description || '',
      deadline: task.deadline || '',
      isUrgent,
      isImportant
    })
  }

  const closeEditModal = () => {
    setEditingTask(null)
    setEditForm({ text: '', description: '', deadline: '', isUrgent: false, isImportant: false })
  }

  const saveTaskEdit = () => {
    if (!editingTask) return

    if (editForm.text.trim() === '') {
      setError('Task name cannot be empty')
      return
    }

    // Determine new quadrant based on checkboxes
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

    const updatedTask: Task = {
      ...editingTask.task,
      text: editForm.text.trim(),
      description: editForm.description.trim() || undefined,
      deadline: editForm.deadline || undefined
    }

    // If quadrant changed, move task to new quadrant
    if (newQuadrant !== editingTask.quadrant) {
      setTasks(prev => ({
        ...prev,
        // Remove from old quadrant
        [editingTask.quadrant]: prev[editingTask.quadrant].filter(
          task => task.id !== editingTask.task.id
        ),
        // Add to new quadrant
        [newQuadrant]: [...prev[newQuadrant], updatedTask]
      }))
    } else {
      // Just update in same quadrant
      setTasks(prev => ({
        ...prev,
        [editingTask.quadrant]: prev[editingTask.quadrant].map(task =>
          task.id === editingTask.task.id ? updatedTask : task
        )
      }))
    }

    closeEditModal()
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      addTask()
    }
  }

  const loadTestTasks = () => {
    const today = new Date()
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const nextWeek = new Date(today)
    nextWeek.setDate(nextWeek.getDate() + 7)
    const nextMonth = new Date(today)
    nextMonth.setMonth(nextMonth.getMonth() + 1)

    const testTasks: Task[] = [
      // Should go to URGENT-IMPORTANT
      {
        id: Date.now() + 1,
        text: 'Emergency: Server is down',
        description: 'Production server crashed and customers cannot access the website',
        deadline: today.toISOString().split('T')[0],
        completed: false
      },
      {
        id: Date.now() + 2,
        text: 'Submit tax return',
        description: 'File annual tax return to avoid penalties',
        deadline: tomorrow.toISOString().split('T')[0],
        completed: false
      },
      {
        id: Date.now() + 3,
        text: 'Fix critical security vulnerability',
        description: 'Patch XSS vulnerability in production app',
        deadline: today.toISOString().split('T')[0],
        completed: false
      },

      // Should go to NOT-URGENT-IMPORTANT
      {
        id: Date.now() + 4,
        text: 'Exercise regularly',
        description: 'Go to the gym 3 times a week for better health',
        deadline: nextMonth.toISOString().split('T')[0],
        completed: false
      },
      {
        id: Date.now() + 5,
        text: 'Learn React',
        description: 'Complete online React course to advance career',
        completed: false
      },
      {
        id: Date.now() + 6,
        text: 'Plan retirement savings',
        description: 'Meet with financial advisor about investment strategy',
        deadline: nextMonth.toISOString().split('T')[0],
        completed: false
      },
      {
        id: Date.now() + 7,
        text: 'Call parents',
        description: 'Weekly catch-up call with family',
        deadline: nextWeek.toISOString().split('T')[0],
        completed: false
      },

      // Should go to URGENT-NOT-IMPORTANT
      {
        id: Date.now() + 8,
        text: 'Reply about lunch plans',
        description: 'Colleague asking about lunch spot for today',
        deadline: today.toISOString().split('T')[0],
        completed: false
      },
      {
        id: Date.now() + 9,
        text: 'Answer non-critical emails',
        description: 'Respond to team newsletter and FYI messages',
        completed: false
      },
      {
        id: Date.now() + 10,
        text: 'Attend optional team meeting',
        description: 'Team social event in 30 minutes',
        deadline: today.toISOString().split('T')[0],
        completed: false
      },

      // Should go to NOT-URGENT-NOT-IMPORTANT
      {
        id: Date.now() + 11,
        text: 'Watch cat videos',
        description: 'Browse social media for entertainment',
        completed: false
      },
      {
        id: Date.now() + 12,
        text: 'Organize desk drawer',
        description: 'Sort old pens and paper clips',
        completed: false
      },
      {
        id: Date.now() + 13,
        text: 'Watch YouTube videos',
        description: 'Random entertainment videos',
        completed: false
      },
      {
        id: Date.now() + 14,
        text: 'Browse online shopping',
        description: 'Window shopping with no intention to buy',
        completed: false
      }
    ]

    // Put all test tasks in the first quadrant for testing
    setTasks({
      'urgent-important': testTasks,
      'not-urgent-important': [],
      'urgent-not-important': [],
      'not-urgent-not-important': []
    })
  }

  const deleteAllTasks = () => {
    const confirmDelete = window.confirm(
      'Are you sure you want to delete ALL tasks? This action cannot be undone.'
    )

    if (confirmDelete) {
      setTasks({
        'urgent-important': [],
        'not-urgent-important': [],
        'urgent-not-important': [],
        'not-urgent-not-important': []
      })
      setSuccessMessage('All tasks deleted')
      setTimeout(() => setSuccessMessage(''), 2000)
    }
  }

  const processBulkText = async () => {
    if (bulkText.trim() === '') {
      setError('Please paste some text to process')
      return
    }

    setIsProcessingBulk(true)
    setError('')

    try {
      const openai = new OpenAI({
        apiKey: import.meta.env.VITE_OPENAI_API_KEY,
        dangerouslyAllowBrowser: true
      })

      const prompt = `You are helping extract and categorize tasks from messy text (like Google Calendar exports or notes).

Extract all tasks/to-dos from the following text and categorize each one into an Eisenhower Matrix quadrant:
1. "urgent-important": Tasks that are both urgent and important (Do First) - e.g., emergencies, deadlines today, critical issues
2. "not-urgent-important": Tasks that are important but not urgent (Schedule) - e.g., long-term goals, health, relationships, learning
3. "urgent-not-important": Tasks that are urgent but not important (Delegate) - e.g., interruptions, some emails, some meetings
4. "not-urgent-not-important": Tasks that are neither urgent nor important (Don't Do) - e.g., time wasters, trivial tasks, busy work

Text to process:
${bulkText}

Respond with a JSON array where each element has:
- "text": the extracted task title (clean and concise, max 100 chars)
- "description": optional detailed description if the task has more context (max 200 chars)
- "deadline": optional deadline in YYYY-MM-DD format if a date is mentioned
- "quadrant": one of "urgent-important", "not-urgent-important", "urgent-not-important", or "not-urgent-not-important"

Only respond with the JSON array, nothing else. If there are no tasks found, return an empty array [].`

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })

      const result = response.choices[0].message.content
      if (!result) throw new Error('No response from AI')

      const extractedTasks = JSON.parse(result) as {
        text: string
        description?: string
        deadline?: string
        quadrant: Quadrant
      }[]

      if (extractedTasks.length === 0) {
        setError('No tasks found in the text')
        setIsProcessingBulk(false)
        return
      }

      // Add all extracted tasks to their respective quadrants
      const newTasks = { ...tasks }
      let addedCount = 0

      extractedTasks.forEach(extracted => {
        const newTask: Task = {
          id: Date.now() + addedCount,
          text: extracted.text,
          description: extracted.description,
          deadline: extracted.deadline,
          completed: false
        }
        newTasks[extracted.quadrant].push(newTask)
        addedCount++
      })

      setTasks(newTasks)
      setBulkText('')
      setShowBulkInput(false)
      setSuccessMessage(`Successfully added ${addedCount} task${addedCount !== 1 ? 's' : ''}!`)

      // Clear success message after 3 seconds
      setTimeout(() => setSuccessMessage(''), 3000)
    } catch (err) {
      console.error('Bulk processing error:', err)
      setError('Failed to process text with AI. Please try again.')
    } finally {
      setIsProcessingBulk(false)
    }
  }

  const autoSortWithAI = async () => {
    // Collect all tasks from all quadrants
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

      const taskDescriptions = allTasks.map(task => {
        let desc = `Task: ${task.text}`
        if (task.description) desc += `\nDescription: ${task.description}`
        if (task.deadline) desc += `\nDeadline: ${task.deadline}`
        return desc
      }).join('\n\n')

      const prompt = `You are helping categorize tasks into an Eisenhower Matrix. The matrix has 4 quadrants:
1. "urgent-important": Tasks that are both urgent and important (Do First) - deadlines today/this week, emergencies, critical issues
2. "not-urgent-important": Tasks that are important but not urgent (Schedule) - long-term goals, future deadlines, strategic work
3. "urgent-not-important": Tasks that are urgent but not important (Delegate) - interruptions, some meetings, non-critical urgent items
4. "not-urgent-not-important": Tasks that are neither urgent nor important (Don't Do) - time wasters, trivial tasks

Consider deadlines when categorizing:
- Tasks with deadlines today or this week are typically urgent
- Tasks with deadlines next month or later are typically not urgent
- Tasks without deadlines should be judged on their inherent urgency and importance

Here are the tasks to categorize:
${taskDescriptions}

For each task, determine which quadrant it belongs to. Respond with a JSON array where each element has:
- "text": the exact task text (match it precisely)
- "quadrant": one of "urgent-important", "not-urgent-important", "urgent-not-important", or "not-urgent-not-important"

Only respond with the JSON array, nothing else.`

      const response = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3
      })

      const result = response.choices[0].message.content
      if (!result) throw new Error('No response from AI')

      const categorizedTasks = JSON.parse(result) as { text: string; quadrant: Quadrant }[]

      // Reorganize tasks based on AI suggestions
      const newTasks: Record<Quadrant, Task[]> = {
        'urgent-important': [],
        'not-urgent-important': [],
        'urgent-not-important': [],
        'not-urgent-not-important': []
      }

      categorizedTasks.forEach(categorized => {
        const originalTask = allTasks.find(t => t.text === categorized.text)
        if (originalTask) {
          newTasks[categorized.quadrant].push({
            id: originalTask.id,
            text: originalTask.text,
            description: originalTask.description,
            deadline: originalTask.deadline,
            completed: originalTask.completed
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

  return (
    <div className="app">
      <h1>Eisenhower Matrix</h1>

      <div className="input-section">
        <div className="input-row">
          <input
            type="text"
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value)
              setError('')
            }}
            onKeyPress={handleKeyPress}
            placeholder="Task name..."
            maxLength={200}
            className="task-input"
          />
          <input
            type="date"
            value={deadline}
            onChange={(e) => setDeadline(e.target.value)}
            className="deadline-input"
          />
        </div>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)..."
          className="description-input"
          rows={2}
          maxLength={500}
        />
        <div className="input-bottom-row">
          <div className="checkbox-group">
            <label>
              <input
                type="checkbox"
                checked={isUrgent}
                onChange={(e) => setIsUrgent(e.target.checked)}
              />
              Urgent
            </label>
            <label>
              <input
                type="checkbox"
                checked={isImportant}
                onChange={(e) => setIsImportant(e.target.checked)}
              />
              Important
            </label>
          </div>
          <button onClick={addTask} className="add-task-button">Add Task</button>
        </div>
      </div>

      <div className="ai-sort-section">
        <button
          onClick={loadTestTasks}
          className="test-button"
        >
          Load Test Tasks
        </button>
        <button
          onClick={() => setShowBulkInput(!showBulkInput)}
          className="bulk-input-button"
        >
          {showBulkInput ? 'Hide Bulk Input' : 'Paste Tasks from Calendar'}
        </button>
        <button
          onClick={autoSortWithAI}
          disabled={isAiSorting}
          className="ai-sort-button"
        >
          {isAiSorting ? 'Sorting with AI...' : 'Auto-Sort with AI'}
        </button>
        <button
          onClick={deleteAllTasks}
          className="delete-all-button"
        >
          Delete All Tasks
        </button>
      </div>

      {showBulkInput && (
        <div className="bulk-input-section">
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder="Paste your tasks from Google Calendar or any text here...&#10;&#10;Example:&#10;Meeting with John at 2pm&#10;Submit report by Friday&#10;Call mom&#10;Learn React"
            rows={8}
          />
          <button
            onClick={processBulkText}
            disabled={isProcessingBulk}
            className="process-button"
          >
            {isProcessingBulk ? 'Processing...' : 'Extract & Add Tasks with AI'}
          </button>
        </div>
      )}

      {error && <div className="error">{error}</div>}
      {successMessage && <div className="success">{successMessage}</div>}

      <div className="matrix">
        <div className="quadrant urgent-important">
          <h2>Urgent & Important</h2>
          <p className="subtitle">Do First</p>
          <ul>
            {[...tasks['urgent-important']].sort((a, b) => Number(a.completed) - Number(b.completed)).map(task => (
              <li key={task.id} className={task.completed ? 'completed' : ''}>
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => toggleComplete('urgent-important', task.id)}
                />
                <div className="task-content" onClick={() => openEditModal(task, 'urgent-important')}>
                  <span className="task-text">{task.text}</span>
                  {task.description && <p className="task-description">{task.description}</p>}
                  {task.deadline && <span className="task-deadline">Due: {new Date(task.deadline).toLocaleDateString()}</span>}
                </div>
                <button className="delete-btn" onClick={() => removeTask('urgent-important', task.id)}>×</button>
              </li>
            ))}
          </ul>
        </div>

        <div className="quadrant not-urgent-important">
          <h2>Not Urgent & Important</h2>
          <p className="subtitle">Schedule</p>
          <ul>
            {[...tasks['not-urgent-important']].sort((a, b) => Number(a.completed) - Number(b.completed)).map(task => (
              <li key={task.id} className={task.completed ? 'completed' : ''}>
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => toggleComplete('not-urgent-important', task.id)}
                />
                <div className="task-content" onClick={() => openEditModal(task, 'not-urgent-important')}>
                  <span className="task-text">{task.text}</span>
                  {task.description && <p className="task-description">{task.description}</p>}
                  {task.deadline && <span className="task-deadline">Due: {new Date(task.deadline).toLocaleDateString()}</span>}
                </div>
                <button className="delete-btn" onClick={() => removeTask('not-urgent-important', task.id)}>×</button>
              </li>
            ))}
          </ul>
        </div>

        <div className="quadrant urgent-not-important">
          <h2>Urgent & Not Important</h2>
          <p className="subtitle">Delegate</p>
          <ul>
            {[...tasks['urgent-not-important']].sort((a, b) => Number(a.completed) - Number(b.completed)).map(task => (
              <li key={task.id} className={task.completed ? 'completed' : ''}>
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => toggleComplete('urgent-not-important', task.id)}
                />
                <div className="task-content" onClick={() => openEditModal(task, 'urgent-not-important')}>
                  <span className="task-text">{task.text}</span>
                  {task.description && <p className="task-description">{task.description}</p>}
                  {task.deadline && <span className="task-deadline">Due: {new Date(task.deadline).toLocaleDateString()}</span>}
                </div>
                <button className="delete-btn" onClick={() => removeTask('urgent-not-important', task.id)}>×</button>
              </li>
            ))}
          </ul>
        </div>

        <div className="quadrant not-urgent-not-important">
          <h2>Not Urgent & Not Important</h2>
          <p className="subtitle">Don't Do</p>
          <ul>
            {[...tasks['not-urgent-not-important']].sort((a, b) => Number(a.completed) - Number(b.completed)).map(task => (
              <li key={task.id} className={task.completed ? 'completed' : ''}>
                <input
                  type="checkbox"
                  checked={task.completed}
                  onChange={() => toggleComplete('not-urgent-not-important', task.id)}
                />
                <div className="task-content" onClick={() => openEditModal(task, 'not-urgent-not-important')}>
                  <span className="task-text">{task.text}</span>
                  {task.description && <p className="task-description">{task.description}</p>}
                  {task.deadline && <span className="task-deadline">Due: {new Date(task.deadline).toLocaleDateString()}</span>}
                </div>
                <button className="delete-btn" onClick={() => removeTask('not-urgent-not-important', task.id)}>×</button>
              </li>
            ))}
          </ul>
        </div>
      </div>

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
                      title="Remove deadline"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <textarea
                  value={editForm.description}
                  onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                  rows={4}
                  maxLength={500}
                />
              </div>
              <div className="form-group">
                <label>Category</label>
                <div className="checkbox-group">
                  <label>
                    <input
                      type="checkbox"
                      checked={editForm.isUrgent}
                      onChange={(e) => setEditForm({ ...editForm, isUrgent: e.target.checked })}
                    />
                    Urgent
                  </label>
                  <label>
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
