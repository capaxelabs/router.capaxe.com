import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from './imagen-3'

class Imagen4Ultra0520 {
  data: ModelData

  constructor() {
    this.data = {
      id: 'google/imagen-4-ultra-05-20',
      providers: [{
        id: 'geminiImagen',
        model_name: 'gemini-2.0-flash-exp',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 0.08,
        }
      }, {
        id: 'vertex',
        model_name: 'imagen-4.0-ultra-generate-exp-05-20',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 0.08,
        }
      }],
      release_date: '2025-05-20',
      examples: [
        {
          image: '/model-examples/imagen-4-ultra-2025-05-24T20-51-35-162Z.webp'
        }
      ]
    }
  }

  getData(): ModelData {
    return this.data
  }
}

export default Imagen4Ultra0520