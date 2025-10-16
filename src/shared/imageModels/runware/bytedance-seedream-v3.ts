import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from '../google/imagen-3'

class BytedanceSeedreamV3 {
  data: ModelData

  constructor() {
    this.data = {
      id: 'runware/bytedance-seedream-v3',
      providers: [{
        id: 'runware',
        model_name: 'bytedance:3@1',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 0.015
        }
      }],
      release_date: '2024-09-01',
      examples: []
    }
  }

  getData(): ModelData {
    return this.data
  }
}

export default BytedanceSeedreamV3
