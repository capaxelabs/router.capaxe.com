// Runware Video Models
import KlingAI21Pro from './klingai-2.1-pro'
import KlingAI21Standard from './klingai-2.1-standard'
import BytedanceSeedance from './bytedance-seedance'
import OpenAISora from './openai-sora'
import RunwareVideo from './runware-video'

// Create instances and export their data
export const runwareVideoModels = {
  'runware/klingai-2.1-pro': new KlingAI21Pro().getData(),
  'runware/klingai-2.1-standard': new KlingAI21Standard().getData(),
  'runware/bytedance-seedance': new BytedanceSeedance().getData(),
  'runware/openai-sora': new OpenAISora().getData(),
  'runware/runware-video': new RunwareVideo().getData(),
}

// Export individual models for direct import
export {
  KlingAI21Pro,
  KlingAI21Standard,
  BytedanceSeedance,
  OpenAISora,
  RunwareVideo,
}
