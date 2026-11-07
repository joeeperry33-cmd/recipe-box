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

  if (!s.ready) return <div className="wrap section"><p className="muted">Loading…</p></div>;
  if (!s.session) return <Login />;

  const pendingIn = s.friendships.filter((f) => f.status === "pending" && f.addressee === s.session!.user.id).length;
  const toBuy = s.list.filter((i) => !i.have && !i.got).length;
  const tab = ["plan", "list", "friends"].includes(page) ? page : "recipes";

  let body;
  switch (page) {
    case "r": body = <RecipeView id={id} />; break;
    case "edit": body = <RecipeEdit id={id} />; break;
    case "add": body = <AddRecipe />; break;
    case "plan": body = <Plan />; break;
    case "list": body = <ShoppingList />; break;
    case "friends": body = <Friends />; break;
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
