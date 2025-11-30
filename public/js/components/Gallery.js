import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import { html } from './shared.js';

export const Gallery = () => {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const apiKey = localStorage.getItem('apiKey') || '';
  const limit = 20;

  const loadItems = async (offset = 0) => {
    if (!apiKey) {
      setError('API key required');
      setLoading(false);
      return;
    }
    
    setLoading(true);
    
    try {
      const statusParam = statusFilter === 'all' ? '' : `&status=${statusFilter}`;
      const typeParam = typeFilter === 'all' ? '' : `&type=${typeFilter}`;
      const res = await fetch(
        `/v1/media?limit=${limit}&offset=${offset}${statusParam}${typeParam}`,
        { headers: { 'Authorization': 'Bearer ' + apiKey } }
      );
      
      if (!res.ok) throw new Error('Failed to load gallery');
      
      const data = await res.json();
      setItems(offset === 0 ? data.data : [...items, ...data.data]);
      setHasMore(data.pagination.hasMore);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    loadItems(0);
  }, [statusFilter, typeFilter]);

  const loadMore = () => {
    const newPage = page + 1;
    setPage(newPage);
    loadItems(newPage * limit);
  };

  return html`
    <div class="bg-white rounded-xl shadow-lg p-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-800 flex items-center">
          <span class="mr-2">📁</span> My Gallery
        </h2>
        
        <div class="flex gap-3">
          <!-- Type Filter -->
          <select
            value=${typeFilter}
            onChange=${(e) => {
              setTypeFilter(e.target.value);
              setPage(0);
            }}
            class="px-4 py-2 border-2 border-gray-200 rounded-lg text-sm focus:border-purple-500 outline-none"
          >
            <option value="all">All Media</option>
            <option value="image">Images Only</option>
            <option value="video">Videos Only</option>
          </select>
          
          <!-- Status Filter -->
          <select
            value=${statusFilter}
            onChange=${(e) => {
              setStatusFilter(e.target.value);
              setPage(0);
            }}
            class="px-4 py-2 border-2 border-gray-200 rounded-lg text-sm focus:border-purple-500 outline-none"
          >
            <option value="all">All Status</option>
            <option value="completed">Completed</option>
            <option value="processing">Processing</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>
        </div>
      </div>
      
      <!-- Loading State -->
      ${loading && page === 0 && html`
        <div class="text-center py-12">
          <div class="spinner mb-4"></div>
          <p class="text-gray-600">Loading gallery...</p>
        </div>
      `}
      
      <!-- Error State -->
      ${error && html`
        <div class="bg-red-50 border-l-4 border-red-500 rounded-lg p-6 mb-4">
          <div class="flex items-start">
            <span class="text-2xl mr-3">❌</span>
            <div>
              <h4 class="font-semibold text-red-800 mb-1">Error</h4>
              <p class="text-red-700 text-sm">${error}</p>
            </div>
          </div>
        </div>
      `}
      
      <!-- Empty State -->
      ${!loading && items.length === 0 && html`
        <div class="text-center py-12 text-gray-400">
          <div class="text-6xl mb-4">📁</div>
          <p class="text-lg font-medium">No content yet</p>
          <p class="text-sm mt-2">Generate images or videos to see them here</p>
        </div>
      `}
      
      <!-- Gallery Grid -->
      ${items.length > 0 && html`
        <div>
          <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            ${items.map(item => html`
              <div class="border-2 border-gray-200 rounded-xl overflow-hidden hover:border-purple-400 transition">
                <!-- Media Display -->
                <div class="relative">
                  ${item.media && item.media.length > 0 
                    ? item.type === 'video' 
                      ? html`
                        <video 
                          src=${item.media[0]} 
                          controls 
                          class="w-full h-48 object-cover bg-black"
                        />
                      `
                      : html`<img src=${item.media[0]} alt=${item.prompt} class="w-full h-48 object-cover" />`
                    : html`
                      <div class="w-full h-48 bg-gray-100 flex items-center justify-center">
                        <span class="text-gray-400 text-4xl">${item.type === 'video' ? '🎬' : '🖼️'}</span>
                      </div>
                    `
                  }
                  
                  <!-- Type Badge -->
                  <div class="absolute top-2 left-2">
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${
                      item.type === 'video' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-purple-100 text-purple-800'
                    }">
                      ${item.type === 'video' ? '🎬 Video' : '🖼️ Image'}
                    </span>
                  </div>
                  
                  <!-- Status Badge -->
                  <div class="absolute top-2 right-2">
                    <span class="px-2 py-1 text-xs font-semibold rounded-full ${
                      item.taskStatus === 'completed' 
                        ? 'bg-green-100 text-green-800' 
                        : item.taskStatus === 'failed' 
                          ? 'bg-red-100 text-red-800' 
                          : 'bg-yellow-100 text-yellow-800'
                    }">
                      ${item.taskStatus}
                    </span>
                  </div>
                </div>
                
                <!-- Item Details -->
                <div class="p-4">
                  <div class="flex items-start justify-between mb-2">
                    <div class="flex-1">
                      <div class="text-xs text-gray-500 font-semibold mb-1">
                        ${item.model}
                      </div>
                      <p class="text-sm text-gray-700 line-clamp-2">${item.prompt}</p>
                    </div>
                  </div>
                  
                  <!-- Metadata -->
                  <div class="grid grid-cols-2 gap-2 mt-3 text-xs">
                    ${item.imageSize ? html`
                      <div>
                        <span class="text-gray-500">Size:</span> 
                        <span class="font-mono">${item.imageSize}</span>
                      </div>
                    ` : html`
                      <div>
                        <span class="text-gray-500">Type:</span> 
                        <span class="font-mono">${item.type}</span>
                      </div>
                    `}
                    <div>
                      <span class="text-gray-500">Cost:</span> 
                      <span class="font-mono text-green-600">$${item.cost.toFixed(4)}</span>
                    </div>
                  </div>
                  
                  <!-- Date -->
                  <div class="mt-3 text-xs text-gray-400">
                    ${new Date(item.createdAt).toLocaleDateString()}
                  </div>
                  
                  <!-- View Links -->
                  ${item.media && item.media.length > 0 && html`
                    <div class="mt-3 flex gap-2">
                      ${item.media.map(url => html`
                        <a
                          href=${url}
                          target="_blank"
                          class="flex-1 text-center bg-purple-600 text-white px-3 py-1 rounded text-xs hover:bg-purple-700 transition"
                        >
                          View
                        </a>
                      `)}
                    </div>
                  `}
                </div>
              </div>
            `)}
          </div>
          
          <!-- Load More Button -->
          ${hasMore && html`
            <div class="text-center mt-6">
              <button
                onClick=${loadMore}
                disabled=${loading}
                class="px-6 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition disabled:opacity-60"
              >
                ${loading ? 'Loading...' : 'Load More'}
              </button>
            </div>
          `}
        </div>
      `}
    </div>
  `;
};
