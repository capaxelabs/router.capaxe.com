import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import { html } from './shared.js';

export const ModelsList = () => {
  const [models, setModels] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

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

  const filteredModels = models?.filter(m => {
    if (filter === 'all') return true;
    return m.type === filter;
  });

  return html`
    <div class="bg-white rounded-xl shadow-lg p-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-800">Available Models</h2>
        
        <select
          value=${filter}
          onChange=${(e) => setFilter(e.target.value)}
          class="px-4 py-2 border-2 border-gray-200 rounded-lg text-sm focus:border-purple-500 outline-none"
        >
          <option value="all">All Models</option>
          <option value="image">Images Only</option>
          <option value="video">Videos Only</option>
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
        <div class="grid gap-4">
          ${filteredModels.map(model => html`
            <div class="border-2 border-gray-200 rounded-xl p-6 hover:border-purple-400 transition">
              <!-- Header -->
              <div class="flex items-start justify-between mb-3">
                <div>
                  <h3 class="text-lg font-bold text-gray-800">${model.id}</h3>
                  <span class="inline-block px-3 py-1 text-xs font-semibold rounded-full mt-2 ${
                    model.type === 'image' 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-green-100 text-green-800'
                  }">
                    ${model.type}
                  </span>
                </div>
                
                <!-- Arena Score -->
                <div class="text-right">
                  <div class="text-sm text-gray-500">Arena Score</div>
                  <div class="text-xl font-bold text-purple-600">
                    ${model.arena_score || 'N/A'}
                  </div>
                </div>
              </div>
              
              <!-- Providers and Pricing -->
              <div class="grid grid-cols-2 gap-4 mt-4 text-sm">
                <div>
                  <div class="text-gray-500 mb-1 font-semibold">Providers</div>
                  <div class="flex flex-wrap gap-1">
                    ${model.providers?.map(p => html`
                      <span class="px-2 py-1 bg-gray-100 rounded text-xs">
                        ${p.id}
                      </span>
                    `)}
                  </div>
                </div>
                
                <div>
                  <div class="text-gray-500 mb-1 font-semibold">Pricing</div>
                  <div class="flex flex-wrap gap-1">
                    ${model.providers?.map(p => html`
                      <span class="px-2 py-1 bg-green-50 text-green-700 rounded text-xs font-mono">
                        $${(p.pricing?.value || 0).toFixed(3)}
                      </span>
                    `)}
                  </div>
                </div>
              </div>
              
              <!-- Tags -->
              ${model.tags && model.tags.length > 0 && html`
                <div class="mt-4 flex flex-wrap gap-2">
                  ${model.tags.map(tag => html`
                    <span class="px-2 py-1 bg-purple-50 text-purple-700 rounded-full text-xs">
                      ${tag}
                    </span>
                  `)}
                </div>
              `}
            </div>
          `)}
        </div>
      `}
    </div>
  `;
};
