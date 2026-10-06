export type WeldStatus = '待检测' | '合格' | '返修中' | '待复检' | '已关闭'
export type DefectLevel = 'Ⅰ级' | 'Ⅱ级' | 'Ⅲ级' | 'Ⅳ级'

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

export interface InspectionPlan {
  id: string
  date: string
  method: string
  weldIds: string[]
  inspector: string
  state: '待执行' | '执行中' | '已完成'
}

export interface AuditEvent {
  id: string
  time: string
  actor: string
  action: string
  target: string
  detail: string
}

// ===== 焊缝 · 热处理炉批 · 硬度复测 · 检测计划 同一依据 =====

/** 炉批依据：温区、保温时间、材料组别三者决定返修计划与硬度复测的判定口径 */
export interface FurnaceBasis {
  temperatureZone: string   // 温区，如 600-650℃
  holdingTime: number       // 保温时间（min）
  materialGroup: string     // 材料组别，如 Q355B / 组别Ⅱ
}

/** 热处理炉批：同批构件焊缝共用同一依据 */
export interface FurnaceBatch extends FurnaceBasis {
  id: string                // 炉批号
  weldIds: string[]         // 同批构件焊缝
  status: '待处理' | '热处理中' | '已出炉'
  basisHash: string         // 依据指纹（温区+保温时间+材料组别）
  version: number            // 乐观锁版本号
  occupiedBy: string         // 当前占用者（先到者占用）
  occupiedAt: string         // 占用时间
  createdAt: string
}

/** 硬度复测：复测时快照炉批当前依据，依据变更后已出报告保留原依据待复核 */
export interface HardnessRetest {
  id: string
  furnaceBatchId: string    // 炉批号（关联同一依据）
  weldId: string            // 同批构件焊缝
  value: number             // 硬度值 HBW
  criterion: string         // 判定依据，如 ≤220 HBW
  result: '合格' | '不合格' | '待复核'
  basisHash: string         // 复测时依据快照
  reportNo: string          // 报告编号
  issued: boolean           // 是否已出报告
  idemKey: string           // 幂等键（重传只算第一次）
  source: '在线' | '离线' | '旧记录'
  createdAt: string
}

/** 返修计划：随炉批依据失效而失效并重算，保留历史版本 */
export interface RepairPlan {
  id: string
  furnaceBatchId: string
  weldIds: string[]
  basisHash: string         // 计划编制依据
  state: '有效' | '已失效'
  version: number
  reason: string            // 编制 / 重算原因
  updatedAt: string
}

/** 离线现场副本记录：回网按炉批号合并，重传只算第一次，失败可从副本重试 */
export interface FieldRecord {
  id: string
  idemKey: string           // 幂等键
  furnaceBatchId: string    // 炉批号（合并键）
  weldId: string
  actor: string             // 现场抄录人
  value: number
  criterion: string
  clientCreatedAt: string   // 现场采集时间（稳定，参与幂等键）
  status: '待提交' | '已合并' | '冲突' | '失败' | '重复'
  failReason?: string
  mergedAt?: string
}

/** 待关联旧记录：缺炉批号，补录后关联炉批进入同一依据 */
export interface LegacyRetest {
  id: string
  weldId: string
  value: number
  method: string
  reportNo: string
  createdAt: string
  furnaceBatchId?: string   // 补录的炉批号
  associated: boolean
}
