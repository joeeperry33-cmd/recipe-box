import { dishUrl } from "../components/DishPhoto";
import { useMemo, useState } from "react";
import { CATEGORIES, ingText, uid } from "../lib/recipes";
import { nameOf, useStore } from "../lib/store";
import { Heart, StarsShown } from "../components/Marks";

export default function Library() {
  const s = useStore();
  const myId = s.session!.user.id;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("All");
  const [whose, setWhose] = useState<"mine" | "friends">("mine");
  const [favOnly, setFavOnly] = useState(false);
  const [sort, setSort] = useState<"name" | "rating">("name");

  const mine = s.recipes.filter((r) => r.owner_id === myId);
  const theirs = s.recipes.filter((r) => r.owner_id !== myId);
  const pool = whose === "mine" ? mine : theirs;
  const cats = ["All", ...CATEGORIES.filter((c) => pool.some((r) => r.category === c))];
  const planned = new Set(s.plan.map((e) => e.recipe_id));

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return pool
      .filter((r) => cat === "All" || r.category === cat)
      .filter((r) => !favOnly || s.marks.get(r.id)?.favorite)
      .filter((r) => !needle || [r.title, r.category, r.source, ...(r.tags || []), ...(r.ingredients || []).map((i) => i.item)].join(" ").toLowerCase().includes(needle))
      .sort((a, b) => (sort === "rating" ? (s.marks.get(b.id)?.rating ?? 0) - (s.marks.get(a.id)?.rating ?? 0) : 0) || a.title.localeCompare(b.title));
  }, [pool, q, cat, favOnly, sort, s.marks]);

  function togglePlan(id: string) {
    const ix = s.plan.findIndex((e) => e.recipe_id === id);
    if (ix >= 0) { s.setPlan(s.plan.filter((_, i) => i !== ix)); s.toast("Removed from meal plan"); }
    else { s.setPlan([...s.plan, { id: uid(), recipe_id: id, day: "Anytime", servings: Number(s.recipeMap.get(id)?.servings) || null }]); s.toast("Added to meal plan"); }
  }

  return (
    <div className="section">
      {theirs.length > 0 && (
        <div className="seg" role="group" aria-label="Whose recipes">
          <button aria-pressed={whose === "mine"} onClick={() => { setWhose("mine"); setCat("All"); }}>My recipes <span className="count">{mine.length}</span></button>
          <button aria-pressed={whose === "friends"} onClick={() => { setWhose("friends"); setCat("All"); }}>From friends <span className="count">{theirs.length}</span></button>
        </div>
      )}
      <div className="search">
        <label className="sr" htmlFor="q">Search recipes</label>
        <input id="q" type="search" placeholder="Search by name, ingredient or tag" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {pool.length > 0 && (
        <div className="filters">
          <button className="chip" aria-pressed={favOnly} onClick={() => setFavOnly((v) => !v)}>♥ Favorites</button>
          <label className="sortby">Sort <select value={sort} onChange={(e) => setSort(e.target.value as "name" | "rating")}><option value="name">A to Z</option><option value="rating">Highest rated</option></select></label>
        </div>
      )}
      {cats.length > 2 && (
        <div className="chips" role="group" aria-label="Category">
          {cats.map((c) => <button key={c} className="chip" aria-pressed={cat === c} onClick={() => setCat(c)}>{c}</button>)}
        </div>
      )}
      {s.loading && s.recipes.length === 0 ? <p className="muted">Loading your recipes…</p>
        : pool.length === 0 ? (
          <div className="empty">
            <h2>Your recipe box is empty</h2>
            <p className="muted" style={{ margin: 0, maxWidth: "40ch" }}>Take a photo of a recipe card or cookbook page. It gets read, sorted into a category and saved here.</p>
            <a className="btn primary" href="#/add">Add your first recipe</a>
          </div>
        ) : shown.length === 0 ? <p className="muted">{favOnly ? "No favorites here yet. Tap the heart on a recipe to add it." : "No recipes match that search."}</p> : (
          <div className="grid">
            {shown.map((r) => (
              <article className="rcard" key={r.id}>
                <a href={"#/r/" + r.id} className="rcard-link">
                  {r.dish_photo && <img className="rcard-photo" src={dishUrl(r.dish_photo)} alt="" loading="lazy" />}
                  <div className="head">
                    <div className="cat">{r.category}</div>
                    <h3>{r.title}</h3>
                    <StarsShown rating={s.marks.get(r.id)?.rating} />
                    {r.owner_id !== myId && <div className="by">from {nameOf(s.people.get(r.owner_id))}</div>}
                  </div>
                  <div className="lines">
                    {(r.ingredients || []).slice(0, 3).map((g, i) => <span key={i}>{ingText(g)}</span>)}
                    {(r.ingredients || []).length > 3 && <span>+ {r.ingredients.length - 3} more</span>}
                  </div>
                </a>
                <Heart recipeId={r.id} title={r.title} />
                <button className={"btn small plan-toggle" + (planned.has(r.id) ? " inplan" : "")} onClick={() => togglePlan(r.id)}
                  aria-label={(planned.has(r.id) ? "Remove from meal plan: " : "Add to meal plan: ") + r.title}>
                  {planned.has(r.id) ? "✓ Planned" : "+ Plan"}
                </button>
              </article>
            ))}
          </div>
        )}
    </div>
  );
}
