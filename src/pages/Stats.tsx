import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useStore } from "../lib/store";
import type { Meal } from "../components/MadeIt";

const RANGES = [{ days: 30, label: "30 days" }, { days: 365, label: "12 months" }, { days: 0, label: "All time" }];
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function Bars({ rows }: { rows: { label: string; n: number; href?: string; sub?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="bars">
      {rows.map((r) => (
        <div className="bar-row" key={r.label}>
          <span className="bar-label">{r.href ? <a href={r.href}>{r.label}</a> : r.label}{r.sub && <span className="muted small"> {r.sub}</span>}</span>
          <span className="bar-track"><span className="bar-fill" style={{ width: `${(r.n / max) * 100}%` }} /></span>
          <span className="bar-n">{r.n}</span>
        </div>
      ))}
    </div>
  );
}

/** Your own cooking stats, from the meals you've logged with "I made this". */
export default function Stats() {
  const s = useStore();
  const myId = s.session!.user.id;
  const [all, setAll] = useState<Meal[] | null>(null);
  const [range, setRange] = useState(30);

  useEffect(() => {
    supabase.from("meals_made").select("*").eq("user_id", myId).order("made_on", { ascending: false }).limit(5000)
      .then(({ data }) => setAll((data ?? []) as Meal[]));
  }, [myId]);

  const st = useMemo(() => {
    if (!all) return null;
    const since = range ? new Date(Date.now() - range * 86_400_000).toISOString().slice(0, 10) : "";
    const meals = all.filter((m) => m.made_on >= since);
    const byRecipe = new Map<string, { label: string; n: number; last: string; href?: string }>();
    for (const m of meals) {
      const key = m.recipe_id ?? m.title;
      const cur = byRecipe.get(key) ?? { label: m.title, n: 0, last: m.made_on, href: m.recipe_id && s.recipeMap.has(m.recipe_id) ? "#/r/" + m.recipe_id : undefined };
      cur.n++; if (m.made_on > cur.last) cur.last = m.made_on;
      byRecipe.set(key, cur);
    }
    const count = (f: (m: Meal) => string) => {
      const c = new Map<string, number>(); meals.forEach((m) => c.set(f(m), (c.get(f(m)) ?? 0) + 1));
      return [...c].map(([label, n]) => ({ label, n })).sort((a, b) => b.n - a.n);
    };
    const made = new Set(all.map((m) => m.recipe_id));
    const neverMade = s.recipes.filter((r) => r.owner_id === myId && !made.has(r.id));
    const weeks = range ? range / 7 : Math.max(1, (Date.now() - Date.parse(all[all.length - 1]?.made_on ?? new Date().toISOString())) / (7 * 86_400_000));
    return {
      total: meals.length,
      distinct: byRecipe.size,
      perWeek: meals.length / Math.max(1, weeks),
      top: [...byRecipe.values()].sort((a, b) => b.n - a.n || b.last.localeCompare(a.last)).slice(0, 10),
      cats: count((m) => m.category || "Other"),
      days: WEEKDAYS.map((d) => ({ label: d, n: meals.filter((m) => WEEKDAYS[new Date(m.made_on + "T12:00").getDay()] === d).length })),
      neverMade,
    };
  }, [all, range, s.recipes, s.recipeMap, myId]);

  return (
    <div className="section">
      <div className="no-print"><a className="btn ghost small" href="#/friends">← Account</a></div>
      <h2>My cooking stats</h2>
      <p className="muted" style={{ marginTop: 0 }}>Built from the meals you log with "I made this" on a recipe. Only you can see this page.</p>
      <div className="chips" role="group" aria-label="Time range">
        {RANGES.map((r) => <button key={r.days} className={"btn small" + (range === r.days ? " primary" : "")} onClick={() => setRange(r.days)}>{r.label}</button>)}
      </div>
      {!st ? <p className="muted">Loading…</p> : st.total === 0 ? (
        <div className="empty"><p style={{ margin: 0 }}>No meals logged {range ? "in this time" : "yet"}. Next time you cook, open the recipe and tap "I made this".</p></div>
      ) : (<>
        <div className="stat-tiles">
          <div className="card tile"><span className="big">{st.total}</span><span className="muted small">meals made</span></div>
          <div className="card tile"><span className="big">{st.distinct}</span><span className="muted small">different recipes</span></div>
          <div className="card tile"><span className="big">{st.perWeek.toFixed(1)}</span><span className="muted small">meals a week</span></div>
        </div>
        <div className="card"><h3>Made most</h3><Bars rows={st.top.map((t) => ({ ...t, sub: "· last " + new Date(t.last + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" }) }))} /></div>
        <div className="card"><h3>By category</h3><Bars rows={st.cats} /></div>
        <div className="card"><h3>By day of the week</h3><Bars rows={st.days} /></div>
      </>)}
      {st && st.neverMade.length > 0 && (
        <div className="card"><h3>Not made yet</h3>
          <p className="muted small" style={{ marginTop: 0 }}>{st.neverMade.length} of your recipes haven't been logged. A few to try:</p>
          <ul className="plainlist">{st.neverMade.slice(0, 8).map((r) => <li key={r.id}><a href={"#/r/" + r.id}>{r.title}</a></li>)}</ul></div>
      )}
    </div>
  );
}
