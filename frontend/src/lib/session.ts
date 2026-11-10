import type { Role } from './protocol'

// タブを閉じるまで保持できれば十分なので sessionStorage を使う
const NAME_KEY = 'mita-oni:name'
const RESULT_KEY = 'mita-oni:last-result'

export interface LastResult {
  role: Role
  recordId: number
}

export function getName(): string {
  return sessionStorage.getItem(NAME_KEY) ?? ''
}

export function setName(name: string) {
  sessionStorage.setItem(NAME_KEY, name)
}

export function getLastResult(): LastResult | null {
  const raw = sessionStorage.getItem(RESULT_KEY)
  return raw ? (JSON.parse(raw) as LastResult) : null
}

export function setLastResult(result: LastResult) {
  sessionStorage.setItem(RESULT_KEY, JSON.stringify(result))
}
