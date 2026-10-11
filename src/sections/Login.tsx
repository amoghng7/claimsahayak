import { useState } from 'react'
import type { FormEvent } from 'react'
import { signInWithGoogle, signInWithEmail, signUpWithEmail } from '../engine/auth'
import { mapAuthError } from '../engine/authErrors'
import { Kicker } from '../components/kit'

/* The multi-color Google "G" — inline SVG per Google's branding guidelines. */
function GoogleLogo() {
  return (
    <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" aria-hidden>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}

export function Login() {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const handleGoogle = async () => {
    setError(null)
    setBusy(true)
    try {
      await signInWithGoogle()
      // onAuthStateChanged will trigger re-render automatically
    } catch (e: unknown) {
      setError(mapAuthError(e))
    } finally {
      setBusy(false)
    }
  }

  const handleEmail = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      if (mode === 'signup') {
        await signUpWithEmail(email, password)
      } else {
        await signInWithEmail(email, password)
      }
    } catch (err: unknown) {
      setError(mapAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-[calc(100vh-4rem)] items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <Kicker>ClaimSahayak</Kicker>
        <h1 className="mt-4 font-display text-3xl font-semibold">
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-3">
          {mode === 'login'
            ? 'Sign in to access the claim readiness desk.'
            : 'Create an account to get started.'}
        </p>

        {/* Google OAuth */}
        <button
          onClick={handleGoogle}
          disabled={busy}
          className="mt-8 flex w-full items-center justify-center gap-3 rounded-full
                     border border-ink/40 px-6 py-3 font-mono text-[12px] uppercase
                     tracking-[0.08em] transition-colors duration-150 hover:bg-paper-2
                     disabled:opacity-50"
        >
          <GoogleLogo />
          Continue with Google
        </button>

        {/* Divider */}
        <div className="my-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-line" />
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3">or</span>
          <div className="h-px flex-1 bg-line" />
        </div>

        {/* Email / password form */}
        <form onSubmit={handleEmail} className="space-y-4">
          <div>
            <label
              htmlFor="login-email"
              className="block font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3"
            >
              Email
            </label>
            <input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="mt-1.5 w-full border border-line bg-paper-2 px-4 py-2.5 font-mono
                         text-[13px] focus:outline-none focus:ring-2 focus:ring-brick"
            />
          </div>
          <div>
            <label
              htmlFor="login-password"
              className="block font-mono text-[11px] uppercase tracking-[0.14em] text-ink-3"
            >
              Password
            </label>
            <input
              id="login-password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              className="mt-1.5 w-full border border-line bg-paper-2 px-4 py-2.5 font-mono
                         text-[13px] focus:outline-none focus:ring-2 focus:ring-brick"
            />
          </div>
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-full bg-ink px-6 py-3 font-mono text-[12px]
                       font-semibold uppercase tracking-[0.08em] text-paper
                       transition-transform duration-150 hover:-translate-y-0.5
                       disabled:opacity-50"
          >
            {mode === 'login' ? 'Sign in' : 'Create account'}
          </button>
        </form>

        {error && (
          <p className="mt-4 text-sm leading-relaxed text-crimson-deep" role="alert">
            {error}
          </p>
        )}

        <p className="mt-6 text-center text-sm text-ink-3">
          {mode === 'login' ? (
            <>
              Don&apos;t have an account?{' '}
              <button
                onClick={() => { setMode('signup'); setError(null) }}
                className="font-medium underline underline-offset-4 hover:text-ink"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{' '}
              <button
                onClick={() => { setMode('login'); setError(null) }}
                className="font-medium underline underline-offset-4 hover:text-ink"
              >
                Sign in
              </button>
            </>
          )}
        </p>
      </div>
    </main>
  )
}
