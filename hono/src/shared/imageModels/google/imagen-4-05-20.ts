import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from './imagen-3'

class Imagen40520 {
  data: ModelData

  constructor() {
    this.data = {
      id: 'google/imagen-4-05-20',
      providers: [{
        id: 'vertex',
        model_name: 'imagen-4.0-generate-preview-05-20',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 0.04,
        }
      }],
      release_date: '2025-05-20',
      examples: [
        {
          image: '/model-examples/imagen-4-2025-05-24T20-46-43-888Z.webp'
        }
      ]
    }
  }

  getData(): ModelData {
    return this.data
  }
}

export default Imagen40520