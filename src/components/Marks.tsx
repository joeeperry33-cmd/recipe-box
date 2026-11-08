import { useStore } from "../lib/store";

// Your own 1-5 star rating. Tap the current star again to clear it.
export function Stars({ recipeId, title }: { recipeId: string; title: string }) {
  const s = useStore();
  const rating = s.marks.get(recipeId)?.rating ?? 0;
  return (
    <div className="stars" role="group" aria-label={"Your rating for " + title}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" className={n <= rating ? "on" : ""} aria-pressed={n <= rating}
          aria-label={`${n} star${n > 1 ? "s" : ""}`}
          onClick={() => s.setMark(recipeId, { rating: n === rating ? null : n })}>★</button>
      ))}
    </div>
  );
}

export function StarsShown({ rating }: { rating: number | null | undefined }) {
  if (!rating) return null;
  return <span className="stars-shown" aria-label={`Rated ${rating} of 5`}>{"★".repeat(rating)}<span className="dim">{"★".repeat(5 - rating)}</span></span>;
}

export function Heart({ recipeId, title, withText }: { recipeId: string; title: string; withText?: boolean }) {
  const s = useStore();
  const fav = !!s.marks.get(recipeId)?.favorite;
  return (
    <button type="button" className={(withText ? "btn" : "heart") + (fav ? " fav" : "")} aria-pressed={fav}
      aria-label={withText ? undefined : (fav ? "Remove from favorites: " : "Add to favorites: ") + title}
      onClick={() => { s.setMark(recipeId, { favorite: !fav }); s.toast(fav ? "Removed from favorites" : "Added to favorites"); }}>
      <span aria-hidden="true">{fav ? "♥" : "♡"}</span>{withText && (fav ? " Favorite" : " Add to favorites")}
    </button>
  );
}
