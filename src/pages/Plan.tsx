import { useState } from "react";
import { DAYS, buildList, uid } from "../lib/recipes";
import { useStore } from "../lib/store";
import { go } from "../App";

export default function Plan() {
  const s = useStore();
  const rs = [...s.recipes].sort((a, b) => a.title.localeCompare(b.title));
  const [pick, setPick] = useState("");
  const [day, setDay] = useState(DAYS[0]);
  const entries = s.plan.filter((e) => s.recipeMap.has(e.recipe_id));

  function add() {
    const id = pick || rs[0]?.id; const r = id && s.recipeMap.get(id);
    if (!r) return;
    s.setPlan([...s.plan, { id: uid(), recipe_id: r.id, day, servings: Number(r.servings) || null }]);
  }
  const update = (id: string, patch: Partial<(typeof s.plan)[number]>) => s.setPlan(s.plan.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  function makeList() {
    s.setList(buildList(entries, s.recipeMap, s.list));
    s.toast("Shopping list ready"); go("list");
  }

  return (
    <div className="section">
      <div className="titlebar">
        <div><h2>This week's meals</h2><p className="muted" style={{ margin: "4px 0 0" }}>Pick recipes for each day, then build one shopping list for all of them.</p></div>
        <div className="btns">
          <button className="btn primary" disabled={!entries.length} onClick={makeList}>Make shopping list</button>
          {entries.length > 0 && <button className="btn" onClick={() => s.setPlan([])}>Clear week</button>}
        </div>
      </div>
      {rs.length === 0 ? (
        <div className="empty"><p style={{ margin: 0 }}>Add some recipes first, then plan your week here.</p><a className="btn primary" href="#/add">Add a recipe</a></div>
      ) : (
        <>
          <div className="day">
            <span className="label" style={{ margin: 0 }}>Add a meal</span>
            <div className="addpick">
              <label className="sr" htmlFor="pickR">Recipe</label>
              <select id="pickR" value={pick || rs[0].id} onChange={(e) => setPick(e.target.value)}>{rs.map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}</select>
              <label className="sr" htmlFor="pickD">Day</label>
              <select id="pickD" className="narrow" value={day} onChange={(e) => setDay(e.target.value)}>{DAYS.map((d) => <option key={d}>{d}</option>)}</select>
              <button className="btn primary" onClick={add}>Add</button>
            </div>
          </div>
          <div className="days">
            {DAYS.map((d) => {
              const es = entries.filter((e) => (e.day || "Anytime") === d);
              if (d === "Anytime" && !es.length) return null;
              return (
                <section className="day" key={d}>
                  <h3>{d}<small>{es.length ? `${es.length} meal${es.length > 1 ? "s" : ""}` : "nothing planned"}</small></h3>
                  {es.map((e) => {
                    const r = s.recipeMap.get(e.recipe_id)!;
                    const base = Number(r.servings) || 0;
                    const opts = [...new Set([1, 2, 3, 4, 5, 6, 8, 10, 12, base].filter(Boolean))].sort((a, b) => a - b);
                    return (
                      <div className="pentry" key={e.id}>
                        <span className="t"><a href={"#/r/" + r.id}>{r.title}</a></span>
                        {base > 0 && <label className="muted small">Serves <select value={e.servings || base} onChange={(ev) => update(e.id, { servings: Number(ev.target.value) })}>{opts.map((n) => <option key={n}>{n}</option>)}</select></label>}
                        <select aria-label="Day" value={e.day || "Anytime"} onChange={(ev) => update(e.id, { day: ev.target.value })}>{DAYS.map((dd) => <option key={dd}>{dd}</option>)}</select>
                        <button className="iconbtn" onClick={() => s.setPlan(s.plan.filter((x) => x.id !== e.id))} aria-label={"Remove " + r.title}>Remove</button>
                      </div>
                    );
                  })}
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
