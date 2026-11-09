import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { nameOf, useStore } from "../lib/store";
import MadeIt, { type Meal } from "../components/MadeIt";
import { dishUrl } from "../components/DishPhoto";
import { alertFriend } from "../lib/push";

const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d.toISOString().slice(0, 10); };
function when(day: string) {
  const diff = Math.round((Date.parse(daysAgo(0)) - Date.parse(day)) / 86_400_000);
  if (diff <= 0) return "today";
  if (diff === 1) return "yesterday";
  if (diff < 7) return new Date(day + "T12:00").toLocaleDateString(undefined, { weekday: "long" });
  return new Date(day + "T12:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** What friends (and you) made lately. */
export default function Feed() {
  const s = useStore();
  const myId = s.session!.user.id;
  const [meals, setMeals] = useState<Meal[] | null>(null);
  const [span, setSpan] = useState(7);
  const [posting, setPosting] = useState(false);
  const [asked, setAsked] = useState<Set<string>>(new Set());
  const hasFriends = s.friendships.some((f) => f.status === "accepted");

  useEffect(() => {
    let live = true;
    supabase.from("meals_made").select("*").gte("made_on", daysAgo(span)).or(`shared.eq.true,user_id.eq.${myId}`)
      .order("made_on", { ascending: false }).order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => { if (live) setMeals((data ?? []) as Meal[]); });
    return () => { live = false; };
  }, [span, myId]);

  async function remove(m: Meal) {
    const { error } = await supabase.from("meals_made").delete().eq("id", m.id);
    if (error) { s.toast("Couldn't delete. Try again."); return; }
    setMeals((x) => (x ?? []).filter((y) => y.id !== m.id));
  }
  async function ask(m: Meal) {
    const { error } = await supabase.from("recipe_requests").insert({ to_user: m.user_id, note: `Could you share your recipe for ${m.title}?`.slice(0, 300) });
    if (error) { s.toast("Couldn't send that. Try again."); return; }
    alertFriend("recipe_request", m.user_id);
    setAsked((x) => new Set(x).add(m.id)); s.toast("Asked " + nameOf(s.people.get(m.user_id)) + " for the recipe");
  }

  return (
    <div className="section">
      <div className="titlebar">
        <div><h2>What everyone's cooking</h2><p className="muted" style={{ margin: "4px 0 0" }}>Meals you and your friends made {span === 7 ? "this past week" : "this past month"}.</p></div>
        {!posting && <div className="btns"><button className="btn primary" onClick={() => setPosting(true)}>+ Post a meal I made</button></div>}
      </div>
      {posting && <MadeIt onCancel={() => setPosting(false)} onDone={(m) => { setPosting(false); setMeals((x) => [m, ...(x ?? [])]); }} />}
      {!hasFriends && <div className="notice">Add friends on the Friends tab to see what they're cooking here.</div>}
      {meals === null ? <p className="muted">Loading…</p> : meals.length === 0 ? (
        <div className="empty"><p style={{ margin: 0 }}>Nothing posted {span === 7 ? "this week" : "this month"} yet. Made something good? Open the recipe and tap "I made this".</p></div>
      ) : (
        <div className="feed">
          {meals.map((m) => {
            const mine = m.user_id === myId;
            const r = m.recipe_id ? s.recipeMap.get(m.recipe_id) : undefined;
            return (
              <article className="card post" key={m.id}>
                <div className="post-head">
                  <span className="avatar" aria-hidden="true">{nameOf(mine ? s.me : s.people.get(m.user_id)).slice(0, 1).toUpperCase()}</span>
                  <span><strong>{mine ? "You" : nameOf(s.people.get(m.user_id))}</strong> made <strong>{r ? <a href={"#/r/" + r.id}>{m.title}</a> : m.title}</strong>
                    <br /><span className="muted small">{when(m.made_on)}{mine && !m.shared ? " · only you can see this" : ""}</span></span>
                </div>
                {m.photo && <img className="post-photo" src={dishUrl(m.photo)} alt={m.title} loading="lazy" />}
                {m.comment && <p className="post-comment">{m.comment}</p>}
                <div className="btns">
                  {!mine && !r && (asked.has(m.id) ? <span className="muted small">Asked for the recipe</span> : <button className="btn small" onClick={() => ask(m)}>Ask for this recipe</button>)}
                  {mine && <button className="btn small ghost" onClick={() => remove(m)}>Delete</button>}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {span === 7 && meals !== null && <div className="btns"><button className="btn" onClick={() => setSpan(30)}>Show the past month</button></div>}
    </div>
  );
}
