import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from '../google/imagen-3'

class SourcefulFluxV1 {
  data: ModelData

  constructor() {
    this.data = {
      id: 'runware/sourceful-flux-v1',
      providers: [{
        id: 'runware',
        model_name: 'sourceful:1@1',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 0.03
        }
      }],
      release_date: '2024-10-01',
      examples: []
    }
  }

  getData(): ModelData {
    return this.data
  }
}

export default SourcefulFluxV1
