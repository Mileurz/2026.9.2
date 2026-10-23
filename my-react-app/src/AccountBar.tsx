import { useEffect, useState } from 'react'
import type { User } from 'firebase/auth'
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { auth, firebaseReady } from './firebase'

type AccountBarProps = {
  cloudStatus: string
  note: string
  onNote: (note: string) => void
  onClose: () => void
}

export function AccountBar({ cloudStatus, note, onNote, onClose }: AccountBarProps) {
  const [user, setUser] = useState<User | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!auth) return
    return onAuthStateChanged(auth, setUser)
  }, [])

  const run = async (mode: 'in' | 'up') => {
    setError('')
    if (!auth || !firebaseReady) {
      setError('Firebase is not connected. Deploy this site with Hosting on IO-O!, or add Web keys to .env.local for local use.')
      return
    }
    try {
      if (mode === 'in') await signInWithEmailAndPassword(auth, email, password)
      else await createUserWithEmailAndPassword(auth, email, password)
      setPassword('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Auth failed')
    }
  }

  return (
    <section className="account-window" aria-label="Account">
      <header className="noise-window-bar">
        <p className="noise-window-title">Account</p>
        <button type="button" className="window-icon-btn" onClick={onClose}>
          Close
        </button>
      </header>
      <p className="account-status">{user ? cloudStatus : 'Not signed in'}</p>

      {user ? (
        <>
          <p className="account-email">{user.email}</p>
          <label className="slider" htmlFor="user-note">
            <span className="slider-row">
              <span>Studio note</span>
            </span>
            <input
              id="user-note"
              className="account-input"
              value={note}
              onChange={(event) => onNote(event.target.value)}
              placeholder="Saved with your login"
            />
          </label>
          <button type="button" className="toolbar-btn" onClick={() => signOut(auth!)}>
            Sign out
          </button>
        </>
      ) : (
        <form
          className="account-form"
          onSubmit={(event) => {
            event.preventDefault()
            void run('in')
          }}
        >
          <input
            className="account-input"
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <input
            className="account-input"
            type="password"
            autoComplete="current-password"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <div className="account-actions">
            <button type="submit" className="apply-btn">
              Sign in
            </button>
            <button type="button" className="toolbar-btn" onClick={() => void run('up')}>
              Create account
            </button>
          </div>
          {error ? <p className="account-error">{error}</p> : null}
        </form>
      )}
    </section>
  )
}
