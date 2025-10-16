import { PRICING_TYPES } from '../../PricingScheme'
import Gemini20FlashExp from './gemini-2.0-flash-exp'
import { ModelData } from './imagen-3'

// Create an instance to access instance methods
const geminiInstance = new Gemini20FlashExp()

class Gemini20FlashPrev {
  data: ModelData

  constructor() {
    this.data = {
      id: 'google/gemini-2.0-flash-prev',
      providers: [{
        id: 'gemini',
        model_name: 'gemini-2.0-flash-preview-image-generation',
        pricing: {
          type: PRICING_TYPES.POST_GENERATION,
          postCalcFunction: this.postCalcPrice,
          value: 0.039,
        },
        applyImage: geminiInstance.applyImage,
      }],
      arena_score: 980,
      release_date: '2025-05-07',
      examples: [
        {
          image: '/model-examples/gemini-2.0-flash-prev-2025-05-13T11-25-55-222Z.webp'
        }
      ]
    }
  }

  postCalcPrice(imageResult: { data?: any[] }): number {
    // Calculate price based on number of images generated
    const pricePerImage = 0.039
    const numberOfImages = imageResult.data ? imageResult.data.length : 1
    return pricePerImage * numberOfImages
  }

  getData(): ModelData {
    return this.data
  }
}

export default Gemini20FlashPrev