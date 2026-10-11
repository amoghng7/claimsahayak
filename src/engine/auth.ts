/**
 * Firebase Authentication — client-side only, no server-side session.
 * Google OAuth + email/password. The Firebase config is not a secret
 * (it identifies the project; access control is via Firebase Auth rules).
 */
import { initializeApp } from 'firebase/app'
import {
  getAuth,
  onAuthStateChanged as firebaseOnAuthStateChanged,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as firebaseSignOut,
  GoogleAuthProvider,
} from 'firebase/auth'
import type { User } from 'firebase/auth'

// Firebase project config — safe to commit (see AGENTS.md security note).
// Web app "ClaimSahayak Web"; values from the Firebase Management API
// (projects/claim-sahayak/webApps/.../config). Non-secret project metadata.
const firebaseConfig = {
  apiKey: 'AIzaSyB3ZVOcmY1N4coC2T9jeOb1f2z2C92sCp4',
  authDomain: 'claim-sahayak.firebaseapp.com',
  projectId: 'claim-sahayak',
  storageBucket: 'claim-sahayak.firebasestorage.app',
  messagingSenderId: '599879020255',
  appId: '1:599879020255:web:04cd00db64a626cc27836a',
}

const app = initializeApp(firebaseConfig)
const auth = getAuth(app)
const googleProvider = new GoogleAuthProvider()

// --- Public API (framework-free, importable from anywhere) ---

export type AuthUser = Pick<User, 'uid' | 'email' | 'displayName' | 'photoURL'>

function toAuthUser(u: User): AuthUser {
  return { uid: u.uid, email: u.email, displayName: u.displayName, photoURL: u.photoURL }
}

export function onAuthStateChange(
  callback: (user: AuthUser | null) => void,
): () => void {
  return firebaseOnAuthStateChanged(auth, (fbUser) => {
    callback(fbUser ? toAuthUser(fbUser) : null)
  })
}

export async function signInWithGoogle(): Promise<AuthUser> {
  const result = await signInWithPopup(auth, googleProvider)
  return toAuthUser(result.user)
}

export async function signInWithEmail(
  email: string,
  password: string,
): Promise<AuthUser> {
  const result = await signInWithEmailAndPassword(auth, email, password)
  return toAuthUser(result.user)
}

export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<AuthUser> {
  const result = await createUserWithEmailAndPassword(auth, email, password)
  return toAuthUser(result.user)
}

export async function signOut(): Promise<void> {
  await firebaseSignOut(auth)
}
