import React, { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { deleteToken, getToken, onMessage } from 'firebase/messaging';
import {
  ADMIN_EMAIL,
  auth,
  db,
  getFirebaseMessaging,
  googleAuthProvider,
  handleFirestoreError,
} from '../lib/firebase.ts';
import type { SupportedLanguage, UserRole } from '../shared/types.ts';
import { setAppLanguage } from '../i18n/index.ts';

export interface UserProfileData {
  uid: string;
  email?: string;
  displayName?: string;
  language: SupportedLanguage;
  manualLocationName?: string;
  manualLocationLat?: number;
  manualLocationLng?: number;
  notifyDelays: boolean;
  notifyCancellations: boolean;
  notifyArrivals: boolean;
  role: UserRole;
}

export interface SavedRouteItem {
  routeId: string;
  routeNumber: string;
  originName: string;
  destinationName: string;
}

export interface SavedStopItem {
  stopId: string;
  stopName: string;
  locality: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  routeId?: string;
  read: boolean;
}

export interface TravelHistoryItem {
  id: string;
  kind: 'ROUTE' | 'STOP' | 'JOURNEY';
  title: string;
  subtitle: string;
  routeId?: string;
  fromStopId?: string;
  toStopId?: string;
  timestamp: number;
}

interface AuthContextValue {
  user: User | null;
  authReady: boolean;
  userRole: UserRole;
  isAdmin: boolean;
  isStaff: boolean;
  profile: UserProfileData | null;
  favouriteRoutes: SavedRouteItem[];
  favouriteStops: SavedStopItem[];
  notifications: NotificationItem[];
  recentSearches: string[];
  travelHistory: TravelHistoryItem[];
  pushPermission: NotificationPermission | 'unsupported';
  pushTokenRegistered: boolean;
  pushError: string | null;
  foregroundToast: { title: string; body: string } | null;
  dismissForegroundToast: () => void;
  enablePushNotifications: () => Promise<boolean>;
  disablePushNotifications: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  getIdToken: () => Promise<string | null>;
  toggleFavouriteRoute: (route: SavedRouteItem) => Promise<void>;
  toggleFavouriteStop: (stop: SavedStopItem) => Promise<void>;
  updatePreferences: (updates: Partial<UserProfileData>) => Promise<void>;
  markNotificationRead: (id: string) => Promise<void>;
  addRecentSearch: (term: string) => void;
  addTravelHistory: (item: Omit<TravelHistoryItem, 'id' | 'timestamp'>) => void;
  clearTravelHistory: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const GUEST_FAV_ROUTES_KEY = 'routepulse_guest_fav_routes';
const GUEST_FAV_STOPS_KEY = 'routepulse_guest_fav_stops';
const RECENT_SEARCHES_KEY = 'routepulse_recent_searches';
const TRAVEL_HISTORY_KEY = 'routepulse_travel_history';
const FCM_TOKEN_KEY = 'routepulse_fcm_token';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [userRole, setUserRole] = useState<UserRole>('passenger');
  const [profile, setProfile] = useState<UserProfileData | null>(null);
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );
  const [pushTokenRegistered, setPushTokenRegistered] = useState<boolean>(() =>
    Boolean(typeof window !== 'undefined' && localStorage.getItem(FCM_TOKEN_KEY))
  );
  const [pushError, setPushError] = useState<string | null>(null);
  const [foregroundToast, setForegroundToast] = useState<{ title: string; body: string } | null>(null);

  const [favouriteRoutes, setFavouriteRoutes] = useState<SavedRouteItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(GUEST_FAV_ROUTES_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [favouriteStops, setFavouriteStops] = useState<SavedStopItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(GUEST_FAV_STOPS_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) || '[]');
    } catch {
      return [];
    }
  });
  const [travelHistory, setTravelHistory] = useState<TravelHistoryItem[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(TRAVEL_HISTORY_KEY) || '[]');
    } catch {
      return [];
    }
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (!firebaseUser) {
        setUserRole('passenger');
        setProfile(null);
        setNotifications([]);
        try {
          setFavouriteRoutes(JSON.parse(localStorage.getItem(GUEST_FAV_ROUTES_KEY) || '[]'));
          setFavouriteStops(JSON.parse(localStorage.getItem(GUEST_FAV_STOPS_KEY) || '[]'));
        } catch {
          setFavouriteRoutes([]);
          setFavouriteStops([]);
        }
        setAuthReady(true);
        return;
      }

      const adminMatch =
        firebaseUser.emailVerified &&
        firebaseUser.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
      setUserRole(adminMatch ? 'admin' : 'passenger');

      // Query authoritative server RBAC role
      try {
        const token = await firebaseUser.getIdToken();
        const meRes = await fetch('/api/admin/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (meRes.ok) {
          const meData = (await meRes.json()) as { role?: UserRole };
          if (meData.role) {
            setUserRole(meData.role);
          }
        }
      } catch {
        // Keep baseline role if offline
      }

      // Ensure user profile document exists in Firestore
      const userDocRef = doc(db, 'users', firebaseUser.uid);
      try {
        const snap = await getDoc(userDocRef);
        if (!snap.exists()) {
          const currentLang = (localStorage.getItem('routepulse_lang') as SupportedLanguage) || 'en';
          await setDoc(userDocRef, {
            uid: firebaseUser.uid,
            email: firebaseUser.email || '',
            displayName: firebaseUser.displayName || 'Commuter',
            language: ['en', 'hi', 'bn'].includes(currentLang) ? currentLang : 'en',
            notifyDelays: true,
            notifyCancellations: true,
            notifyArrivals: false,
            role: 'passenger',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }
      } catch (err) {
        console.error('Failed to sync user profile:', err);
      }

      setAuthReady(true);
    });

    return () => unsub();
  }, []);

  // Attach Firestore real-time listeners ONLY when authenticated
  useEffect(() => {
    if (!authReady || !user) return;

    const userPath = `users/${user.uid}`;
    const unsubProfile = onSnapshot(
      doc(db, 'users', user.uid),
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as UserProfileData;
          setProfile(data);
          if (data.language && ['en', 'hi', 'bn'].includes(data.language)) {
            setAppLanguage(data.language);
          }
        }
      },
      (error) => {
        handleFirestoreError(error, 'get', userPath);
      }
    );

    const favRoutesPath = `users/${user.uid}/favourite_routes`;
    const unsubRoutes = onSnapshot(
      collection(db, favRoutesPath),
      (snapshot) => {
        const items: SavedRouteItem[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            routeId: String(data.routeId || d.id),
            routeNumber: String(data.routeNumber || ''),
            originName: String(data.originName || ''),
            destinationName: String(data.destinationName || ''),
          };
        });
        setFavouriteRoutes(items);
      },
      (error) => {
        handleFirestoreError(error, 'list', favRoutesPath);
      }
    );

    const favStopsPath = `users/${user.uid}/favourite_stops`;
    const unsubStops = onSnapshot(
      collection(db, favStopsPath),
      (snapshot) => {
        const items: SavedStopItem[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            stopId: String(data.stopId || d.id),
            stopName: String(data.stopName || ''),
            locality: String(data.locality || ''),
          };
        });
        setFavouriteStops(items);
      },
      (error) => {
        handleFirestoreError(error, 'list', favStopsPath);
      }
    );

    const notifPath = `users/${user.uid}/notifications`;
    const unsubNotifs = onSnapshot(
      collection(db, notifPath),
      (snapshot) => {
        const items: NotificationItem[] = snapshot.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            title: String(data.title || ''),
            body: String(data.body || ''),
            routeId: data.routeId ? String(data.routeId) : undefined,
            read: Boolean(data.read),
          };
        });
        setNotifications(items);
      },
      (error) => {
        handleFirestoreError(error, 'list', notifPath);
      }
    );

    return () => {
      unsubProfile();
      unsubRoutes();
      unsubStops();
      unsubNotifs();
    };
  }, [authReady, user]);

  // Listen for foreground FCM messages if supported & already granted
  useEffect(() => {
    let unsubMsg: (() => void) | undefined;
    if (pushTokenRegistered && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      getFirebaseMessaging().then((messaging) => {
        if (!messaging) return;
        unsubMsg = onMessage(messaging, (payload) => {
          const title = payload.notification?.title || 'RoutePulse Update';
          const body = payload.notification?.body || '';
          setForegroundToast({ title, body });
        });
      });
    }
    return () => {
      unsubMsg?.();
    };
  }, [pushTokenRegistered]);

  // Explicit user-click opt-in ONLY
  const enablePushNotifications = async (): Promise<boolean> => {
    setPushError(null);
    if (!user) {
      setPushError('Sign in required before registering device push alerts.');
      return false;
    }
    if (typeof window === 'undefined' || !('Notification' in window) || !('serviceWorker' in navigator)) {
      setPushPermission('unsupported');
      setPushError('Web push notifications are not supported in this browser.');
      return false;
    }

    try {
      const cfgRes = await fetch('/api/config/public');
      const cfg = (await cfgRes.json()) as { fcmVapidPublicKey: string | null; fcmConfigured: boolean };
      if (!cfg.fcmVapidPublicKey) {
        setPushError('FCM_VAPID_PUBLIC_KEY is not configured on this server yet.');
        return false;
      }

      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== 'granted') {
        setPushError('Browser notification permission was not granted.');
        return false;
      }

      const messaging = await getFirebaseMessaging();
      if (!messaging) {
        setPushError('Firebase Cloud Messaging is unavailable in this browser context.');
        return false;
      }

      const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
      const token = await getToken(messaging, {
        vapidKey: cfg.fcmVapidPublicKey,
        serviceWorkerRegistration: swReg,
      });

      if (!token) {
        setPushError('Failed to obtain FCM registration token.');
        return false;
      }

      const idToken = await user.getIdToken();
      const lang = (localStorage.getItem('routepulse_lang') as SupportedLanguage) || 'en';
      const regRes = await fetch('/api/notifications/register-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          token,
          language: lang,
          routeIds: favouriteRoutes.map((r) => r.routeId),
        }),
      });
      if (!regRes.ok) {
        setPushError('Server rejected FCM token registration.');
        return false;
      }

      localStorage.setItem(FCM_TOKEN_KEY, token);
      setPushTokenRegistered(true);
      return true;
    } catch (err) {
      setPushError(err instanceof Error ? err.message : 'Unable to enable push notifications.');
      return false;
    }
  };

  const disablePushNotifications = async (): Promise<void> => {
    setPushError(null);
    const savedToken = localStorage.getItem(FCM_TOKEN_KEY);
    if (savedToken && user) {
      try {
        const idToken = await user.getIdToken();
        await fetch('/api/notifications/unregister-token', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({ token: savedToken }),
        });
      } catch {
        // Ignore network errors during unregister
      }
    }
    try {
      const messaging = await getFirebaseMessaging();
      if (messaging) {
        await deleteToken(messaging);
      }
    } catch {
      // Ignore
    }
    localStorage.removeItem(FCM_TOKEN_KEY);
    setPushTokenRegistered(false);
  };

  const signInWithGoogle = async () => {
    await signInWithPopup(auth, googleAuthProvider);
  };

  const logout = async () => {
    await signOut(auth);
  };

  const getIdToken = async (): Promise<string | null> => {
    if (!auth.currentUser) return null;
    return await auth.currentUser.getIdToken();
  };

  const toggleFavouriteRoute = async (route: SavedRouteItem) => {
    const exists = favouriteRoutes.some((r) => r.routeId === route.routeId);
    if (!user) {
      const next = exists
        ? favouriteRoutes.filter((r) => r.routeId !== route.routeId)
        : [route, ...favouriteRoutes];
      setFavouriteRoutes(next);
      localStorage.setItem(GUEST_FAV_ROUTES_KEY, JSON.stringify(next));
      return;
    }

    const docPath = `users/${user.uid}/favourite_routes/${route.routeId}`;
    try {
      if (exists) {
        await deleteDoc(doc(db, docPath));
      } else {
        await setDoc(doc(db, docPath), {
          userId: user.uid,
          routeId: route.routeId,
          routeNumber: route.routeNumber.slice(0, 32),
          originName: route.originName.slice(0, 120),
          destinationName: route.destinationName.slice(0, 120),
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, exists ? 'delete' : 'create', docPath);
    }
  };

  const toggleFavouriteStop = async (stop: SavedStopItem) => {
    const exists = favouriteStops.some((s) => s.stopId === stop.stopId);
    if (!user) {
      const next = exists
        ? favouriteStops.filter((s) => s.stopId !== stop.stopId)
        : [stop, ...favouriteStops];
      setFavouriteStops(next);
      localStorage.setItem(GUEST_FAV_STOPS_KEY, JSON.stringify(next));
      return;
    }

    const docPath = `users/${user.uid}/favourite_stops/${stop.stopId}`;
    try {
      if (exists) {
        await deleteDoc(doc(db, docPath));
      } else {
        await setDoc(doc(db, docPath), {
          userId: user.uid,
          stopId: stop.stopId,
          stopName: stop.stopName.slice(0, 120),
          locality: stop.locality.slice(0, 120),
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      handleFirestoreError(error, exists ? 'delete' : 'create', docPath);
    }
  };

  const updatePreferences = async (updates: Partial<UserProfileData>) => {
    if (updates.language) {
      setAppLanguage(updates.language);
    }
    if (!user) return;

    const docPath = `users/${user.uid}`;
    const allowedPayload: Record<string, unknown> = {
      updatedAt: serverTimestamp(),
    };
    if (updates.displayName !== undefined) allowedPayload.displayName = updates.displayName.slice(0, 120);
    if (updates.language !== undefined) allowedPayload.language = updates.language;
    if (updates.manualLocationName !== undefined)
      allowedPayload.manualLocationName = updates.manualLocationName.slice(0, 120);
    if (updates.manualLocationLat !== undefined)
      allowedPayload.manualLocationLat = updates.manualLocationLat;
    if (updates.manualLocationLng !== undefined)
      allowedPayload.manualLocationLng = updates.manualLocationLng;
    if (updates.notifyDelays !== undefined) allowedPayload.notifyDelays = updates.notifyDelays;
    if (updates.notifyCancellations !== undefined)
      allowedPayload.notifyCancellations = updates.notifyCancellations;
    if (updates.notifyArrivals !== undefined)
      allowedPayload.notifyArrivals = updates.notifyArrivals;

    try {
      await updateDoc(doc(db, docPath), allowedPayload);
    } catch (error) {
      handleFirestoreError(error, 'update', docPath);
    }
  };

  const markNotificationRead = async (id: string) => {
    if (!user) return;
    const docPath = `users/${user.uid}/notifications/${id}`;
    try {
      await updateDoc(doc(db, docPath), { read: true });
    } catch (error) {
      handleFirestoreError(error, 'update', docPath);
    }
  };

  const addRecentSearch = (term: string) => {
    const clean = term.trim();
    if (!clean) return;
    setRecentSearches((prev) => {
      const next = [clean, ...prev.filter((t) => t.toLowerCase() !== clean.toLowerCase())].slice(0, 6);
      localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      return next;
    });
  };

  const addTravelHistory = (item: Omit<TravelHistoryItem, 'id' | 'timestamp'>) => {
    const entry: TravelHistoryItem = {
      ...item,
      id: `hist_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      timestamp: Date.now(),
    };
    setTravelHistory((prev) => {
      const deduped = prev.filter(
        (existing) =>
          !(
            existing.kind === entry.kind &&
            existing.routeId === entry.routeId &&
            existing.fromStopId === entry.fromStopId &&
            existing.toStopId === entry.toStopId &&
            existing.title === entry.title
          )
      );
      const next = [entry, ...deduped].slice(0, 15);
      localStorage.setItem(TRAVEL_HISTORY_KEY, JSON.stringify(next));
      return next;
    });
  };

  const clearTravelHistory = () => {
    setTravelHistory([]);
    localStorage.removeItem(TRAVEL_HISTORY_KEY);
  };

  const isAdmin = userRole === 'admin';
  const isStaff = userRole === 'admin' || userRole === 'moderator' || userRole === 'operator';

  return (
    <AuthContext.Provider
      value={{
        user,
        authReady,
        userRole,
        isAdmin,
        isStaff,
        profile,
        favouriteRoutes,
        favouriteStops,
        notifications,
        recentSearches,
        travelHistory,
        pushPermission,
        pushTokenRegistered,
        pushError,
        foregroundToast,
        dismissForegroundToast: () => setForegroundToast(null),
        enablePushNotifications,
        disablePushNotifications,
        signInWithGoogle,
        logout,
        getIdToken,
        toggleFavouriteRoute,
        toggleFavouriteStop,
        updatePreferences,
        markNotificationRead,
        addRecentSearch,
        addTravelHistory,
        clearTravelHistory,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
