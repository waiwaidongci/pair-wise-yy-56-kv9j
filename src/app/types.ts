export type WeldStatus = '待检测' | '合格' | '返修中' | '待复检' | '已关闭'
export type DefectLevel = 'Ⅰ级' | 'Ⅱ级' | 'Ⅲ级' | 'Ⅳ级'

/** 依据链状态：有效 / 已失效（参数变更未出报告，立即失效重算）/ 已冻结（已出报告留原依据待复核）*/
export type BasisState = '有效' | '已失效' | '已冻结'
/** 检测计划状态：参数变更后在途返修计划立即失效 */
export type PlanState = '待执行' | '执行中' | '已完成' | '已失效'
export type ClaimState = '占用中' | '冲突'
export type OfflineState = '待同步' | '同步中' | '已合并' | '失败'

export interface Defect {
  id: string
  position: number
  type: string
  length: number
  level: DefectLevel
  method: string
  report: string
}

export interface Weld {
  id: string
  drawing: string
  component: string
  joint: string
  method: string
  welder: string
  qualification: string
  qualificationValid: boolean
  inspectionRatio: number
  requiredRatio: number
  status: WeldStatus
  x: number
  y: number
  repairs: number
  defects: Defect[]
}

/** 热处理炉批：温区、保温时间、材料组别是返修计划的生效参数 */
export interface HeatBatch {
  id: string
  materialGroup: string
  zones: string
  holdMinutes: number
  date: string
  componentIds: string[]
  weldIds: string[]
  recordedAt: string
  actor: string
}

/** 硬度复测：按同炉批同材料组别的全部构件核对覆盖范围 */
export interface HardnessTest {
  id: string
  batchId: string
  componentId: string
  weldId: string
  hbw: number
  limit: string
  pass: boolean
  report: string
  testedAt: string
  /** 旧记录补录时为 true：原记录缺炉批号，关联前不计入覆盖 */
  legacy?: boolean
}

/**
 * 同一依据：焊缝 → 热处理炉批 → 硬度复测 → 检测/返修计划。
 * 创建时冻结炉批参数快照；温区、保温时间或材料组别任一字段改动：
 *  - 已出报告：保留原依据，状态置“已冻结”待复核；
 *  - 未出报告：状态置“已失效”，关联返修计划立即失效并重算新依据。
 */
export interface RepairBasis {
  id: string
  weldId: string
  batchId: string
  hardnessIds: string[]
  planId: string
  state: BasisState
  issuedReport: string
  parameterSnapshot: { materialGroup: string; zones: string; holdMinutes: number }
  supersededBy: string
  createdAt: string
}

/** 同炉批并发提交：先到者占用，后到留冲突（记录先到者） */
export interface BatchClaim {
  id: string
  batchId: string
  actor: string
  submittedAt: string
  state: ClaimState
  /** 冲突时指向先到者占用记录 */
  blockedBy?: string
}

/** 离线抄录回网：按炉批号合并，重传（同一副本摘要）只算第一次；失败保留现场副本可重试 */
export interface OfflineEntry {
  id: string
  batchId: string
  /** 现场副本摘要：同批次抄录重传时摘要相同，只计第一次 */
  payloadDigest: string
  copy: string
  actor: string
  capturedAt: string
  syncedAt: string
  state: OfflineState
  attempts: number
  lastError: string
  /** 已合并到的炉批号（合并键为炉批号） */
  mergedTo?: string
}

/** 旧记录缺炉批号：先补成待关联，待人工补填炉批号后才并入依据链覆盖 */
export interface LegacyRecord {
  id: string
  kind: '硬度' | '热处理'
  ref: string
  componentId: string
  weldId: string
  hbw?: number
  materialGuess: string
  foundAt: string
  state: '待关联' | '已关联'
  linkedBatchId: string
}

export interface InspectionPlan {
  id: string
  date: string
  method: string
  weldIds: string[]
  inspector: string
  state: PlanState
  /** 失效重算时指向原计划 */
  basisOf?: string
  supersededBy?: string
}

export interface ChainData {
  batches: HeatBatch[]
  hardness: HardnessTest[]
  bases: RepairBasis[]
  claims: BatchClaim[]
  offline: OfflineEntry[]
  legacy: LegacyRecord[]
}

export interface AuditEvent {
  id: string
  time: string
  actor: string
  action: string
  target: string
  detail: string
}
