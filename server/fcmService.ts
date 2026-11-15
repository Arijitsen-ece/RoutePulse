import crypto from 'node:crypto';
import { getMessaging } from 'firebase-admin/messaging';
import { adminApp, getSafeAdminFirestore, hasFcmServerCredentials } from './firebaseAdmin.ts';
import type {
  FcmDeliveryHealth,
  ServiceAlert,
  SupportedLanguage,
} from '../src/shared/types.ts';

export interface RegisteredFcmToken {
  token: string;
  tokenHash: string;
  uid: string;
  language: SupportedLanguage;
  routeIds: string[];
  updatedAt: number;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex').slice(0, 32);
}

class FcmNotificationService {
  private tokens = new Map<string, RegisteredFcmToken>();
  private sentCount = 0;
  private failedCount = 0;
  private prunedTokensCount = 0;
  private lastSentAt: number | null = null;
  private lastError: string | null = null;

  public getHealth(): FcmDeliveryHealth {
    const vapidKey = process.env.FCM_VAPID_PUBLIC_KEY || process.env.VITE_FCM_VAPID_PUBLIC_KEY || '';
    const configured = hasFcmServerCredentials();
    return {
      configured,
      credentialMode: configured ? 'ADC_OR_ENV' : 'UNCONFIGURED',
      vapidConfigured: Boolean(vapidKey && !vapidKey.startsWith('MY_')),
      registeredTokensCount: this.tokens.size,
      sentCount: this.sentCount,
      failedCount: this.failedCount,
      prunedTokensCount: this.prunedTokensCount,
      lastSentAt: this.lastSentAt,
      lastError: this.lastError,
    };
  }

  public async registerToken(params: {
    token: string;
    uid: string;
    language?: SupportedLanguage;
    routeIds?: string[];
  }): Promise<RegisteredFcmToken> {
    const cleanToken = params.token.trim();
    const tokenHash = hashToken(cleanToken);
    const record: RegisteredFcmToken = {
      token: cleanToken,
      tokenHash,
      uid: params.uid,
      language: params.language || 'en',
      routeIds: Array.isArray(params.routeIds) ? params.routeIds.slice(0, 30) : [],
      updatedAt: Date.now(),
    };
    this.tokens.set(cleanToken, record);

    const db = getSafeAdminFirestore();
    if (db) {
      try {
        await db
          .collection('users')
          .doc(params.uid)
          .collection('fcm_tokens')
          .doc(tokenHash)
          .set({
            uid: params.uid,
            token: cleanToken,
            language: record.language,
            routeIds: record.routeIds,
            updatedAt: new Date(record.updatedAt).toISOString(),
          });
      } catch {
        // Safe fallback to in-memory token store if Firestore ADC is absent
      }
    }

    return record;
  }

  public async unregisterToken(params: { token: string; uid: string }): Promise<boolean> {
    const cleanToken = params.token.trim();
    const existed = this.tokens.delete(cleanToken);
    const db = getSafeAdminFirestore();
    if (db) {
      try {
        await db
          .collection('users')
          .doc(params.uid)
          .collection('fcm_tokens')
          .doc(hashToken(cleanToken))
          .delete();
      } catch {
        // Ignore
      }
    }
    return existed;
  }

  private isPermanentTokenError(code: string | undefined): boolean {
    return (
      code === 'messaging/registration-token-not-registered' ||
      code === 'messaging/invalid-registration-token'
    );
  }

  private async sendWithRetry(
    token: string,
    title: string,
    body: string,
    data: Record<string, string>,
    attempt = 1
  ): Promise<{ ok: boolean; pruned?: boolean; error?: string }> {
    const messaging = getMessaging(adminApp);
    try {
      await messaging.send({
        token,
        notification: { title, body },
        data,
        webpush: {
          notification: {
            title,
            body,
            icon: '/favicon.ico',
          },
        },
      });
      return { ok: true };
    } catch (err) {
      const code =
        err && typeof err === 'object' && 'code' in err
          ? String((err as { code?: unknown }).code || '')
          : '';
      if (this.isPermanentTokenError(code)) {
        const record = this.tokens.get(token);
        this.tokens.delete(token);
        this.prunedTokensCount += 1;
        if (record) {
          const db = getSafeAdminFirestore();
          if (db) {
            db.collection('users')
              .doc(record.uid)
              .collection('fcm_tokens')
              .doc(record.tokenHash)
              .delete()
              .catch(() => {});
          }
        }
        return { ok: false, pruned: true, error: code || 'invalid-token' };
      }

      if (attempt < 3) {
        const delayMs = 250 * Math.pow(2, attempt - 1);
        await new Promise((r) => setTimeout(r, delayMs));
        return this.sendWithRetry(token, title, body, data, attempt + 1);
      }

      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message };
    }
  }

  public async sendNotificationToTokens(params: {
    title: string | Record<SupportedLanguage, string>;
    body: string | Record<SupportedLanguage, string>;
    routeId?: string;
    targetUid?: string;
  }): Promise<{
    sent: number;
    failed: number;
    pruned: number;
    skippedReason?: string;
  }> {
    if (!hasFcmServerCredentials()) {
      return {
        sent: 0,
        failed: 0,
        pruned: 0,
        skippedReason: 'FCM HTTP v1 credentials (GOOGLE_APPLICATION_CREDENTIALS or service account env) not configured.',
      };
    }

    const candidates = Array.from(this.tokens.values()).filter((rec) => {
      if (params.targetUid && rec.uid !== params.targetUid) return false;
      if (
        params.routeId &&
        params.routeId !== 'ALL' &&
        rec.routeIds.length > 0 &&
        !rec.routeIds.includes(params.routeId)
      ) {
        return false;
      }
      return true;
    });

    if (candidates.length === 0) {
      return {
        sent: 0,
        failed: 0,
        pruned: 0,
        skippedReason: 'No matching registered FCM device tokens.',
      };
    }

    let sent = 0;
    let failed = 0;
    let pruned = 0;

    for (const rec of candidates) {
      const lang = rec.language || 'en';
      const title =
        typeof params.title === 'string'
          ? params.title
          : params.title[lang] || params.title.en;
      const body =
        typeof params.body === 'string'
          ? params.body
          : params.body[lang] || params.body.en;

      const res = await this.sendWithRetry(rec.token, title, body, {
        routeId: params.routeId || 'ALL',
        language: lang,
      });

      if (res.ok) {
        sent += 1;
        this.sentCount += 1;
        this.lastSentAt = Date.now();
        this.lastError = null;
      } else {
        failed += 1;
        this.failedCount += 1;
        if (res.pruned) pruned += 1;
        this.lastError = res.error || 'Push delivery failed';
      }
    }

    return { sent, failed, pruned };
  }

  public async broadcastAlertPush(alert: ServiceAlert): Promise<{
    sent: number;
    failed: number;
    pruned: number;
    skippedReason?: string;
  }> {
    return this.sendNotificationToTokens({
      title: alert.title,
      body: alert.description,
      routeId: alert.routeId,
    });
  }
}

export const fcmService = new FcmNotificationService();
