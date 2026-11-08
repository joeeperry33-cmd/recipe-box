// The browser's own "install this app" prompt (Chrome and Android). iPhone has none: it uses Share > Add to Home Screen.
export type InstallEvent = Event & { prompt: () => Promise<void> };
let installEvent: InstallEvent | null = null;
const listeners = new Set<() => void>();
window.addEventListener("beforeinstallprompt", (e) => { e.preventDefault(); installEvent = e as InstallEvent; listeners.forEach((f) => f()); });
window.addEventListener("appinstalled", () => { installEvent = null; listeners.forEach((f) => f()); });

export const canPrompt = () => !!installEvent;
export const onInstallChange = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };
export async function promptInstall() { const e = installEvent; installEvent = null; listeners.forEach((f) => f()); if (e) await e.prompt(); }
export const isIos = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
export const isInstalled = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
