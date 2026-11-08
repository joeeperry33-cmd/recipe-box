import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { StoreProvider } from "./lib/store";
import App from "./App";
import "./styles.css";

registerSW({ immediate: true });

// A page shared into the app from the phone's Share menu arrives as ?url= or ?text=. Open Add recipe with it.
{
  const q = new URLSearchParams(location.search);
  const shared = q.get("url") || (q.get("text") ?? "").match(/https?:\/\/\S+/)?.[0];
  if (shared) {
    try { sessionStorage.setItem("sharedRecipeUrl", shared); } catch { /* private mode */ }
    history.replaceState(null, "", "/#/add");
  }
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>,
);
