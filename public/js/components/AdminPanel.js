import { useState, useEffect, useCallback } from 'https://esm.sh/preact@10.19.3/hooks';
import { html } from './shared.js';

const Toast = ({ message, type, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 3000);
    return () => clearTimeout(timer);
  }, [onClose]);

  const bg = type === 'error' ? 'bg-red-600' : type === 'success' ? 'bg-green-600' : 'bg-gray-800';

  return html`
    <div class="fixed bottom-4 right-4 ${bg} text-white px-6 py-3 rounded-lg shadow-lg z-50">
      ${message}
    </div>
  `;
};

const ModelEditor = ({ model, onClose, onSave, adminKey }) => {
  const isNew = !model.id;
  const [form, setForm] = useState({
    id: model.id || '',
    name: model.name || '',
    slug: model.slug || '',
    type: model.type || 'image',
    status: model.status || 'active',
    releaseDate: model.releaseDate || new Date().toISOString().split('T')[0],
    providers: typeof model.providers === 'string' ? model.providers : JSON.stringify(model.providers || [{ id: 'gemini', model_name: '', pricing: { type: 'FIXED', value: 0.01 } }], null, 2),
    description: model.description || '',
    arenaScore: model.arenaScore || '',
    category: model.category || ''
  });
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);

    try {
      let providers;
      try {
        providers = JSON.parse(form.providers);
      } catch (e) {
        throw new Error('Invalid JSON in providers field');
      }

      const url = isNew ? '/admin/models' : `/admin/models/${encodeURIComponent(model.id)}`;
      const method = isNew ? 'POST' : 'PATCH';

      const body = {
        ...form,
        providers,
        arenaScore: form.arenaScore ? parseInt(form.arenaScore) : null
      };

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminKey}`
        },
        body: JSON.stringify(body)
      });

      const data = await res.json();

      if (data.success) {
        onSave();
      } else {
        setError(data.error || 'Failed to save model');
      }
    } catch (err) {
      setError(err.message);
    }

    setSaving(false);
  };

  return html`
    <div class="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick=${onClose}>
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick=${e => e.stopPropagation()}>
        <div class="p-6 border-b flex justify-between items-center sticky top-0 bg-white">
          <h2 class="text-xl font-bold text-gray-800">${isNew ? 'Add New Model' : 'Edit Model'}</h2>
          <button onClick=${onClose} class="text-gray-400 hover:text-gray-600 text-2xl font-light">×</button>
        </div>

        <div class="p-6 space-y-4">
          ${error && html`
            <div class="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm">
              ${error}
            </div>
          `}

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Model ID</label>
              <input
                value=${form.id}
                onInput=${e => setForm(f => ({ ...f, id: e.target.value }))}
                disabled=${!isNew}
                placeholder="provider/model-name"
                class="w-full px-3 py-2 border rounded-lg disabled:bg-gray-100 focus:border-purple-500 outline-none"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Display Name</label>
              <input
                value=${form.name}
                onInput=${e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="My Model"
                class="w-full px-3 py-2 border rounded-lg focus:border-purple-500 outline-none"
              />
            </div>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Slug</label>
              <input
                value=${form.slug}
                onInput=${e => setForm(f => ({ ...f, slug: e.target.value }))}
                placeholder="my-model"
                class="w-full px-3 py-2 border rounded-lg focus:border-purple-500 outline-none"
              />
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <input
                value=${form.category}
                onInput=${e => setForm(f => ({ ...f, category: e.target.value }))}
                placeholder="Google, Runware, etc."
                class="w-full px-3 py-2 border rounded-lg focus:border-purple-500 outline-none"
              />
            </div>
          </div>

          <div class="grid grid-cols-3 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select
                value=${form.type}
                onChange=${e => setForm(f => ({ ...f, type: e.target.value }))}
                class="w-full px-3 py-2 border rounded-lg focus:border-purple-500 outline-none"
              >
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value=${form.status}
                onChange=${e => setForm(f => ({ ...f, status: e.target.value }))}
                class="w-full px-3 py-2 border rounded-lg focus:border-purple-500 outline-none"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
                <option value="beta">Beta</option>
                <option value="deprecated">Deprecated</option>
              </select>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Arena Score</label>
              <input
                type="number"
                value=${form.arenaScore}
                onInput=${e => setForm(f => ({ ...f, arenaScore: e.target.value }))}
                placeholder="1350"
                class="w-full px-3 py-2 border rounded-lg focus:border-purple-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Release Date</label>
            <input
              type="date"
              value=${form.releaseDate}
              onInput=${e => setForm(f => ({ ...f, releaseDate: e.target.value }))}
              class="w-full px-3 py-2 border rounded-lg focus:border-purple-500 outline-none"
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Providers (JSON)</label>
            <textarea
              value=${form.providers}
              onInput=${e => setForm(f => ({ ...f, providers: e.target.value }))}
              rows="6"
              class="w-full px-3 py-2 border rounded-lg font-mono text-sm focus:border-purple-500 outline-none"
              placeholder='[{"id":"gemini","model_name":"...","pricing":{"type":"FIXED","value":0.01}}]'
            />
          </div>

          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Description</label>
            <textarea
              value=${form.description}
              onInput=${e => setForm(f => ({ ...f, description: e.target.value }))}
              rows="2"
              class="w-full px-3 py-2 border rounded-lg focus:border-purple-500 outline-none"
              placeholder="Model description..."
            />
          </div>

          <div class="flex justify-end gap-3 pt-4 border-t">
            <button
              onClick=${onClose}
              class="px-4 py-2 border rounded-lg hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              onClick=${save}
              disabled=${saving}
              class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 transition"
            >
              ${saving ? 'Saving...' : 'Save Model'}
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
};

export const AdminPanel = () => {
  const [models, setModels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const [adminKey, setAdminKey] = useState(localStorage.getItem('adminKey') || '');
  const [editing, setEditing] = useState(null);
  const [toast, setToast] = useState(null);
  const [filters, setFilters] = useState({ type: '', status: '', search: '' });

  const connect = async () => {
    if (!adminKey) return;

    localStorage.setItem('adminKey', adminKey);

    try {
      const res = await fetch('/admin/models/stats', {
        headers: { 'Authorization': `Bearer ${adminKey}` }
      });
      const data = await res.json();

      if (data.success) {
        setConnected(true);
        loadModels();
      } else {
        setToast({ message: 'Invalid admin key', type: 'error' });
      }
    } catch (err) {
      setToast({ message: 'Connection failed', type: 'error' });
    }
  };

  const loadModels = async () => {
    setLoading(true);
    try {
      const res = await fetch('/admin/models', {
        headers: { 'Authorization': `Bearer ${adminKey}` }
      });
      const data = await res.json();
      if (data.success) {
        setModels(data.models);
      }
    } catch (err) {
      setToast({ message: 'Failed to load models', type: 'error' });
    }
    setLoading(false);
  };

  const toggleStatus = async (model) => {
    const newStatus = model.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetch(`/admin/models/${encodeURIComponent(model.id)}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${adminKey}`
        },
        body: JSON.stringify({ status: newStatus })
      });
      const data = await res.json();
      if (data.success) {
        setToast({ message: `Model ${newStatus}`, type: 'success' });
        loadModels();
      }
    } catch (err) {
      setToast({ message: 'Failed to update status', type: 'error' });
    }
  };

  const deleteModel = async (model) => {
    if (!confirm(`Delete "${model.id}"? This will set it to inactive.`)) return;

    try {
      const res = await fetch(`/admin/models/${encodeURIComponent(model.id)}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${adminKey}` }
      });
      const data = await res.json();
      if (data.success) {
        setToast({ message: 'Model deleted', type: 'success' });
        loadModels();
      }
    } catch (err) {
      setToast({ message: 'Failed to delete model', type: 'error' });
    }
  };

  const filteredModels = models.filter(m => {
    if (filters.type && m.type !== filters.type) return false;
    if (filters.status && m.status !== filters.status) return false;
    if (filters.search) {
      const search = filters.search.toLowerCase();
      if (!m.id.toLowerCase().includes(search) && !(m.name || '').toLowerCase().includes(search)) {
        return false;
      }
    }
    return true;
  });

  const statusColors = {
    active: 'bg-green-100 text-green-800',
    inactive: 'bg-gray-100 text-gray-800',
    beta: 'bg-yellow-100 text-yellow-800',
    deprecated: 'bg-red-100 text-red-800'
  };

  if (!connected) {
    return html`
      <div class="max-w-md mx-auto mt-12">
        <div class="bg-white rounded-xl shadow-lg p-8">
          <h2 class="text-2xl font-bold text-gray-800 mb-6 text-center">Admin Authentication</h2>
          <p class="text-gray-600 text-sm text-center mb-6">Enter your admin API key to manage models</p>
          <input
            type="password"
            value=${adminKey}
            onInput=${e => setAdminKey(e.target.value)}
            placeholder="Enter Admin API Key"
            class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none mb-4"
          />
          <button
            onClick=${connect}
            class="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition"
          >
            Connect
          </button>
        </div>
      </div>
      ${toast && html`<${Toast} ...${toast} onClose=${() => setToast(null)} />`}
    `;
  }

  return html`
    <div>
      <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-gray-800">Model Management</h2>
        <div class="flex gap-3">
          <button
            onClick=${loadModels}
            class="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition text-sm font-medium"
          >
            Refresh
          </button>
          <button
            onClick=${() => setEditing({})}
            class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm font-medium"
          >
            + Add Model
          </button>
        </div>
      </div>

      <!-- Stats -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <div class="bg-purple-50 rounded-xl p-4 text-center">
          <div class="text-2xl font-bold text-purple-600">${models.length}</div>
          <div class="text-sm text-gray-500">Total Models</div>
        </div>
        <div class="bg-green-50 rounded-xl p-4 text-center">
          <div class="text-2xl font-bold text-green-600">${models.filter(m => m.status === 'active').length}</div>
          <div class="text-sm text-gray-500">Active</div>
        </div>
        <div class="bg-blue-50 rounded-xl p-4 text-center">
          <div class="text-2xl font-bold text-blue-600">${models.filter(m => m.type === 'image').length}</div>
          <div class="text-sm text-gray-500">Image Models</div>
        </div>
        <div class="bg-pink-50 rounded-xl p-4 text-center">
          <div class="text-2xl font-bold text-pink-600">${models.filter(m => m.type === 'video').length}</div>
          <div class="text-sm text-gray-500">Video Models</div>
        </div>
      </div>

      <!-- Filters -->
      <div class="bg-white rounded-xl shadow-lg p-4 mb-6">
        <div class="flex flex-wrap items-center gap-4">
          <input
            type="text"
            value=${filters.search}
            onInput=${e => setFilters(f => ({ ...f, search: e.target.value }))}
            placeholder="Search models..."
            class="flex-1 min-w-48 px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none"
          />
          <select
            value=${filters.type}
            onChange=${e => setFilters(f => ({ ...f, type: e.target.value }))}
            class="px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none"
          >
            <option value="">All Types</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
          </select>
          <select
            value=${filters.status}
            onChange=${e => setFilters(f => ({ ...f, status: e.target.value }))}
            class="px-4 py-2 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="beta">Beta</option>
            <option value="deprecated">Deprecated</option>
          </select>
        </div>
      </div>

      <!-- Models Table -->
      ${loading ? html`
        <div class="flex justify-center py-12">
          <div class="spinner"></div>
        </div>
      ` : html`
        <div class="bg-white rounded-xl shadow-lg overflow-hidden">
          <table class="w-full">
            <thead class="bg-gray-50">
              <tr>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Model</th>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                <th class="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Providers</th>
                <th class="px-6 py-4 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-200">
              ${filteredModels.length === 0 ? html`
                <tr>
                  <td colspan="5" class="px-6 py-12 text-center text-gray-500">
                    No models found
                  </td>
                </tr>
              ` : filteredModels.map(model => {
                const providers = (() => {
                  try {
                    return typeof model.providers === 'string' ? JSON.parse(model.providers) : model.providers || [];
                  } catch { return []; }
                })();

                return html`
                  <tr key=${model.id} class="hover:bg-gray-50">
                    <td class="px-6 py-4">
                      <div class="font-medium text-gray-800">${model.id}</div>
                      <div class="text-sm text-gray-500">${model.name}</div>
                    </td>
                    <td class="px-6 py-4">
                      <span class="px-2 py-1 text-xs font-medium rounded-full ${model.type === 'image' ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'}">
                        ${model.type}
                      </span>
                    </td>
                    <td class="px-6 py-4">
                      <span class="px-2 py-1 text-xs font-medium rounded-full ${statusColors[model.status] || 'bg-gray-100'}">
                        ${model.status}
                      </span>
                    </td>
                    <td class="px-6 py-4">
                      <div class="flex flex-wrap gap-1">
                        ${providers.map(p => html`
                          <span key=${p.id} class="px-2 py-1 bg-gray-100 text-xs rounded">${p.id}</span>
                        `)}
                      </div>
                    </td>
                    <td class="px-6 py-4 text-right">
                      <div class="flex justify-end gap-2">
                        <button
                          onClick=${() => setEditing(model)}
                          class="px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded hover:bg-blue-100 transition"
                        >
                          Edit
                        </button>
                        <button
                          onClick=${() => toggleStatus(model)}
                          class="px-3 py-1 text-sm ${model.status === 'active' ? 'bg-yellow-50 text-yellow-600' : 'bg-green-50 text-green-600'} rounded hover:opacity-80 transition"
                        >
                          ${model.status === 'active' ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick=${() => deleteModel(model)}
                          class="px-3 py-1 text-sm bg-red-50 text-red-600 rounded hover:bg-red-100 transition"
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
              })}
            </tbody>
          </table>
        </div>
      `}
    </div>

    ${editing && html`
      <${ModelEditor}
        model=${editing}
        adminKey=${adminKey}
        onClose=${() => setEditing(null)}
        onSave=${() => {
          setEditing(null);
          loadModels();
          setToast({ message: 'Model saved', type: 'success' });
        }}
      />
    `}

    ${toast && html`<${Toast} ...${toast} onClose=${() => setToast(null)} />`}
  `;
};
