import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from '../../../utils/providerSelector'

class KlingAI21Pro {
  data: ModelData

  constructor() {
    this.data = {
      id: 'runware/klingai-2.1-pro',
      providers: [{
        id: 'runware',
        model_name: 'klingai:6@1',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 0.924,
        },
      }],
      arena_score: 1180,
      release_date: '2024-11-15',
      examples: []
    }
  }

  getData(): ModelData {
    return this.data
  }
}

export default KlingAI21Pro
