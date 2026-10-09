/** Platform detection and the browser's install prompt, for installing the app to a home screen or dock. */

export const isIos = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const isAndroid = () => /Android/.test(navigator.userAgent);
export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
/** Desktop Safari on a Mac (iPads also report "Macintosh", so rule them out first). */
export const isMacSafari = () =>
  !isIos() && /Macintosh/.test(navigator.userAgent) && /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg|Firefox/.test(navigator.userAgent);

export type Platform = 'ios' | 'android' | 'mac-safari' | 'desktop';
export const platform = (): Platform => (isIos() ? 'ios' : isAndroid() ? 'android' : isMacSafari() ? 'mac-safari' : 'desktop');

/** Chromium's install event (not in the DOM typings). */
export interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferred: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((f) => f());

/** Call once at startup: the browser fires these early, often before the menu has rendered. */
export function captureInstallPrompt(): void {
  addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep it for our own button instead of the browser's mini-infobar
    deferred = e as InstallPromptEvent;
    emit();
  });
  addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    emit();
  });
}

export const installPrompt = () => deferred;
export const justInstalled = () => installed;

export function onInstallChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** Show the browser's install dialog; the event can only be used once. */
export async function promptInstall(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null;
  await e.prompt();
  const { outcome } = await e.userChoice;
  emit();
  return outcome === 'accepted';
}
