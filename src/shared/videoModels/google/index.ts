// Google Video Models
import Veo2Mock from './veo-2-mock'
import Veo2 from './veo-2'
import Veo3Fast from './veo-3-fast'
import Veo3 from './veo-3'

// Create instances and export their data
export const googleVideoModels = {
  'google/veo-2-mock': new Veo2Mock().getData(),
  'google/veo-2': new Veo2().getData(),
  'google/veo-3-fast': new Veo3Fast().getData(),
  'google/veo-3': new Veo3().getData(),
}

// Export individual models for direct import
export {
  Veo2Mock,
  Veo2,
  Veo3Fast,
  Veo3,
}