import { useEffect } from 'react'

interface FABProps {
  isOpen: boolean
  isAiSorting: boolean
  onToggle: () => void
  onAddTask: () => void
  onAutoSort: () => void
  onSettings: () => void
  onLogout: () => void
}

export const FAB = ({
  isOpen,
  isAiSorting,
  onToggle,
  onAddTask,
  onAutoSort,
  onSettings,
  onLogout
}: FABProps) => {
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (isOpen && !target.closest('.fab-container')) {
        onToggle()
      }
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [isOpen, onToggle])

  return (
    <div className="fab-container">
      {isOpen && (
        <div className="fab-menu">
          <button className="fab-menu-item add" onClick={onAddTask}>
            <span className="fab-menu-icon">+</span>
            <span>Add Task</span>
          </button>
          <button className="fab-menu-item ai" onClick={onAutoSort} disabled={isAiSorting}>
            <span className="fab-menu-icon">AI</span>
            <span>{isAiSorting ? 'Sorting...' : 'Auto Sort'}</span>
          </button>
          <button className="fab-menu-item settings" onClick={onSettings}>
            <span className="fab-menu-icon">⚙</span>
            <span>Settings</span>
          </button>
          <button className="fab-menu-item logout" onClick={onLogout}>
            <span className="fab-menu-icon">↪</span>
            <span>Logout</span>
          </button>
        </div>
      )}
      <button
        className={`fab-button ${isOpen ? 'open' : ''}`}
        onClick={(e) => {
          e.stopPropagation()
          onToggle()
        }}
      >
        <span className="fab-icon">{isOpen ? '×' : '+'}</span>
      </button>
    </div>
  )
}
