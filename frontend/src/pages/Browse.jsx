import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ItemCard from '../components/ItemCard.jsx';
import Pagination from '../components/Pagination.jsx';
import useLatest from '../hooks/useLatest.js';
import { browseItems, getColleges } from '../services/flowService.js';
import { getCategories } from '../services/itemService.js';
import { CONDITION_LABELS } from '../utils/format.js';

const SORTS = [['newest', 'Newest first'], ['price_asc', 'Price: low to high'], ['price_desc', 'Price: high to low'], ['ending_soon', 'Auctions ending soon']];
const TYPES = [['', 'All'], ['sale', 'For sale'], ['exchange', 'For exchange'], ['auction', 'Auctions']];

export default function Browse() {
  const [params, setParams] = useSearchParams();
  const latest = useLatest();
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [categories, setCategories] = useState([]);
  const [colleges, setColleges] = useState([]);
  const get = (k) => params.get(k) || '';
  const [draft, setDraft] = useState({ q: get('q'), minPrice: get('minPrice'), maxPrice: get('maxPrice'), college: get('college') });

  useEffect(() => { getCategories().then(setCategories).catch(() => {}); getColleges().then(setColleges).catch(() => {}); }, []);
  useEffect(() => { setDraft({ q: get('q'), minPrice: get('minPrice'), maxPrice: get('maxPrice'), college: get('college') }); /* eslint-disable-next-line */ }, [params]);
  useEffect(() => {
    setResult(null);
    latest(browseItems({ q: get('q'), category: get('category'), type: get('type'), condition: get('condition'), college: get('college'), minPrice: get('minPrice'), maxPrice: get('maxPrice'), sort: get('sort'), page: get('page') || 1, limit: 12 }))
      .then((r) => { setResult(r); setError(''); })
      .catch((e) => setError(e.message));
    /* eslint-disable-next-line */
  }, [params]);

  const update = (changes) => {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v === '' || v === undefined ? next.delete(k) : next.set(k, v)));
    if (!('page' in changes)) next.delete('page');
    setParams(next);
  };
  const applyDraft = (e) => { e.preventDefault(); update(draft); };
  const clearAll = () => setParams(new URLSearchParams());
  const hasFilters = [...params.keys()].some((k) => k !== 'page');
  const activeCategory = categories.find((c) => c.slug === get('category'));

  return (
    <div className="browse">
      <aside className="filters card">
        <form onSubmit={applyDraft}>
          <label>Search<input value={draft.q} onChange={(e) => setDraft({ ...draft, q: e.target.value })} placeholder="Name or keywords" /></label>

          <fieldset>
            <legend>Category</legend>
            <label className="radio"><input type="radio" name="cat" checked={!get('category')} onChange={() => update({ category: '' })} /> All categories</label>
            {categories.map((c) => (
              <label className="radio" key={c.id}><input type="radio" name="cat" checked={get('category') === c.slug} onChange={() => update({ category: c.slug })} /> {c.name}</label>
            ))}
          </fieldset>

          <fieldset>
            <legend>Listing type</legend>
            {TYPES.map(([v, l]) => <label className="radio" key={v}><input type="radio" name="type" checked={get('type') === v} onChange={() => update({ type: v })} /> {l}</label>)}
          </fieldset>

          <label>Condition
            <select value={get('condition')} onChange={(e) => update({ condition: e.target.value })}>
              <option value="">Any</option>
              {Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </label>

          <div className="row">
            <label>Min price<input type="number" min="0" value={draft.minPrice} onChange={(e) => setDraft({ ...draft, minPrice: e.target.value })} /></label>
            <label>Max price<input type="number" min="0" value={draft.maxPrice} onChange={(e) => setDraft({ ...draft, maxPrice: e.target.value })} /></label>
          </div>

          <label>College
            <input list="colleges" value={draft.college} onChange={(e) => setDraft({ ...draft, college: e.target.value })} placeholder="Any college" />
            <datalist id="colleges">{colleges.map((c) => <option key={c} value={c} />)}</datalist>
          </label>

          <button className="btn btn-primary">Apply filters</button>
          {hasFilters && <button type="button" className="btn btn-outline" onClick={clearAll}>Clear all</button>}
        </form>
      </aside>

      <section className="results">
        <div className="results-head">
          <div>
            <h2>{activeCategory ? activeCategory.name : 'All accessories'}</h2>
            {result && <span className="muted">{result.total} result{result.total === 1 ? '' : 's'}{get('q') ? ` for “${get('q')}”` : ''}</span>}
          </div>
          <label className="sort">Sort by
            <select value={get('sort') || 'newest'} onChange={(e) => update({ sort: e.target.value === 'newest' ? '' : e.target.value })}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {!result && !error && <p className="center-note">Loading…</p>}
        {result && result.items.length === 0 && <div className="card center"><p className="muted">No items match your search.</p>{hasFilters && <button className="btn btn-outline" onClick={clearAll}>Clear filters</button>}</div>}
        {result && result.items.length > 0 && (
          <>
            <div className="grid">{result.items.map((i) => <ItemCard key={i.id} item={i} />)}</div>
            <Pagination page={result.page} totalPages={result.totalPages} onChange={(p) => update({ page: String(p) })} />
          </>
        )}
      </section>
    </div>
  );
}
