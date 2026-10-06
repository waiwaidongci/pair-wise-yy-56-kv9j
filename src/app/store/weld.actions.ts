import { createAction, props } from '@ngrx/store'
import type { ChainData, InspectionPlan, Weld, WeldStatus } from '../types'

export const loadWelds = createAction('[Weld] Load')
export const loadWeldsSuccess = createAction('[Weld API] Load Success', props<{ welds: Weld[]; plans: InspectionPlan[] }>())
export const loadChainSuccess = createAction('[Chain API] Load Success', props<{ chain: ChainData }>())
export const selectWeld = createAction('[Weld] Select', props<{ id: string }>())
export const filterStatus = createAction('[Weld] Filter Status', props<{ status: string }>())
export const advanceWeld = createAction('[Weld] Advance', props<{ id: string; status: WeldStatus }>())
export const createPlan = createAction('[Inspection] Create Plan', props<{ plan: InspectionPlan }>())
export const lockBaseline = createAction('[Approval] Lock Baseline')

/** 同一炉批并发提交：先到者占用，后到留冲突 */
export const claimBatch = createAction('[Chain] Claim Batch', props<{ batchId: string; actor: string }>())

/** 温区 / 保温时间 / 材料组别改动：在途返修计划立即失效重算，已出报告留原依据待复核 */
export const changeBatchParams = createAction(
  '[Chain] Change Batch Params',
  props<{ batchId: string; actor: string; zones: string; holdMinutes: number; materialGroup: string }>(),
)

/** 复核已冻结依据（原炉批参数）后人工关闭 */
export const reviewFrozenBasis = createAction('[Chain] Review Frozen Basis', props<{ basisId: string; actor: string }>())

/** 离线抄录回网：按炉批号合并，重传只算第一次 */
export const syncOffline = createAction('[Chain] Sync Offline Entry', props<{ entryId: string; actor: string }>())
/** 同步失败后从现场副本重试 */
export const retryOffline = createAction('[Chain] Retry Offline Entry', props<{ entryId: string }>())

/** 旧记录缺炉批号：补成待关联 → 补填炉批号 */
export const linkLegacy = createAction('[Chain] Link Legacy Record', props<{ legacyId: string; batchId: string; actor: string }>())
