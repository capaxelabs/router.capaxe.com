import { PRICING_TYPES } from '../../PricingScheme'
import { applyReferenceImages, applyFalImage } from '../../applyImage'
import { postCalcSimple } from '../../../lib/imageHelpers'
import { ModelData } from '../google/imagen-3'

class SeedEditV3 {
  data: ModelData

  constructor() {
    this.data = {
      id: 'bytedance/seededit-3',
      providers: [
        {
          id: 'runware',
          model_name: 'bytedance:4@1',
          pricing: {
            type: PRICING_TYPES.POST_GENERATION,
            postCalcFunction: postCalcSimple,
            value: 0.03,
          },
          applyImage: applyReferenceImages
        },
        {
          id: 'fal',
          model_name: 'fal-ai/bytedance/seededit/v3/edit-image',
          pricing: {
            type: PRICING_TYPES.FIXED,
            value: 0.03,
          },
          applyImage: applyFalImage
        }
      ],
      release_date: '2025-07-06'
    }
  }

  getData(): ModelData {
    return this.data
  }
}

export default SeedEditV3