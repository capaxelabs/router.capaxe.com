import CyberRealisticPony from './CyberRealistic-Pony'
import DreamShaper from './DreamShaper'
import RMBG20 from './RMBG-2.0'
import RealVisXL from './RealVisXL'
import RealisticVision from './Realistic-Vision'

// Initialize all Runware models
const cyberRealisticPony = new CyberRealisticPony()
const dreamShaper = new DreamShaper()
const rmbg20 = new RMBG20()
const realVisXL = new RealVisXL()
const realisticVision = new RealisticVision()

export const runwareImageModels = {
  [cyberRealisticPony.data.id]: cyberRealisticPony.data,
  [dreamShaper.data.id]: dreamShaper.data,
  [rmbg20.data.id]: rmbg20.data,
  [realVisXL.data.id]: realVisXL.data,
  [realisticVision.data.id]: realisticVision.data,
}

export {
  CyberRealisticPony,
  DreamShaper,
  RMBG20,
  RealVisXL,
  RealisticVision
}