import { useState, useEffect, useCallback } from 'https://esm.sh/preact@10.19.3/hooks';
import { html } from './shared.js';

export const TasksViewer = () => {
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [apiKey, setApiKey] = useState(localStorage.getItem('apiKey') || '');

  const loadTasks = useCallback(async () => {
    if (!apiKey) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/v1/tasks', {
        headers: { 'Authorization': `Bearer ${apiKey}` }
      });

      if (!res.ok) throw new Error('Failed to fetch tasks');

      const data = await res.json();
      setTasks(data.tasks || []);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
    setLoading(false);
  }, [apiKey]);

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  const handleApiKeyChange = (e) => {
    const key = e.target.value;
    setApiKey(key);
    localStorage.setItem('apiKey', key);
  };

  const statusColors = {
    pending: 'bg-yellow-100 text-yellow-800',
    processing: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800'
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    return new Date(timestamp).toLocaleString();
  };

  const formatCost = (cost) => {
    if (!cost) return '$0.0000';
    return `$${(cost / 10000).toFixed(4)}`;
  };

  if (!apiKey) {
    return html`
      <div class="max-w-md mx-auto mt-12">
        <div class="bg-white rounded-xl shadow-lg p-8">
          <h2 class="text-xl font-bold text-gray-800 mb-4 text-center">Enter API Key</h2>
          <p class="text-gray-600 text-sm text-center mb-6">Your API key is required to view your generation tasks</p>
          <input
            type="password"
            value=${apiKey}
            onInput=${handleApiKeyChange}
            placeholder="Enter your API key..."
            class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none mb-4"
          />
          <button
            onClick=${loadTasks}
            class="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white py-3 rounded-lg font-semibold hover:from-purple-700 hover:to-pink-700"
          >
            View Tasks
          </button>
        </div>
      </div>
    `;
  }

  return html`
    <div>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-800">Your Tasks</h2>
        <button
          onClick=${loadTasks}
          class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm font-medium"
        >
          Refresh
        </button>
      </div>

      ${error && html`
        <div class="bg-red-50 border-l-4 border-red-500 p-4 rounded mb-6">
          <p class="text-red-700">${error}</p>
        </div>
      `}

      ${loading ? html`
        <div class="flex items-center justify-center h-64">
          <div class="spinner"></div>
        </div>
      ` : html`
        <div class="bg-white rounded-xl shadow-lg overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Model</th>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Prompt</th>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Cost</th>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Created</th>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Output</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              ${tasks.length === 0 ? html`
                <tr>
                  <td colspan="6" class="px-6 py-12 text-center text-gray-500">
                    No tasks found. Generate some images or videos to see them here.
                  </td>
                </tr>
              ` : tasks.map(task => html`
                <tr key=${task.id} class="hover:bg-gray-50">
                  <td class="px-6 py-4">
                    <span class="px-2 py-1 text-xs font-medium rounded-full ${statusColors[task.taskStatus] || 'bg-gray-100'}">
                      ${task.taskStatus}
                    </span>
                  </td>
                  <td class="px-6 py-4 font-medium text-gray-800 text-sm">${task.model}</td>
                  <td class="px-6 py-4 text-sm text-gray-600 truncate max-w-xs" title=${task.prompt}>
                    ${task.prompt?.substring(0, 50)}${task.prompt?.length > 50 ? '...' : ''}
                  </td>
                  <td class="px-6 py-4 font-mono text-sm text-gray-700">${formatCost(task.cost)}</td>
                  <td class="px-6 py-4 text-sm text-gray-500">${formatDate(task.createdAt)}</td>
                  <td class="px-6 py-4">
                    ${task.outputUrls ? html`
                      <div class="flex gap-1">
                        ${(() => {
                          try {
                            const urls = JSON.parse(task.outputUrls);
                            return urls.slice(0, 2).map((url, i) => html`
                              <a key=${i} href=${url} target="_blank" class="w-10 h-10 rounded overflow-hidden border hover:border-purple-500">
                                <img src=${url} class="w-full h-full object-cover" />
                              </a>
                            `);
                          } catch { return '-'; }
                        })()}
                        ${(() => {
                          try {
                            const urls = JSON.parse(task.outputUrls);
                            return urls.length > 2 ? html`<span class="text-xs text-gray-400 self-center">+${urls.length - 2}</span>` : '';
                          } catch { return ''; }
                        })()}
                      </div>
                    ` : '-'}
                  </td>
                </tr>
              `)}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
};
