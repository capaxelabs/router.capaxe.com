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

// Main App Component
export const App = () => {
  const [activeView, setActiveView] = useState(viewFromHash);

  useEffect(() => {
    if (!window.location.hash) {
      history.replaceState(null, '', `#/${activeView}`);
    }
    const onHashChange = () => setActiveView(viewFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  const navigate = (view) => {
    window.location.hash = `/${view}`;
  };

  return html`
    <div class="flex min-h-screen bg-gray-50">
      <${Sidebar} activeView=${activeView} setActiveView=${navigate} />

      <main class="ml-64 flex-1 p-6">
        ${activeView === 'images' && html`<${ImageGenerator} />`}
        ${activeView === 'videos' && html`<${VideoGenerator} />`}
        ${activeView === 'gallery' && html`<${Gallery} />`}
        ${activeView === 'models' && html`<${ModelsList} />`}
        ${activeView === 'tasks' && html`<${TasksViewer} />`}
        ${activeView === 'admin' && html`<${AdminPanel} />`}
      </main>
    </div>
  `;
};

export { render, html };
