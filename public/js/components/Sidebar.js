import { html } from './shared.js';

const NavButton = ({ view, activeView, setActiveView, icon, label, desc }) => html`
  <a
    href="#/${view}"
    onClick=${() => setActiveView(view)}
    class="block w-full text-left px-4 py-3 rounded-lg mb-2 transition ${
      activeView === view
        ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md'
        : 'text-gray-700 hover:bg-gray-100'
    }"
  >
    <div class="flex items-center">
      <span class="text-lg mr-3">${icon}</span>
      <div>
        <div class="font-semibold text-sm">${label}</div>
        <div class="text-xs opacity-75">${desc}</div>
      </div>
    </div>
  </a>
`;

export const Sidebar = ({ activeView, setActiveView }) => html`
  <div class="w-64 bg-white h-screen fixed left-0 top-0 shadow-xl overflow-y-auto z-10">
    <div class="p-6 border-b border-gray-200">
      <h1 class="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
        🎨 ImageRouter
      </h1>
      <p class="text-xs text-gray-500 mt-1">AI Generation API</p>
    </div>

    <nav class="p-4">
      <div class="mb-6">
        <h3 class="text-xs font-semibold text-gray-500 uppercase mb-3 px-3">Generate</h3>
        <${NavButton} view="images" activeView=${activeView} setActiveView=${setActiveView} icon="🖼️" label="Images" desc="Generate AI images" />
        <${NavButton} view="videos" activeView=${activeView} setActiveView=${setActiveView} icon="🎬" label="Videos" desc="Generate AI videos" />
      </div>

      <div class="mb-6">
        <h3 class="text-xs font-semibold text-gray-500 uppercase mb-3 px-3">Library</h3>
        <${NavButton} view="gallery" activeView=${activeView} setActiveView=${setActiveView} icon="📁" label="Gallery" desc="View my media" />
        <${NavButton} view="tasks" activeView=${activeView} setActiveView=${setActiveView} icon="📊" label="Tasks" desc="View generations" />
      </div>

      <div class="mb-6">
        <h3 class="text-xs font-semibold text-gray-500 uppercase mb-3 px-3">Resources</h3>
        <${NavButton} view="models" activeView=${activeView} setActiveView=${setActiveView} icon="📋" label="Models" desc="Browse all models" />
        <${NavButton} view="admin" activeView=${activeView} setActiveView=${setActiveView} icon="⚙️" label="Admin" desc="Manage models" />
      </div>
    </nav>
  </div>
`;
