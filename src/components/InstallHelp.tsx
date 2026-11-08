import { useEffect, useState } from "react";
import { canPrompt, isInstalled, isIos, onInstallChange, promptInstall } from "../lib/install";

/** An Install button where the browser supports one, otherwise short steps for this phone. */
export default function InstallHelp({ compact }: { compact?: boolean }) {
  const [, tick] = useState(0);
  useEffect(() => onInstallChange(() => tick((n) => n + 1)), []);
  if (isInstalled()) return compact ? null : <p className="muted" style={{ margin: 0 }}>The app is already installed on this device.</p>;
  if (canPrompt()) return <button className="btn primary" onClick={promptInstall}>Install the app</button>;
  if (compact) return <a className="btn ghost small" href="#/install">How to install the app</a>;
  return isIos ? (
    <ol className="steps-list">
      <li>Open this page in <b>Safari</b>.</li>
      <li>Tap the <b>Share</b> button (the square with an arrow pointing up).</li>
      <li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li>
    </ol>
  ) : (
    <ol className="steps-list">
      <li>Open this page in <b>Chrome</b>.</li>
      <li>Tap the <b>⋮</b> menu in the top right.</li>
      <li>Tap <b>Install app</b> or <b>Add to Home screen</b>.</li>
    </ol>
  );
}
