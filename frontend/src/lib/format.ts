const pad = (n: number) => String(n).padStart(2, '0')

/** 02:13 */
export function mmss(ms: number): string {
  const s = Math.ceil(Math.max(0, ms) / 1000)
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}`
}

/** 00:47.82 */
export function mmssCs(ms: number): string {
  const cs = Math.floor(Math.max(0, ms) / 10)
  const s = Math.floor(cs / 100)
  return `${pad(Math.floor(s / 60))}:${pad(s % 60)}.${pad(cs % 100)}`
}

/** #018 */
export function roomNo(id: number): string {
  return String(id).padStart(3, '0')
}
