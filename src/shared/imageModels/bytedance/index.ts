// Bytedance Image Models
import DreaminaV31 from './dreamina-3.1'
import InfiniteYou from './infiniteyou'
import InfiniteYouFree from './infiniteyou-free'
import SeedEditV3 from './seededit-v3'
import SeedreamV3 from './seedream-v3'
import SeedreamV4 from './seedream-v4'

// Create instances and export their data
export const bytedanceImageModels = {
  'bytedance/dreamina-3.1': new DreaminaV31().getData(),
  'ByteDance/InfiniteYou': new InfiniteYou().getData(),
  'ByteDance/InfiniteYou:free': new InfiniteYouFree().getData(),
  'bytedance/seededit-3': new SeedEditV3().getData(),
  'bytedance/seedream-3': new SeedreamV3().getData(),
  'bytedance/seedream-4': new SeedreamV4().getData(),
}

// Export individual models for direct import
export {
  DreaminaV31,
  InfiniteYou,
  InfiniteYouFree,
  SeedEditV3,
  SeedreamV3,
  SeedreamV4
}