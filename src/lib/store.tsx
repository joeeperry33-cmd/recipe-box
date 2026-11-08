import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import type { ListItem, PlanEntry, Recipe } from "./recipes";

export type Profile = { id: string; email: string; display_name: string; share_box: boolean };
export type Friendship = { id: string; requester: string; addressee: string; status: "pending" | "accepted" };
export type RecipeRequest = { id: string; from_user: string; to_user: string; note: string; status: "open" | "sent" | "declined"; recipe_id: string | null; created_at: string };
export type Mark = { rating: number | null; favorite: boolean };
export type Share = { recipe_id: string; shared_with: string; shared_by: string };

type Store = {
  session: Session | null;
  ready: boolean;
  me: Profile | null;
  recipes: Recipe[];
  recipeMap: Map<string, Recipe>;
  people: Map<string, Profile>;
  friendships: Friendship[];
  shares: Share[];
  marks: Map<string, Mark>;
  requests: RecipeRequest[];
  setMark: (recipeId: string, p: Partial<Mark>) => void;
  plan: PlanEntry[];
  list: ListItem[];
  loading: boolean;
  error: string;
  reload: () => Promise<void>;
  setPlan: (p: PlanEntry[]) => void;
  setList: (l: ListItem[]) => void;
  upsertRecipeLocal: (r: Recipe) => void;
  removeRecipeLocal: (id: string) => void;
  setMe: (p: Profile) => void;
  toast: (msg: string) => void;
  toastMsg: string;
};

const Ctx = createContext<Store | null>(null);
export const useStore = () => { const s = useContext(Ctx); if (!s) throw new Error("no store"); return s; };
export const nameOf = (p?: Profile | null) => p?.display_name || p?.email || "A friend";

export function StoreProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [me, setMe] = useState<Profile | null>(null);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [people, setPeople] = useState<Map<string, Profile>>(new Map());
  const [friendships, setFriendships] = useState<Friendship[]>([]);
  const [shares, setShares] = useState<Share[]>([]);
  const [requests, setRequests] = useState<RecipeRequest[]>([]);
  const [marks, setMarks] = useState<Map<string, Mark>>(new Map());
  const [plan, setPlanState] = useState<PlanEntry[]>([]);
  const [list, setListState] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toastMsg, setToast] = useState("");
  const toastTimer = useRef<number>(0);
  const toast = useCallback((m: string) => {
    setToast(m); window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 2800);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  const userId = session?.user.id;
  const reload = useCallback(async () => {
    if (!userId) return;
    setLoading(true); setError("");
    const [prof, rec, fr, sh, pl, li, mk, rq] = await Promise.all([
      supabase.from("profiles").select("id,email,display_name,share_box"),
      supabase.from("recipes").select("*").order("title"),
      supabase.from("friendships").select("id,requester,addressee,status"),
      supabase.from("recipe_shares").select("recipe_id,shared_with,shared_by"),
      supabase.from("meal_plans").select("entries").eq("user_id", userId).maybeSingle(),
      supabase.from("shopping_lists").select("items").eq("user_id", userId).maybeSingle(),
      supabase.from("recipe_marks").select("recipe_id,rating,favorite").eq("user_id", userId),
      supabase.from("recipe_requests").select("id,from_user,to_user,note,status,recipe_id,created_at").order("created_at", { ascending: false }),
    ]);
    const err = [prof, rec, fr, sh, pl, li, mk, rq].find((r) => r.error)?.error;
    if (err) setError("Couldn't load your recipe box. Check your connection and try again.");
    const ps = (prof.data ?? []) as Profile[];
    setPeople(new Map(ps.map((p) => [p.id, p])));
    setMe(ps.find((p) => p.id === userId) ?? null);
    setRecipes((rec.data ?? []) as Recipe[]);
    setFriendships((fr.data ?? []) as Friendship[]);
    setShares((sh.data ?? []) as Share[]);
    setRequests((rq.data ?? []) as RecipeRequest[]);
    setMarks(new Map((mk.data ?? []).map((m) => [m.recipe_id as string, { rating: m.rating as number | null, favorite: !!m.favorite }])));
    if (pl.data) setPlanState(pl.data.entries as PlanEntry[]);
    if (li.data) setListState(li.data.items as ListItem[]);
    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!userId) { setRecipes([]); setMarks(new Map()); setRequests([]); setMe(null); setPlanState([]); setListState([]); return; }
    reload();
    const onFocus = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onFocus);
    return () => document.removeEventListener("visibilitychange", onFocus);
  }, [userId, reload]);

  // Plan and list save shortly after each change, one write at a time.
  const saveTimers = useRef<Record<string, number>>({});
  const save = useCallback((table: "meal_plans" | "shopping_lists", field: "entries" | "items", value: unknown) => {
    if (!userId) return;
    window.clearTimeout(saveTimers.current[table]);
    saveTimers.current[table] = window.setTimeout(async () => {
      const { error } = await supabase.from(table).upsert({ user_id: userId, [field]: value, updated_at: new Date().toISOString() });
      if (error) toast("Couldn't save. Check your connection.");
    }, 600);
  }, [userId, toast]);
  const setPlan = useCallback((p: PlanEntry[]) => { setPlanState(p); save("meal_plans", "entries", p); }, [save]);
  const setList = useCallback((l: ListItem[]) => { setListState(l); save("shopping_lists", "items", l); }, [save]);

  // Star ratings and favorites are personal: each person keeps their own for any recipe they can see.
  const marksRef = useRef(marks);
  marksRef.current = marks;
  const setMark = useCallback(async (recipeId: string, p: Partial<Mark>) => {
    if (!userId) return;
    const next: Mark = { ...(marksRef.current.get(recipeId) ?? { rating: null, favorite: false }), ...p };
    const n = new Map(marksRef.current); n.set(recipeId, next); marksRef.current = n; setMarks(n);
    const { error } = await supabase.from("recipe_marks").upsert({ user_id: userId, recipe_id: recipeId, rating: next.rating, favorite: next.favorite, updated_at: new Date().toISOString() });
    if (error) toast("Couldn't save. Check your connection.");
  }, [userId, toast]);

  const upsertRecipeLocal = useCallback((r: Recipe) => setRecipes((rs) => {
    const i = rs.findIndex((x) => x.id === r.id);
    return i >= 0 ? rs.map((x) => (x.id === r.id ? r : x)) : [...rs, r];
  }), []);
  const removeRecipeLocal = useCallback((id: string) => setRecipes((rs) => rs.filter((r) => r.id !== id)), []);

  const recipeMap = useMemo(() => new Map(recipes.map((r) => [r.id, r])), [recipes]);

  const value: Store = {
    session, ready, me, recipes, recipeMap, people, friendships, shares, marks, setMark, requests, plan, list, loading, error,
    reload, setPlan, setList, upsertRecipeLocal, removeRecipeLocal, setMe, toast, toastMsg,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
