import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from '../../../shared/imageModels/google/imagen-3'
import { processSingleFile } from '../../../lib/imageHelpers'

class Veo3 {
  data: ModelData

  constructor() {
    this.data = {
      id: 'google/veo-3',
      providers: [
        {
          id: 'gemini',
        model_name: 'veo-3.0-generate-001',
          pricing: {
            type: PRICING_TYPES.FIXED,
            value: 6,
          },
          applyImage: this.applyImage,
        }, {
          id: 'vertex',
          model_name: 'veo-3.0-generate-preview',
          pricing: {
            type: PRICING_TYPES.FIXED,
            value: 6,
          },
          applyImage: this.applyImage,
        }
      ],
      arena_score: 1240,
      release_date: '2025-05-20',
      examples: [
        {
          video: '/model-examples/veo-3.webm'
        }
      ]
    }
  }

  getData(): ModelData {
    return this.data
  }

  async applyImage(params: any): Promise<any> {
    if (params.files?.image) {
      params.image = await processSingleFile(params.files.image)
      delete params.files.image
    }
    return params
  }
}

export default Veo3