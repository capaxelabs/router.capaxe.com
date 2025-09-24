import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from './imagen-3'

class Imagen40606 {
  data: ModelData

  constructor() {
    this.data = {
      id: 'google/imagen-4-06-06',
      providers: [{
        id: 'geminiImagen',
        model_name: 'gemini-2.0-flash-exp',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 0.04,
        }
      }, {
        id: 'vertex',
        model_name: 'imagen-4.0-generate-preview-06-06',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 0.04,
        }
      }],
      release_date: '2025-06-06',
    }
  }

  getData(): ModelData {
    return this.data
  }
}

export default Imagen40606