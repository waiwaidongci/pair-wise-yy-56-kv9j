import { createReducer, on } from '@ngrx/store'
import type { AuditEvent, InspectionPlan, Weld, FurnaceBatch, HardnessRetest, RepairPlan, FieldRecord, LegacyRetest } from '../types'
import * as A from './weld.actions'

export interface WeldState {
  welds: Weld[]
  plans: InspectionPlan[]
  selectedId: string
  statusFilter: string
  locked: boolean
  version: number
  audit: AuditEvent[]
  // ===== 焊缝 · 热处理炉批 · 硬度复测 同一依据 =====
  furnaceBatches: FurnaceBatch[]
  hardnessRetests: HardnessRetest[]
  repairPlans: RepairPlan[]
  fieldRecords: FieldRecord[]
  legacyRetests: LegacyRetest[]
}

const audit: AuditEvent[] = [
  { id: 'AE-1', time: '16:38', actor: '赵岚', action: '提交复检', target: 'W-104', detail: '返修后 UT 复检合格，等待审核签字' },
  { id: 'AE-2', time: '15:12', actor: '陈锋', action: '录入缺陷', target: 'W-107', detail: '翼缘板端部夹渣，长度 12mm，Ⅱ级' },
  { id: 'AE-3', time: '14:20', actor: '系统', action: '资质预警', target: 'W-109', detail: '焊工证书 2026-10-01 到期，不得列入后续检测计划' },
]

export const initialState: WeldState = { welds: [], plans: [], selectedId: '', statusFilter: '全部', locked: false, version: 12, audit, furnaceBatches: [], hardnessRetests: [], repairPlans: [], fieldRecords: [], legacyRetests: [] }

/** 依据指纹：温区 + 保温时间 + 材料组别，任一改动即依据变更 */
export function basisHashOf(b: { temperatureZone: string; holdingTime: number; materialGroup: string }): string {
  return `WB:${b.temperatureZone}|${b.holdingTime}|${b.materialGroup}`
}

function nowTime(): string { return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }) }
function iso(): string { return new Date().toISOString() }
function aid(): string { return `AE-${Date.now()}-${Math.floor(Math.random() * 1000)}` }

function pushAudit(state: WeldState, actor: string, action: string, target: string, detail: string): WeldState {
  return { ...state, version: state.version + 1, audit: [{ id: aid(), time: nowTime(), actor, action, target, detail }, ...state.audit] }
}

/** 依据变更后：返修计划立即失效重算；已出报告保留原依据，仅置待复核，不覆盖原依据 */
function invalidateAndRecalc(state: WeldState, batch: FurnaceBatch, oldHash: string, actor: string): WeldState {
  let next = pushAudit(state, actor, '依据变更', batch.id, `温区/保温时间/材料组别调整，依据 ${oldHash} → ${batch.basisHash}`)
  // 1) 旧返修计划失效
  next = { ...next, repairPlans: next.repairPlans.map((p) => p.furnaceBatchId === batch.id && p.state === '有效' ? { ...p, state: '已失效' as const } : p) }
  // 2) 立即重算新返修计划
  const newPlan: RepairPlan = { id: `RP-${batch.id}-${next.repairPlans.filter((p) => p.furnaceBatchId === batch.id).length + 1}`, furnaceBatchId: batch.id, weldIds: batch.weldIds, basisHash: batch.basisHash, state: '有效', version: batch.version, reason: '依据变更重算', updatedAt: iso() }
  next = pushAudit(next, actor, '返修计划重算', batch.id, `返修计划已失效并按新依据重算为 ${newPlan.id}，覆盖 ${batch.weldIds.length} 条同批构件`)
  next = { ...next, repairPlans: [newPlan, ...next.repairPlans] }
  // 3) 已出报告保留原依据 → 待复核；未出报告同样需按新依据复测
  let pending = 0
  next = { ...next, hardnessRetests: next.hardnessRetests.map((r) => {
    if (r.furnaceBatchId !== batch.id || r.basisHash === batch.basisHash) return r
    pending++
    return { ...r, result: '待复核' as const }
  }) }
  if (pending > 0) next = pushAudit(next, actor, '报告待复核', batch.id, `${pending} 份硬度复测/报告依据已过期，保留原依据 ${oldHash}，转待复核`)
  return next
}

export const weldReducer = createReducer(
  initialState,
  on(A.loadWeldsSuccess, (state, { welds, plans }) => ({ ...state, welds, plans, selectedId: state.selectedId || welds[0]?.id || '' })),
  on(A.loadHeatTreatmentSuccess, (state, { furnaceBatches, hardnessRetests, repairPlans, fieldRecords, legacyRetests }) => ({ ...state, furnaceBatches, hardnessRetests, repairPlans, fieldRecords, legacyRetests })),
  on(A.selectWeld, (state, { id }) => ({ ...state, selectedId: id })),
  on(A.filterStatus, (state, { status }) => ({ ...state, statusFilter: status })),
  on(A.advanceWeld, (state, { id, status }) => ({ ...state, version: state.version + 1, welds: state.welds.map((weld) => weld.id === id ? { ...weld, status } : weld), audit: [{ id: `AE-${Date.now()}`, time: new Date().toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit', hour12:false }), actor:'当前审核人', action:'状态流转', target:id, detail:`状态变更为 ${status}` }, ...state.audit] })),
  on(A.createPlan, (state, { plan }) => ({ ...state, plans: [plan, ...state.plans], version: state.version + 1 })),
  on(A.lockBaseline, (state) => ({ ...state, locked: true, audit: [{ id: `AE-${Date.now()}`, time: '刚刚', actor: '质量负责人', action: '签字锁定', target: '检测批次', detail: '焊工资质、检测比例与返修闭环已确认' }, ...state.audit] })),

  // 依据变更 → 返修计划失效重算
  on(A.updateFurnaceBasis, (state, { id, temperatureZone, holdingTime, materialGroup, actor }) => {
    const batch = state.furnaceBatches.find((b) => b.id === id)
    if (!batch) return state
    const oldHash = batch.basisHash
    const newHash = basisHashOf({ temperatureZone, holdingTime, materialGroup })
    if (newHash === oldHash) return state
    const updated: FurnaceBatch = { ...batch, temperatureZone, holdingTime, materialGroup, basisHash: newHash, version: batch.version + 1, occupiedBy: '', occupiedAt: '' }
    const next: WeldState = { ...state, furnaceBatches: state.furnaceBatches.map((b) => b.id === id ? updated : b) }
    return invalidateAndRecalc(next, updated, oldHash, actor)
  }),

  // 在线提交：先到者占用炉批
  on(A.submitRetest, (state, { retest, actor }) => {
    const batch = state.furnaceBatches.find((b) => b.id === retest.furnaceBatchId)
    if (!batch) return state
    const next: WeldState = {
      ...state,
      hardnessRetests: [retest, ...state.hardnessRetests],
      furnaceBatches: state.furnaceBatches.map((b) => b.id === batch.id ? { ...b, version: b.version + 1, occupiedBy: actor, occupiedAt: iso() } : b),
    }
    return pushAudit(next, actor, '提交硬度复测', batch.id, `${retest.weldId} 硬度 ${retest.value} HBW，依据 ${retest.basisHash}，占用炉批`)
  }),
  on(A.submitRetestConflict, (state, { furnaceBatchId, actor, occupiedBy }) =>
    pushAudit(state, actor, '提交冲突', furnaceBatchId, `该炉批已被 ${occupiedBy} 先占用，${actor} 后到留冲突，未写入复测记录`)),
  on(A.releaseOccupation, (state, { furnaceBatchId }) => ({
    ...state,
    furnaceBatches: state.furnaceBatches.map((b) => b.id === furnaceBatchId ? { ...b, occupiedBy: '', occupiedAt: '' } : b),
  })),

  // 离线现场副本
  on(A.queueOfflineRecord, (state, { record }) => ({ ...state, fieldRecords: [record, ...state.fieldRecords], audit: [{ id: aid(), time: nowTime(), actor: record.actor, action: '离线抄录', target: record.furnaceBatchId, detail: `${record.weldId} 硬度 ${record.value} HBW 已存入现场副本，待回网合并` }, ...state.audit] })),
  on(A.mergeOfflineRecord, (state, { recordId, simulateFail }) => {
    const rec = state.fieldRecords.find((r) => r.id === recordId)
    if (!rec) return state
    // 模拟网络中断：保留现场副本，置失败，供重试
    if (simulateFail) {
      const next: WeldState = { ...state, fieldRecords: state.fieldRecords.map((r) => r.id === recordId ? { ...r, status: '失败' as const, failReason: '模拟网络中断，未收到服务端确认' } : r) }
      return pushAudit(next, rec.actor, '离线合并失败', rec.furnaceBatchId, `${rec.weldId} 合并失败，现场副本保留，可重试`)
    }
    // 重传只算第一次：幂等键已存在（已合并的复测或现场副本）→ 标记重复，不重复写入
    const alreadyMerged = state.hardnessRetests.some((r) => r.idemKey === rec.idemKey)
      || state.fieldRecords.some((r) => r.idemKey === rec.idemKey && (r.status === '已合并' || r.status === '重复'))
    if (alreadyMerged) {
      const next: WeldState = { ...state, fieldRecords: state.fieldRecords.map((r) => r.id === recordId ? { ...r, status: '重复' as const, mergedAt: iso() } : r) }
      return pushAudit(next, rec.actor, '离线合并去重', rec.furnaceBatchId, `${rec.weldId} 该记录已合并过，重传只算第一次，已忽略`)
    }
    // 并发占用：炉批正被他人占用 → 冲突
    const batch = state.furnaceBatches.find((b) => b.id === rec.furnaceBatchId)
    if (batch && batch.occupiedBy && batch.occupiedBy !== rec.actor) {
      const next: WeldState = { ...state, fieldRecords: state.fieldRecords.map((r) => r.id === recordId ? { ...r, status: '冲突' as const, failReason: `炉批已被 ${batch.occupiedBy} 占用` } : r) }
      return pushAudit(next, rec.actor, '离线合并冲突', rec.furnaceBatchId, `炉批已被 ${batch.occupiedBy} 先占用，合并留冲突`)
    }
    // 正常合并：按炉批号关联到当前依据
    const retest: HardnessRetest = {
      id: `HR-${rec.id}`, furnaceBatchId: rec.furnaceBatchId, weldId: rec.weldId, value: rec.value,
      criterion: rec.criterion, result: '合格', basisHash: batch?.basisHash ?? '', reportNo: '', issued: false,
      idemKey: rec.idemKey, source: '离线', createdAt: rec.clientCreatedAt,
    }
    const next: WeldState = {
      ...state,
      hardnessRetests: [retest, ...state.hardnessRetests],
      fieldRecords: state.fieldRecords.map((r) => r.id === recordId ? { ...r, status: '已合并' as const, mergedAt: iso(), failReason: undefined } : r),
    }
    return pushAudit(next, rec.actor, '离线合并', rec.furnaceBatchId, `${rec.weldId} 按炉批号合并入同一依据（${retest.basisHash || '待关联'}）`)
  }),
  on(A.retryOfflineRecord, (state, { recordId }) => {
    const rec = state.fieldRecords.find((r) => r.id === recordId)
    if (!rec) return state
    const next: WeldState = { ...state, fieldRecords: state.fieldRecords.map((r) => r.id === recordId ? { ...r, status: '待提交' as const, failReason: undefined } : r) }
    return pushAudit(next, rec.actor, '现场副本重试', rec.furnaceBatchId, `${rec.weldId} 从现场副本重新提交`)
  }),

  // 待关联旧记录：补录炉批号 → 关联炉批进入同一依据
  on(A.associateLegacy, (state, { id, furnaceBatchId }) => {
    const legacy = state.legacyRetests.find((r) => r.id === id)
    if (!legacy) return state
    const batch = state.furnaceBatches.find((b) => b.id === furnaceBatchId)
    const retest: HardnessRetest = {
      id: `HR-${legacy.id}`, furnaceBatchId, weldId: legacy.weldId, value: legacy.value,
      criterion: '≤220 HBW', result: '合格', basisHash: batch?.basisHash ?? '',
      reportNo: legacy.reportNo, issued: !!legacy.reportNo, idemKey: `LEGACY-${legacy.id}`,
      source: '旧记录', createdAt: legacy.createdAt,
    }
    const next: WeldState = {
      ...state,
      legacyRetests: state.legacyRetests.map((r) => r.id === id ? { ...r, furnaceBatchId, associated: true } : r),
      hardnessRetests: [retest, ...state.hardnessRetests],
    }
    return pushAudit(next, '系统', '旧记录补关联', furnaceBatchId, `${legacy.weldId} 历史硬度记录补录炉批号，关联入同一依据（${retest.basisHash || '依据缺失'}）`)
  }),
)
