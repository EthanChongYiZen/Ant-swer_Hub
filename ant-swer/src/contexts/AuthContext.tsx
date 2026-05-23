import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  updateProfile,
  updatePassword,
  type User as FirebaseUser,
} from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage'
import { auth, db, storage, googleProvider } from '../lib/firebase'

export interface AppUser {
  uid: string
  email: string | null
  displayName: string | null
  photoURL: string | null
  region: string | null
  role: 'user' | 'admin' | 'manager'
}

interface AuthContextValue {
  user: AppUser | null
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (name: string, email: string, password: string) => Promise<void>
  loginWithGoogle: () => Promise<void>
  logout: () => Promise<void>
  updateUserRegion: (region: string) => Promise<void>
  updateUserProfile: (data: { displayName?: string; photoFile?: File }) => Promise<void>
  changePassword: (newPassword: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  async function fetchOrCreateUser(firebaseUser: FirebaseUser): Promise<AppUser> {
    const ref2 = doc(db, 'users', firebaseUser.uid)
    const snap = await getDoc(ref2)
    if (snap.exists()) {
      const data = snap.data()
      return {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: data.displayName ?? firebaseUser.displayName,
        photoURL: data.photoURL ?? firebaseUser.photoURL,
        region: data.region ?? null,
        role: data.role ?? 'user',
      }
    } else {
      const newUser: AppUser = {
        uid: firebaseUser.uid,
        email: firebaseUser.email,
        displayName: firebaseUser.displayName,
        photoURL: firebaseUser.photoURL,
        region: null,
        role: 'user',
      }
      await setDoc(ref2, { ...newUser, createdAt: serverTimestamp() })
      return newUser
    }
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const appUser = await fetchOrCreateUser(firebaseUser)
        setUser(appUser)
      } else {
        setUser(null)
      }
      setLoading(false)
    })
    return unsub
  }, [])

  async function login(email: string, password: string) {
    await signInWithEmailAndPassword(auth, email, password)
  }

  async function register(name: string, email: string, password: string) {
    const cred = await createUserWithEmailAndPassword(auth, email, password)
    await updateProfile(cred.user, { displayName: name })
    await setDoc(doc(db, 'users', cred.user.uid), {
      uid: cred.user.uid,
      email,
      displayName: name,
      photoURL: null,
      region: null,
      role: 'user',
      createdAt: serverTimestamp(),
    })
    // Immediately update local state so displayName shows right after registration
    setUser({ uid: cred.user.uid, email, displayName: name, photoURL: null, region: null, role: 'user' })
  }

  async function loginWithGoogle() {
    await signInWithPopup(auth, googleProvider)
  }

  async function logout() {
    await signOut(auth)
  }

  async function updateUserRegion(region: string) {
    if (!user) return
    await updateDoc(doc(db, 'users', user.uid), { region })
    setUser({ ...user, region })
  }

  async function updateUserProfile(data: { displayName?: string; photoFile?: File }) {
    if (!user || !auth.currentUser) return
    let photoURL = user.photoURL
    if (data.photoFile) {
      // Use a fixed path (avatar.jpg) so the URL stays stable and cache-busting isn't needed
      const storageRef = ref(storage, `avatars/${user.uid}/avatar.jpg`)
      const task = uploadBytesResumable(storageRef, data.photoFile)
      await new Promise<void>((resolve, reject) => task.on('state_changed', null, reject, resolve))
      // Append cache-buster so all clients immediately see the new photo
      const base = await getDownloadURL(storageRef)
      photoURL = base.includes('?') ? `${base}&v=${Date.now()}` : `${base}?v=${Date.now()}`
    }
    const updates: Record<string, string | null> = {}
    if (data.displayName) updates.displayName = data.displayName
    if (photoURL !== user.photoURL) updates.photoURL = photoURL
    if (Object.keys(updates).length > 0) {
      await updateProfile(auth.currentUser, updates)
      await updateDoc(doc(db, 'users', user.uid), updates)
      setUser({ ...user, ...updates })
    }
  }

  async function changePassword(newPassword: string) {
    if (!auth.currentUser) return
    await updatePassword(auth.currentUser, newPassword)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, loginWithGoogle, logout, updateUserRegion, updateUserProfile, changePassword }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
