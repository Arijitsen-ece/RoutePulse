import { cert, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import type { NextFunction, Request, Response } from 'express';
import firebaseConfig from '../firebase-applet-config.json' with { type: 'json' };
import type { AuditLogEntry, UserRole } from '../src/shared/types.ts';

function hasServiceAccountEnv(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
      process.env.FIREBASE_CLIENT_EMAIL &&
      process.env.FIREBASE_PRIVATE_KEY
  );
}

export function hasFcmServerCredentials(): boolean {
  return Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS || hasServiceAccountEnv());
}

function initAdminApp(): App {
  if (getApps().length > 0) {
    return getApps()[0];
  }
  if (hasServiceAccountEnv()) {
    const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');
    return initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey,
      }),
      projectId: process.env.FIREBASE_PROJECT_ID || firebaseConfig.projectId,
    });
  }
  return initializeApp({
    projectId: firebaseConfig.projectId,
  });
}

export const adminApp = initAdminApp();
export const adminAuth = getAuth(adminApp);

let firestoreDb: Firestore | null = null;
export function getSafeAdminFirestore(): Firestore | null {
  if (firestoreDb) return firestoreDb;
  try {
    firestoreDb = getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
    return firestoreDb;
  } catch {
    return null;
  }
}

export const BOOTSTRAPPED_ADMIN_EMAIL = 'arijitsenarijitsen58@gmail.com';

export interface AuthRequest extends Request {
  user?: DecodedIdToken;
  userRole?: UserRole;
  isAdmin?: boolean;
}

const VALID_STAFF_ROLES: UserRole[] = ['passenger', 'moderator', 'operator', 'admin'];

async function resolveUserRole(decoded: DecodedIdToken): Promise<UserRole> {
  if (
    decoded.email_verified === true &&
    decoded.email?.toLowerCase() === BOOTSTRAPPED_ADMIN_EMAIL.toLowerCase()
  ) {
    return 'admin';
  }

  if (decoded.email_verified !== true) {
    return 'passenger';
  }

  const db = getSafeAdminFirestore();
  if (!db) {
    return 'passenger';
  }

  try {
    const roleDoc = await db.collection('staff_roles').doc(decoded.uid).get();
    if (roleDoc.exists) {
      const roleVal = roleDoc.data()?.role;
      if (typeof roleVal === 'string' && VALID_STAFF_ROLES.includes(roleVal as UserRole)) {
        return roleVal as UserRole;
      }
    }
    const adminDoc = await db.collection('admins').doc(decoded.uid).get();
    if (adminDoc.exists) {
      return 'admin';
    }
  } catch {
    // Gracefully fall back to passenger if Firestore Admin ADC is unavailable in dev
  }

  return 'passenger';
}

export const optionalAuth = async (req: AuthRequest, _res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    if (token) {
      try {
        const decoded = await adminAuth.verifyIdToken(token);
        req.user = decoded;
        const role = await resolveUserRole(decoded);
        req.userRole = role;
        req.isAdmin = role === 'admin';
      } catch {
        // Ignore invalid optional token and continue as guest
      }
    }
  }
  next();
};

export const requireAuth = async (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const decoded = await adminAuth.verifyIdToken(token);
    req.user = decoded;
    const role = await resolveUserRole(decoded);
    req.userRole = role;
    req.isAdmin = role === 'admin';
    next();
  } catch (error) {
    console.error('Firebase token verification error:', error);
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
};

export function requireRole(allowedRoles: UserRole[]) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    await requireAuth(req, res, () => {
      const role = req.userRole || 'passenger';
      if (!allowedRoles.includes(role)) {
        return res.status(403).json({ error: 'Insufficient staff privileges for this action' });
      }
      next();
    });
  };
}

export const requireModerator = requireRole(['moderator', 'admin']);
export const requireOperator = requireRole(['operator', 'admin']);
export const requireAdmin = requireRole(['admin']);

export async function persistAuditLog(entry: AuditLogEntry): Promise<void> {
  const db = getSafeAdminFirestore();
  if (!db) return;
  try {
    await db.collection('admin_audit_logs').doc(entry.logId).set({
      ...entry,
      persistedAt: new Date(entry.timestamp).toISOString(),
    });
  } catch {
    // Non-fatal when ADC is not configured in local dev
  }
}
