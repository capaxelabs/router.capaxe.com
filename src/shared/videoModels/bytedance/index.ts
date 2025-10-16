// Bytedance Video Models
import Seedance1Lite from './seedance-1-lite'
import Seedance1Pro from './seedance-1-pro'

// Create instances and export their data
export const bytedanceVideoModels = {
  'bytedance/seedance-1-lite': new Seedance1Lite().getData(),
  'bytedance/seedance-1-pro': new Seedance1Pro().getData(),
}

// Export individual models for direct import
export {
  Seedance1Lite,
  Seedance1Pro
}