import { useState } from 'https://esm.sh/preact@10.19.3/hooks';
import { html } from './shared.js';

export const VideoGenerator = () => {
  const [formData, setFormData] = useState({
    model: 'google/veo-2',
    prompt: '',
    duration: 5,
    resolution: '720p',
    apiKey: localStorage.getItem('apiKey') || ''
  });
  
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [polling, setPolling] = useState(false);
  const [progress, setProgress] = useState(0);
  const [inputImages, setInputImages] = useState([]);
  const [inputImagePreviews, setInputImagePreviews] = useState([]);

  const updateForm = (key, value) => {
    setFormData({ ...formData, [key]: value });
    if (key === 'apiKey') localStorage.setItem('apiKey', value);
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;
    
    for (const file of files) {
      // Show preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setInputImagePreviews(prev => [...prev, e.target.result]);
      };
      reader.readAsDataURL(file);
      
      // Convert to base64 for API
      const base64Reader = new FileReader();
      base64Reader.onload = (e) => {
        const base64 = e.target.result.split(',')[1]; // Remove data:image/...;base64, prefix
        setInputImages(prev => [...prev, {
          data: base64,
          type: file.type,
          filename: file.name
        }]);
      };
      base64Reader.readAsDataURL(file);
    }
    
    // Reset input so same files can be added again
    e.target.value = '';
  };

  const removeImage = (index) => {
    setInputImages(prev => prev.filter((_, i) => i !== index));
    setInputImagePreviews(prev => prev.filter((_, i) => i !== index));
  };

  const clearAllImages = () => {
    setInputImages([]);
    setInputImagePreviews([]);
  };

  const pollTask = async (id) => {
    setPolling(true);
    const maxAttempts = 120;
    let attempts = 0;
    
    const poll = async () => {
      try {
        const res = await fetch('/v1/tasks/' + id, {
          headers: { 'Authorization': 'Bearer ' + formData.apiKey }
        });
        
        if (!res.ok) throw new Error('Failed to fetch task status');
        
        const data = await res.json();
        
        if (data.progress) setProgress(data.progress);
        
        if (data.status === 'completed' && data.result) {
          setResult(data.result);
          setPolling(false);
          setLoading(false);
        } else if (data.status === 'failed') {
          setError(data.error || 'Task failed');
          setPolling(false);
          setLoading(false);
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 3000);
        } else {
          setError('Polling timeout');
          setPolling(false);
          setLoading(false);
        }
      } catch (err) {
        setError(err.message);
        setPolling(false);
        setLoading(false);
      }
    };
    
    poll();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    setTaskId(null);
    setProgress(0);
    
    try {
      const requestBody = {
        model: formData.model,
        prompt: formData.prompt,
        duration: parseInt(formData.duration),
        resolution: formData.resolution
      };
      
      // Add input images if provided
      if (inputImages.length > 0) {
        requestBody.image = inputImages.length === 1 ? inputImages[0] : inputImages;
      }
      
      const res = await fetch('/v1/videos/generations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + formData.apiKey
        },
        body: JSON.stringify(requestBody)
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error?.message || data.error || 'Request failed');
      }
      
      if (data.taskId) {
        setTaskId(data.taskId);
        await pollTask(data.taskId);
      } else {
        setResult(data);
        setLoading(false);
      }
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return html`
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Settings Panel -->
      <div class="lg:col-span-1">
        <div class="bg-white rounded-xl shadow-lg p-6 sticky top-6">
          <h2 class="text-lg font-bold text-gray-800 mb-4 flex items-center">
            <span class="mr-2">🎬</span> Video Settings
          </h2>
          
          <form onSubmit=${handleSubmit} class="space-y-4">
            <!-- API Key -->
            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-2 uppercase">
                API Key
              </label>
              <input
                type="password"
                value=${formData.apiKey}
                onInput=${(e) => updateForm('apiKey', e.target.value)}
                placeholder="Enter your API key"
                required
                class="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition"
              />
            </div>
            
            <!-- Model Selection -->
            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-2 uppercase">
                Model
              </label>
              <select
                value=${formData.model}
                onChange=${(e) => updateForm('model', e.target.value)}
                class="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition"
              >
                <optgroup label="Google Veo">
                  <option value="google/veo-2">Veo 2</option>
                  <option value="google/veo-3">Veo 3</option>
                  <option value="google/veo-3-fast">Veo 3 Fast</option>
                </optgroup>
              </select>
            </div>
            
            <!-- Duration and Resolution -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-600 mb-2 uppercase">
                  Duration (s)
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value=${formData.duration}
                  onInput=${(e) => updateForm('duration', e.target.value)}
                  class="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition"
                />
              </div>
              
              <div>
                <label class="block text-xs font-semibold text-gray-600 mb-2 uppercase">
                  Resolution
                </label>
                <select
                  value=${formData.resolution}
                  onChange=${(e) => updateForm('resolution', e.target.value)}
                  class="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition"
                >
                  <option value="480p">480p</option>
                  <option value="720p">720p</option>
                  <option value="1080p">1080p</option>
                </select>
              </div>
            </div>
            
            <!-- Prompt -->
            <div>
              <label class="block text-xs font-semibold text-gray-600 mb-2 uppercase">
                Prompt
              </label>
              <textarea
                value=${formData.prompt}
                onInput=${(e) => updateForm('prompt', e.target.value)}
                placeholder="A drone shot of waves crashing..."
                required
                rows="4"
                class="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition resize-none"
              />
            </div>
            
            <!-- Input Images (Optional) -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <label class="block text-xs font-semibold text-gray-600 uppercase">
                  Input Images (Optional)
                </label>
                ${inputImages.length > 0 && html`
                  <button
                    type="button"
                    onClick=${clearAllImages}
                    class="text-xs text-red-600 hover:text-red-700 font-medium"
                  >
                    Clear All
                  </button>
                `}
              </div>
              
              ${inputImagePreviews.length > 0 && html`
                <div class="grid grid-cols-2 gap-2 mb-2">
                  ${inputImagePreviews.map((preview, index) => html`
                    <div class="relative group">
                      <img 
                        src=${preview} 
                        class="w-full h-20 object-cover rounded-lg border-2 border-gray-200"
                        alt="Input preview ${index + 1}"
                      />
                      <button
                        type="button"
                        onClick=${() => removeImage(index)}
                        class="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold hover:bg-red-600 transition opacity-0 group-hover:opacity-100"
                      >
                        ×
                      </button>
                      <div class="absolute bottom-1 left-1 bg-black bg-opacity-60 text-white text-xs px-1.5 py-0.5 rounded">
                        ${index + 1}
                      </div>
                    </div>
                  `)}
                </div>
              `}
              
              <label class="w-full px-4 py-6 border-2 border-dashed border-gray-300 rounded-lg hover:border-purple-500 transition cursor-pointer flex flex-col items-center justify-center text-center">
                <span class="text-2xl mb-1">🎬</span>
                <span class="text-xs text-gray-600">Click to add image(s)</span>
                <span class="text-xs text-gray-400 mt-1">Multiple images supported</span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  onChange=${handleImageUpload}
                  class="hidden"
                />
              </label>
            </div>
            
            <!-- Submit Button -->
            <button
              type="submit"
              disabled=${loading}
              class="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-purple-700 hover:to-pink-700 transition transform hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none shadow-lg text-sm"
            >
              ${loading ? '⏳ Generating...' : '🎬 Generate Video'}
            </button>
          </form>
        </div>
      </div>
      
      <!-- Results Panel -->
      <div class="lg:col-span-2">
        <div class="bg-white rounded-xl shadow-lg p-6 min-h-[600px]">
          <h2 class="text-lg font-bold text-gray-800 mb-4">Generated Videos</h2>
          
          <!-- Loading State -->
          ${loading && html`
            <div class="flex items-center justify-center h-96 bg-purple-50 rounded-lg">
              <div class="text-center">
                <div class="spinner mb-4"></div>
                <p class="text-gray-700 font-medium mb-2">
                  ${polling 
                    ? html`<span>Polling task: <span class="font-mono text-purple-600">${taskId}</span></span>` 
                    : 'Submitting request...'
                  }
                </p>
                ${progress > 0 && html`
                  <div class="max-w-md mx-auto mt-4">
                    <div class="bg-gray-200 rounded-full h-2 overflow-hidden">
                      <div 
                        class="gradient-animate h-full transition-all duration-500" 
                        style="width: ${progress}%"
                      ></div>
                    </div>
                    <p class="text-sm text-gray-600 mt-2">${progress}% complete</p>
                  </div>
                `}
              </div>
            </div>
          `}
          
          <!-- Error State -->
          ${error && html`
            <div class="bg-red-50 border-l-4 border-red-500 rounded-lg p-6">
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
          ${!loading && !error && !result && html`
            <div class="flex items-center justify-center h-96">
              <div class="text-center text-gray-400">
                <div class="text-6xl mb-4">🎬</div>
                <p class="text-lg font-medium">No results yet</p>
                <p class="text-sm mt-2">Fill in the form and click generate</p>
              </div>
            </div>
          `}
          
          <!-- Results State -->
          ${result && html`
            <div class="space-y-6">
              <!-- Video Display -->
              <div class="grid grid-cols-1 gap-4">
                ${result.data?.map(vid => html`
                  <div class="overflow-hidden rounded-xl shadow-lg">
                    <video 
                      src=${vid.url} 
                      controls 
                      autoplay 
                      loop 
                      class="w-full h-auto"
                    />
                  </div>
                `)}
              </div>
              
              <!-- Response Details -->
              <details class="bg-gray-50 rounded-lg p-4">
                <summary class="font-semibold text-gray-800 cursor-pointer text-sm">
                  Response Details
                </summary>
                <pre class="bg-white p-3 rounded-lg mt-3 overflow-x-auto text-xs text-gray-700">
${JSON.stringify(result, null, 2)}</pre>
              </details>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
};
