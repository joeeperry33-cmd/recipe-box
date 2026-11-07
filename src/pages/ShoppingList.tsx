import { useState, type FormEvent } from "react";
import { AISLES, amountText, buildList, listText, parseIngLine, uid, type ListItem } from "../lib/recipes";
import { useStore } from "../lib/store";

export default function ShoppingList() {
  const s = useStore();
  const items = s.list;
  const [newItem, setNewItem] = useState("");
  const need = items.filter((i) => !i.have);
  const have = items.filter((i) => i.have);
  const left = need.filter((i) => !i.got).length;
  const groups = AISLES.map((a) => [a, need.filter((i) => (i.aisle || "Other") === a)] as const).filter(([, xs]) => xs.length);

  const patch = (key: string, p: Partial<ListItem>) => s.setList(items.map((i) => (i.key === key ? { ...i, ...p } : i)));
  function add(e: FormEvent) {
    e.preventDefault();
    const g = parseIngLine(newItem);
    if (!g) return;
    s.setList([...items, { key: "m-" + uid(), name: g.item, unit: g.unit, qty: g.qty, aisle: g.aisle, from: [], have: false, got: false, manual: true }]);
    setNewItem("");
  }
  async function copy() {
    try { await navigator.clipboard.writeText(listText(items) || "Nothing left to buy!"); s.toast("List copied"); }
    catch { s.toast("Couldn't copy on this device."); }
  }

  const row = (i: ListItem) => (
    <div className={"item" + (i.got ? " got" : "") + (i.have ? " have" : "")} key={i.key}>
      {i.have ? <span className="cbspace" /> : <input type="checkbox" checked={i.got} onChange={() => patch(i.key, { got: !i.got })} aria-label={"Got " + i.name} />}
      <div className="nm"><b>{i.name}</b>{i.from?.length > 0 && <small>{i.from.join(", ")}</small>}</div>
      <label className="sr" htmlFor={"q-" + i.key}>Amount of {i.name}</label>
      <input className="q" key={amountText(i)} id={"q-" + i.key} defaultValue={amountText(i)} placeholder="amt" onBlur={(e) => { if (e.target.value !== amountText(i)) patch(i.key, { amount: e.target.value.trim() }); }} />
      <button className="iconbtn" onClick={() => patch(i.key, { have: !i.have, got: false })}>{i.have ? "Need it" : "Have it"}</button>
      <button className="iconbtn" onClick={() => s.setList(items.filter((x) => x.key !== i.key))} aria-label={"Delete " + i.name}>✕</button>
    </div>
  );

  return (
    <div className="section">
      <div className="titlebar">
        <div><h2>Shopping list</h2><p className="muted" style={{ margin: "4px 0 0" }}>{items.length ? `${left} to buy${have.length ? ` · ${have.length} already in the kitchen` : ""}` : "Plan some meals and make a list, or add items yourself."}</p></div>
        <div className="btns">
          {s.plan.length > 0 && <button className="btn" onClick={() => { s.setList(buildList(s.plan, s.recipeMap, items)); s.toast("List updated from your meal plan"); }}>Rebuild from meal plan</button>}
          {items.length > 0 && <button className="btn" onClick={copy}>Copy list</button>}
          {items.some((i) => i.got) && <button className="btn" onClick={() => s.setList(items.filter((i) => !i.got))}>Clear checked</button>}
        </div>
      </div>
      <form className="addrow" onSubmit={add}>
        <label className="sr" htmlFor="newItem">Add an item</label>
        <input id="newItem" value={newItem} onChange={(e) => setNewItem(e.target.value)} placeholder="Add an item, like paper towels or 2 lb apples" />
        <button className="btn primary" type="submit">Add</button>
      </form>
      {need.length > 0 ? (
        <div className="listpaper">{groups.map(([a, xs]) => <div className="aisle" key={a}><h3>{a}</h3>{xs.map(row)}</div>)}</div>
      ) : items.length > 0 ? <div className="notice">You have everything on the list.</div> : null}
      {have.length > 0 && <div><span className="label">Already have</span><div className="listpaper">{have.map(row)}</div></div>}
      {items.length > 0 && <p className="muted small" style={{ margin: 0 }}>Tap “Have it” for things already in your pantry. Tap an amount to change it.</p>}
    </div>
  );
}
