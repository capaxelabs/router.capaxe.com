import { useState, useEffect } from 'https://esm.sh/preact@10.19.3/hooks';
import { html } from './shared.js';

export const ImageGenerator = () => {
  const [formData, setFormData] = useState({
    model: 'google/gemini-2.0-flash-exp',
    prompt: '',
    size: '1024x1024',
    quality: 'medium',
    n: 1,
    apiKey: localStorage.getItem('apiKey') || '',
    async: true
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [taskId, setTaskId] = useState(null);
  const [polling, setPolling] = useState(false);
  const [inputImages, setInputImages] = useState([]);
  const [inputImagePreviews, setInputImagePreviews] = useState([]);

  // Models from database
  const [models, setModels] = useState({});
  const [modelsLoading, setModelsLoading] = useState(true);
  const [selectedModelCapabilities, setSelectedModelCapabilities] = useState(null);

  // Fetch models from database on mount
  useEffect(() => {
    const fetchModels = async () => {
      try {
        const res = await fetch('/v1/models?type=image');
        if (!res.ok) throw new Error('Failed to fetch models');
        const data = await res.json();

        // Filter out inactive/deprecated models
        const activeModels = Object.entries(data).reduce((acc, [id, model]) => {
          if (model.status !== 'inactive' && model.status !== 'deprecated') {
            acc[id] = model;
          }
          return acc;
        }, {});

        setModels(activeModels);
        setModelsLoading(false);
      } catch (err) {
        console.error('Error fetching models:', err);
        setModelsLoading(false);
      }
    };
    fetchModels();
  }, []);

  // Update selected model capabilities when model changes
  useEffect(() => {
    if (models[formData.model]) {
      const capabilities = models[formData.model].capabilities;
      setSelectedModelCapabilities(capabilities);
    }
  }, [formData.model, models]);

  const updateForm = (key, value) => {
    setFormData({ ...formData, [key]: value });
    if (key === 'apiKey') localStorage.setItem('apiKey', value);
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (files.length === 0) return;

    // Supported image types
    const supportedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/tiff'];

    // Check for unsupported file types
    const unsupportedFiles = files.filter(file => !supportedTypes.includes(file.type));
    if (unsupportedFiles.length > 0) {
      alert(`Unsupported image format detected!\n\nFile: ${unsupportedFiles[0].name}\nType: ${unsupportedFiles[0].type}\n\nSupported formats: JPEG, PNG, GIF, WebP, BMP, TIFF\n\nNote: AVIF format is not supported.`);
      e.target.value = '';
      return;
    }

    // Check if adding these files would exceed the limit
    const maxImages = selectedModelCapabilities?.maxInputImages;
    if (maxImages && (inputImages.length + files.length) > maxImages) {
      alert(`This model supports a maximum of ${maxImages} images. You currently have ${inputImages.length} and are trying to add ${files.length} more.`);
      e.target.value = '';
      return;
    }

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
    const maxAttempts = 60;
    let attempts = 0;
    
    const poll = async () => {
      try {
        const res = await fetch('/v1/tasks/' + id, {
          headers: { 'Authorization': 'Bearer ' + formData.apiKey }
        });
        
        if (!res.ok) throw new Error('Failed to fetch task status');
        
        const data = await res.json();
        
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
          setTimeout(poll, 2000);
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
    
    try {
      const requestBody = {
        model: formData.model,
        prompt: formData.prompt,
        size: formData.size,
        quality: formData.quality,
        n: parseInt(formData.n)
      };
      
      // Add input images if provided
      if (inputImages.length > 0) {
        requestBody.image = inputImages.length === 1 ? inputImages[0] : inputImages;
      }
      
      const res = await fetch('/v1/images/generations', {
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
            <span class="mr-2">🖼️</span> Image Settings
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
              ${modelsLoading ? html`
                <div class="w-full px-3 py-2 text-sm text-gray-400">Loading models...</div>
              ` : html`
                <select
                  value=${formData.model}
                  onChange=${(e) => updateForm('model', e.target.value)}
                  class="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition"
                >
                  ${Object.entries(
                    Object.values(models).reduce((groups, model) => {
                      // Group by category or provider
                      const group = model.category || 'Other';
                      if (!groups[group]) groups[group] = [];
                      groups[group].push(model);
                      return groups;
                    }, {})
                  ).map(([category, categoryModels]) => html`
                    <optgroup label=${category}>
                      ${categoryModels.map(model => html`
                        <option value=${model.id}>${model.name}</option>
                      `)}
                    </optgroup>
                  `)}
                </select>
              `}
            </div>
            
            <!-- Size and Quality -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-600 mb-2 uppercase">
                  Size / Aspect Ratio
                </label>
                <select
                  value=${formData.size}
                  onChange=${(e) => updateForm('size', e.target.value)}
                  class="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition"
                >
                  ${selectedModelCapabilities?.aspectRatios ?
                    selectedModelCapabilities.aspectRatios.map(ratio => {
                      const label = ratio.replace(':', '×');
                      return html`<option value=${ratio}>${label}</option>`;
                    }) :
                    html`
                      <option value="256x256">256×256</option>
                      <option value="512x512">512×512</option>
                      <option value="1024x1024">1024×1024</option>
                      <option value="1792x1024">1792×1024</option>
                      <option value="1024x1792">1024×1792</option>
                    `
                  }
                </select>
              </div>
              
              <div>
                <label class="block text-xs font-semibold text-gray-600 mb-2 uppercase">
                  Quality
                </label>
                <select
                  value=${formData.quality}
                  onChange=${(e) => updateForm('quality', e.target.value)}
                  class="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition"
                >
                  <option value="auto">Auto</option>
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>
            
            <!-- Count and Mode -->
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs font-semibold text-gray-600 mb-2 uppercase">
                  Count
                </label>
                <input
                  type="number"
                  min="1"
                  max="10"
                  value=${formData.n}
                  onInput=${(e) => updateForm('n', e.target.value)}
                  class="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition"
                />
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
                placeholder="A beautiful sunset over mountains..."
                required
                rows="4"
                class="w-full px-3 py-2 text-sm border-2 border-gray-200 rounded-lg focus:border-purple-500 outline-none transition resize-none"
              />
            </div>
            
            <!-- Model Capabilities Info -->
            ${selectedModelCapabilities && html`
              <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs">
                <div class="font-semibold text-blue-800 mb-2">Model Info</div>
                ${selectedModelCapabilities.maxInputImages && html`
                  <div class="text-blue-700 mb-1">
                    📷 Reference Images: ${selectedModelCapabilities.minInputImages || 0} - ${selectedModelCapabilities.maxInputImages}
                  </div>
                `}
                ${selectedModelCapabilities.aspectRatios && html`
                  <div class="text-blue-700">
                    📐 Aspect Ratios: ${selectedModelCapabilities.aspectRatios.join(', ')}
                  </div>
                `}
              </div>
            `}

            <!-- Input Images (Optional) -->
            <div>
              <div class="flex items-center justify-between mb-2">
                <label class="block text-xs font-semibold text-gray-600 uppercase">
                  Input Images (Optional)
                  ${selectedModelCapabilities?.maxInputImages && html`
                    <span class="text-xs text-gray-500 font-normal ml-1">
                      (Max: ${selectedModelCapabilities.maxInputImages})
                    </span>
                  `}
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

              <!-- Validation Warning -->
              ${selectedModelCapabilities?.maxInputImages && inputImages.length > selectedModelCapabilities.maxInputImages && html`
                <div class="bg-red-50 border border-red-200 rounded-lg p-2 mb-2 text-xs text-red-700">
                  ⚠️ Too many images! This model supports max ${selectedModelCapabilities.maxInputImages} images. Please remove ${inputImages.length - selectedModelCapabilities.maxInputImages}.
                </div>
              `}

              ${selectedModelCapabilities?.minInputImages && inputImages.length > 0 && inputImages.length < selectedModelCapabilities.minInputImages && html`
                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-2 text-xs text-yellow-700">
                  ⚠️ At least ${selectedModelCapabilities.minInputImages} images required for this model.
                </div>
              `}
              
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
                <span class="text-2xl mb-1">📷</span>
                <span class="text-xs text-gray-600">Click to add image(s)</span>
                <span class="text-xs text-gray-400 mt-1">Multiple images supported</span>
                <span class="text-xs text-gray-400 block mt-1">JPEG, PNG, GIF, WebP, BMP, TIFF</span>
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/gif,image/webp,image/bmp,image/tiff"
                  multiple
                  onChange=${handleImageUpload}
                  class="hidden"
                />
              </label>
            </div>
            
            <!-- Submit Button -->
            <button
              type="submit"
              disabled=${loading ||
                (selectedModelCapabilities?.maxInputImages && inputImages.length > selectedModelCapabilities.maxInputImages) ||
                (selectedModelCapabilities?.minInputImages && inputImages.length > 0 && inputImages.length < selectedModelCapabilities.minInputImages)}
              class="w-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-semibold py-3 px-6 rounded-lg hover:from-purple-700 hover:to-pink-700 transition transform hover:scale-[1.02] disabled:opacity-60 disabled:cursor-not-allowed disabled:transform-none shadow-lg text-sm"
            >
              ${loading ? '⏳ Generating...' : '🎨 Generate Images'}
            </button>
          </form>
        </div>
      </div>
      
      <!-- Results Panel -->
      <div class="lg:col-span-2">
        <div class="bg-white rounded-xl shadow-lg p-6 min-h-[600px]">
          <h2 class="text-lg font-bold text-gray-800 mb-4">Generated Images</h2>
          
          <!-- Loading State -->
          ${loading && html`
            <div class="flex items-center justify-center h-96 bg-purple-50 rounded-lg">
              <div class="text-center">
                <div class="spinner mb-4"></div>
                <p class="text-gray-700 font-medium">
                  ${polling 
                    ? html`<span>Polling task: <span class="font-mono text-purple-600">${taskId}</span></span>` 
                    : 'Submitting request...'
                  }
                </p>
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
                <div class="text-6xl mb-4">🖼️</div>
                <p class="text-lg font-medium">No results yet</p>
                <p class="text-sm mt-2">Fill in the form and click generate</p>
              </div>
            </div>
          `}
          
          <!-- Results State -->
          ${result && html`
            <div class="space-y-6">
              <!-- Image Grid -->
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                ${result.data?.map(img => html`
                  <div class="group relative overflow-hidden rounded-xl shadow-lg hover:shadow-2xl transition">
                    <img src=${img.url} alt="Generated" class="w-full h-auto" />
                    <div class="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition flex items-center justify-center">
                      <a
                        href=${img.url}
                        target="_blank"
                        class="opacity-0 group-hover:opacity-100 transition bg-white text-purple-600 px-4 py-2 rounded-lg font-semibold text-sm"
                      >
                        View Full Size
                      </a>
                    </div>
                  </div>
                `)}
              </div>
              
              <!-- Response Details -->
              <details class="bg-gray-50 rounded-lg p-4">
                <summary class="font-semibold text-gray-800 cursor-pointer text-sm">
                  Response Details
                </summary>
                <pre class="bg-white p-3 rounded-lg mt-3 overflow-x-auto text-xs text-gray-700">
                    ${JSON.stringify(result, null, 2)}
                </pre>
              </details>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
};
