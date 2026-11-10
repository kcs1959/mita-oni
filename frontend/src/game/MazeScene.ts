import Phaser from 'phaser'
import type { Cell, Role } from '../lib/protocol'
import { CELL, COLORS, LANDMARKS, VISION_RADIUS_PX } from './config'

export interface MazeSceneData {
  maze: string[]
  role: Role
  you: Cell
  opp: Cell
}

/** サーバーの 30Hz 更新の間を、描画の 60fps で補間して滑らかに動かすための係数（1 秒あたり） */
const FOLLOW_RATE = 28
/** これ以上離れたら補間せずに瞬間移動させる（マス数） */
const SNAP_CELLS = 2

const cellCenter = ([x, y]: Cell) => ({ x: x * CELL + CELL / 2, y: y * CELL + CELL / 2 })

/**
 * 迷路・プレイヤー・視界（霧）を描画するだけのシーン。
 * 移動や当たり判定の権威はサーバーにあり、ここは受け取った位置を表示するだけ。
 */
export class MazeScene extends Phaser.Scene {
  private data0!: MazeSceneData
  private me!: Phaser.GameObjects.Container
  private opp!: Phaser.GameObjects.Container
  private fog!: Phaser.GameObjects.Image
  private ring!: Phaser.GameObjects.Graphics
  private target = { me: { x: 0, y: 0 }, opp: { x: 0, y: 0 } }

  constructor() {
    super('maze')
  }

  init(data: MazeSceneData) {
    this.data0 = data
  }

  create() {
    const { maze, role } = this.data0
    this.drawMaze(maze)
    this.drawLandmarks()

    const oppRole: Role = role === 'oni' ? 'runner' : 'oni'
    this.opp = this.makeCharacter(oppRole)
    this.me = this.makeCharacter(role)
    this.setPositions(this.data0.you, this.data0.opp, true)

    this.fog = this.add.image(0, 0, this.makeFogTexture(maze)).setDepth(10)
    this.ring = this.add.graphics().setDepth(11)
    this.ring.lineStyle(2.7, COLORS.ring, 1).strokeCircle(0, 0, VISION_RADIUS_PX)
  }

  /** サーバーから届いた最新のマス座標を目標位置として設定する */
  setPositions(you: Cell, opp: Cell, snap = false) {
    if (!this.me) return
    this.target.me = cellCenter(you)
    this.target.opp = cellCenter(opp)
    if (snap) {
      this.me.setPosition(this.target.me.x, this.target.me.y)
      this.opp.setPosition(this.target.opp.x, this.target.opp.y)
    }
  }

  update(_time: number, delta: number) {
    const t = 1 - Math.exp((-FOLLOW_RATE * delta) / 1000)
    for (const [obj, to] of [
      [this.me, this.target.me],
      [this.opp, this.target.opp],
    ] as const) {
      const dist = Phaser.Math.Distance.Between(obj.x, obj.y, to.x, to.y)
      if (dist > CELL * SNAP_CELLS || dist < 0.5) obj.setPosition(to.x, to.y)
      else obj.setPosition(obj.x + (to.x - obj.x) * t, obj.y + (to.y - obj.y) * t)
    }

    // 霧と視界の輪を自分と一緒に動かす（プレイヤー + 外円ごと移動）
    this.fog.setPosition(this.me.x, this.me.y)
    this.ring.setPosition(this.me.x, this.me.y)

    // 霧は完全な不透明ではないので、視界外の相手はそもそも描画しない
    const d = Phaser.Math.Distance.Between(this.me.x, this.me.y, this.opp.x, this.opp.y)
    this.opp.setVisible(d <= VISION_RADIUS_PX)
  }

  private drawMaze(maze: string[]) {
    const g = this.add.graphics()
    const w = maze[0].length * CELL
    const h = maze.length * CELL
    g.fillStyle(COLORS.road, 1).fillRect(0, 0, w, h)
    const pad = 2
    maze.forEach((row, y) => {
      ;[...row].forEach((c, x) => {
        const px = x * CELL
        const py = y * CELL
        if (c === '#') {
          g.fillStyle(COLORS.wall, 1).fillRoundedRect(px + pad, py + pad, CELL - pad * 2, CELL - pad * 2, 6)
          g.fillStyle(COLORS.wallHighlight, 1).fillRoundedRect(px + pad + 3, py + pad + 3, CELL - pad * 2 - 6, 4, 2)
        } else if (x % 2 === 1 && y % 2 === 1) {
          g.fillStyle(COLORS.marker, 0.4).fillCircle(px + CELL / 2, py + CELL / 2, 2)
        }
      })
    })
  }

  private drawLandmarks() {
    for (const m of LANDMARKS) {
      const x = m.x * CELL
      const y = m.y * CELL
      const w = m.w * CELL
      const h = m.h * CELL
      const g = this.add.graphics().setAlpha(0.6)
      g.fillStyle(COLORS.landmarkBg, 1).fillRoundedRect(x, y, w, h, 12)
      g.fillStyle(m.color, 1).fillRoundedRect(x + 7, y + 7, w - 14, 4, 2)
      const color = `#${m.color.toString(16).padStart(6, '0')}`
      this.add
        .text(x + w / 2, y + h * 0.42, m.icon, { fontFamily: 'Noto Sans JP', fontSize: '20px', fontStyle: 'bold', color })
        .setOrigin(0.5)
        .setAlpha(0.75)
      this.add
        .text(x + w / 2, y + h * 0.75, m.label, { fontFamily: 'Noto Sans JP', fontSize: '14px', fontStyle: 'bold', color: COLORS.text })
        .setOrigin(0.5)
        .setAlpha(0.75)
    }
  }

  private makeCharacter(role: Role): Phaser.GameObjects.Container {
    const color = role === 'oni' ? COLORS.oni : COLORS.runner
    const r = CELL * 0.4
    const g = this.add.graphics()
    g.fillStyle(color, 0.13).fillCircle(0, 0, r * 1.3)
    g.fillStyle(color, 1).fillCircle(0, 0, r)
    g.fillStyle(COLORS.eye, 1)
    g.fillEllipse(-r * 0.32, -r * 0.2, r * 0.2, r * 0.3)
    g.fillEllipse(r * 0.32, -r * 0.2, r * 0.2, r * 0.3)
    g.fillRoundedRect(-r * 0.4, r * 0.32, r * 0.8, 2, 1)
    return this.add.container(0, 0, [g]).setDepth(role === this.data0.role ? 5 : 4)
  }

  /**
   * 視界外を覆う霧のテクスチャ。中心に視界の穴が空いた暗い板を 1 枚作り、
   * それを毎フレーム自分の位置へ動かすだけで視界制限を表現する（マスク処理より軽く単純）。
   * 盤面のどこにいても全体を覆えるよう、盤面の 2 倍の大きさにしている。
   */
  private makeFogTexture(maze: string[]): string {
    const key = 'fog'
    if (this.textures.exists(key)) this.textures.remove(key)
    const w = maze[0].length * CELL * 2
    const h = maze.length * CELL * 2
    const tex = this.textures.createCanvas(key, w, h)!
    const ctx = tex.getContext()
    ctx.fillStyle = 'rgba(9, 19, 34, 0.9)'
    ctx.fillRect(0, 0, w, h)
    ctx.globalCompositeOperation = 'destination-out'
    const grad = ctx.createRadialGradient(w / 2, h / 2, VISION_RADIUS_PX * 0.85, w / 2, h / 2, VISION_RADIUS_PX)
    grad.addColorStop(0, 'rgba(0,0,0,1)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, VISION_RADIUS_PX, 0, Math.PI * 2)
    ctx.fill()
    tex.refresh()
    return key
  }
}

export function createMazeGame(parent: HTMLElement, data: MazeSceneData): { game: Phaser.Game; scene: () => MazeScene | null } {
  const width = data.maze[0].length * CELL
  const height = data.maze.length * CELL
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width,
    height,
    backgroundColor: '#091322',
    // 描画は 60fps に固定（高リフレッシュレートのモニタでも 60fps）
    fps: { target: 60, limit: 60 },
    scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    banner: false,
    scene: [],
  })
  game.scene.add('maze', MazeScene, true, data)
  return {
    game,
    scene: () => (game.scene.getScene('maze') as MazeScene | null) ?? null,
  }
}
