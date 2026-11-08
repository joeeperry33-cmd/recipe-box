import { useEffect, useState } from "react";
import { useStore } from "./lib/store";
import Login from "./pages/Login";
import Library from "./pages/Library";
import RecipeView from "./pages/RecipeView";
import RecipeEdit from "./pages/RecipeEdit";
import AddRecipe from "./pages/AddRecipe";
import Plan from "./pages/Plan";
import ShoppingList from "./pages/ShoppingList";
import Friends from "./pages/Friends";
import SharedRecipe from "./pages/SharedRecipe";
import Install from "./pages/Install";
import { takePending } from "./lib/links";
import { isInstalled } from "./lib/install";

export function useRoute() {
  const read = () => (location.hash.replace(/^#\/?/, "") || "").split("/");
  const [parts, setParts] = useState(read);
  useEffect(() => {
    const on = () => { setParts(read()); window.scrollTo(0, 0); };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return parts;
}
export const go = (path: string) => { location.hash = "#/" + path; };

export default function App() {
  const s = useStore();
  const [page, id] = useRoute();
  const [wantLogin, setWantLogin] = useState(false);

  // After signing in from a shared link, go back to that recipe so it can be saved.
  useEffect(() => {
    if (!s.session) return;
    const t = takePending();
    if (t) go("s/" + t);
  }, [s.session]);

  if (!s.ready) return <div className="wrap section"><p className="muted">Loading…</p></div>;
  if (!s.session) {
    if (page === "s" && id && !wantLogin) return (
      <>
        <header className="top no-print"><div className="wrap"><div className="row"><span className="brand"><span className="tab-mark" aria-hidden="true" />Recipe Box</span></div></div></header>
        <main className="wrap"><SharedRecipe token={id} onSignIn={() => setWantLogin(true)} /></main>
      </>
    );
    if (page === "install") return <main className="wrap"><Install signedIn={false} /></main>;
    return <Login />;
  }

  const myId = s.session.user.id;
  const pendingIn = s.friendships.filter((f) => f.status === "pending" && f.addressee === myId).length
    + s.requests.filter((r) => r.status === "open" && r.to_user === myId).length;
  const toBuy = s.list.filter((i) => !i.have && !i.got).length;
  const tab = ["plan", "list", "friends", "install"].includes(page) ? page : "recipes";

  let body;
  switch (page) {
    case "r": body = <RecipeView id={id} />; break;
    case "edit": body = <RecipeEdit id={id} />; break;
    case "add": body = <AddRecipe />; break;
    case "plan": body = <Plan />; break;
    case "list": body = <ShoppingList />; break;
    case "friends": body = <Friends />; break;
    case "s": body = <SharedRecipe token={id} />; break;
    case "install": body = <Install signedIn />; break;
    default: body = <Library />;
  }

  return (
    <>
      <header className="top no-print">
        <div className="wrap">
          <div className="row">
            <a className="brand" href="#/"><span className="tab-mark" aria-hidden="true" />Recipe Box</a>
            <div className="spacer" />
            <a className="btn primary small" href="#/add">+ Add recipe</a>
          </div>
          <nav className="tabs" aria-label="Sections">
            <a href="#/" aria-current={tab === "recipes" ? "page" : undefined}>Recipes <span className="count">{s.recipes.length}</span></a>
            <a href="#/plan" aria-current={tab === "plan" ? "page" : undefined}>Meal plan <span className="count">{s.plan.length}</span></a>
            <a href="#/list" aria-current={tab === "list" ? "page" : undefined}>Shopping list <span className="count">{toBuy}</span></a>
            <a href="#/friends" aria-current={tab === "friends" ? "page" : undefined}>Friends {pendingIn > 0 && <span className="count alert">{pendingIn}</span>}</a>
            {/* Hidden once the app runs from the home screen, where it's already installed. */}
            {!isInstalled() && <a href="#/install" aria-current={tab === "install" ? "page" : undefined}>Install app</a>}
          </nav>
        </div>
      </header>
      <main className="wrap">
        {s.error && <div className="notice warn" style={{ marginTop: 16 }}>{s.error} <button className="btn small" onClick={() => s.reload()}>Try again</button></div>}
        {body}
      </main>
      {s.toastMsg && <div className="toast" role="status">{s.toastMsg}</div>}
    </>
  );
}
