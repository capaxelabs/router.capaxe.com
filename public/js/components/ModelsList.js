import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import { html } from './shared.js';

const TYPE_STYLES = {
  image: 'bg-blue-100 text-blue-700',
  video: 'bg-green-100 text-green-700',
  text: 'bg-purple-100 text-purple-700',
};

const formatPrice = (p) => {
  const value = p?.value || 0;
  const price = value < 0.01
    ? `$${value.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')}`
    : `$${value.toFixed(2).replace(/\.00$/, '')}`;
  return p?.unit === 'per_1m_tokens' ? `${price}/1M tok` : price;
};

export const ModelsList = () => {
  const [models, setModels] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('default');

  useEffect(() => {
    fetch('/v1/models')
      .then(r => r.json())
      .then(data => {
        const modelsList = Object.entries(data).map(([id, model]) => ({
          id,
          ...model
        }));
        setModels(modelsList);
        setLoading(false);
      })
      .catch(err => {
        console.error('Error loading models:', err);
        setLoading(false);
      });
  }, []);

  const priceOf = (m) => m.providers?.[0]?.pricing?.value || 0;
  const nameOf = (m) => m.name || m.id;

  const filteredModels = models?.filter(m => {
    if (filter !== 'all' && m.type !== filter) return false;
    if (search) {
      const q = search.toLowerCase();
      return m.id.toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => {
    switch (sort) {
      case 'name-asc': return nameOf(a).localeCompare(nameOf(b));
      case 'name-desc': return nameOf(b).localeCompare(nameOf(a));
      case 'price-asc': return priceOf(a) - priceOf(b);
      case 'price-desc': return priceOf(b) - priceOf(a);
      default: return 0;
    }
  });

  return html`
    <div class="bg-white rounded-xl shadow-lg p-4">
      <!-- Header -->
      <div class="flex flex-wrap items-center gap-2 mb-3">
        <h2 class="text-lg font-bold text-gray-800 mr-auto">
          Models
          ${filteredModels && html`<span class="ml-2 text-sm font-normal text-gray-400">${filteredModels.length}</span>`}
        </h2>

        <input
          type="text"
          placeholder="Search models..."
          value=${search}
          onInput=${(e) => setSearch(e.target.value)}
          class="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:border-purple-500 outline-none w-52"
        />

        <select
          value=${filter}
          onChange=${(e) => setFilter(e.target.value)}
          class="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:border-purple-500 outline-none"
        >
          <option value="all">All</option>
          <option value="image">Image</option>
          <option value="video">Video</option>
          <option value="text">Text</option>
        </select>

        <select
          value=${sort}
          onChange=${(e) => setSort(e.target.value)}
          class="px-3 py-1.5 border border-gray-200 rounded-lg text-sm focus:border-purple-500 outline-none"
        >
          <option value="default">Sort: Default</option>
          <option value="name-asc">Name A–Z</option>
          <option value="name-desc">Name Z–A</option>
          <option value="price-asc">Price ↑</option>
          <option value="price-desc">Price ↓</option>
        </select>
      </div>

      <!-- Loading State -->
      ${loading && html`
        <div class="text-center py-12">
          <div class="spinner mb-4"></div>
          <p class="text-gray-600">Loading models...</p>
        </div>
      `}

      <!-- Models List -->
      ${!loading && filteredModels && html`
        <div class="divide-y divide-gray-100">
          ${filteredModels.map(model => html`
            <div class="flex items-center gap-3 py-1.5 px-2 hover:bg-gray-50 rounded transition text-sm">
              <span class="shrink-0 w-12 text-center px-1.5 py-0.5 text-[10px] font-semibold rounded uppercase ${TYPE_STYLES[model.type] || 'bg-gray-100 text-gray-600'}">
                ${model.type}
              </span>

              <span class="font-mono text-gray-800 truncate" title=${model.description || model.id}>
                ${model.id}
              </span>

              ${model.category && html`
                <span class="hidden md:inline text-xs text-gray-400 truncate shrink-0">
                  ${model.category}
                </span>
              `}

              <span class="ml-auto shrink-0 font-mono text-xs text-green-700">
                ${formatPrice(model.providers?.[0]?.pricing)}
              </span>
            </div>
          `)}

          ${filteredModels.length === 0 && html`
            <p class="text-center text-gray-400 py-8 text-sm">No models match</p>
          `}
        </div>
      `}
    </div>
  `;
};
