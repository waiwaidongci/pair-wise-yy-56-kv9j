import { inject, Injectable } from '@angular/core'
import { Store } from '@ngrx/store'
import type { FieldRecord, FurnaceBatch, HardnessRetest } from '../types'
import { WeldState } from '../store/weld.reducer'
import * as A from '../store/weld.actions'

/** 先到者占用窗口：提交后占用炉批 4s，期间他人提交留冲突 */
const OCCUPY_WINDOW_MS = 4000
const FIELD_COPY_KEY = 'ht-field-copy'

export interface SubmitResult { ok: boolean; status: '已提交' | '冲突'; reason?: string; occupiedBy?: string }

@Injectable({ providedIn: 'root' })
export class HeatTreatmentService {
  private readonly store = inject(Store<{ welds: WeldState }>)
  private state!: WeldState
  constructor() { this.store.select('welds').subscribe((s) => this.state = s) }

  private nowIso(): string { return new Date().toISOString() }
  private clientNow(): string { return new Date().toLocaleString('zh-CN', { hour12: false }) }

  /** 幂等键：炉批号 + 焊缝 + 硬度值 + 现场采集时间，重传只算第一次 */
  private idemKeyOf(batchId: string, weldId: string, value: number, clientCreatedAt: string): string {
    return `IDEM|${batchId}|${weldId}|${value}|${clientCreatedAt}`
  }

  private isOccupied(batch: FurnaceBatch, actor: string): boolean {
    if (!batch.occupiedBy || batch.occupiedBy === actor) return false
    const at = new Date(batch.occupiedAt).getTime()
    return Date.now() - at < OCCUPY_WINDOW_MS
  }

  /** 在线提交硬度复测：先到者占用炉批，后到留冲突 */
  submitRetest(batchId: string, weldId: string, value: number, criterion: string, actor: string): SubmitResult {
    const batch = this.state.furnaceBatches.find((b) => b.id === batchId)
    if (!batch) return { ok: false, status: '冲突', reason: '炉批不存在' }
    if (this.isOccupied(batch, actor)) {
      this.store.dispatch(A.submitRetestConflict({ furnaceBatchId: batchId, actor, occupiedBy: batch.occupiedBy }))
      return { ok: false, status: '冲突', reason: `该炉批已被 ${batch.occupiedBy} 先占用`, occupiedBy: batch.occupiedBy }
    }
    const retest: HardnessRetest = {
      id: `HR-${Date.now()}`, furnaceBatchId: batchId, weldId, value, criterion,
      result: '合格', basisHash: batch.basisHash, reportNo: '', issued: false,
      idemKey: `ONLINE-${Date.now()}`, source: '在线', createdAt: this.nowIso(),
    }
    this.store.dispatch(A.submitRetest({ retest, actor }))
    setTimeout(() => this.store.dispatch(A.releaseOccupation({ furnaceBatchId: batchId })), OCCUPY_WINDOW_MS)
    return { ok: true, status: '已提交' }
  }

  /** 离线抄录：存入现场副本（localStorage），待回网合并 */
  queueOffline(batchId: string, weldId: string, value: number, criterion: string, actor: string): FieldRecord {
    const clientCreatedAt = this.clientNow()
    const record: FieldRecord = {
      id: `FR-${Date.now()}`, idemKey: this.idemKeyOf(batchId, weldId, value, clientCreatedAt),
      furnaceBatchId: batchId, weldId, actor, value, criterion, clientCreatedAt, status: '待提交',
    }
    this.saveFieldCopy(record)
    this.store.dispatch(A.queueOfflineRecord({ record }))
    return record
  }

  /** 回网合并：按炉批号合并入同一依据；simulateFail 模拟网络中断以演示失败重试。失败记录保留，由现场副本重试 */
  mergeQueue(simulateFail: boolean): void {
    const pending = this.state.fieldRecords.filter((r) => r.status === '待提交')
    for (const rec of pending) {
      this.store.dispatch(A.mergeOfflineRecord({ recordId: rec.id, simulateFail }))
      if (!simulateFail) this.markMergedInCopy(rec.id)
    }
  }

  /** 从现场副本重试：先重置为待提交，再合并 */
  retryRecord(recordId: string): void {
    this.store.dispatch(A.retryOfflineRecord({ recordId }))
    this.store.dispatch(A.mergeOfflineRecord({ recordId, simulateFail: false }))
    this.markMergedInCopy(recordId)
  }

  /** 读取现场副本（localStorage），用于会话间保留离线记录 */
  loadFieldCopy(): FieldRecord[] {
    try { return JSON.parse(localStorage.getItem(FIELD_COPY_KEY) || '[]') } catch { return [] }
  }

  private saveFieldCopy(record: FieldRecord): void {
    const all = this.loadFieldCopy().filter((r) => r.id !== record.id)
    all.push(record)
    localStorage.setItem(FIELD_COPY_KEY, JSON.stringify(all))
  }

  private markMergedInCopy(recordId: string): void {
    const all = this.loadFieldCopy().map((r) => r.id === recordId ? { ...r, status: '已合并' as const, mergedAt: this.nowIso() } : r)
    localStorage.setItem(FIELD_COPY_KEY, JSON.stringify(all))
  }
}
