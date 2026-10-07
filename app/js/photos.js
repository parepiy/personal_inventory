// Photos: shrink on the device before saving, keep a local copy, fetch missing ones from GitHub.

import * as idb from './idb.js';

const MAX_SIDE = 1280;
const QUALITY = 0.82;
const urls = new Map();
const inflight = new Map();

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => resolve({ img, url });
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('This photo format could not be read. Try a JPEG or PNG.'));
    };
    img.src = url;
  });
}

/** Resizes a picked or captured photo to a JPEG of at most 1280px on its long side. */
export async function shrink(file) {
  const { img, url } = await loadImage(file);
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not save the photo.'))), 'image/jpeg', QUALITY);
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function savePhoto(path, blob) {
  await idb.set('photos', path, blob);
  const old = urls.get(path);
  if (old) URL.revokeObjectURL(old);
  urls.set(path, URL.createObjectURL(blob));
}

export const localPhoto = (path) => idb.get('photos', path);

export async function forgetPhoto(path) {
  await idb.del('photos', path);
  const old = urls.get(path);
  if (old) URL.revokeObjectURL(old);
  urls.delete(path);
}

/** Already-loaded object URL, if any (lets lists render without waiting). */
export const cachedURL = (path) => urls.get(path) || null;

/**
 * Object URL for a photo: memory, then this device, then GitHub (via `download`).
 * Returns null if it cannot be found right now (e.g. offline and never downloaded).
 */
export function photoURL(path, download) {
  if (!path) return Promise.resolve(null);
  if (urls.has(path)) return Promise.resolve(urls.get(path));
  if (inflight.has(path)) return inflight.get(path);
  const p = (async () => {
    let blob = await idb.get('photos', path);
    if (!blob && download) {
      try {
        blob = await download(path);
        await idb.set('photos', path, blob);
      } catch {
        return null;
      }
    }
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.set(path, url);
    return url;
  })().finally(() => inflight.delete(path));
  inflight.set(path, p);
  return p;
}
