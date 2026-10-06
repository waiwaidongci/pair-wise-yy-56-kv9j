import { createReducer, on } from '@ngrx/store'
import type { AuditEvent, ChainData, InspectionPlan, RepairBasis, Weld } from '../types'
import * as A from './weld.actions'

export interface WeldState {
  welds: Weld[]
  plans: InspectionPlan[]
  chain: ChainData
  selectedId: string
  statusFilter: string
  locked: boolean
  version: number
  audit: AuditEvent[]
}

const now = () => new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
let seq = 100
const auditEvent = (actor: string, action: string, target: string, detail: string): AuditEvent =>
  ({ id: `AE-${Date.now()}-${seq++}`, time: now(), actor, action, target, detail })

const emptyChain: ChainData = { batches: [], hardness: [], bases: [], claims: [], offline: [], legacy: [] }

const audit: AuditEvent[] = [
  { id: 'AE-1', time: '16:38', actor: '赵岚', action: '提交复检', target: 'W-104', detail: '返修后 UT 复检合格，等待审核签字' },
  { id: 'AE-2', time: '15:12', actor: '陈锋', action: '录入缺陷', target: 'W-107', detail: '翼缘板端部夹渣，长度 12mm，Ⅱ级' },
  { id: 'AE-3', time: '14:20', actor: '系统', action: '资质预警', target: 'W-109', detail: '焊工证书 2026-10-01 到期，不得列入后续检测计划' },
]

export const initialState: WeldState = {
  welds: [], plans: [], chain: emptyChain,
  selectedId: '', statusFilter: '全部', locked: false, version: 12, audit,
}

export const weldReducer = createReducer(
  initialState,
  on(A.loadWeldsSuccess, (state, { welds, plans }) => ({ ...state, welds, plans, selectedId: state.selectedId || welds[0]?.id || '' })),
  on(A.loadChainSuccess, (state, { chain }) => ({ ...state, chain })),
  on(A.selectWeld, (state, { id }) => ({ ...state, selectedId: id })),
  on(A.filterStatus, (state, { status }) => ({ ...state, statusFilter: status })),
  on(A.advanceWeld, (state, { id, status }) => ({
    ...state, version: state.version + 1,
    welds: state.welds.map((weld) => weld.id === id ? { ...weld, status } : weld),
    audit: [auditEvent('当前审核人', '状态流转', id, `状态变更为 ${status}`), ...state.audit],
  })),
  on(A.createPlan, (state, { plan }) => ({ ...state, plans: [plan, ...state.plans], version: state.version + 1 })),
  on(A.lockBaseline, (state) => ({
    ...state, locked: true,
    audit: [auditEvent('质量负责人', '签字锁定', '检测批次', '焊工资质、检测比例与返修闭环已确认'), ...state.audit],
  })),

  // 同一炉批两人同时提交：先到者占用，后到留冲突并记录先到者
  on(A.claimBatch, (state, { batchId, actor }) => {
    const holder = state.chain.claims.find((c) => c.batchId === batchId && c.state === '占用中')
    const claim = holder
      ? { id: `CL-${seq++}`, batchId, actor, submittedAt: new Date().toISOString(), state: '冲突' as const, blockedBy: holder.id }
      : { id: `CL-${seq++}`, batchId, actor, submittedAt: new Date().toISOString(), state: '占用中' as const }
    const detail = holder
      ? `炉批 ${batchId} 已被 ${holder.actor}（${holder.id}）先到占用，本次提交留冲突待处置`
      : `占用炉批 ${batchId}，先到者提交生效`
    return { ...state, chain: { ...state.chain, claims: [claim, ...state.chain.claims] }, audit: [auditEvent(actor, holder ? '提交冲突' : '占用炉批', batchId, detail), ...state.audit] }
  }),

  // 温区 / 保温时间 / 材料组别改动：在途返修计划立即失效重算；已出报告留原依据冻结待复核
  on(A.changeBatchParams, (state, { batchId, actor, zones, holdMinutes, materialGroup }) => {
    const batch = state.chain.batches.find((b) => b.id === batchId)
    if (!batch) return state
    const changed = batch.zones !== zones || batch.holdMinutes !== holdMinutes || batch.materialGroup !== materialGroup
    if (!changed) return state
    const newParams = { materialGroup, zones, holdMinutes }
    const events: AuditEvent[] = [
      auditEvent(actor, '炉批参数改动', batchId, `温区 ${batch.zones}→${zones}；保温 ${batch.holdMinutes}→${holdMinutes} 分钟；材料组别 ${batch.materialGroup}→${materialGroup}`),
    ]

    const updatedBases: RepairBasis[] = []
    const newBases: RepairBasis[] = []
    const newPlans: InspectionPlan[] = []
    const planReplace = new Map<string, string>()

    for (const basis of state.chain.bases) {
      if (basis.batchId !== batchId || basis.state === '已冻结') { updatedBases.push(basis); continue }
      if (basis.issuedReport) {
        // 已出报告：保留原依据，冻结待复核，不重算
        updatedBases.push({ ...basis, state: '已冻结' })
        events.push(auditEvent('系统', '依据冻结', basis.id, `炉批参数改动且报告 ${basis.issuedReport} 已出，原依据保留待复核`))
        continue
      }
      // 未出报告：依据立即失效，按新参数重算新依据
      const nextBasisId = `RB-${seq++}`
      const nextBasis: RepairBasis = { ...basis, id: nextBasisId, state: '有效', supersededBy: '', parameterSnapshot: newParams }
      newBases.push(nextBasis)
      updatedBases.push({ ...basis, state: '已失效', supersededBy: nextBasisId })
      events.push(auditEvent('系统', '依据失效重算', nextBasisId, `${basis.id} 随炉批参数改动立即失效，按新参数重算`))
      // 挂在该依据上的在途返修计划同步作废重算
      const oldPlan = state.plans.find((p) => p.id === basis.planId)
      if (oldPlan && oldPlan.state !== '已完成' && oldPlan.state !== '已失效') {
        const nextPlanId = `IP-R-${seq++}`
        newPlans.push({ id: nextPlanId, date: new Date().toISOString().slice(0, 10), method: oldPlan.method, weldIds: oldPlan.weldIds, inspector: oldPlan.inspector, state: '待执行', basisOf: nextBasisId })
        nextBasis.planId = nextPlanId
        planReplace.set(oldPlan.id, nextPlanId)
        events.push(auditEvent('系统', '返修计划重算', nextPlanId, `在途返修计划 ${oldPlan.id} 立即失效，按炉批 ${batchId} 新参数重算`))
      }
    }

    const plans = state.plans.map((p) => planReplace.has(p.id)
      ? { ...p, state: '已失效' as const, supersededBy: planReplace.get(p.id) }
      : p)

    return {
      ...state,
      version: state.version + 1,
      chain: { ...state.chain, batches: state.chain.batches.map((b) => b.id === batchId ? { ...b, zones, holdMinutes, materialGroup } : b), bases: [...newBases, ...updatedBases] },
      plans: [...newPlans, ...plans],
      audit: [...events, ...state.audit],
    }
  }),

  // 复核已冻结依据：原参数依据关闭（已复核），需人工确认报告是否仍有效
  on(A.reviewFrozenBasis, (state, { basisId, actor }) => ({
    ...state,
    chain: { ...state.chain, bases: state.chain.bases.filter((b) => b.id !== basisId) },
    audit: [auditEvent(actor, '复核冻结依据', basisId, '原炉批参数下出具的报告已复核，冻结依据关闭'), ...state.audit],
  })),

  // 离线抄录回网：按炉批号合并；同一现场副本重传只算第一次；失败保留副本
  on(A.syncOffline, (state, { entryId, actor }) => {
    const entry = state.chain.offline.find((e) => e.id === entryId)
    if (!entry) return state
    // 同一炉批号 + 同一份现场副本摘要已合并过：重传只算第一次
    const already = state.chain.offline.find((e) => e.id !== entryId && e.batchId === entry.batchId && e.payloadDigest === entry.payloadDigest && (e.state === '已合并'))
    if (already) {
      return {
        ...state,
        chain: { ...state.chain, offline: state.chain.offline.map((e) => e.id === entryId ? { ...e, state: '已合并' as const, mergedTo: already.mergedTo ?? entry.batchId } : e) },
        audit: [auditEvent(actor, '离线去重', entryId, `与 ${already.id} 为同一现场副本，重传只算第一次，按炉批号 ${entry.batchId} 合并`), ...state.audit],
      }
    }
    // 模拟网络失败：保留现场副本，可从副本重试
    const fail = entry.attempts === 0
    if (fail) {
      return {
        ...state,
        chain: { ...state.chain, offline: state.chain.offline.map((e) => e.id === entryId ? { ...e, state: '失败' as const, attempts: 1, syncedAt: new Date().toISOString(), lastError: '现场网络中断，数据未送达' } : e) },
        audit: [auditEvent(actor, '离线同步失败', entryId, '回网合并失败，现场副本已保留，可从副本重试'), ...state.audit],
      }
    }
    return {
      ...state,
      chain: { ...state.chain, offline: state.chain.offline.map((e) => e.id === entryId ? { ...e, state: '已合并' as const, syncedAt: new Date().toISOString(), mergedTo: entry.batchId, lastError: '' } : e) },
      audit: [auditEvent(actor, '离线合并', entryId, `按炉批号 ${entry.batchId} 合并回网（现场副本重试成功）`), ...state.audit],
    }
  }),
  on(A.retryOffline, (state, { entryId }) => {
    const entry = state.chain.offline.find((e) => e.id === entryId)
    if (!entry || entry.state !== '失败') return state
    return { ...state, chain: { ...state.chain, offline: state.chain.offline.map((e) => e.id === entryId ? { ...e, state: '待同步' as const } : e) } }
  }),

  // 旧记录缺炉批号：待关联 → 补填炉批号后并入依据链
  on(A.linkLegacy, (state, { legacyId, batchId, actor }) => {
    const legacy = state.chain.legacy.find((l) => l.id === legacyId)
    if (!legacy) return state
    const hardnessAdd = legacy.kind === '硬度'
      ? [{ id: `HD-L-${seq++}`, batchId, componentId: legacy.componentId, weldId: legacy.weldId, hbw: legacy.hbw ?? 0, limit: '≤ 270HBW', pass: (legacy.hbw ?? 0) <= 270, report: legacy.ref, testedAt: legacy.foundAt, legacy: true }]
      : []
    return {
      ...state,
      chain: {
        ...state.chain,
        legacy: state.chain.legacy.map((l) => l.id === legacyId ? { ...l, state: '已关联' as const, linkedBatchId: batchId } : l),
        hardness: [...hardnessAdd, ...state.chain.hardness],
      },
      audit: [auditEvent(actor, '旧记录补关联', legacyId, `原记录缺炉批号，补关联至 ${batchId} 后计入覆盖核对`), ...state.audit],
    }
  }),
)
