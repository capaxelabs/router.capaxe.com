import { PRICING_TYPES } from '../../PricingScheme'
import { processSingleFile, postCalcSimple } from '../../../lib/imageHelpers'
import { applyImageRunwareVideo } from '../../applyImage'
import { ModelData } from '../../imageModels/google/imagen-3'

class Seedance1Lite {
  data: ModelData

  constructor() {
    this.data = {
      id: 'bytedance/seedance-1-lite',
      providers: [
        {
          id: 'runware',
          model_name: 'bytedance:1@1',
          pricing: {
            type: PRICING_TYPES.POST_GENERATION,
            postCalcFunction: postCalcSimple,
            range: {
              min: 0.0680,
              average: 0.144,
              max: 0.144,
            },
          },
          applyImage: applyImageRunwareVideo,
        }, {
          id: 'wavespeed',
          model_name: 'bytedance/seedance-v1-lite-t2v-720p',
          pricing: {
            type: PRICING_TYPES.FIXED,
            value: 0.16,
          },
          applyImage: this.applyImageWaveSpeed,
        }
      ],
      release_date: '2025-06-16',
      examples: [
        {
          video: '/model-examples/seedance-1-2025-06-16T19-01-20-528Z.webm'
        }
      ]
    }
  }

  getData(): ModelData {
    return this.data
  }

  async applyImageWaveSpeed(params: any): Promise<any> {
    params.image = await processSingleFile(params.files.image)
    params.model = 'bytedance/seedance-v1-lite-i2v-720p'
    delete params.files.image
    return params
  }
}

export default Seedance1Lite