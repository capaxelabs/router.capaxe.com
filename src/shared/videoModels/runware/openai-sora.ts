import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from '../../../utils/providerSelector'

class OpenAISora {
  data: ModelData

  constructor() {
    this.data = {
      id: 'runware/openai-sora',
      providers: [{
        id: 'runware',
        model_name: 'openai:3@1',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 2.40, // Approximate pricing for Sora
        },
      }],
      arena_score: 1200,
      release_date: '2024-12-01',
      examples: []
    }
  }

  getData(): ModelData {
    return this.data
  }
}

export default OpenAISora
