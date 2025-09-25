import { PRICING_TYPES } from '../../PricingScheme'
import { postCalcSimple } from '../../../lib/imageHelpers'
import { ModelData } from '../google/imagen-3'

class DreamShaper {
  data: ModelData

  constructor() {
    this.data = {
      id: 'Lykon/DreamShaper',
      providers: [{
        id: 'runware',
        model_name: 'civitai:4384@128713',
        pricing: {
          type: PRICING_TYPES.POST_GENERATION,
          postCalcFunction: postCalcSimple,
          range: {
            min: 0.0013,
            average: 0.0019,
            max: 0.0294
          }
        },
        applyQuality: this.applyQuality
      }],
      release_date: '2023-07-29',
      examples: [{
        image: '/model-examples/DreamShaper-2025-06-15T21-45-26-399Z.webp'
      }]
    }
  }

  applyQuality(params: any): any {
    const qualitySteps = {
      low: 15,
      medium: 25,
      high: 50
    }
    params.steps = qualitySteps[params.quality as keyof typeof qualitySteps] ?? qualitySteps['medium']
    delete params.quality
    return params
  }

  getData(): ModelData {
    return this.data
  }
}

export default DreamShaper