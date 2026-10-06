import { Component, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { Store } from '@ngrx/store'
import { TableModule } from 'primeng/table'
import { TagModule } from 'primeng/tag'
import { ButtonModule } from 'primeng/button'
import { DialogModule } from 'primeng/dialog'
import { InputTextModule } from 'primeng/inputtext'
import { SelectModule } from 'primeng/select'
import { WeldState } from '../store/weld.reducer'
import * as A from '../store/weld.actions'
import type { HeatBatch, OfflineEntry } from '../types'

/**
 * 返修依据链：焊缝 — 热处理炉批 — 硬度复测 — 检测/返修计划 同一依据。
 * 规则：
 *  1) 温区 / 保温时间 / 材料组别改动后，未出报告的返修计划立即失效重算；已出报告留原依据冻结待复核。
 *  2) 同炉批两人同时提交：先到者占用，后到留冲突。
 *  3) 离线抄录回网按炉批号合并，重传（同一现场副本）只算第一次；失败保留现场副本可重试。
 *  4) 旧记录缺炉批号先补成待关联，补填后才计入覆盖核对。
 */
@Component({
  selector: 'app-basis-chain',
  standalone: true,
  imports: [CommonModule, FormsModule, TableModule, TagModule, ButtonModule, DialogModule, InputTextModule, SelectModule],
  template: `
  <main class="page">
    <div class="page-head">
      <div><p class="eyebrow">焊缝 → 热处理炉批 → 硬度复测 → 检测计划</p><h1>返修依据链</h1>
        <p>硬度复测按同炉批、同材料组别的全部构件核对覆盖；温区、保温时间或材料组别改动后返修计划立即失效重算，已出报告留原依据待复核。</p></div>
      <p-button label="提交炉批（并发）" icon="pi pi-bolt" (onClick)="claimDialog = true" />
    </div>

    <!-- 一、同一依据链 -->
    <section class="card">
      <h2 class="panel-title">同一依据：炉批 / 硬度复测 / 返修计划</h2>
      <p-table [value]="state.chain.batches" [paginator]="false">
        <ng-template #header><tr><th>炉批号</th><th>材料组别</th><th>温区（℃）</th><th>保温(分)</th><th>同批构件 / 焊缝</th><th>硬度复测覆盖</th><th>依据 / 计划</th></tr></ng-template>
        <ng-template #body let-batch>
          <tr [class.dirty]="editId === batch.id">
            <td><b>{{batch.id}}</b><small class="block">{{batch.date}} · {{batch.actor}}</small></td>
            <td>
              <ng-container *ngIf="editId === batch.id"><input pInputText [(ngModel)]="editForm.materialGroup" size="9" /></ng-container>
              <ng-container *ngIf="editId !== batch.id">{{batch.materialGroup}}</ng-container>
            </td>
            <td>
              <ng-container *ngIf="editId === batch.id"><input pInputText [(ngModel)]="editForm.zones" size="22" /></ng-container>
              <ng-container *ngIf="editId !== batch.id">{{batch.zones}}</ng-container>
            </td>
            <td>
              <ng-container *ngIf="editId === batch.id"><input pInputText type="number" [(ngModel)]="editForm.holdMinutes" size="4" /></ng-container>
              <ng-container *ngIf="editId !== batch.id">{{batch.holdMinutes}}</ng-container>
            </td>
            <td>{{batch.componentIds.join('、')}}<small class="block">{{batch.weldIds.join('、')}}</small></td>
            <td>
              <div class="cov" *ngFor="let r of coverage(batch)">
                <span [class.full]="r.covered" [class.miss]="!r.covered">{{r.componentId}}：{{r.tested}}/{{r.total}} 焊缝{{r.covered ? '已全覆盖' : '未覆盖'}}</span>
                <small *ngIf="!r.covered">缺 {{r.missing.join('、')}}：硬度复测未覆盖同批构件全部返修焊缝，不得闭环</small>
              </div>
            </td>
            <td>
              <div class="basis" *ngFor="let basis of basesOf(batch.id)">
                <p-tag [value]="basis.state" [severity]="basis.state === '有效' ? 'success' : basis.state === '已冻结' ? 'warn' : 'danger'" />
                <small>{{basis.id}} · 焊缝 {{basis.weldId}}<ng-container *ngIf="basis.issuedReport"> · 报告 {{basis.issuedReport}}</ng-container></small>
                <small class="plan" [class.dead]="planState(basis.planId) === '已失效'">计划 {{basis.planId}}（{{planState(basis.planId)}}）<ng-container *ngIf="basis.supersededBy"> → 重算 {{basis.supersededBy}}</ng-container></small>
                <p-button *ngIf="basis.state === '已冻结'" label="复核" size="small" text (onClick)="review(basis.id)" />
              </div>
            </td>
          </tr>
        </ng-template>
        <ng-template #footer>
          <tr *ngIf="editId"><td colspan="7" class="editbar">
            <span><i class="pi pi-info-circle"></i> 保存即视为参数改动：未出报告的返修计划立即失效重算；已出报告留原依据冻结待复核。</span>
            <span class="spacer"></span>
            <p-button label="取消" severity="secondary" size="small" (onClick)="editId=''" />
            <p-button label="保存改动并重算" size="small" icon="pi pi-refresh" (onClick)="saveParams()" />
          </td></tr>
        </ng-template>
      </p-table>
      <div class="batch-actions">
        <p-button *ngFor="let b of state.chain.batches" [label]="'改动参数：' + b.id" size="small" severity="secondary" icon="pi pi-pencil" (onClick)="startEdit(b)" />
      </div>
    </section>

    <div class="grid-2 mt-4">
      <!-- 二、炉批并发占用 -->
      <section class="card">
        <h2 class="panel-title">同炉批并发提交</h2>
        <p class="hint">两个人同时提交同一炉批：先到者占用，后到留冲突。</p>
        <div class="claim" *ngFor="let c of state.chain.claims">
          <p-tag [value]="c.state" [severity]="c.state === '占用中' ? 'success' : 'danger'" />
          <div><b>{{c.actor}}</b><small>{{c.batchId}} · {{c.submittedAt | date:'MM-dd HH:mm:ss'}}</small></div>
          <small class="block" *ngIf="c.state === '冲突'">被先到者 {{blockedBy(c.blockedBy)}} 占用，提交挂起待处置</small>
        </div>
      </section>

      <!-- 三、离线抄录回网 -->
      <section class="card">
        <h2 class="panel-title">离线抄录回网</h2>
        <p class="hint">按炉批号合并；同一份现场副本重传只算第一次；失败后可从现场副本重试。</p>
        <div class="offline" *ngFor="let e of state.chain.offline">
          <div class="off-head">
            <p-tag [value]="e.state" [severity]="e.state === '已合并' ? 'success' : e.state === '失败' ? 'danger' : 'warn'" />
            <b>{{e.id}} · {{e.batchId}}</b><small>第 {{e.attempts}} 次</small>
          </div>
          <p class="copy"><i class="pi pi-file"></i> {{e.copy}}</p>
          <small class="digest">副本摘要 {{e.payloadDigest}}</small>
          <small class="err" *ngIf="e.lastError"><i class="pi pi-exclamation-triangle"></i> {{e.lastError}}</small>
          <small class="ok" *ngIf="e.state === '已合并'">已按炉批号 {{e.mergedTo}} 合并<ng-container *ngIf="attemptsDedup(e)">（与首次提交为同一副本，重传只计第一次）</ng-container></small>
          <div class="off-actions">
            <p-button *ngIf="e.state === '待同步'" label="回网合并" size="small" icon="pi pi-cloud-upload" (onClick)="sync(e)" />
            <p-button *ngIf="e.state === '失败'" label="从现场副本重试" size="small" severity="warn" icon="pi pi-replay" (onClick)="retry(e)" />
          </div>
        </div>
      </section>
    </div>

    <!-- 四、旧记录待关联 -->
    <section class="card mt-4">
      <h2 class="panel-title">缺炉批号旧记录（先补成待关联）</h2>
      <p-table [value]="state.chain.legacy" [paginator]="false">
        <ng-template #header><tr><th>旧记录</th><th>类型</th><th>构件 / 焊缝</th><th>推测材料组别</th><th>硬度</th><th>炉批号</th><th>状态</th><th></th></tr></ng-template>
        <ng-template #body let-l>
          <tr>
            <td>{{l.ref}}</td><td>{{l.kind}}</td><td>{{l.componentId}} / {{l.weldId}}</td><td>{{l.materialGuess}}</td><td>{{l.hbw}} HBW</td>
            <td>
              <p-select *ngIf="l.state === '待关联'" [options]="batchOptions" [(ngModel)]="linkTarget[l.id]" placeholder="选择炉批号" styleClass="w-full" />
              <span *ngIf="l.state !== '待关联'">{{l.linkedBatchId}}</span>
            </td>
            <td><p-tag [value]="l.state" [severity]="l.state === '已关联' ? 'success' : 'warn'" /></td>
            <td><p-button *ngIf="l.state === '待关联'" label="补关联" size="small" [disabled]="!linkTarget[l.id]" (onClick)="link(l.id)" /></td>
          </tr>
        </ng-template>
      </p-table>
    </section>

    <!-- 并发提交对话框 -->
    <p-dialog header="提交同一炉批" [(visible)]="claimDialog" [modal]="true" [style]="{width:'420px'}">
      <div class="form">
        <label>炉批号</label>
        <p-select [options]="claimBatchOptions" [(ngModel)]="claimForm.batchId" />
        <label>提交人（模拟第二个人同时提交）</label>
        <input pInputText [(ngModel)]="claimForm.actor" placeholder="如：陈锋" />
        <p class="hint">若该炉批已有占用中的提交，本次直接记为冲突，不覆盖先到者。</p>
      </div>
      <ng-template #footer><p-button label="取消" severity="secondary" (onClick)="claimDialog=false" /><p-button label="提交" [disabled]="!claimForm.batchId || !claimForm.actor" (onClick)="claim()" /></ng-template>
    </p-dialog>
  </main>
  `,
  styles: [`
    .block{display:block}.grid-2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
    tr.dirty{background:#fffbeb}
    .cov{padding:3px 0}.cov span{font-weight:700}.cov .full{color:#16a34a}.cov .miss{color:#dc2626}.cov small{display:block;color:#b45309;font-weight:400}
    .basis{display:flex;flex-direction:column;gap:2px;padding:4px 0}.basis .plan{color:#667085}.basis .plan.dead{color:#dc2626;text-decoration:line-through}
    .batch-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
    .editbar td{background:#fef3c7}.editbar{display:flex;width:100%;align-items:center;gap:10px}.editbar .spacer{flex:1}
    .claim,.offline{padding:11px 0;border-bottom:1px solid #edf0f5}.claim{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:center}
    .claim small{color:#7a8798}.claim small.block{grid-column:2;color:#dc2626}
    .off-head{display:flex;gap:8px;align-items:center}.off-head small{color:#7a8798;margin-left:auto}.copy{margin:6px 0 2px;font-size:13px;color:#334155}.digest{display:block;color:#94a3b8;font-size:12px}
    .err{display:block;color:#dc2626;margin-top:3px}.ok{display:block;color:#16a34a;margin-top:3px}.off-actions{margin-top:6px}
    .hint{color:#7a8798;font-size:13px;margin:4px 0 10px}.form{display:grid;gap:9px}.form input,.form select{padding:9px;border:1px solid #cbd5e1;border-radius:6px;width:100%}
    .mt-4{margin-top:16px}
  `],
})
export class BasisChainComponent {
  private readonly store = inject(Store<{ welds: WeldState }>)
  state!: WeldState
  claimDialog = false
  claimForm = { batchId: 'HT-2026-0928-01', actor: '陈锋' }
  editId = ''
  editForm = { materialGroup: '', zones: '', holdMinutes: 0 }
  linkTarget: Record<string, string> = {}

  constructor() { this.store.select('welds').subscribe((state) => this.state = state) }

  get batchOptions() { return this.state.chain.batches.map((b) => b.id) }
  get claimBatchOptions() { return (this.state?.chain.batches ?? []).map((b) => b.id) }

  /** 覆盖核对：同炉批同材料组别下，每个构件的在链焊缝是否都有硬度复测（待关联旧记录不计入，补填炉批号后并入） */
  coverage(batch: HeatBatch) {
    const linked = this.state.chain.legacy.filter((l) => l.state === '已关联' && l.linkedBatchId === batch.id)
    const linkedByComp = new Map<string, Set<string>>()
    linked.forEach((l) => {
      if (!linkedByComp.has(l.componentId)) linkedByComp.set(l.componentId, new Set())
      linkedByComp.get(l.componentId)!.add(l.weldId)
    })
    const components = [...new Set([...batch.componentIds, ...linkedByComp.keys()])]
    return components.map((componentId) => {
      const weldSet = new Set<string>(batch.componentIds.includes(componentId) ? batch.weldIds : [])
      ;(linkedByComp.get(componentId) ?? []).forEach((w) => weldSet.add(w))
      const tested = new Set(this.state.chain.hardness.filter((h) => h.batchId === batch.id && h.componentId === componentId).map((h) => h.weldId))
      const missing = [...weldSet].filter((w) => !tested.has(w))
      return { componentId, total: weldSet.size, tested: weldSet.size - missing.length, missing, covered: missing.length === 0 }
    })
  }

  basesOf(batchId: string) { return this.state.chain.bases.filter((b) => b.batchId === batchId) }
  planState(planId: string) { return this.state.plans.find((p) => p.id === planId)?.state ?? '未找到' }
  blockedBy(claimId?: string) { const c = this.state.chain.claims.find((x) => x.id === claimId); return c ? `${c.actor}（${c.id}）` : claimId }
  attemptsDedup(e: OfflineEntry) { return this.state.chain.offline.some((x) => x.id !== e.id && x.batchId === e.batchId && x.payloadDigest === e.payloadDigest && x.state === '已合并') }

  startEdit(b: HeatBatch) {
    this.editId = b.id
    this.editForm = { materialGroup: b.materialGroup, zones: b.zones, holdMinutes: b.holdMinutes }
  }
  saveParams() {
    this.store.dispatch(A.changeBatchParams({
      batchId: this.editId, actor: '当前热处理工程师',
      zones: this.editForm.zones, holdMinutes: Number(this.editForm.holdMinutes), materialGroup: this.editForm.materialGroup,
    }))
    this.editId = ''
  }

  claim() {
    this.store.dispatch(A.claimBatch({ batchId: this.claimForm.batchId, actor: this.claimForm.actor }))
    this.claimDialog = false
  }
  review(basisId: string) { this.store.dispatch(A.reviewFrozenBasis({ basisId, actor: '当前质量负责人' })) }
  sync(e: OfflineEntry) { this.store.dispatch(A.syncOffline({ entryId: e.id, actor: e.actor })) }
  retry(e: OfflineEntry) {
    this.store.dispatch(A.retryOffline({ entryId: e.id }))
    // 置回待同步后立即发起重试（仍由同一 action 按 attempts 决定成败/去重）
    setTimeout(() => this.store.dispatch(A.syncOffline({ entryId: e.id, actor: e.actor })), 0)
  }
  link(legacyId: string) {
    const batchId = this.linkTarget[legacyId]
    if (batchId) this.store.dispatch(A.linkLegacy({ legacyId, batchId, actor: '当前资料员' }))
  }
}
