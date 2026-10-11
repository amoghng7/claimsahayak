/**
 * User-friendly mapping for Firebase auth errors. Kept dependency-free (no
 * firebase imports) so the mapping stays testable without initializing the
 * SDK — the raw SDK message ("Firebase: Error (auth/…)") must never reach
 * the UI.
 */
export function mapAuthError(err: unknown): string {
  if (!(err instanceof Error)) return 'Authentication failed.'
  const code = /\((auth\/[^)]+?)\)/.exec(err.message)?.[1] ?? ''
  const messages: Record<string, string> = {
    'auth/invalid-credential': 'Invalid email or password.',
    'auth/wrong-password': 'Invalid email or password.',
    'auth/user-not-found': 'No account found with that email.',
    'auth/email-already-in-use': 'An account with that email already exists — try signing in.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/popup-closed-by-user': 'Sign-in popup was closed — try again.',
    'auth/popup-blocked': 'Your browser blocked the sign-in popup — allow popups for this site and try again.',
    'auth/cancelled-popup-request': 'Another sign-in popup was already open — try again.',
    'auth/network-request-failed': 'Network error — check your connection and try again.',
    'auth/api-key-not-valid': 'Authentication is not configured correctly — please contact the site owner.',
    'auth/invalid-api-key': 'Authentication is not configured correctly — please contact the site owner.',
    'auth/operation-not-allowed': 'This sign-in method is not enabled for this app.',
    'auth/unauthorized-domain': 'This domain is not authorized for sign-in.',
    'auth/too-many-requests': 'Too many attempts — wait a minute and try again.',
    'auth/user-disabled': 'This account has been disabled.',
  }
  // Codes observed in the wild carry a suffix, e.g.
  // "auth/api-key-not-valid.-please-pass-a-valid-api-key." — match the prefix.
  for (const [prefix, message] of Object.entries(messages)) {
    if (code === prefix || code.startsWith(prefix + '.') || code.startsWith(prefix + '-')) return message
  }
  return code ? `Sign-in failed (${code}). Please try again.` : 'Authentication failed.'
}
