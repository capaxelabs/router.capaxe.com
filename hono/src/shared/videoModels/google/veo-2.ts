import { PRICING_TYPES } from '../../PricingScheme'
import { processSingleFile } from '../../../lib/imageHelpers'
import { ModelData } from '../../../shared/imageModels/google/imagen-3'

class Veo2 {
  data: ModelData

  constructor() {
    this.data = {
      id: 'google/veo-2',
      providers: [{
        id: 'gemini',
        model_name: 'veo-2.0-generate-001',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 1.75,
        },
        applyImage: this.applyImage,
      }],
      arena_score: 1115,
      release_date: '2024-12-16',
      examples: [
        {
          video: '/model-examples/veo-2-2025-05-27T22-57-10-794Z.webm'
        }
      ]
    }
  }

  getData(): ModelData {
    return this.data
  }

  async applyImage(params: any): Promise<any> {
    params.image = await processSingleFile(params.files.image)
    delete params.files.image
    return params
  }
}

export default Veo2