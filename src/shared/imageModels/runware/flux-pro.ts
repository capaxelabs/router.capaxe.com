import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from '../google/imagen-3'

class FluxPro {
  data: ModelData

  constructor() {
    this.data = {
      id: 'runware/flux-pro',
      providers: [{
        id: 'runware',
        model_name: 'bfl:2@1',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 0.055
        }
      }],
      release_date: '2024-08-01',
      examples: []
    }
  }

  getData(): ModelData {
    return this.data
  }
}

export default FluxPro
