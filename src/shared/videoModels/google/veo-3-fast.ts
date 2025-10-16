import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from '../../../utils/providerSelector'
import { processSingleFile } from '../../../lib/imageHelpers'

class Veo3Fast {
  data: ModelData
  constructor() {
    this.data = {
      id: 'google/veo-3-fast',
      providers: [
        {
          id: 'gemini',
        model_name: 'veo-3.0-fast-generate-001',
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
          applyImage: this.applyImage,
        }
      ],
      release_date: '2025-06-12'
    }
  }

  getData(): ModelData {
    return this.data
  }

  async applyImage(params: any): Promise<any> {
    // Process image files if provided
    if (params.files?.image) {
      params.image = await processSingleFile(params.files.image)
      delete params.files.image
    }

    // Validate and set Veo 3 Fast specific parameters (same as Veo 3)
    this.validateVeoParams(params)
    
    return params
  }

  validateVeoParams(params: any): void {
    // Veo 3 Fast supports both 16:9 and 9:16 aspect ratios
    if (params.aspect_ratio && !['16:9', '9:16'].includes(params.aspect_ratio)) {
      throw new Error('Veo 3 Fast supports aspect ratios: "16:9", "9:16"')
    }

    // Resolution validation - 1080p only available for 16:9
    if (params.resolution === '1080p' && params.aspect_ratio === '9:16') {
      throw new Error('1080p resolution is only available for 16:9 aspect ratio in Veo 3 Fast')
    }

    // Person generation validation for Veo 3 Fast
    if (params.person_generation) {
      if (params.image) {
        // Image-to-video: only allow_adult
        if (params.person_generation !== 'allow_adult') {
          console.warn('Veo 3 Fast image-to-video only supports person_generation: "allow_adult", adjusting parameter')
          params.person_generation = 'allow_adult'
        }
      } else {
        // Text-to-video: only allow_all
        if (params.person_generation !== 'allow_all') {
          console.warn('Veo 3 Fast text-to-video only supports person_generation: "allow_all", adjusting parameter')
          params.person_generation = 'allow_all'
        }
      }
    }

    // Set defaults
    params.aspect_ratio = params.aspect_ratio || '16:9'
    params.resolution = params.resolution || '720p'
    params.person_generation = params.person_generation || (params.image ? 'allow_adult' : 'allow_all')
  }
}

export default Veo3Fast