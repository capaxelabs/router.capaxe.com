import { render } from 'https://esm.sh/preact@10.19.3';
import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import { html } from './components/shared.js';

// Import all components
import { Sidebar } from './components/Sidebar.js';
import { ImageGenerator } from './components/ImageGenerator.js';
import { VideoGenerator } from './components/VideoGenerator.js';
import { Gallery } from './components/Gallery.js';
import { ModelsList } from './components/ModelsList.js';
import { TasksViewer } from './components/TasksViewer.js';
import { AdminPanel } from './components/AdminPanel.js';

const VIEWS = ['images', 'videos', 'gallery', 'models', 'tasks', 'admin'];

const viewFromHash = () => {
  const view = window.location.hash.replace(/^#\/?/, '');
  return VIEWS.includes(view) ? view : 'images';
};

const LoginScreen = ({ onLogin, error }) => {
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!key || busy) return;
    setBusy(true);
    await onLogin(key);
    setBusy(false);
  };

  return html`
    <div class="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div class="bg-white rounded-xl shadow-lg p-8 w-full max-w-md">
        <h1 class="text-xl font-bold text-center mb-1 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
          🎨 ImageRouter
        </h1>
        <h2 class="text-2xl font-bold text-gray-800 mb-2 text-center">Dashboard Login</h2>
        <p class="text-gray-600 text-sm text-center mb-6">Enter the admin secret key to access the dashboard</p>
        ${error && html`
          <div class="bg-red-50 border border-red-200 text-red-700 p-3 rounded-lg text-sm mb-4 text-center">
            ${error}
          </div>
        `}
        <input
          type="password"
          value=${key}
          onInput=${e => setKey(e.target.value)}
          onKeyDown=${e => { if (e.key === 'Enter') submit(); }}
          placeholder="Admin secret key"
          class="w-full px-4 py-3 border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none mb-4"
        />
        <button
          onClick=${submit}
          disabled=${busy}
          class="w-full bg-purple-600 text-white py-3 rounded-lg font-semibold hover:bg-purple-700 transition disabled:opacity-50"
        >
          ${busy ? 'Checking...' : 'Login'}
        </button>
      </div>
    </div>
  `;
};

// Main App Component
export const App = () => {
  const [activeView, setActiveView] = useState(viewFromHash);
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(!!localStorage.getItem('adminKey'));
  const [loginError, setLoginError] = useState(null);
  const [adminKey, setAdminKey] = useState(localStorage.getItem('adminKey') || '');

  const login = async (key, silent = false) => {
    setLoginError(null);
    try {
      const res = await fetch('/admin/auth/verify', {
        headers: { 'Authorization': `Bearer ${key}` }
      });
      if (res.ok) {
        localStorage.setItem('adminKey', key);
        setAdminKey(key);
        setAuthed(true);
      } else {
        localStorage.removeItem('adminKey');
        if (!silent) setLoginError('Invalid admin key');
      }
    } catch (err) {
      if (!silent) setLoginError('Connection failed');
    }
    setChecking(false);
  };

  const logout = () => {
    localStorage.removeItem('adminKey');
    setAdminKey('');
    setAuthed(false);
  };

  useEffect(() => {
    const saved = localStorage.getItem('adminKey');
    if (saved) login(saved, true);

    if (!window.location.hash) {
      history.replaceState(null, '', `#/${viewFromHash()}`);
    }
    const onHashChange = () => setActiveView(viewFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (view) => {
    window.location.hash = `/${view}`;
  };

  if (checking) {
    return html`
      <div class="min-h-screen flex items-center justify-center bg-gray-50">
        <div class="spinner"></div>
      </div>
    `;
  }

  if (!authed) {
    return html`<${LoginScreen} onLogin=${login} error=${loginError} />`;
  }

  return html`
    <div class="flex min-h-screen bg-gray-50">
      <${Sidebar} activeView=${activeView} setActiveView=${navigate} onLogout=${logout} />

      <main class="ml-64 flex-1 p-6">
        ${activeView === 'images' && html`<${ImageGenerator} />`}
        ${activeView === 'videos' && html`<${VideoGenerator} />`}
        ${activeView === 'gallery' && html`<${Gallery} />`}
        ${activeView === 'models' && html`<${ModelsList} />`}
        ${activeView === 'tasks' && html`<${TasksViewer} />`}
        ${activeView === 'admin' && html`<${AdminPanel} adminKey=${adminKey} />`}
      </main>
    </div>
  `;
};

export { render, html };
