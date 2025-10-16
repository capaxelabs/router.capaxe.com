import type { FC } from 'hono/jsx'

interface Model {
  id: string
  name: string
  type: 'image' | 'video'
  status: string
  providers: Array<{
    id: string
    model_name: string
    pricing: {
      type: string
      value: number
    }
  }>
  arenaScore?: number
  releaseDate: string
  tags: string[]
}

interface ModelsPageProps {
  models: Model[]
}

const Layout: FC = (props) => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>ImageRouter Models - Available Models</title>
        <style>{`
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
          
          .no-results {
            text-align: center;
            padding: 40px;
            color: #999;
            display: none;
          }

          .tags {
            display: flex;
            flex-wrap: wrap;
            gap: 4px;
          }

          .tag {
            padding: 2px 6px;
            background: #fff3e0;
            color: #e65100;
            border-radius: 4px;
            font-size: 10px;
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
        `}</style>
      </head>
      <body>
        {props.children}
      </body>
    </html>
  )
}

export const ModelsPage: FC<ModelsPageProps> = ({ models }) => {
  const imageModels = models.filter(m => m.type === 'image')
  const videoModels = models.filter(m => m.type === 'video')

  return (
    <Layout>
      <div class="container">
        <div class="header">
          <h1>🤖 ImageRouter Models</h1>
          <p>Available Google & Runware AI Models for Image & Video Generation</p>
        </div>
        
        <div class="controls">
          <input type="text" id="searchBox" class="search-box" placeholder="🔍 Search models..." />
          <select id="typeFilter" class="filter-select">
            <option value="">All Types</option>
            <option value="image">Image Models</option>
            <option value="video">Video Models</option>
          </select>
          <select id="providerFilter" class="filter-select">
            <option value="">All Providers</option>
            <option value="gemini">Gemini</option>
            <option value="vertex">Vertex AI</option>
            <option value="runware">Runware</option>
          </select>
          <div class="stats">
            <span id="modelCount">{models.length} models ({imageModels.length} image, {videoModels.length} video)</span>
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
                <th>Tags</th>
              </tr>
            </thead>
            <tbody id="modelsBody">
              {models.map((model) => (
                <tr data-type={model.type} data-providers={model.providers.map(p => p.id).join(',')}>
                  <td class="model-id">{model.id}</td>
                  <td>
                    <span class={`model-type type-${model.type}`}>{model.type}</span>
                  </td>
                  <td>
                    <div class="providers">
                      {model.providers.map((p) => (
                        <div class="provider">{p.id}</div>
                      ))}
                    </div>
                  </td>
                  <td>
                    <div class="pricing">
                      {model.providers.map((p) => {
                        let priceText = ''
                        if (p.pricing.type === 'fixed') {
                          priceText = `$${p.pricing.value.toFixed(3)}`
                        } else if (p.pricing.type === 'post_generation') {
                          priceText = `$${p.pricing.value.toFixed(3)}/img`
                        } else {
                          priceText = p.pricing.type
                        }
                        return <div class="price">{priceText}</div>
                      })}
                    </div>
                  </td>
                  <td class="arena-score">{model.arenaScore || 'N/A'}</td>
                  <td class="release-date">{model.releaseDate || 'N/A'}</td>
                  <td>
                    <div class="tags">
                      {model.tags?.map((tag) => (
                        <span class="tag">{tag}</span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          
          <div id="noResults" class="no-results">
            No models found matching your criteria.
          </div>
        </div>
      </div>

      <script dangerouslySetInnerHTML={{
        __html: `
          const allRows = document.querySelectorAll('#modelsBody tr');
          const searchBox = document.getElementById('searchBox');
          const typeFilter = document.getElementById('typeFilter');
          const providerFilter = document.getElementById('providerFilter');
          const modelCount = document.getElementById('modelCount');
          const noResults = document.getElementById('noResults');

          function filterModels() {
            const searchTerm = searchBox.value.toLowerCase();
            const typeValue = typeFilter.value;
            const providerValue = providerFilter.value;
            
            let visibleCount = 0;
            
            allRows.forEach(row => {
              const modelId = row.querySelector('.model-id').textContent.toLowerCase();
              const rowType = row.dataset.type;
              const rowProviders = row.dataset.providers;
              
              const matchesSearch = modelId.includes(searchTerm);
              const matchesType = !typeValue || rowType === typeValue;
              const matchesProvider = !providerValue || rowProviders.includes(providerValue);
              
              if (matchesSearch && matchesType && matchesProvider) {
                row.style.display = '';
                visibleCount++;
              } else {
                row.style.display = 'none';
              }
            });
            
            if (visibleCount === 0) {
              noResults.style.display = 'block';
            } else {
              noResults.style.display = 'none';
            }
            
            modelCount.textContent = visibleCount + ' models';
          }
          
          searchBox.addEventListener('input', filterModels);
          typeFilter.addEventListener('change', filterModels);
          providerFilter.addEventListener('change', filterModels);
        `
      }} />
    </Layout>
  )
}
