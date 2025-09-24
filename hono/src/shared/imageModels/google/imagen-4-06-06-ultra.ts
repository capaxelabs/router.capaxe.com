import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from './imagen-3'

class Imagen4Ultra0606 {
  data: ModelData

  constructor() {
    this.data = {
      id: 'google/imagen-4-ultra-06-06',
      providers: [{
        id: 'vertex',
        model_name: 'imagen-4.0-ultra-generate-preview-06-06',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 0.06,
        }
      }],
      release_date: '2025-06-06',
    }
  }

  getData(): ModelData {
    return this.data
  }
}

export default Imagen4Ultra0606