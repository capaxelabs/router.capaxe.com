import { Hono } from 'hono'
import type { FC } from 'hono/jsx'
import { CloudflareBindings, ContextVariables } from '../types/env'
import { ModelService } from '../services/modelService'

const app = new Hono<{ Bindings: CloudflareBindings; Variables: ContextVariables }>()

// Note: JavaScript code is in public/js/models-ui.js
// It's served as a static asset via Cloudflare Workers Assets (wrangler.jsonc)

/**
 * Get all available models from database
 * GET /v1/models
 */
app.get('/', async (c) => {
  const db = c.get('db')
  const modelService = new ModelService(db)
  
  const type = c.req.query('type') as 'image' | 'video' | undefined
  const status = c.req.query('status') as 'active' | 'inactive' | 'deprecated' | 'beta' | undefined
  const provider = c.req.query('provider')
  
  const filters: any = {
    status: status || 'active',
    type,
    provider,
    isPublic: true,
  }

  try {
    const modelsArray = await modelService.listModels(filters)
    
    const allModels: any = {}
    
    for (const model of modelsArray) {
      const sanitizedModel = {
        id: model.id,
        providers: model.providers.map((p: any) => ({
          id: p.id,
          model_name: p.model_name,
          pricing: {
            type: p.pricing.type,
            value: p.pricing.value,
            range: p.pricing.range,
          }
        })),
        arena_score: model.arenaScore,
        release_date: model.releaseDate,
        examples: model.examples,
        type: model.type,
        name: model.name,
        description: model.description,
        capabilities: model.capabilities,
        tags: model.tags,
        category: model.category,
      }
      
      allModels[model.id] = sanitizedModel
    }

    return c.json(allModels)
  } catch (error) {
    console.error('Error fetching models:', error)
    return c.json({ error: 'Failed to fetch models' }, 500)
  }
})

const ModelsUI: FC = async () => {
  return (
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>ImageRouter Models</title>
        <style>{`
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
          }
          .container { max-width: 1400px; margin: 0 auto; padding: 20px; }
          .header { text-align: center; color: white; margin-bottom: 30px; }
          .header h1 { font-size: 3rem; margin-bottom: 10px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
          .header p { font-size: 1.2rem; opacity: 0.9; }
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
          .search-box:focus, .filter-select:focus { outline: none; border-color: #667eea; }
          .stats { margin-left: auto; color: #666; font-weight: 500; }
          .table-container {
            background: white;
            border-radius: 10px;
            box-shadow: 0 4px 6px rgba(0,0,0,0.1);
            overflow: hidden;
          }
          table { width: 100%; border-collapse: collapse; }
          thead { background: linear-gradient(135deg, #667eea, #764ba2); color: white; }
          th { padding: 15px 12px; text-align: left; font-weight: 600; }
          tbody tr:nth-child(even) { background-color: #f8f9ff; }
          tbody tr:hover { background-color: #e8f0ff; }
          td { padding: 12px; border-bottom: 1px solid #e1e1e1; vertical-align: top; }
          .model-id { font-weight: 600; color: #667eea; }
          .model-type {
            display: inline-block;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
            text-transform: uppercase;
          }
          .type-image { background: #e3f2fd; color: #1976d2; }
          .type-video { background: #fce4ec; color: #c2185b; }
          .providers { display: flex; flex-direction: column; gap: 4px; }
          .provider {
            padding: 2px 6px;
            background: #f0f0f0;
            border-radius: 4px;
            font-size: 11px;
            color: #555;
          }
          .pricing { display: flex; flex-direction: column; gap: 4px; }
          .price {
            padding: 2px 6px;
            background: #e8f5e8;
            color: #2e7d32;
            border-radius: 4px;
            font-size: 11px;
            font-weight: 500;
          }
          .arena-score { font-weight: 600; color: #ff6b35; }
          .release-date { color: #666; font-size: 14px; }
          .tags { display: flex; flex-wrap: wrap; gap: 4px; }
          .tag {
            padding: 2px 6px;
            background: #fff3e0;
            color: #e65100;
            border-radius: 4px;
            font-size: 10px;
          }
        `}</style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🤖 ImageRouter Models</h1>
            <p>Available AI Models from Database</p>
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
              <option value="runware">Runware</option>
            </select>
            <div class="stats">
              <span id="modelCount">Loading...</span>
            </div>
          </div>
          
          <div class="table-container">
            <table>
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
                <tr><td colspan="7" style="text-align: center; padding: 40px;" id="loading">Loading models...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

        <script src="/js/models-ui.js"></script>
      </body>
    </html>
  )
}

app.get('/ui', async (c) => {
  const html = await c.html(<ModelsUI />)
  // Override CSP to allow inline scripts
  html.headers.set('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'")
  return html
})

export default app
