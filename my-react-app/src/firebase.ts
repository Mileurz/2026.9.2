import { initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

type WebConfig = {
  apiKey?: string
  authDomain?: string
  projectId?: string
  storageBucket?: string
  messagingSenderId?: string
  appId?: string
}

function fromEnv(): WebConfig {
  return {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY as string | undefined,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET as string | undefined,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID as string | undefined,
    appId: import.meta.env.VITE_FIREBASE_APP_ID as string | undefined,
  }
}

function isComplete(config: WebConfig | null | undefined): config is Required<
  Pick<WebConfig, 'apiKey' | 'authDomain' | 'projectId'>
> {
  return Boolean(config?.apiKey && config.authDomain && config.projectId)
}

async function fromHosting(): Promise<WebConfig | null> {
  try {
    const response = await fetch('/__/firebase/init.json')
    if (!response.ok) return null
    return (await response.json()) as WebConfig
  } catch {
    return null
  }
}

function startApp(config: WebConfig) {
  app = initializeApp(config)
  auth = getAuth(app)
  db = getFirestore(app)
  firebaseReady = true
}

export let firebaseReady = false
export let app: FirebaseApp | null = null
export let auth: Auth | null = null
export let db: Firestore | null = null

export async function initFirebase() {
  if (app) return

  const envConfig = fromEnv()
  if (isComplete(envConfig)) {
    startApp(envConfig)
    return
  }

  const hosted = await fromHosting()
  if (isComplete(hosted)) {
    startApp(hosted)
  }
}
