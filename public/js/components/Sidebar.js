import { html } from './shared.js';

export const Sidebar = ({ activeView, setActiveView }) => html`
  <div class="w-64 bg-white h-screen fixed left-0 top-0 shadow-xl overflow-y-auto z-10">
    <div class="p-6 border-b border-gray-200">
      <h1 class="text-xl font-bold bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
        🎨 ImageRouter
      </h1>
      <p class="text-xs text-gray-500 mt-1">API Playground</p>
    </div>
    
    <nav class="p-4">
      <div class="mb-6">
        <h3 class="text-xs font-semibold text-gray-500 uppercase mb-3 px-3">Generate</h3>
        
        <button 
          onClick=${() => setActiveView('images')} 
          class="w-full text-left px-4 py-3 rounded-lg mb-2 transition ${
            activeView === 'images' 
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md' 
              : 'text-gray-700 hover:bg-gray-100'
          }"
        >
          <div class="flex items-center">
            <span class="text-lg mr-3">🖼️</span>
            <div>
              <div class="font-semibold text-sm">Images</div>
              <div class="text-xs opacity-75">Generate AI images</div>
            </div>
          </div>
        </button>
        
        <button 
          onClick=${() => setActiveView('videos')} 
          class="w-full text-left px-4 py-3 rounded-lg mb-2 transition ${
            activeView === 'videos' 
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md' 
              : 'text-gray-700 hover:bg-gray-100'
          }"
        >
          <div class="flex items-center">
            <span class="text-lg mr-3">🎬</span>
            <div>
              <div class="font-semibold text-sm">Videos</div>
              <div class="text-xs opacity-75">Generate AI videos</div>
            </div>
          </div>
        </button>
      </div>
      
      <div class="mb-6">
        <h3 class="text-xs font-semibold text-gray-500 uppercase mb-3 px-3">Library</h3>
        
        <button 
          onClick=${() => setActiveView('gallery')} 
          class="w-full text-left px-4 py-3 rounded-lg mb-2 transition ${
            activeView === 'gallery' 
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md' 
              : 'text-gray-700 hover:bg-gray-100'
          }"
        >
          <div class="flex items-center">
            <span class="text-lg mr-3">📁</span>
            <div>
              <div class="font-semibold text-sm">Gallery</div>
              <div class="text-xs opacity-75">View my images</div>
            </div>
          </div>
        </button>
      </div>
      
      <div class="mb-6">
        <h3 class="text-xs font-semibold text-gray-500 uppercase mb-3 px-3">Resources</h3>
        
        <button 
          onClick=${() => setActiveView('models')} 
          class="w-full text-left px-4 py-3 rounded-lg mb-2 transition ${
            activeView === 'models' 
              ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-md' 
              : 'text-gray-700 hover:bg-gray-100'
          }"
        >
          <div class="flex items-center">
            <span class="text-lg mr-3">⚙️</span>
            <div>
              <div class="font-semibold text-sm">Models</div>
              <div class="text-xs opacity-75">Browse all models</div>
            </div>
          </div>
        </button>
      </div>
    </nav>
  </div>
`;
