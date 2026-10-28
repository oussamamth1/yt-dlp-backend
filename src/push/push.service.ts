import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { cert, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

/**
 * Sends call signaling to a device that isn't reachable over its socket
 * (backgrounded or fully closed app) via a data-only FCM message. Data-only
 * (no `notification` block) is required so Android always hands the message
 * to the app's background isolate instead of showing its own default tray
 * notification — the app itself decides how to present it (CallKit UI).
 */
@Injectable()
export class PushService implements OnModuleInit {
  private readonly logger = new Logger(PushService.name);
  private app?: App;

  onModuleInit() {
    const encoded = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!encoded) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT_BASE64 not set — call push notifications are disabled.');
      return;
    }
    const serviceAccount = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
    this.app = initializeApp({ credential: cert(serviceAccount) });
    this.logger.log('Firebase Admin initialized — push notifications enabled.');
  }

  async sendCallPush(token: string, data: Record<string, string>): Promise<void> {
    if (!this.app) {
      this.logger.warn('sendCallPush called but Firebase Admin is not initialized');
      return;
    }
    try {
      const id = await getMessaging(this.app).send({
        token,
        data,
        android: { priority: 'high' },
      });
      this.logger.log(`Call push sent: ${id}`);
    } catch (err) {
      this.logger.warn(`Failed to send call push: ${(err as Error).message}`);
    }
  }

  /**
   * A regular `notification` message — unlike the data-only call push above,
   * Android displays this one itself whenever the app isn't in the
   * foreground, with no app code needing to run. There's no message preview
   * in the body: the server only ever holds ciphertext, never plaintext.
   */
  async sendMessageNotification(token: string, title: string, body: string): Promise<void> {
    if (!this.app) {
      this.logger.warn('sendMessageNotification called but Firebase Admin is not initialized');
      return;
    }
    try {
      const id = await getMessaging(this.app).send({
        token,
        notification: { title, body },
        android: { priority: 'high' },
      });
      this.logger.log(`Message push sent: ${id}`);
    } catch (err) {
      this.logger.warn(`Failed to send message push: ${(err as Error).message}`);
    }
  }
}
