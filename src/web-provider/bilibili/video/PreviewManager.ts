import API_bilibili from '@root/api/bilibili'
import VideoPreviewManager, {
  VideoPreviewData,
} from '@root/core/VideoPreviewManager'
import { createElement, switchLatest } from '@root/utils'
import AsyncLock from '@root/utils/AsyncLock'
import { OrPromise } from '@root/utils/typeUtils'

export default class BiliBiliPreviewManager extends VideoPreviewManager {
  data: Awaited<ReturnType<typeof API_bilibili.getVideoShot>> | null = null
  timeNodesMap = new Map<number, number>()

  asyncLock = new AsyncLock()

  override async onInit() {
    this.asyncLock.reWaiting()
    const data = await API_bilibili.getVideoShot(location.href)
    this.asyncLock.ok()

    this.data = data
    this.timeNodesMap.clear()
    for (let i = 0; i < data.timeNodes.length; i++) {
      this.timeNodesMap.set(data.timeNodes[i], i)
    }
  }

  override getPreviewImage = switchLatest(async (currentTime: number) => {
    await this.asyncLock.waiting()
    if (!this.data) throw Error('no init')

    const frameIndex = (() => {
      let _time = ~~currentTime
      while (true) {
        const time = this.timeNodesMap.get(_time)
        if (time) return time
        _time--
      }
    })()

    const oneImageLength = this.data.xCount * this.data.yCount
    const imageIndex = Math.ceil(frameIndex / oneImageLength) - 1
    const image = this.data.images[imageIndex === -1 ? 0 : imageIndex]

    const realFrameIndex = frameIndex % oneImageLength

    const imageData = await this.getImageFromFrameIndex(image, realFrameIndex)

    // console.log(
    //   '%c ',
    //   `font-size:400px; background:url(${imageData}) no-repeat;`,
    // )
    return {
      image: imageData || '',
      width: this.data.xSize,
      height: this.data.ySize,
    }
  })

  /** 单槽缓存：只保留当前这一张雪碧图的解码结果，切图时立刻丢弃上一张。 */
  private sprite: { img: string; promise: Promise<HTMLImageElement | null> } | null =
    null

  // shortcut: 只缓存一张雪碧图；跨图预览会重新解码一次。旧实现把每张 4800×2700 大图永久缓存（单张≈49MB，整片 6 张≈297MB 常驻），是长时播放内存暴涨的主因。
  private loadSprite(img: string): Promise<HTMLImageElement | null> {
    if (this.sprite?.img === img) return this.sprite.promise
    const promise = (async () => {
      const el = new Image()
      el.crossOrigin = 'Anonymous'
      el.src = img
      try {
        await new Promise<void>((resolve, reject) => {
          el.onload = () => resolve()
          el.onerror = () => reject(new Error('load sprite failed'))
        })
      } catch {
        return null
      }
      return el
    })()
    this.sprite = { img, promise }
    return promise
  }

  getImageFromFrameIndex = async (img: string, index: number) => {
    if (!this.data) throw Error('no init')
    const sprite = await this.loadSprite(img)
    if (!sprite) return

    const x = (index % this.data.xCount) * this.data.xSize
    const y = Math.floor(index / this.data.xCount) * this.data.ySize

    // 只把需要的那一帧从雪碧图裁到小画布，绝不缓存整张大图
    const canvas = createElement('canvas')
    canvas.width = this.data.xSize
    canvas.height = this.data.ySize
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(
      sprite,
      x,
      y,
      this.data.xSize,
      this.data.ySize,
      0,
      0,
      this.data.xSize,
      this.data.ySize,
    )
    return canvas.toDataURL()
  }

  protected override onUnload(): void {
    this.asyncLock.reWaiting()
    this.data = null
    this.timeNodesMap.clear()
    this.sprite = null
  }
}
