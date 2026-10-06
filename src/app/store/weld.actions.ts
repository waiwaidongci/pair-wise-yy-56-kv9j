import { createAction, props } from '@ngrx/store'
import type { InspectionPlan, Weld, WeldStatus, FurnaceBatch, HardnessRetest, RepairPlan, FieldRecord, LegacyRetest } from '../types'

export const loadWelds = createAction('[Weld] Load')
export const loadWeldsSuccess = createAction('[Weld API] Load Success', props<{ welds: Weld[]; plans: InspectionPlan[] }>())
export const selectWeld = createAction('[Weld] Select', props<{ id: string }>())
export const filterStatus = createAction('[Weld] Filter Status', props<{ status: string }>())
export const advanceWeld = createAction('[Weld] Advance', props<{ id: string; status: WeldStatus }>())
export const createPlan = createAction('[Inspection] Create Plan', props<{ plan: InspectionPlan }>())
export const lockBaseline = createAction('[Approval] Lock Baseline')

// ===== 焊缝 · 热处理炉批 · 硬度复测 同一依据 =====
export const loadHeatTreatment = createAction('[HT] Load')
export const loadHeatTreatmentSuccess = createAction('[HT API] Load Success', props<{ furnaceBatches: FurnaceBatch[]; hardnessRetests: HardnessRetest[]; repairPlans: RepairPlan[]; fieldRecords: FieldRecord[]; legacyRetests: LegacyRetest[] }>())

/** 炉批依据（温区/保温时间/材料组别）改动 → 返修计划立即失效重算，已出报告留原依据待复核 */
export const updateFurnaceBasis = createAction('[HT] Update Furnace Basis', props<{ id: string; temperatureZone: string; holdingTime: number; materialGroup: string; actor: string }>())

/** 在线提交硬度复测：先到者占用炉批，后到留冲突 */
export const submitRetest = createAction('[HT] Submit Retest', props<{ retest: HardnessRetest; actor: string }>())
export const submitRetestConflict = createAction('[HT] Submit Retest Conflict', props<{ furnaceBatchId: string; actor: string; occupiedBy: string }>())
export const releaseOccupation = createAction('[HT] Release Occupation', props<{ furnaceBatchId: string }>())

/** 离线现场副本：回网按炉批号合并，重传只算第一次，失败后可从现场副本重试 */
export const queueOfflineRecord = createAction('[HT] Queue Offline Record', props<{ record: FieldRecord }>())
export const mergeOfflineRecord = createAction('[HT] Merge Offline Record', props<{ recordId: string; simulateFail: boolean }>())
export const retryOfflineRecord = createAction('[HT] Retry Offline Record', props<{ recordId: string }>())

/** 待关联旧记录：缺炉批号先补成待关联，补录后关联炉批 */
export const associateLegacy = createAction('[HT] Associate Legacy', props<{ id: string; furnaceBatchId: string }>())
