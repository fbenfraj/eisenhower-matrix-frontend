import { subscribeToPush, unsubscribeFromPush, sendTestPush as apiSendTestPush } from './api'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray.buffer as ArrayBuffer
}

export function isPushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

export function isIOSPWA(): boolean {
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
  const isStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  return isIOS && !isStandalone
}

export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!('Notification' in window)) {
    return 'denied'
  }
  return Notification.requestPermission()
}

export async function subscribeToPushNotifications(): Promise<boolean> {
  if (!isPushSupported()) {
    throw new Error('Push notifications not supported')
  }

  const permission = await requestNotificationPermission()
  if (permission !== 'granted') {
    throw new Error('Notification permission denied')
  }

  const registration = await navigator.serviceWorker.ready

  let subscription = await registration.pushManager.getSubscription()

  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
    })
  }

  const p256dh = subscription.getKey('p256dh')
  const auth = subscription.getKey('auth')

  if (!p256dh || !auth) {
    throw new Error('Failed to get subscription keys')
  }

  await subscribeToPush(
    subscription.endpoint,
    {
      p256dh: btoa(String.fromCharCode(...new Uint8Array(p256dh))),
      auth: btoa(String.fromCharCode(...new Uint8Array(auth)))
    },
    navigator.userAgent
  )

  return true
}

export async function unsubscribeFromPushNotifications(): Promise<void> {
  const registration = await navigator.serviceWorker.ready
  const subscription = await registration.pushManager.getSubscription()

  if (subscription) {
    await subscription.unsubscribe()
    await unsubscribeFromPush(subscription.endpoint)
  } else {
    await unsubscribeFromPush()
  }
}

export async function sendTestNotification(): Promise<void> {
  await apiSendTestPush()
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) {
    return null
  }

  const registration = await navigator.serviceWorker.ready
  return registration.pushManager.getSubscription()
}
