import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from '../../../utils/providerSelector'

class RunwareVideo {
  data: ModelData

  constructor() {
    this.data = {
      id: 'runware/runware-video',
      providers: [{
        id: 'runware',
        model_name: 'runware:201@1',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 0.15,
        },
      }],
      arena_score: 1100,
      release_date: '2024-09-01',
      examples: []
    }
  }

  getData(): ModelData {
    return this.data
  }
}

export default RunwareVideo
