import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from '../../../shared/imageModels/google/imagen-3'

class Veo3 {
  data: ModelData

  constructor() {
    this.data = {
      id: 'google/veo-3',
      providers: [
        {
          id: 'vertex',
          model_name: 'veo-3.0-generate-preview',
          pricing: {
            type: PRICING_TYPES.FIXED,
            value: 6,
          },
          // TODO: Implement applyVertexImage function when needed
          // applyImage: applyVertexImage
        }, {
          id: 'replicate',
          model_name: 'google/veo-3',
          pricing: {
            type: PRICING_TYPES.FIXED,
            value: 6,
          }
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
}

export default Veo3