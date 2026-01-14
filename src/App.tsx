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
  const [isAiSorting, setIsAiSorting] = useState(false)
  const [editingTask, setEditingTask] = useState<{ task: Task; quadrant: Quadrant } | null>(null)
  const [editForm, setEditForm] = useState({ text: '', description: '', deadline: '', isUrgent: false, isImportant: false })

  // FAB and Add Task Modal state
  const [isFabOpen, setIsFabOpen] = useState(false)
  const [showAddModal, setShowAddModal] = useState(false)
  const [addForm, setAddForm] = useState({ text: '', description: '', deadline: '', isUrgent: false, isImportant: false })
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

  const addTask = () => {
    const trimmedValue = addForm.text.trim()

    if (trimmedValue === '') {
      setError('Task cannot be empty')
      return
    }

    if (trimmedValue.length > 200) {
      setError('Task must be 200 characters or less')
      return
    }

    let quadrant: Quadrant
    if (addForm.isUrgent && addForm.isImportant) {
      quadrant = 'urgent-important'
    } else if (!addForm.isUrgent && addForm.isImportant) {
      quadrant = 'not-urgent-important'
    } else if (addForm.isUrgent && !addForm.isImportant) {
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
      description: addForm.description.trim() || undefined,
      deadline: addForm.deadline || undefined,
      completed: false
    }

    setTasks(prev => ({
      ...prev,
      [quadrant]: [...prev[quadrant], newTask]
    }))

    setAddForm({ text: '', description: '', deadline: '', isUrgent: false, isImportant: false })
    setError('')
    setShowAddModal(false)
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
    }
    setIsFabOpen(false)
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

  const openAddModal = () => {
    setIsFabOpen(false)
    setShowAddModal(true)
    setError('')
  }

  const closeAddModal = () => {
    setShowAddModal(false)
    setAddForm({ text: '', description: '', deadline: '', isUrgent: false, isImportant: false })
    setError('')
  }

  // Get non-empty quadrants
  const nonEmptyQuadrants = (Object.keys(tasks) as Quadrant[]).filter(q => tasks[q].length > 0)
  const totalTasks = Object.values(tasks).reduce((sum, arr) => sum + arr.length, 0)

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
                {[...tasks[quadrant]].sort((a, b) => Number(a.completed) - Number(b.completed)).map(task => (
                  <li key={task.id} className={task.completed ? 'completed' : ''}>
                    <input
                      type="checkbox"
                      checked={task.completed}
                      onChange={() => toggleComplete(quadrant, task.id)}
                    />
                    <div className="task-content" onClick={() => openEditModal(task, quadrant)}>
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
            <button className="fab-menu-item delete" onClick={deleteAllTasks}>
              <span className="fab-menu-icon">×</span>
              <span>Delete All</span>
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
        <div className="modal-overlay" onClick={closeAddModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h2>Add Task</h2>
            <div className="modal-form">
              <div className="form-group">
                <label>Task Name</label>
                <input
                  type="text"
                  value={addForm.text}
                  onChange={(e) => setAddForm({ ...addForm, text: e.target.value })}
                  placeholder="What needs to be done?"
                  maxLength={200}
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label>Deadline</label>
                <input
                  type="date"
                  value={addForm.deadline}
                  onChange={(e) => setAddForm({ ...addForm, deadline: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label>Description (optional)</label>
                <textarea
                  value={addForm.description}
                  onChange={(e) => setAddForm({ ...addForm, description: e.target.value })}
                  placeholder="Add more details..."
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
                      checked={addForm.isUrgent}
                      onChange={(e) => setAddForm({ ...addForm, isUrgent: e.target.checked })}
                    />
                    Urgent
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={addForm.isImportant}
                      onChange={(e) => setAddForm({ ...addForm, isImportant: e.target.checked })}
                    />
                    Important
                  </label>
                </div>
              </div>
              <div className="modal-actions">
                <button onClick={closeAddModal} className="cancel-btn">Cancel</button>
                <button onClick={addTask} className="save-btn">Add Task</button>
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
