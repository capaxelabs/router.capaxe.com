import { PRICING_TYPES } from '../../PricingScheme'
import { processSingleOrMultipleFiles } from '../../../lib/imageHelpers'
import { ModelData } from './imagen-3'

export default class Gemini25FlashFree {
  data: ModelData

  constructor() {
    this.data = {
      id: 'google/gemini-2.5-flash:free',
      providers: [{
        id: 'openrouter',
        model_name: 'google/gemini-2.5-flash-image-preview:free',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 0,
        },
        applyImage: this.applyImageOpenRouter,
      }],
      arena_score: 1167,
      release_date: '2025-08-26',
      examples: [
        {
          image: '/model-examples/gemini-2.5-flash_free-2025-08-27T20-15-19-867Z.webp'
        }
      ]
    }
  }

  getData(): ModelData {
    return this.data
  }

  async applyImageOpenRouter(params: any): Promise<any> {
    // Process single or multiple image files
    const processedImages = await processSingleOrMultipleFiles(params.files.image, 'datauri')
    
    // Store the images for use in the API call
    params.imagesData = Array.isArray(processedImages) ? processedImages : [processedImages]
    
    return params
  }
}