import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from '../../../utils/providerSelector'

class BytedanceSeedance {
  data: ModelData

  constructor() {
    this.data = {
      id: 'runware/bytedance-seedance',
      providers: [{
        id: 'runware',
        model_name: 'bytedance:2@1',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 0.28,
        },
      }],
      arena_score: 1140,
      release_date: '2024-10-01',
      examples: []
    }
  }

  getData(): ModelData {
    return this.data
  }
}

export default BytedanceSeedance
