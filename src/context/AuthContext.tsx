import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut as firebaseSignOut,
  type User,
} from 'firebase/auth';
import { auth, googleAuthProvider } from '../lib/firebase';
import { apiFetch } from '../lib/api';
import { syncUserProfileToFirestore } from '../lib/socialFirestore';

export interface UserProfile {
  id: string;
  uid: string;
  email: string;
  fullName: string;
  handle: string | null;
  bio: string | null;
  city: string | null;
  phone: string | null;
  avatarUrl: string | null;
  role: 'customer' | 'owner' | 'admin';
  preferredLang: string;
}

interface AuthContextValue {
  firebaseUser: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<UserProfile | null>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  firebaseUser: null,
  profile: null,
  loading: true,
  signInWithGoogle: async () => null,
  signOut: async () => {},
  refreshProfile: async () => {},
});

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshProfile = useCallback(async () => {
    if (!auth.currentUser) {
      setProfile(null);
      return;
    }
    try {
      const data = await apiFetch<{ profile: UserProfile }>('/api/me');
      setProfile(data.profile);
      if (data.profile && auth.currentUser) {
        void syncUserProfileToFirestore(auth.currentUser, data.profile).catch((e) =>
          console.warn('Firestore user sync warning:', e)
        );
      }
    } catch (err) {
      console.error('Failed to refresh profile:', err);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (user) {
        await refreshProfile();
      } else {
        setProfile(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [refreshProfile]);

  const signInWithGoogle = async () => {
    const result = await signInWithPopup(auth, googleAuthProvider);
    setFirebaseUser(result.user);
    const data = await apiFetch<{ profile: UserProfile }>('/api/me');
    setProfile(data.profile);
    if (data.profile) {
      void syncUserProfileToFirestore(result.user, data.profile).catch((e) =>
        console.warn('Firestore user sync warning:', e)
      );
    }
    return data.profile;
  };

  const signOut = async () => {
    await firebaseSignOut(auth);
    setFirebaseUser(null);
    setProfile(null);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        profile,
        loading,
        signInWithGoogle,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
