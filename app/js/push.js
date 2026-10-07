// Web Push on this device: support checks, VAPID key creation, subscribing.

import { base64ToBytes, bytesToBase64 } from './github.js';

const b64url = (bytes) => bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => base64ToBytes(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4));

export const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches
  || navigator.standalone === true;

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

export function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) return 'iPad';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Android/.test(ua)) return 'Android';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'Browser';
}

/** A fresh VAPID key pair: the app signs nothing itself; the daily job uses these to send. */
export async function generateVapidKeys() {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const pub = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
  const jwk = await crypto.subtle.exportKey('jwk', pair.privateKey);
  const subject = location.protocol === 'https:'
    ? new URL('./', location.href).href
    : 'mailto:pawventory@users.noreply.github.com';
  return { publicKey: b64url(pub), privateKey: jwk.d, subject };
}

/** Why push can't be turned on here, or null if it can. */
export function pushBlocker() {
  if (isIOS() && !isStandalone()) return 'add-to-home';
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return null;
}

/** Must be called straight from a tap: browsers only ask for permission after a user gesture. */
export async function subscribe(vapidPublicKey) {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notifications were not allowed.');
  const reg = await navigator.serviceWorker.ready;
  const key = fromB64url(vapidPublicKey);
  let sub = await reg.pushManager.getSubscription();
  if (sub) {
    const current = sub.options?.applicationServerKey;
    if (current && b64url(new Uint8Array(current)) !== vapidPublicKey) {
      await sub.unsubscribe();
      sub = null;
    }
  }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
  return { ...sub.toJSON(), device: deviceName(), addedAt: new Date().toISOString() };
}

export async function currentSubscription() {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return reg ? reg.pushManager.getSubscription() : null;
}

export async function unsubscribe() {
  const sub = await currentSubscription();
  if (sub) await sub.unsubscribe();
  return sub?.endpoint || null;
}

export async function setBadge(count) {
  try {
    if (count > 0 && navigator.setAppBadge) await navigator.setAppBadge(count);
    else if (navigator.clearAppBadge) await navigator.clearAppBadge();
  } catch { /* badges are optional */ }
}
