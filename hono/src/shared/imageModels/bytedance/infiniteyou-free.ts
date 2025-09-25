import InfiniteYou from './infiniteyou'

class InfiniteYouFree extends InfiniteYou {
  constructor(...args: any[]) {
    super(...args)
    this.data.id = 'ByteDance/InfiniteYou:free'
    this.data.providers[0].pricing.value = 0
  }
}

export default InfiniteYouFree