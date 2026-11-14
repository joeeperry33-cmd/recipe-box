import { useState } from "react";
import { DAYS, buildList, uid } from "../lib/recipes";
import { useStore } from "../lib/store";
import { go } from "../App";
import { supabase } from "../lib/supabase";
import { withLimitNote } from "../lib/links";
import Roulette from "../components/Roulette";

const WEEK = DAYS.filter((d) => d !== "Anytime");
type Suggestion = { plan: { day: string; recipe_id: string; reason: string }[]; summary: string };

/** Asks the AI to plan the week from the person's own recipes, then lets them use or redo it. */
function AiPlanner() {
  const s = useStore();
  const myId = s.session!.user.id;
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState<string[]>(WEEK);
  const [notes, setNotes] = useState("");
  const [friends, setFriends] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [sug, setSug] = useState<Suggestion | null>(null);
  const [change, setChange] = useState("");
  const [editingCurrent, setEditingCurrent] = useState(false); // the suggestion is a change to the plan already in use
  const mineSorted = [...s.recipes].filter((r) => friends || r.owner_id === myId).sort((a, b) => a.title.localeCompare(b.title));
  const hasFriendRecipes = s.recipes.some((r) => r.owner_id !== myId);

  async function make(revise?: { current: { day: string; recipe_id: string }[]; change: string }) {
    setBusy(true); setErr("");
    const ids = [...new Set([...s.recipes.filter((r) => friends || r.owner_id === myId).map((r) => r.id), ...(revise?.current.map((p) => p.recipe_id) ?? [])])];
    const { data, error } = await supabase.functions.invoke("plan-week", { body: { recipe_ids: ids, days, notes, ...revise } });
    setBusy(false);
    if (error) {
      let t = "Something went wrong making the plan. Try again.";
      try { const j = await (error as { context?: Response }).context?.json(); if (j?.error) t = j.error; } catch { /* not json */ }
      setErr(withLimitNote(t)); return;
    }
    setSug(data as Suggestion); setChange("");
  }
  const reviseSuggestion = () => sug && change.trim() && make({ current: sug.plan, change: change.trim() });
  function reviseCurrent() {
    if (!change.trim()) return;
    const current = s.plan.filter((e) => days.includes(e.day) && s.recipeMap.has(e.recipe_id)).map((e) => ({ day: e.day, recipe_id: e.recipe_id }));
    setEditingCurrent(true); make({ current, change: change.trim() });
  }
  // Hand edits to the suggestion before using it.
  const setPick = (i: number, recipe_id: string) => sug && setSug({ ...sug, plan: sug.plan.map((p, j) => (j === i ? { ...p, recipe_id, reason: "your pick" } : p)) });
  const dropPick = (i: number) => sug && setSug({ ...sug, plan: sug.plan.filter((_, j) => j !== i) });
  function use(replace: boolean) {
    if (!sug) return;
    const keep = replace ? s.plan.filter((e) => !days.includes(e.day)) : s.plan;
    const add = sug.plan.map((p) => ({ id: uid(), recipe_id: p.recipe_id, day: p.day, servings: Number(s.recipeMap.get(p.recipe_id)?.servings) || null }));
    s.setPlan([...keep, ...add]); setSug(null); setOpen(false); setEditingCurrent(false); s.toast("Meal plan updated");
  }

  if (!open) return (
    <div className="day ai-plan">
      <span className="label" style={{ margin: 0 }}>Plan my week for me</span>
      <p className="muted small" style={{ margin: 0 }}>Let AI pick a dinner for each day from your recipes, with variety and quick meals on busy nights.</p>
      <div className="btns"><button className="btn primary" onClick={() => setOpen(true)}>✨ Plan my week</button></div>
    </div>
  );

  return (
    <div className="day ai-plan">
      <span className="label" style={{ margin: 0 }}>Plan my week for me</span>
      {!sug && <>
        <div className="field"><span className="small">Which days?</span>
          <div className="chips">{WEEK.map((d) => (
            <label key={d} className="checkrow small chip-check"><input type="checkbox" checked={days.includes(d)} onChange={(e) => setDays(e.target.checked ? WEEK.filter((x) => x === d || days.includes(x)) : days.filter((x) => x !== d))} /> {d.slice(0, 3)}</label>
          ))}</div></div>
        <div className="field"><label htmlFor="aiNotes" className="small">Anything to keep in mind? (optional)</label>
          <input id="aiNotes" value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. quick on weeknights, no fish, use up chicken" /></div>
        {hasFriendRecipes && <label className="checkrow small"><input type="checkbox" checked={friends} onChange={(e) => setFriends(e.target.checked)} /> Include recipes friends shared with me</label>}
        <div className="btns">
          <button className="btn primary" disabled={busy || !days.length} onClick={() => { setEditingCurrent(false); make(); }}>{busy ? "Planning…" : "Make a new plan"}</button>
          <button className="btn" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
        </div>
        {s.plan.some((e) => days.includes(e.day)) && (
          <form className="field" onSubmit={(e) => { e.preventDefault(); reviseCurrent(); }}>
            <label htmlFor="aiChangeNow" className="small">Or change the plan you have now</label>
            <div className="addrow"><input id="aiChangeNow" value={change} maxLength={500} onChange={(e) => setChange(e.target.value)} placeholder="e.g. swap Tuesday for something lighter" />
              <button className="btn" disabled={busy || !change.trim()}>Change it</button></div>
          </form>
        )}
        {busy && <div className="status"><span className="spin" />Looking through your recipes… this takes about 20 seconds.</div>}
      </>}
      {err && <div className="notice warn">{err}</div>}
      {sug && <>
        <p style={{ margin: 0 }}>{sug.summary}</p>
        <div>{sug.plan.map((p, i) => ({ p, i })).sort((a, b) => WEEK.indexOf(a.p.day) - WEEK.indexOf(b.p.day)).map(({ p, i }) => (
          <div className="pentry sug" key={i}>
            <strong className="sug-day">{p.day}</strong>
            <select aria-label={"Recipe for " + p.day} value={p.recipe_id} onChange={(e) => setPick(i, e.target.value)}>
              {!s.recipeMap.has(p.recipe_id) && <option value={p.recipe_id}>?</option>}
              {(mineSorted.some((r) => r.id === p.recipe_id) ? mineSorted : [s.recipeMap.get(p.recipe_id)!, ...mineSorted].filter(Boolean)).map((r) => <option key={r.id} value={r.id}>{r.title}</option>)}
            </select>
            <button className="iconbtn" onClick={() => dropPick(i)} aria-label={"Remove " + p.day}>Remove</button>
            <span className="muted small sug-why">{p.reason}</span>
          </div>
        ))}</div>
        <form className="field" onSubmit={(e) => { e.preventDefault(); reviseSuggestion(); }}>
          <label htmlFor="aiChange" className="small">Want changes? Tell it what to change</label>
          <div className="addrow"><input id="aiChange" value={change} maxLength={500} onChange={(e) => setChange(e.target.value)} placeholder="e.g. no pasta, swap Friday for pizza night" />
            <button className="btn" disabled={busy || !change.trim()}>{busy ? "Updating…" : "Update plan"}</button></div>
        </form>
        {busy && <div className="status"><span className="spin" />Updating the plan…</div>}
        <div className="btns">
          <button className="btn primary" disabled={busy || !sug.plan.length} onClick={() => use(true)}>{editingCurrent ? "Save changes" : "Use this plan"}</button>
          {!editingCurrent && s.plan.some((e) => days.includes(e.day)) && <button className="btn" disabled={busy} onClick={() => use(false)}>Add to what I have</button>}
          {!editingCurrent && <button className="btn" disabled={busy} onClick={() => make()}>Start over</button>}
          <button className="btn ghost" onClick={() => { setSug(null); setOpen(false); setEditingCurrent(false); }}>Cancel</button>
        </div>
      </>}
    </div>
  );
}

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
          <Roulette pool={s.recipes} label="🎲 Can't decide?" />
        </div>
      </div>
      {rs.length === 0 ? (
        <div className="empty"><p style={{ margin: 0 }}>Add some recipes first, then plan your week here.</p><a className="btn primary" href="#/add">Add a recipe</a></div>
      ) : (
        <>
          <AiPlanner />
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
