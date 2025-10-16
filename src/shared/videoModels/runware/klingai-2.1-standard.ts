import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from '../../../utils/providerSelector'

class KlingAI21Standard {
  data: ModelData

  constructor() {
    this.data = {
      id: 'runware/klingai-2.1-standard',
      providers: [{
        id: 'runware',
        model_name: 'klingai:5@2',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 0.323,
        },
      }],
      arena_score: 1160,
      release_date: '2024-11-15',
      examples: []
    }
  }

  getData(): ModelData {
    return this.data
  }
}

export default KlingAI21Standard
