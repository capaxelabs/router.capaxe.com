import { PRICING_TYPES } from '../../PricingScheme'
import { processSingleFile } from '../../../lib/imageHelpers'
import { ModelData } from '../../../shared/imageModels/google/imagen-3'

class Veo2 {
  data: ModelData

  constructor() {
    this.data = {
      id: 'google/veo-2',
      providers: [{
        id: 'gemini',
        model_name: 'veo-2.0-generate-001',
        pricing: {
          type: PRICING_TYPES.FIXED,
          value: 1.75,
        },
        applyImage: this.applyImage,
      }],
      arena_score: 1115,
      release_date: '2024-12-16',
      examples: [
        {
          video: '/model-examples/veo-2-2025-05-27T22-57-10-794Z.webm'
        }
      ]
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

    // Validate and set Veo 2 specific parameters
    this.validateVeoParams(params)
    
    return params
  }

  validateVeoParams(params: any): void {
    // Veo 2 supports both 16:9 and 9:16 aspect ratios
    if (params.aspect_ratio && !['16:9', '9:16'].includes(params.aspect_ratio)) {
      throw new Error('Veo 2 supports aspect ratios: "16:9", "9:16"')
    }

    // Veo 2 does not support 1080p resolution - always 720p
    if (params.resolution === '1080p') {
      console.warn('Veo 2 does not support 1080p resolution, using 720p instead')
      params.resolution = '720p'
    }

    // Person generation validation for Veo 2 - more flexible than Veo 3
    if (params.person_generation) {
      if (params.image) {
        // Image-to-video: allow_adult and dont_allow
        if (!['allow_adult', 'dont_allow'].includes(params.person_generation)) {
          console.warn('Veo 2 image-to-video supports person_generation: "allow_adult", "dont_allow", adjusting to allow_adult')
          params.person_generation = 'allow_adult'
        }
      } else {
        // Text-to-video: allow_all, allow_adult, dont_allow
        if (!['allow_all', 'allow_adult', 'dont_allow'].includes(params.person_generation)) {
          console.warn('Veo 2 text-to-video supports person_generation: "allow_all", "allow_adult", "dont_allow", adjusting to allow_all')
          params.person_generation = 'allow_all'
        }
      }
    }

    // Set defaults
    params.aspect_ratio = params.aspect_ratio || '16:9'
    params.resolution = '720p' // Always 720p for Veo 2
    params.person_generation = params.person_generation || (params.image ? 'allow_adult' : 'allow_all')
  }
}

export default Veo2