import API_bilibili from '@root/api/bilibili'
import VideoPreviewManager from '@root/core/VideoPreviewManager'
import { createElement, switchLatest } from '@root/utils'
import AsyncLock from '@root/utils/AsyncLock'
import { getVideoInfo } from './utils'

//i.ytimg.com/sb/_LaVvGlkBDs/storyboard3_L$L/$N.jpg?sqp=-oaymwENSDfyq4qpAwVwAcABBqLzl_8DBgizoYbVBQ==|48#27#100#10#10#0#default#rs$AOn4CLAA38Ph1_ymbKlaeU80kIYB4yK1iw|80#45#122#10#10#5000#M$M#rs$AOn4CLAN3OpH57qro3fcfTWavdhucIBTNg|160#90#122#5#5#5000#M$M#rs$AOn4CLAL_qzDlf70Qjr3scobD-5INjMzZQ

export default class YoutubePreviewManager extends VideoPreviewManager {
  data: Awaited<ReturnType<typeof API_bilibili.getVideoShot>> | null = null
  oneFrameTime = 0
  asyncLock = new AsyncLock()

  override async onInit() {
    if (!this.webVideo) return
    this.asyncLock.reWaiting()

    const videoInfo = await getVideoInfo()
    const url: string = videoInfo.storyboards.playerStoryboardSpecRenderer.spec
    const vid = new URLSearchParams(location.search).get('v') || ''
    const sqp = (new URL(url).searchParams.get('sqp') || '').replace(
      /\|.*$/,
      '',
    )

    const a1 = url.split('|')
    const code = a1[a1.length - 1]

    const [width, height, frameCount, cols, rows, ...others] = code.split('#')
    const sigh = others[others.length - 1]

    const duration = this.webVideo.duration
    const fragmentCount = +frameCount / (+cols * +rows),
      fragmentDuration = duration / fragmentCount

    this.oneFrameTime = fragmentDuration / (+cols * +rows)

    this.data = {
      images: new Array(Math.ceil(fragmentCount))
        .fill(null)
        .map(
          (_, i) =>
            `https://i.ytimg.com/sb/${vid}/storyboard3_L${a1.length - 2}/M${i}.jpg?sqp=${sqp}&sigh=${sigh}`,
        ),
      timeNodes: [],
      xCount: +cols,
      yCount: +rows,
      xSize: +width,
      ySize: +height,
    }

    this.asyncLock.ok()
  }

  override getPreviewImage = switchLatest(async (currentTime: number) => {
    await this.asyncLock.waiting()
    if (!this.data) throw Error('no init')

    const frameIndex = Math.ceil(currentTime / this.oneFrameTime)

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

  // shortcut: 只缓存一张雪碧图；跨图预览会重新解码一次。旧实现把所有雪碧图大 canvas 永久缓存，是长时播放内存暴涨的主因。
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
    this.sprite = null
  }
}
