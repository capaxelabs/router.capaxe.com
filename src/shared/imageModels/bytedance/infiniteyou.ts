import { PRICING_TYPES } from '../../PricingScheme'
import { processSingleFile } from '../../../lib/imageHelpers'
import { ModelData } from '../google/imagen-3'

class InfiniteYou {
  data: ModelData

  constructor() {
    this.data = {
      id: 'ByteDance/InfiniteYou',
      providers: [{
        id: 'chutes',
        model_name: 'infiniteyou',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 0.01
        },
        applyImage: this.applyImage
      }],
      release_date: '2025-03-21',
      examples: [
        {
          image: '/model-examples/InfiniteYou-2025-06-23T10-38-20-558Z.webp'
        }
      ]
    }
  }

  // Convert uploaded image to base64 string expected by InfiniteYou endpoint
  async applyImage(params: any): Promise<any> {
    if (!params.files?.image) {
      throw new Error('No image provided. Please provide a reference image with a person in it.')
    }
    params.id_image_b64 = await processSingleFile(params.files.image, 'datauri')
    delete params.files.image
    return params
  }

  getData(): ModelData {
    return this.data
  }
}

export default InfiniteYou