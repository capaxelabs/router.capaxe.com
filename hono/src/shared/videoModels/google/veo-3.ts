import { PRICING_TYPES } from '../../PricingScheme'
import { ModelData } from '../../../shared/imageModels/google/imagen-3'
import { processSingleFile } from '../../../lib/imageHelpers'

class Veo3 {
  data: ModelData

  constructor() {
    this.data = {
      id: 'google/veo-3',
      providers: [
        {
          id: 'gemini',
        model_name: 'veo-3.0-generate-001',
          pricing: {
            type: PRICING_TYPES.FIXED,
            value: 6,
          },
          applyImage: this.applyImage,
        }, {
          id: 'vertex',
          model_name: 'veo-3.0-generate-preview',
          pricing: {
            type: PRICING_TYPES.FIXED,
            value: 6,
          },
          applyImage: this.applyImage,
        }
      ],
      arena_score: 1240,
      release_date: '2025-05-20',
      examples: [
        {
          video: '/model-examples/veo-3.webm'
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

    // Validate and set Veo 3 specific parameters
    this.validateVeoParams(params)
    
    return params
  }

  validateVeoParams(params: any): void {
    // Veo 3 supports both 16:9 and 9:16 aspect ratios
    if (params.aspect_ratio && !['16:9', '9:16'].includes(params.aspect_ratio)) {
      throw new Error('Veo 3 supports aspect ratios: "16:9", "9:16"')
    }

    // Resolution validation - 1080p only available for 16:9
    if (params.resolution === '1080p' && params.aspect_ratio === '9:16') {
      throw new Error('1080p resolution is only available for 16:9 aspect ratio in Veo 3')
    }

    // Person generation validation for Veo 3
    if (params.person_generation) {
      if (params.image) {
        // Image-to-video: only allow_adult
        if (params.person_generation !== 'allow_adult') {
          console.warn('Veo 3 image-to-video only supports person_generation: "allow_adult", adjusting parameter')
          params.person_generation = 'allow_adult'
        }
      } else {
        // Text-to-video: only allow_all
        if (params.person_generation !== 'allow_all') {
          console.warn('Veo 3 text-to-video only supports person_generation: "allow_all", adjusting parameter')
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

export default Veo3