// Google Image Models
import Gemini20FlashExp from './gemini-2.0-flash-exp'
import Gemini20FlashPrev from './gemini-2.0-flash-prev'
import Gemini25FlashFree from './gemini-2.5-flash-free'
import Gemini25Flash from './gemini-2.5-flash'
import Imagen3Fast from './imagen-3-fast'
import Imagen3 from './imagen-3'
import Imagen40520Ultra from './imagen-4-05-20-ultra'
import Imagen40520 from './imagen-4-05-20'
import Imagen40606Fast from './imagen-4-06-06-fast'
import Imagen40606Ultra from './imagen-4-06-06-ultra'
import Imagen40606 from './imagen-4-06-06'
import Imagen4Fast from './imagen-4-fast'
import Imagen4Ultra from './imagen-4-ultra'
import Imagen4 from './imagen-4'

// Create instances and export their data
export const googleImageModels = {
  'google/gemini-2.0-flash-exp': new Gemini20FlashExp().getData(),
  'google/gemini-2.0-flash-prev': new Gemini20FlashPrev().getData(),
  'google/gemini-2.5-flash:free': new Gemini25FlashFree().getData(),
  'google/gemini-2.5-flash': new Gemini25Flash().getData(),
  'google/imagen-3-fast': new Imagen3Fast().getData(),
  'google/imagen-3': new Imagen3().getData(),
  'google/imagen-4-05-20-ultra': new Imagen40520Ultra().getData(),
  'google/imagen-4-05-20': new Imagen40520().getData(),
  'google/imagen-4-06-06-fast': new Imagen40606Fast().getData(),
  'google/imagen-4-06-06-ultra': new Imagen40606Ultra().getData(),
  'google/imagen-4-06-06': new Imagen40606().getData(),
  'google/imagen-4-fast': new Imagen4Fast().getData(),
  'google/imagen-4-ultra': new Imagen4Ultra().getData(),
  'google/imagen-4': new Imagen4().getData(),
}

// Export individual models for direct import
export {
  Gemini20FlashExp,
  Gemini20FlashPrev,
  Gemini25FlashFree,
  Gemini25Flash,
  Imagen3Fast,
  Imagen3,
  Imagen40520Ultra,
  Imagen40520,
  Imagen40606Fast,
  Imagen40606Ultra,
  Imagen40606,
  Imagen4Fast,
  Imagen4Ultra,
  Imagen4
}