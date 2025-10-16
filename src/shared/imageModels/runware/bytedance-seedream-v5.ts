import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from '../google/imagen-3'

class BytedanceSeedreamV5 {
  data: ModelData

  constructor() {
    this.data = {
      id: 'runware/bytedance-seedream-v5',
      providers: [{
        id: 'runware',
        model_name: 'bytedance:5@0',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 0.02
        }
      }],
      release_date: '2024-11-01',
      examples: []
    }
  }

  getData(): ModelData {
    return this.data
  }
}

export default BytedanceSeedreamV5
