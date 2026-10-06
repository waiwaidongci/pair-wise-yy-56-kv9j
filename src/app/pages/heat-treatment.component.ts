import { Component, OnInit, inject } from '@angular/core'
import { CommonModule } from '@angular/common'
import { FormsModule } from '@angular/forms'
import { Store } from '@ngrx/store'
import { TableModule } from 'primeng/table'
import { TagModule } from 'primeng/tag'
import { ButtonModule } from 'primeng/button'
import { DialogModule } from 'primeng/dialog'
import { InputTextModule } from 'primeng/inputtext'
import { InputNumberModule } from 'primeng/inputnumber'
import { SelectModule } from 'primeng/select'
import { WeldGraphqlService } from '../services/weld-graphql.service'
import { HeatTreatmentService } from '../services/heat-treatment.service'
import { WeldState } from '../store/weld.reducer'
import * as A from '../store/weld.actions'
import type { FurnaceBatch, LegacyRetest, InspectionPlan } from '../types'

@Component({
  selector: 'app-heat-treatment', standalone: true,
  imports: [CommonModule, FormsModule, TableModule, TagModule, ButtonModule, DialogModule, InputTextModule, InputNumberModule, SelectModule],
  template: `
    <main class="page">
      <div class="page-head">
        <div><p class="eyebrow">焊缝 · 热处理炉批 · 硬度复测 · 检测计划 同一依据</p><h1>热处理炉批与硬度复测</h1><p>以炉批号为脊线，同批构件共用温区、保温时间、材料组别依据；依据改动立即失效重算，已出报告留原依据待复核。</p></div>
        <div class="head-actions">
          <p-select [options]="actorOptions" [(ngModel)]="actor" placeholder="操作人" styleClass="w-36" />
          <p-button [label]="offline ? '离线模式（现场副本）' : '在线模式'" [icon]="offline ? 'pi pi-wifi' : 'pi pi-cloud'" [severity]="offline ? 'warn' : 'secondary'" (onClick)="offline = !offline" />
        </div>
      </div>

      <div class="grid-4">
        <article class="card metric"><span>热处理炉批</span><strong>{{state.furnaceBatches.length}}</strong><small>同批构件 {{totalWelds}} 条焊缝</small></article>
        <article class="card metric"><span>硬度复测覆盖率</span><strong>{{coveragePct}}%</strong><small>{{coveredWelds}} / {{totalWelds}} 条同批构件已覆盖当前依据</small></article>
        <article class="card metric"><span>待复核报告</span><strong class="warning">{{pendingReview}}</strong><small>依据变更后保留原依据</small></article>
        <article class="card metric"><span>现场副本待合并</span><strong class="danger">{{pendingField}}</strong><small>失败 {{failedField}} · 可重试</small></article>
      </div>

      <nav class="tabs">
        <button [class.active]="tab==='batches'" (click)="tab='batches'">炉批与依据</button>
        <button [class.active]="tab==='retests'" (click)="tab='retests'">硬度复测</button>
        <button [class.active]="tab==='field'" (click)="tab='field'">离线现场副本 <em *ngIf="pendingField">{{pendingField}}</em></button>
        <button [class.active]="tab==='legacy'" (click)="tab='legacy'">待关联旧记录 <em *ngIf="legacyPending">{{legacyPending}}</em></button>
      </nav>

      <!-- ===== 炉批与依据 ===== -->
      <section class="card" *ngIf="tab==='batches'">
        <div class="toolbar"><h2 class="panel-title">热处理炉批 · 同一依据台账</h2><span class="spacer"></span><p-button label="按炉批生成检测计划" icon="pi pi-calendar-plus" severity="secondary" (onClick)="genPlanFor(firstBatch)" /></div>
        <p-table [value]="state.furnaceBatches" [paginator]="true" [rows]="6" dataKey="id">
          <ng-template #header><tr><th>炉批号</th><th>温区</th><th>保温时间</th><th>材料组别</th><th>同批构件 / 硬度覆盖</th><th>关联检测计划</th><th>依据状态</th><th>操作</th></tr></ng-template>
          <ng-template #body let-batch>
            <tr>
              <td><b>{{batch.id}}</b><small class="block">{{batch.status}}</small><small class="block danger" *ngIf="batch.occupiedBy">占用中：{{batch.occupiedBy}}</small></td>
              <td>{{batch.temperatureZone}}</td>
              <td>{{batch.holdingTime}} min</td>
              <td>{{batch.materialGroup}}</td>
              <td><div class="cov"><span *ngFor="let w of coverageOf(batch).welds" class="dot" [class.ok]="w.status==='covered'" [class.pending]="w.status==='pending'" [class.none]="w.status==='none'" [title]="w.id + ' ' + w.status"></span></div><small class="block">{{coverageOf(batch).covered}}/{{coverageOf(batch).total}} 覆盖 · 待复核 {{coverageOf(batch).pending}}</small></td>
              <td><small class="block" *ngFor="let p of relatedPlans(batch)">{{p.id}} · {{p.state}}</small><span *ngIf="!relatedPlans(batch).length" class="muted">未关联</span></td>
              <td><p-tag [value]="activePlan(batch)?.state || '无计划'" [severity]="activePlan(batch)?.state==='有效' ? 'success' : 'danger'" /><small class="block">v{{activePlan(batch)?.version}} · {{activePlan(batch)?.reason}}</small></td>
              <td class="row-actions"><p-button label="调整依据" icon="pi pi-sliders-h" size="small" (onClick)="openBasis(batch)" /><p-button label="复测" icon="pi pi-pencil" size="small" severity="secondary" (onClick)="openRetest(batch)" /></td>
            </tr>
          </ng-template>
        </p-table>
      </section>

      <!-- ===== 硬度复测 ===== -->
      <section class="card" *ngIf="tab==='retests'">
        <div class="toolbar"><h2 class="panel-title">硬度复测记录（依据快照）</h2><span class="spacer"></span><p-button label="新增硬度复测" icon="pi pi-plus" (onClick)="openRetest()" /></div>
        <p-table [value]="state.hardnessRetests" [paginator]="true" [rows]="8" dataKey="id">
          <ng-template #header><tr><th>报告编号</th><th>炉批号</th><th>焊缝</th><th>硬度 HBW</th><th>判定依据</th><th>结果</th><th>依据快照</th><th>来源</th></tr></ng-template>
          <ng-template #body let-r>
            <tr>
              <td>{{r.reportNo || '未出报告'}}</td>
              <td>{{r.furnaceBatchId}}</td>
              <td>{{r.weldId}}</td>
              <td><b>{{r.value}}</b></td>
              <td>{{r.criterion}}</td>
              <td><p-tag [value]="r.result" [severity]="r.result==='合格' ? 'success' : r.result==='待复核' ? 'warn' : 'danger'" /></td>
              <td><small class="block">{{r.basisHash || '—'}}</small><p-tag *ngIf="r.result==='待复核'" value="原依据待复核" severity="warn" /></td>
              <td><p-tag [value]="r.source" [severity]="r.source==='在线' ? 'info' : r.source==='离线' ? 'secondary' : 'contrast'" /></td>
            </tr>
          </ng-template>
        </p-table>
      </section>

      <!-- ===== 离线现场副本 ===== -->
      <section class="card" *ngIf="tab==='field'">
        <div class="toolbar">
          <h2 class="panel-title">离线现场副本 · 回网按炉批号合并</h2>
          <span class="spacer"></span>
          <label class="sim"><input type="checkbox" [(ngModel)]="simulateFail" /> 模拟合并失败（演示重试）</label>
          <p-button label="回网合并" icon="pi pi-cloud-upload" (onClick)="mergeQueue()" [disabled]="!pendingField && !failedField" />
        </div>
        <p-table [value]="state.fieldRecords" [paginator]="true" [rows]="8" dataKey="id">
          <ng-template #header><tr><th>副本编号</th><th>炉批号（合并键）</th><th>焊缝</th><th>硬度</th><th>现场采集时间</th><th>状态</th><th>操作</th></tr></ng-template>
          <ng-template #body let-r>
            <tr>
              <td>{{r.id}}</td>
              <td>{{r.furnaceBatchId}}</td>
              <td>{{r.weldId}}<small class="block">{{r.actor}}</small></td>
              <td>{{r.value}}</td>
              <td>{{r.clientCreatedAt}}</td>
              <td><p-tag [value]="r.status" [severity]="r.status==='已合并' ? 'success' : r.status==='待提交' ? 'info' : r.status==='失败' ? 'danger' : r.status==='重复' ? 'warn' : 'secondary'" /><small class="block danger" *ngIf="r.failReason">{{r.failReason}}</small></td>
              <td class="row-actions">
                <p-button *ngIf="r.status==='失败'" label="从现场副本重试" icon="pi pi-replay" size="small" (onClick)="retryRecord(r.id)" />
                <p-button *ngIf="r.status==='已合并' || r.status==='重复'" label="重传" icon="pi pi-copy" size="small" severity="secondary" (onClick)="retransmit(r.id)" />
              </td>
            </tr>
          </ng-template>
        </p-table>
        <p class="muted">离线记录保存在本机现场副本（localStorage），回网后按炉批号合并入同一依据；同一记录重传只算第一次，失败后可从现场副本重试。</p>
      </section>

      <!-- ===== 待关联旧记录 ===== -->
      <section class="card" *ngIf="tab==='legacy'">
        <div class="toolbar"><h2 class="panel-title">待关联旧记录 · 缺炉批号先补成待关联</h2></div>
        <p-table [value]="state.legacyRetests" [paginator]="true" [rows]="8" dataKey="id">
          <ng-template #header><tr><th>记录编号</th><th>焊缝</th><th>方法</th><th>硬度</th><th>报告编号</th><th>状态</th><th>操作</th></tr></ng-template>
          <ng-template #body let-r>
            <tr>
              <td>{{r.id}}</td>
              <td>{{r.weldId}}</td>
              <td>{{r.method}}</td>
              <td>{{r.value}}</td>
              <td>{{r.reportNo || '—'}}</td>
              <td><p-tag [value]="r.associated ? '已关联' : '待关联'" [severity]="r.associated ? 'success' : 'warn'" /><small class="block" *ngIf="r.associated">{{r.furnaceBatchId}}</small></td>
              <td><p-button *ngIf="!r.associated" label="补录炉批号" icon="pi pi-link" size="small" (onClick)="openAssociate(r)" /></td>
            </tr>
          </ng-template>
        </p-table>
      </section>

      <!-- ===== 依据调整 dialog ===== -->
      <p-dialog header="调整炉批依据（温区 / 保温时间 / 材料组别）" [(visible)]="basisDialog" [modal]="true" [style]="{width:'520px'}">
        <div class="form" *ngIf="editingBatch">
          <p class="basis-target">{{editingBatch.id}} · 同批 {{editingBatch.weldIds.length}} 条构件</p>
          <label>温区</label><input pInputText [(ngModel)]="basisForm.temperatureZone" />
          <label>保温时间（min）</label><p-inputnumber [(ngModel)]="basisForm.holdingTime" [min]="0" />
          <label>材料组别</label><input pInputText [(ngModel)]="basisForm.materialGroup" />
          <div class="warn-box">依据改动后：返修计划立即失效并重算；已出报告保留原依据（{{editingBatch.basisHash}}）转待复核，不覆盖原记录。</div>
        </div>
        <ng-template #footer><p-button label="取消" severity="secondary" (onClick)="basisDialog=false" /><p-button label="保存并失效重算" icon="pi pi-bolt" (onClick)="saveBasis()" /></ng-template>
      </p-dialog>

      <!-- ===== 硬度复测 dialog ===== -->
      <p-dialog header="新增硬度复测" [(visible)]="retestDialog" [modal]="true" [style]="{width:'520px'}">
        <div class="form">
          <label>炉批号</label><p-select [options]="state.furnaceBatches" [(ngModel)]="retestForm.batchId" optionLabel="id" optionValue="id" placeholder="选择炉批" (onChange)="onBatchChange()" />
          <label>同批构件焊缝</label><p-select [options]="weldOptions" [(ngModel)]="retestForm.weldId" placeholder="选择焊缝" />
          <label>硬度值（HBW）</label><p-inputnumber [(ngModel)]="retestForm.value" [min]="0" />
          <label>判定依据</label><input pInputText [(ngModel)]="retestForm.criterion" />
          <div class="warn-box" *ngIf="offline">离线模式：提交将存入现场副本，回网后按炉批号合并。</div>
          <div class="submit-msg" *ngIf="submitMsg" [class.ok]="submitOk" [class.err]="!submitOk">{{submitMsg}}</div>
        </div>
        <ng-template #footer>
          <p-button label="模拟他人同时提交" icon="pi pi-users" severity="help" (onClick)="concurrentDemo()" [disabled]="!retestForm.batchId || !retestForm.weldId" />
          <p-button [label]="offline ? '存入现场副本' : '提交复测'" icon="pi pi-check" (onClick)="submitRetest()" [disabled]="!retestForm.batchId || !retestForm.weldId" />
        </ng-template>
      </p-dialog>

      <!-- ===== 待关联 dialog ===== -->
      <p-dialog header="补录炉批号 · 关联同一依据" [(visible)]="associateDialog" [modal]="true" [style]="{width:'460px'}">
        <div class="form" *ngIf="associating">
          <p class="basis-target">{{associating.id}} · {{associating.weldId}} · 硬度 {{associating.value}}</p>
          <label>炉批号</label><p-select [options]="state.furnaceBatches" [(ngModel)]="associateForm.furnaceBatchId" optionLabel="id" optionValue="id" placeholder="选择炉批" />
        </div>
        <ng-template #footer><p-button label="取消" severity="secondary" (onClick)="associateDialog=false" /><p-button label="确认关联" (onClick)="saveAssociate()" [disabled]="!associateForm.furnaceBatchId" /></ng-template>
      </p-dialog>
    </main>
  `,
  styles: [`
    .head-actions{display:flex;gap:10px;align-items:center}.tabs{display:flex;gap:6px;margin:6px 0 16px;flex-wrap:wrap}
    .tabs button{padding:9px 16px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;cursor:pointer;font-size:14px;color:#475467}
    .tabs button.active{background:#2563eb;color:#fff;border-color:#2563eb}.tabs em{font-style:normal;background:#dc2626;color:#fff;border-radius:10px;padding:1px 7px;font-size:12px;margin-left:6px}
    .block{display:block;color:#7a8798;margin-top:3px}.danger{color:#dc2626!important}.warning{color:#d97706}.muted{color:#7a8798;font-size:13px;margin-top:10px}
    .row-actions{display:flex;gap:6px;flex-wrap:wrap}.cov{display:flex;gap:4px}.dot{width:12px;height:12px;border-radius:50%;display:inline-block;border:1px solid #cbd5e1}
    .dot.ok{background:#16a34a}.dot.pending{background:#f59e0b}.dot.none{background:#fff}
    .form{display:grid;gap:9px}.form label{font-size:13px;color:#475467;margin-top:4px}.form input,.form .p-select{width:100%}
    .basis-target{background:#f1f5f9;padding:8px 12px;border-radius:6px;margin:0 0 6px;font-size:13px}
    .warn-box{background:#fffbeb;border:1px solid #fde68a;color:#92400e;padding:9px 12px;border-radius:6px;font-size:13px;margin-top:6px}
    .submit-msg{padding:9px 12px;border-radius:6px;font-size:13px;margin-top:6px}.submit-msg.ok{background:#ecfdf5;color:#065f46}.submit-msg.err{background:#fef2f2;color:#991b1b}
    .sim{display:flex;align-items:center;gap:6px;font-size:13px;color:#475467}
    .w-36{width:144px}.mt-3{margin-top:12px}
  `],
})
export class HeatTreatmentComponent implements OnInit {
  private readonly store = inject(Store<{ welds: WeldState }>)
  private readonly api = inject(WeldGraphqlService)
  private readonly ht = inject(HeatTreatmentService)
  state!: WeldState
  tab = 'batches'
  actor = '赵岚'
  actorOptions = ['赵岚', '陈锋', '周婷']
  offline = false
  simulateFail = false

  basisDialog = false
  editingBatch?: FurnaceBatch
  basisForm = { temperatureZone: '', holdingTime: 0, materialGroup: '' }

  retestDialog = false
  retestForm = { batchId: '', weldId: '', value: 200, criterion: '≤220 HBW' }
  submitMsg = ''
  submitOk = false

  associateDialog = false
  associating?: LegacyRetest
  associateForm = { furnaceBatchId: '' }

  ngOnInit() {
    this.store.select('welds').subscribe((s) => this.state = s)
    this.api.load().subscribe(({ welds, plans }) => this.store.dispatch(A.loadWeldsSuccess({ welds, plans })))
    this.api.loadHeatTreatment().subscribe((data) => {
      const local = this.ht.loadFieldCopy()
      const localIds = new Set(local.map((r) => r.id))
      const fieldRecords = [...local, ...data.fieldRecords.filter((r) => !localIds.has(r.id))]
      this.store.dispatch(A.loadHeatTreatmentSuccess({ ...data, fieldRecords }))
    })
  }

  get firstBatch(): FurnaceBatch { return this.state?.furnaceBatches[0] }
  get totalWelds(): number { return (this.state?.furnaceBatches ?? []).reduce((n, b) => n + b.weldIds.length, 0) }
  get coveredWelds(): number { return (this.state?.furnaceBatches ?? []).reduce((n, b) => n + this.coverageOf(b).covered, 0) }
  get coveragePct(): number { return this.totalWelds ? Math.round(this.coveredWelds / this.totalWelds * 100) : 0 }
  get pendingReview(): number { return (this.state?.hardnessRetests ?? []).filter((r) => r.result === '待复核').length }
  get pendingField(): number { return (this.state?.fieldRecords ?? []).filter((r) => r.status === '待提交').length }
  get failedField(): number { return (this.state?.fieldRecords ?? []).filter((r) => r.status === '失败').length }
  get legacyPending(): number { return (this.state?.legacyRetests ?? []).filter((r) => !r.associated).length }
  get weldOptions(): string[] { const b = this.state?.furnaceBatches.find((x) => x.id === this.retestForm.batchId); return b ? b.weldIds : [] }

  coverageOf(batch: FurnaceBatch) {
    const welds = batch.weldIds.map((id) => {
      const rs = this.state.hardnessRetests.filter((r) => r.furnaceBatchId === batch.id && r.weldId === id)
      const covered = rs.some((r) => r.basisHash === batch.basisHash && r.result !== '待复核')
      const pending = rs.some((r) => r.result === '待复核')
      return { id, status: covered ? 'covered' : pending ? 'pending' : 'none' }
    })
    return { welds, covered: welds.filter((w) => w.status === 'covered').length, pending: welds.filter((w) => w.status === 'pending').length, total: welds.length }
  }

  activePlan(batch: FurnaceBatch) { return this.state.repairPlans.find((p) => p.furnaceBatchId === batch.id && p.state === '有效') }
  relatedPlans(batch: FurnaceBatch): InspectionPlan[] { return (this.state?.plans ?? []).filter((p) => p.weldIds.some((w) => batch.weldIds.includes(w))) }

  openBasis(batch: FurnaceBatch) { this.editingBatch = batch; this.basisForm = { temperatureZone: batch.temperatureZone, holdingTime: batch.holdingTime, materialGroup: batch.materialGroup }; this.basisDialog = true }
  saveBasis() {
    if (!this.editingBatch) return
    this.store.dispatch(A.updateFurnaceBasis({ id: this.editingBatch.id, temperatureZone: this.basisForm.temperatureZone, holdingTime: Number(this.basisForm.holdingTime), materialGroup: this.basisForm.materialGroup, actor: this.actor }))
    this.basisDialog = false
  }

  openRetest(batch?: FurnaceBatch) { this.retestForm = { batchId: batch?.id ?? this.retestForm.batchId, weldId: '', value: 200, criterion: '≤220 HBW' }; this.submitMsg = ''; this.retestDialog = true }
  onBatchChange() { this.retestForm.weldId = '' }

  submitRetest() {
    const { batchId, weldId, value, criterion } = this.retestForm
    if (this.offline) {
      this.ht.queueOffline(batchId, weldId, value, criterion, this.actor)
      this.submitOk = true; this.submitMsg = '已存入现场副本，回网后按炉批号合并。'
      return
    }
    const res = this.ht.submitRetest(batchId, weldId, value, criterion, this.actor)
    this.submitOk = res.ok; this.submitMsg = res.ok ? '已提交并占用炉批。' : `冲突：${res.reason}（先到者占用，后到留冲突）`
  }

  /** 模拟另一用户同时提交同一炉批：先到者占用，后到留冲突 */
  concurrentDemo() {
    const { batchId, weldId, value, criterion } = this.retestForm
    const other = this.actorOptions.find((a) => a !== this.actor) ?? '周婷'
    const res = this.ht.submitRetest(batchId, weldId, value, criterion, other)
    this.submitOk = res.ok; this.submitMsg = res.ok ? `模拟 ${other} 先提交：已占用炉批。` : `模拟 ${other} 提交：${res.reason}，后到留冲突。`
  }

  mergeQueue() { this.ht.mergeQueue(this.simulateFail) }
  retryRecord(id: string) { this.ht.retryRecord(id) }
  retransmit(id: string) { this.store.dispatch(A.mergeOfflineRecord({ recordId: id, simulateFail: false })) }

  openAssociate(legacy: LegacyRetest) { this.associating = legacy; this.associateForm = { furnaceBatchId: '' }; this.associateDialog = true }
  saveAssociate() { if (this.associating) this.store.dispatch(A.associateLegacy({ id: this.associating.id, furnaceBatchId: this.associateForm.furnaceBatchId })); this.associateDialog = false }

  genPlanFor(batch?: FurnaceBatch) {
    if (!batch) return
    const plan: InspectionPlan = { id: `IP-${Date.now().toString().slice(-6)}`, date: new Date().toISOString().slice(0, 10), method: 'UT + MT', weldIds: batch.weldIds, inspector: this.actor, state: '待执行' }
    this.store.dispatch(A.createPlan({ plan }))
  }
}
