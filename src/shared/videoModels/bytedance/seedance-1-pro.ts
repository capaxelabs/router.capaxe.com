import { PRICING_TYPES } from '../../PricingScheme'
import { processSingleFile, postCalcSimple } from '../../../lib/imageHelpers'
import { applyImageRunwareVideo } from '../../applyImage'
import { ModelData } from '../../imageModels/google/imagen-3'

class Seedance1Pro {
  data: ModelData

  constructor() {
    this.data = {
      id: 'bytedance/seedance-1-pro',
      providers: [
        {
          id: 'runware',
          model_name: 'bytedance:2@1',
          pricing: {
            type: PRICING_TYPES.POST_GENERATION,
            postCalcFunction: postCalcSimple,
            range: {
              min: 0.1132,
              average: 0.57,
              max: 0.7,
            },
          },
          applyImage: applyImageRunwareVideo,
        }, {
          id: 'replicate',
          model_name: 'bytedance/seedance-1-pro',
          pricing: {
            type: PRICING_TYPES.POST_GENERATION,
            postCalcFunction: postCalcSimple,
            range: {
              min: 0.15,
              average: 0.4,
              max: 0.6,
            },
          },
          applyImage: this.applyImageReplicate,
        }, {
          id: 'wavespeed',
          model_name: 'bytedance/seedance-v1-pro-t2v-720p',
          pricing: {
            type: PRICING_TYPES.FIXED,
            value: 0.3,
          },
          applyImage: this.applyImageWaveSpeed,
        }
      ],
      arena_score: 1347,
      release_date: '2025-06-16',
      examples: [
        {
          video: '/model-examples/seedance-1-pro-2025-06-20T21-03-30-821Z.webm'
        }
      ]
    }
  }

  getData(): ModelData {
    return this.data
  }

  async applyImageWaveSpeed(params: any): Promise<any> {
    params.image = await processSingleFile(params.files.image)
    params.model = 'bytedance/seedance-v1-pro-i2v-720p'
    delete params.files.image
    return params
  }

  async applyImageReplicate(params: any): Promise<any> {
    // Process image files if provided
    if (params.files?.image) {
      params.image = await processSingleFile(params.files.image)
      delete params.files.image
    }
    return params
  }
}

export default Seedance1Pro