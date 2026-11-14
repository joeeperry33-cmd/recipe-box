import { useEffect, useRef, useState } from "react";
import { uid, type Recipe } from "../lib/recipes";
import { useStore } from "../lib/store";
import { dishUrl } from "./DishPhoto";
import { go } from "../App";

const DINNER = ["Main dish", "Soup & salad"];
const todayName = () => ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][new Date().getDay()];

/** Dinner roulette: spins through recipes and lands on one at random. */
export default function Roulette({ pool, label = "🎲 Dinner roulette" }: { pool: Recipe[]; label?: string }) {
  const s = useStore();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState<Recipe | null>(null);
  const [spinning, setSpinning] = useState(false);
  const last = useRef<string>("");
  const timer = useRef(0);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  // Dinners first; if the list has none (say it's filtered to desserts), use whatever is showing.
  const dinners = pool.filter((r) => DINNER.includes(r.category));
  const choices = dinners.length ? dinners : pool;

  function spin() {
    if (!choices.length) return;
    setOpen(true); setSpinning(true);
    // Avoid landing on the same recipe twice in a row.
    const options = choices.length > 1 ? choices.filter((r) => r.id !== last.current) : choices;
    const pick = options[Math.floor(Math.random() * options.length)];
    last.current = pick.id;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || choices.length === 1) { setShown(pick); setSpinning(false); return; }
    // Flick through titles, slowing down, then stop on the pick.
    let step = 0; const steps = 14;
    const tick = () => {
      step++;
      if (step >= steps) { setShown(pick); setSpinning(false); return; }
      setShown(choices[Math.floor(Math.random() * choices.length)]);
      timer.current = window.setTimeout(tick, 40 + step * step * 2);
    };
    tick();
  }

  function addToPlan(r: Recipe) {
    const day = todayName();
    s.setPlan([...s.plan, { id: uid(), recipe_id: r.id, day, servings: Number(r.servings) || null }]);
    s.toast(`Added to ${day} in your meal plan`); setOpen(false);
  }

  return (
    <>
      <button className="chip roulette-btn" onClick={spin} disabled={!choices.length}>{label}</button>
      {open && shown && (
        <div className="roulette-back" onClick={() => !spinning && setOpen(false)}>
          <div className="card roulette" role="dialog" aria-modal="true" aria-label="Dinner roulette" onClick={(e) => e.stopPropagation()}>
            <span className="label" style={{ margin: 0 }}>{spinning ? "Spinning…" : "Tonight's dinner is…"}</span>
            {!spinning && shown.dish_photo && <img className="roulette-photo" src={dishUrl(shown.dish_photo)} alt="" />}
            <h2 className={"roulette-title" + (spinning ? " spinning" : "")} aria-live="polite">{shown.title}</h2>
            {!spinning && <>
              <span className="muted small">{[shown.category, shown.prep_time && "prep " + shown.prep_time, shown.cook_time && "cook " + shown.cook_time].filter(Boolean).join(" · ")}</span>
              <div className="btns center">
                <button className="btn primary" onClick={() => { setOpen(false); go("r/" + shown.id); }}>Let's make it</button>
                <button className="btn" onClick={() => addToPlan(shown)}>Add to tonight's plan</button>
                <button className="btn" onClick={spin}>🎲 Spin again</button>
              </div>
              <button className="btn ghost small" onClick={() => setOpen(false)}>Close</button>
            </>}
          </div>
        </div>
      )}
    </>
  );
}
