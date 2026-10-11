import { describe, expect, it } from 'vitest'
import { mapAuthError } from '../authErrors'

function firebaseError(code: string): Error {
  return new Error(`Firebase: Error (${code}).`)
}

describe('mapAuthError', () => {
  it('maps credential errors to invalid email or password', () => {
    expect(mapAuthError(firebaseError('auth/invalid-credential'))).toBe('Invalid email or password.')
    expect(mapAuthError(firebaseError('auth/wrong-password'))).toBe('Invalid email or password.')
  })

  it('maps user-not-found', () => {
    expect(mapAuthError(firebaseError('auth/user-not-found'))).toBe('No account found with that email.')
  })

  it('maps email-already-in-use', () => {
    expect(mapAuthError(firebaseError('auth/email-already-in-use'))).toBe(
      'An account with that email already exists — try signing in.',
    )
  })

  it('maps weak-password and invalid-email', () => {
    expect(mapAuthError(firebaseError('auth/weak-password'))).toBe('Password must be at least 6 characters.')
    expect(mapAuthError(firebaseError('auth/invalid-email'))).toBe('Please enter a valid email address.')
  })

  it('maps popup errors', () => {
    expect(mapAuthError(firebaseError('auth/popup-closed-by-user'))).toBe('Sign-in popup was closed — try again.')
    expect(mapAuthError(firebaseError('auth/popup-blocked'))).toBe(
      'Your browser blocked the sign-in popup — allow popups for this site and try again.',
    )
    expect(mapAuthError(firebaseError('auth/cancelled-popup-request'))).toBe(
      'Another sign-in popup was already open — try again.',
    )
  })

  it('maps network-request-failed', () => {
    expect(mapAuthError(firebaseError('auth/network-request-failed'))).toBe(
      'Network error — check your connection and try again.',
    )
  })

  it('maps configuration errors instead of leaking the raw SDK message', () => {
    expect(mapAuthError(firebaseError('auth/api-key-not-valid.-please-pass-a-valid-api-key.'))).toBe(
      'Authentication is not configured correctly — please contact the site owner.',
    )
    expect(mapAuthError(firebaseError('auth/invalid-api-key'))).toBe(
      'Authentication is not configured correctly — please contact the site owner.',
    )
    expect(mapAuthError(firebaseError('auth/operation-not-allowed'))).toBe(
      'This sign-in method is not enabled for this app.',
    )
    expect(mapAuthError(firebaseError('auth/unauthorized-domain'))).toBe(
      'This domain is not authorized for sign-in.',
    )
  })

  it('maps rate limiting and disabled accounts', () => {
    expect(mapAuthError(firebaseError('auth/too-many-requests'))).toBe(
      'Too many attempts — wait a minute and try again.',
    )
    expect(mapAuthError(firebaseError('auth/user-disabled'))).toBe('This account has been disabled.')
  })

  it('never leaks the raw Firebase wrapper for unknown codes', () => {
    const msg = mapAuthError(firebaseError('auth/some-future-error'))
    expect(msg).not.toContain('Firebase')
    expect(msg).toContain('auth/some-future-error')
  })

  it('handles non-Error input', () => {
    expect(mapAuthError('nope')).toBe('Authentication failed.')
    expect(mapAuthError(undefined)).toBe('Authentication failed.')
  })
})
