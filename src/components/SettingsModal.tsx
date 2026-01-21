import { useState, useEffect } from 'react'
import { getNotificationSettings, updateNotificationSettings, type NotificationSettings } from '../services/api'
import { isPushSupported, isIOSPWA, subscribeToPushNotifications, unsubscribeFromPushNotifications, sendTestNotification } from '../services/push'

interface SettingsModalProps {
  isOpen: boolean
  onClose: () => void
}

const COMMON_TIMEZONES = [
  'Europe/Paris',
  'Europe/London',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Asia/Tokyo',
  'Asia/Shanghai',
  'Australia/Sydney'
]

export function SettingsModal({ isOpen, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<NotificationSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const pushSupported = isPushSupported()
  const iosNotInstalled = isIOSPWA()

  useEffect(() => {
    if (isOpen) {
      loadSettings()
    }
  }, [isOpen])

  async function loadSettings() {
    setLoading(true)
    setError(null)
    try {
      const data = await getNotificationSettings()
      setSettings(data)
    } catch {
      setError('Failed to load settings')
    } finally {
      setLoading(false)
    }
  }

  async function handleToggleNotifications() {
    if (!settings) return

    setSaving(true)
    setError(null)

    try {
      if (!settings.notificationsEnabled) {
        await subscribeToPushNotifications()
        const updated = await updateNotificationSettings({ notificationsEnabled: true })
        setSettings(updated)
      } else {
        await unsubscribeFromPushNotifications()
        const updated = await updateNotificationSettings({ notificationsEnabled: false })
        setSettings(updated)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update notifications')
    } finally {
      setSaving(false)
    }
  }

  async function handleTimeChange(time: string) {
    if (!settings) return

    setSaving(true)
    setError(null)

    try {
      const updated = await updateNotificationSettings({ reminderTime: time })
      setSettings(updated)
    } catch {
      setError('Failed to update reminder time')
    } finally {
      setSaving(false)
    }
  }

  async function handleTimezoneChange(timezone: string) {
    if (!settings) return

    setSaving(true)
    setError(null)

    try {
      const updated = await updateNotificationSettings({ timezone })
      setSettings(updated)
    } catch {
      setError('Failed to update timezone')
    } finally {
      setSaving(false)
    }
  }

  async function handleTestNotification() {
    setError(null)
    try {
      await sendTestNotification()
    } catch {
      setError('Failed to send test notification')
    }
  }

  if (!isOpen) return null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content settings-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Settings</h2>

        {loading ? (
          <p>Loading...</p>
        ) : (
          <div className="settings-form">
            {error && <div className="settings-error">{error}</div>}

            {iosNotInstalled && (
              <div className="ios-warning">
                To receive notifications on iOS, add this app to your Home Screen first (Share → Add to Home Screen)
              </div>
            )}

            <div className="settings-section">
              <h3>Daily Reminder</h3>

              {!pushSupported ? (
                <p className="settings-note">Push notifications are not supported in this browser</p>
              ) : (
                <>
                  <label className="settings-toggle">
                    <input
                      type="checkbox"
                      checked={settings?.notificationsEnabled ?? false}
                      onChange={handleToggleNotifications}
                      disabled={saving || iosNotInstalled}
                    />
                    <span>Enable daily reminder</span>
                  </label>

                  {settings?.notificationsEnabled && (
                    <>
                      <div className="settings-field">
                        <label>Reminder time</label>
                        <input
                          type="time"
                          value={settings.reminderTime}
                          onChange={(e) => handleTimeChange(e.target.value)}
                          disabled={saving}
                        />
                      </div>

                      <div className="settings-field">
                        <label>Timezone</label>
                        <select
                          value={settings.timezone}
                          onChange={(e) => handleTimezoneChange(e.target.value)}
                          disabled={saving}
                        >
                          {COMMON_TIMEZONES.map((tz) => (
                            <option key={tz} value={tz}>{tz}</option>
                          ))}
                        </select>
                      </div>

                      <button
                        className="settings-test-btn"
                        onClick={handleTestNotification}
                        disabled={saving}
                      >
                        Send Test
                      </button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        <div className="modal-actions">
          <button className="cancel-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  )
}
