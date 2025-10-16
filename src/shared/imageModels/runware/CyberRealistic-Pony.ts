import { PRICING_TYPES } from '../../PricingScheme'
import { postCalcSimple } from '../../../lib/imageHelpers'
import { ModelData } from '../google/imagen-3'

class CyberRealisticPony {
  data: ModelData

  constructor() {
    this.data = {
      id: 'cyberdelia/CyberRealisticPony',
      providers: [{
        id: 'runware',
        model_name: 'pasaranax:443821@1957537',
        pricing: {
          type: PRICING_TYPES.POST_GENERATION,
          postCalcFunction: postCalcSimple,
          range: {
            min: 0.0013,
            average: 0.0019,
            max: 0.007
          }
        },
        applyQuality: this.applyQuality
      }],
      release_date: '2025-06-29',
      examples: [
        {
          image: '/model-examples/pasaranax:443821@1957537.webp'
        }
      ]
    }
  }

  applyQuality(params: any): any {
    const qualitySteps = {
      low: 10,
      medium: 20,
      high: 35
    }
    params.steps = qualitySteps[params.quality as keyof typeof qualitySteps] ?? qualitySteps['medium']
    delete params.quality
    return params
  }

  getData(): ModelData {
    return this.data
  }
}

export default CyberRealisticPony