// Models UI JavaScript
let allModels = [];

console.log('Models UI script loaded');
console.log('Fetching models from /v1/models...');

fetch('/v1/models')
  .then(r => {
    console.log('Response status:', r.status);
    return r.json();
  })
  .then(data => {
    console.log('Models received:', Object.keys(data).length);
    allModels = Object.entries(data).map(([id, model]) => ({id, ...model}));
    console.log('Parsed models:', allModels.length);
    displayModels(allModels);
    updateStats(allModels);
  })
  .catch(err => {
    console.error('Error loading models:', err);
    document.getElementById('modelsBody').innerHTML = 
      '<tr><td colspan="7" style="color: red; text-align: center;">Failed to load models: ' + err.message + '</td></tr>';
  });

function displayModels(models) {
  const tbody = document.getElementById('modelsBody');
  if (models.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center;">No models found</td></tr>';
    return;
  }
  
  tbody.innerHTML = models.map(m => {
    const providers = m.providers.map(p => 
      '<div class="provider">' + p.id + '</div>'
    ).join('');
    
    const pricing = m.providers.map(p => {
      let price = p.pricing.type === 'fixed' || p.pricing.type === 'post_generation'
        ? '$' + p.pricing.value.toFixed(3)
        : p.pricing.type;
      return '<div class="price">' + price + '</div>';
    }).join('');
    
    const tags = (m.tags || []).map(t => '<span class="tag">' + t + '</span>').join('');
    
    return '<tr data-type="' + m.type + '" data-providers="' + m.providers.map(p => p.id).join(',') + '">' +
      '<td class="model-id">' + m.id + '</td>' +
      '<td><span class="model-type type-' + m.type + '">' + m.type + '</span></td>' +
      '<td><div class="providers">' + providers + '</div></td>' +
      '<td><div class="pricing">' + pricing + '</div></td>' +
      '<td class="arena-score">' + (m.arena_score || 'N/A') + '</td>' +
      '<td class="release-date">' + (m.release_date || 'N/A') + '</td>' +
      '<td><div class="tags">' + tags + '</div></td>' +
      '</tr>';
  }).join('');
}

function updateStats(models) {
  const imageCount = models.filter(m => m.type === 'image').length;
  const videoCount = models.filter(m => m.type === 'video').length;
  document.getElementById('modelCount').textContent = 
    models.length + ' models (' + imageCount + ' image, ' + videoCount + ' video)';
}

function filterModels() {
  const search = document.getElementById('searchBox').value.toLowerCase();
  const type = document.getElementById('typeFilter').value;
  const provider = document.getElementById('providerFilter').value;
  
  const filtered = allModels.filter(m => {
    const matchSearch = m.id.toLowerCase().includes(search);
    const matchType = !type || m.type === type;
    const matchProvider = !provider || m.providers.some(p => p.id === provider);
    return matchSearch && matchType && matchProvider;
  });
  
  displayModels(filtered);
  updateStats(filtered);
}

// Setup event listeners when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('searchBox').addEventListener('input', filterModels);
  document.getElementById('typeFilter').addEventListener('change', filterModels);
  document.getElementById('providerFilter').addEventListener('change', filterModels);
});
