import CyberRealisticPony from './CyberRealistic-Pony'
import DreamShaper from './DreamShaper'
import RMBG20 from './RMBG-2.0'
import RealVisXL from './RealVisXL'
import RealisticVision from './Realistic-Vision'
import FluxPro from './flux-pro'
import GoogleImagen4 from './google-imagen-4'
import BytedanceSeedreamV3 from './bytedance-seedream-v3'
import BytedanceSeedreamV5 from './bytedance-seedream-v5'
import SourcefulFluxV1 from './sourceful-flux-v1'

// Initialize all Runware models
const cyberRealisticPony = new CyberRealisticPony()
const dreamShaper = new DreamShaper()
const rmbg20 = new RMBG20()
const realVisXL = new RealVisXL()
const realisticVision = new RealisticVision()
const fluxPro = new FluxPro()
const googleImagen4 = new GoogleImagen4()
const bytedanceSeedreamV3 = new BytedanceSeedreamV3()
const bytedanceSeedreamV5 = new BytedanceSeedreamV5()
const sourcefulFluxV1 = new SourcefulFluxV1()

export const runwareImageModels = {
  [cyberRealisticPony.data.id]: cyberRealisticPony.data,
  [dreamShaper.data.id]: dreamShaper.data,
  [rmbg20.data.id]: rmbg20.data,
  [realVisXL.data.id]: realVisXL.data,
  [realisticVision.data.id]: realisticVision.data,
  [fluxPro.data.id]: fluxPro.data,
  [googleImagen4.data.id]: googleImagen4.data,
  [bytedanceSeedreamV3.data.id]: bytedanceSeedreamV3.data,
  [bytedanceSeedreamV5.data.id]: bytedanceSeedreamV5.data,
  [sourcefulFluxV1.data.id]: sourcefulFluxV1.data,
}

export {
  CyberRealisticPony,
  DreamShaper,
  RMBG20,
  RealVisXL,
  RealisticVision,
  FluxPro,
  GoogleImagen4,
  BytedanceSeedreamV3,
  BytedanceSeedreamV5,
  SourcefulFluxV1
}