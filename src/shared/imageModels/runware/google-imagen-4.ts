import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from '../google/imagen-3'

class GoogleImagen4 {
  data: ModelData

  constructor() {
    this.data = {
      id: 'runware/google-imagen-4',
      providers: [{
        id: 'runware',
        model_name: 'google:4@1',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 0.04
        }
      }],
      release_date: '2024-05-01',
      examples: []
    }
  }

  getData(): ModelData {
    return this.data
  }
}

export default GoogleImagen4
