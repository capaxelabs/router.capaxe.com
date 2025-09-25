import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from '../../../shared/imageModels/google/imagen-3'
import { processSingleFile } from '../../../lib/imageHelpers'

class Veo3Fast {
  data: ModelData

  constructor() {
    this.data = {
      id: 'google/veo-3-fast',
      providers: [
        {
          id: 'gemini',
        model_name: 'veo-3.0-generate-001',
          pricing: {
            type: PRICING_TYPES.FIXED,
            value: 3.2,
          },
          applyImage: this.applyImage,
        }, {
          id: 'vertex',
          model_name: 'veo-3.0-fast-generate-preview',
          pricing: {
            type: PRICING_TYPES.FIXED,
            value: 3.2,
          },
          // TODO: Implement applyVertexImage function when needed
          // applyImage: applyVertexImage
        }, {
          id: 'replicate',
          model_name: 'google/veo-3-fast',
          pricing: {
            type: PRICING_TYPES.FIXED,
            value: 3.2,
          },
        }, {
          id: 'wavespeed',
          model_name: 'google/veo3-fast', // no audio ?
          pricing: {
            type: PRICING_TYPES.FIXED,
            value: 3.2,
          },
        }
      ],
      release_date: '2025-06-12'
    }
  }

  getData(): ModelData {
    return this.data
  }

  async applyImage(params: any): Promise<any> {
    if (params.files?.image) {
      params.image = await processSingleFile(params.files.image)
      delete params.files.image
    }
    return params
  }
}

export default Veo3Fast