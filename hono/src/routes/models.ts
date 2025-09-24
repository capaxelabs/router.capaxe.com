import { Hono } from 'hono'
import { googleImageModels } from '../shared/imageModels/google'
import { googleVideoModels } from '../shared/videoModels/google'
import { CloudflareBindings } from '../types/env'

const app = new Hono<{ Bindings: CloudflareBindings }>()

/**
 * Get all available models (Google only for Phase 2)
 * GET /v1/models
 */
app.get('/', (c) => {
  // Remove provider-specific details for security
  const sanitizeModel = (modelData: any) => {
    return {
      ...modelData,
      providers: modelData.providers?.map((provider: any) => ({
        id: provider.id,
        model_name: provider.model_name,
        pricing: {
          type: provider.pricing.type,
          value: provider.pricing.value,
          range: provider.pricing.range,
        }
        // Remove applyImage, applyMask functions and API keys
      }))
    }
  }

  // Combine and sanitize Google models
  const allModels = {
    // Google Image Models
    ...Object.fromEntries(
      Object.entries(googleImageModels).map(([key, value]) => [
        key,
        sanitizeModel(value)
      ])
    ),
    // Google Video Models  
    ...Object.fromEntries(
      Object.entries(googleVideoModels).map(([key, value]) => [
        key,
        sanitizeModel(value)
      ])
    )
  }

  return c.json(allModels)
})

/**
 * HTML Models Viewer Page
 * GET /models (HTML page)
 */
app.get('/ui', (c) => {
  return c.html(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>ImageRouter Models - Available Models</title>
    <script src="https://code.jquery.com/jquery-3.6.0.min.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
        }
        
        .container {
            max-width: 1400px;
            margin: 0 auto;
            padding: 20px;
        }
        
        .header {
            text-align: center;
            color: white;
            margin-bottom: 30px;
        }
        
        .header h1 {
            font-size: 3rem;
            margin-bottom: 10px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
        }
        
        .header p {
            font-size: 1.2rem;
            opacity: 0.9;
        }
        
        .controls {
            background: white;
            padding: 20px;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            margin-bottom: 20px;
            display: flex;
            gap: 20px;
            align-items: center;
            flex-wrap: wrap;
        }
        
        .search-box, .filter-select {
            padding: 10px 15px;
            border: 2px solid #e1e1e1;
            border-radius: 8px;
            font-size: 16px;
            min-width: 200px;
        }
        
        .search-box:focus, .filter-select:focus {
            outline: none;
            border-color: #667eea;
        }
        
        .stats {
            margin-left: auto;
            color: #666;
            font-weight: 500;
        }
        
        .table-container {
            background: white;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            overflow: hidden;
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
        }
        
        thead {
            background: linear-gradient(135deg, #667eea, #764ba2);
            color: white;
        }
        
        th {
            padding: 15px 12px;
            text-align: left;
            font-weight: 600;
            position: sticky;
            top: 0;
            z-index: 10;
        }
        
        tbody tr:nth-child(even) {
            background-color: #f8f9ff;
        }
        
        tbody tr:hover {
            background-color: #e8f0ff;
            cursor: pointer;
        }
        
        td {
            padding: 12px;
            border-bottom: 1px solid #e1e1e1;
            vertical-align: top;
        }
        
        .model-id {
            font-weight: 600;
            color: #667eea;
        }
        
        .model-type {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
            text-transform: uppercase;
        }
        
        .type-image {
            background: #e3f2fd;
            color: #1976d2;
        }
        
        .type-video {
            background: #fce4ec;
            color: #c2185b;
        }
        
        .providers {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        
        .provider {
            padding: 2px 6px;
            background: #f0f0f0;
            border-radius: 4px;
            font-size: 11px;
            color: #555;
        }
        
        .pricing {
            display: flex;
            flex-direction: column;
            gap: 4px;
        }
        
        .price {
            padding: 2px 6px;
            background: #e8f5e8;
            color: #2e7d32;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
        }
        
        .arena-score {
            font-weight: 600;
            color: #ff6b35;
        }
        
        .release-date {
            color: #666;
            font-size: 14px;
        }
        
        .loading {
            text-align: center;
            padding: 40px;
            color: #666;
        }
        
        .no-results {
            text-align: center;
            padding: 40px;
            color: #999;
            display: none;
        }
        
        @media (max-width: 768px) {
            .controls {
                flex-direction: column;
                align-items: stretch;
            }
            
            .search-box, .filter-select {
                min-width: auto;
                width: 100%;
            }
            
            .stats {
                margin-left: 0;
                text-align: center;
            }
            
            table {
                font-size: 14px;
            }
            
            th, td {
                padding: 8px 6px;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🤖 ImageRouter Models</h1>
            <p>Available Google AI Models for Image & Video Generation</p>
        </div>
        
        <div class="controls">
            <input type="text" id="searchBox" class="search-box" placeholder="🔍 Search models...">
            <select id="typeFilter" class="filter-select">
                <option value="">All Types</option>
                <option value="image">Image Models</option>
                <option value="video">Video Models</option>
            </select>
            <select id="providerFilter" class="filter-select">
                <option value="">All Providers</option>
                <option value="gemini">Gemini</option>
                <option value="vertex">Vertex AI</option>
                <option value="openrouter">OpenRouter</option>
                <option value="replicate">Replicate</option>
                <option value="wavespeed">WaveSpeed</option>
            </select>
            <div class="stats">
                <span id="modelCount">Loading...</span>
            </div>
        </div>
        
        <div class="table-container">
            <table id="modelsTable">
                <thead>
                    <tr>
                        <th>Model ID</th>
                        <th>Type</th>
                        <th>Providers</th>
                        <th>Pricing</th>
                        <th>Arena Score</th>
                        <th>Release Date</th>
                    </tr>
                </thead>
                <tbody id="modelsBody">
                    <tr>
                        <td colspan="6" class="loading">
                            Loading models...
                        </td>
                    </tr>
                </tbody>
            </table>
            
            <div id="noResults" class="no-results">
                No models found matching your criteria.
            </div>
        </div>
    </div>

    <script>
        $(document).ready(function() {
            let allModels = [];
            
            // Fetch models from API
            $.ajax({
                url: '/v1/models',
                method: 'GET',
                success: function(data) {
                    allModels = Object.entries(data).map(([id, model]) => ({
                        id: id,
                        ...model,
                        type: id.includes('/imagen-') || id.includes('/gemini-') ? 'image' : 'video'
                    }));
                    
                    displayModels(allModels);
                    updateStats(allModels);
                },
                error: function() {
                    $('#modelsBody').html('<tr><td colspan="6" style="color: red; text-align: center;">Failed to load models. Please try again.</td></tr>');
                }
            });
            
            // Display models in table
            function displayModels(models) {
                const tbody = $('#modelsBody');
                
                if (models.length === 0) {
                    tbody.empty();
                    $('#noResults').show();
                    return;
                } else {
                    $('#noResults').hide();
                }
                
                const rows = models.map(model => {
                    const providers = model.providers.map(p => 
                        \`<div class="provider">\${p.id}</div>\`
                    ).join('');
                    
                    const pricing = model.providers.map(p => {
                        let priceText = '';
                        if (p.pricing.type === 'fixed') {
                            priceText = \`$\${p.pricing.value.toFixed(3)}\`;
                        } else if (p.pricing.range) {
                            priceText = \`$\${p.pricing.range.min.toFixed(3)}-$\${p.pricing.range.max.toFixed(3)}\`;
                        } else {
                            priceText = p.pricing.type;
                        }
                        return \`<div class="price">\${priceText}</div>\`;
                    }).join('');
                    
                    return \`
                        <tr>
                            <td class="model-id">\${model.id}</td>
                            <td>
                                <span class="model-type type-\${model.type}">\${model.type}</span>
                            </td>
                            <td>
                                <div class="providers">\${providers}</div>
                            </td>
                            <td>
                                <div class="pricing">\${pricing}</div>
                            </td>
                            <td class="arena-score">\${model.arena_score || 'N/A'}</td>
                            <td class="release-date">\${model.release_date || 'N/A'}</td>
                        </tr>
                    \`;
                }).join('');
                
                tbody.html(rows);
            }
            
            // Update statistics
            function updateStats(models) {
                const imageCount = models.filter(m => m.type === 'image').length;
                const videoCount = models.filter(m => m.type === 'video').length;
                $('#modelCount').text(\`\${models.length} models (\${imageCount} image, \${videoCount} video)\`);
            }
            
            // Filter models
            function filterModels() {
                const searchTerm = $('#searchBox').val().toLowerCase();
                const typeFilter = $('#typeFilter').val();
                const providerFilter = $('#providerFilter').val();
                
                const filtered = allModels.filter(model => {
                    const matchesSearch = model.id.toLowerCase().includes(searchTerm) ||
                                        (model.providers.some(p => p.id.toLowerCase().includes(searchTerm)));
                    
                    const matchesType = !typeFilter || model.type === typeFilter;
                    
                    const matchesProvider = !providerFilter || 
                                          model.providers.some(p => p.id === providerFilter);
                    
                    return matchesSearch && matchesType && matchesProvider;
                });
                
                displayModels(filtered);
                updateStats(filtered);
            }
            
            // Event listeners
            $('#searchBox').on('input', filterModels);
            $('#typeFilter').on('change', filterModels);
            $('#providerFilter').on('change', filterModels);
            
            // Row click handler (for future use)
            $(document).on('click', 'tbody tr', function() {
                const modelId = $(this).find('.model-id').text();
                console.log('Selected model:', modelId);
                // Could open modal with more details, copy API endpoint, etc.
            });
        });
    </script>
</body>
</html>
  `)
})

export default app