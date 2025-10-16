import { PRICING_TYPES } from '../../PricingScheme'
import { Provider } from '../../../utils/providerSelector'

export interface ModelData {
  id: string
  providers: Provider[]
  arena_score?: number
  release_date?: string
  examples?: Array<{ image?: string; video?: string }>
}

class Imagen3 {
  data: ModelData

  constructor() {
    this.data = {
      id: 'google/imagen-3',
      providers: [
        {
          id: 'geminiImagen',
          model_name: 'imagen-3.0-generate-002',
          pricing: {
            type: PRICING_TYPES.FIXED,
            value: 0.03,
          }
        }, {
          id: 'vertex',
          model_name: 'imagen-3.0-generate-002',
          pricing: {
            type: PRICING_TYPES.FIXED,
            value: 0.04,
          }
        }
      ],
      arena_score: 1092,
      release_date: '2024-12-16',
      examples: [
        {
          image: '/model-examples/imagen-3-2025-04-03T15-11-15-706Z.webp'
        }
      ]
    }
  }

  getData(): ModelData {
    return this.data
  }
}

export default Imagen3