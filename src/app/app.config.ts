import { ApplicationConfig } from '@angular/core'
import { provideRouter } from '@angular/router'
import { provideStore } from '@ngrx/store'
import { providePrimeNG } from 'primeng/config'
import Aura from '@primeng/themes/aura'
import { provideApollo } from 'apollo-angular'
import { ApolloLink, InMemoryCache, Observable } from '@apollo/client/core'
import { routes } from './app.routes'
import { weldReducer } from './store/weld.reducer'

const mockGraphqlLink = new ApolloLink((operation) => new Observable((observer) => {
  setTimeout(() => {
    observer.next({ data: mockData })
    observer.complete()
  }, 180)
}))

const mockData = {
  welds: [
    { id:'W-101', drawing:'SG-04-钢柱', component:'KZ-12 / 柱翼缘', joint:'全熔透坡口焊', method:'GMAW', welder:'王凯', qualification:'GB/T 9448 · 2027-06', qualificationValid:true, inspectionRatio:100, requiredRatio:100, status:'合格', x:18, y:24, repairs:0, defects:[] },
    { id:'W-104', drawing:'SG-07-屋面梁', component:'GL-21 / 下翼缘', joint:'对接焊缝', method:'SAW', welder:'刘强', qualification:'GB/T 9448 · 2028-03', qualificationValid:true, inspectionRatio:100, requiredRatio:100, status:'待复检', x:48, y:38, repairs:2, defects:[{id:'D-31',position:42,type:'夹渣',length:12,level:'Ⅱ级',method:'UT',report:'UT-2026-0918'}] },
    { id:'W-107', drawing:'SG-07-屋面梁', component:'GL-21 / 腹板', joint:'角焊缝', method:'FCAW', welder:'赵明', qualification:'GB/T 9448 · 2027-01', qualificationValid:true, inspectionRatio:20, requiredRatio:20, status:'返修中', x:61, y:42, repairs:1, defects:[{id:'D-32',position:68,type:'未熔合',length:18,level:'Ⅲ级',method:'MT',report:'MT-2026-0921'}] },
    { id:'W-109', drawing:'SG-12-平台梁', component:'PL-08 / 节点板', joint:'角焊缝', method:'SMAW', welder:'孙鹏', qualification:'GB/T 9448 · 2026-10-01', qualificationValid:false, inspectionRatio:10, requiredRatio:20, status:'待检测', x:78, y:60, repairs:0, defects:[] },
    { id:'W-112', drawing:'SG-12-平台梁', component:'PL-08 / 腹板', joint:'组合焊缝', method:'GMAW', welder:'王凯', qualification:'GB/T 9448 · 2027-06', qualificationValid:true, inspectionRatio:50, requiredRatio:50, status:'已关闭', x:36, y:68, repairs:0, defects:[] },
  ],
  plans: [
    { id:'IP-2026-0930-A', date:'2026-09-30', method:'UT + MT', weldIds:['W-105','W-106','W-108'], inspector:'陈锋', state:'待执行' },
    { id:'IP-2026-0929-B', date:'2026-09-29', method:'UT', weldIds:['W-104'], inspector:'赵岚', state:'执行中' },
  ],
  // ===== 焊缝 · 热处理炉批 · 硬度复测 同一依据 =====
  furnaceBatches: [
    { id:'FB-2026-1001', weldIds:['W-101','W-104'], status:'已出炉', temperatureZone:'600-650℃', holdingTime:120, materialGroup:'Q355B / 组别Ⅱ', basisHash:'WB:600-650℃|120|Q355B / 组别Ⅱ', version:1, occupiedBy:'', occupiedAt:'', createdAt:'2026-09-20' },
    { id:'FB-2026-1002', weldIds:['W-107','W-109'], status:'热处理中', temperatureZone:'620-680℃', holdingTime:150, materialGroup:'Q355B / 组别Ⅱ', basisHash:'WB:620-680℃|150|Q355B / 组别Ⅱ', version:1, occupiedBy:'', occupiedAt:'', createdAt:'2026-09-22' },
    { id:'FB-2026-1003', weldIds:['W-112'], status:'待处理', temperatureZone:'580-620℃', holdingTime:90, materialGroup:'Q420B / 组别Ⅲ', basisHash:'WB:580-620℃|90|Q420B / 组别Ⅲ', version:1, occupiedBy:'', occupiedAt:'', createdAt:'2026-09-25' },
  ],
  hardnessRetests: [
    { id:'HR-001', furnaceBatchId:'FB-2026-1001', weldId:'W-101', value:198, criterion:'≤220 HBW', result:'合格', basisHash:'WB:600-650℃|120|Q355B / 组别Ⅱ', reportNo:'HB-2026-1001', issued:true, idemKey:'ONLINE-HR-001', source:'在线', createdAt:'2026-09-21' },
    { id:'HR-002', furnaceBatchId:'FB-2026-1001', weldId:'W-104', value:205, criterion:'≤220 HBW', result:'合格', basisHash:'WB:600-650℃|120|Q355B / 组别Ⅱ', reportNo:'HB-2026-1002', issued:true, idemKey:'ONLINE-HR-002', source:'在线', createdAt:'2026-09-21' },
    { id:'HR-003', furnaceBatchId:'FB-2026-1002', weldId:'W-107', value:210, criterion:'≤220 HBW', result:'合格', basisHash:'WB:620-680℃|150|Q355B / 组别Ⅱ', reportNo:'', issued:false, idemKey:'ONLINE-HR-003', source:'在线', createdAt:'2026-09-23' },
    { id:'HR-004', furnaceBatchId:'FB-2026-1002', weldId:'W-107', value:232, criterion:'≤220 HBW', result:'待复核', basisHash:'WB:600-650℃|120|Q355B / 组别Ⅱ', reportNo:'HB-2026-0988', issued:true, idemKey:'ONLINE-HR-004', source:'在线', createdAt:'2026-09-10' },
  ],
  repairPlans: [
    { id:'RP-FB-2026-1001-1', furnaceBatchId:'FB-2026-1001', weldIds:['W-101','W-104'], basisHash:'WB:600-650℃|120|Q355B / 组别Ⅱ', state:'有效', version:1, reason:'初始编制', updatedAt:'2026-09-20' },
    { id:'RP-FB-2026-1002-1', furnaceBatchId:'FB-2026-1002', weldIds:['W-107','W-109'], basisHash:'WB:620-680℃|150|Q355B / 组别Ⅱ', state:'有效', version:1, reason:'初始编制', updatedAt:'2026-09-22' },
    { id:'RP-FB-2026-1003-1', furnaceBatchId:'FB-2026-1003', weldIds:['W-112'], basisHash:'WB:580-620℃|90|Q420B / 组别Ⅲ', state:'有效', version:1, reason:'初始编制', updatedAt:'2026-09-25' },
  ],
  fieldRecords: [
    { id:'FR-1', idemKey:'IDEM|FB-2026-1002|W-107|212|2026/10/4 09:12:00', furnaceBatchId:'FB-2026-1002', weldId:'W-107', actor:'陈锋', value:212, criterion:'≤220 HBW', clientCreatedAt:'2026-10-04 09:12:00', status:'待提交' },
    { id:'FR-2', idemKey:'IDEM|FB-2026-1001|W-104|201|2026/10/3 14:20:00', furnaceBatchId:'FB-2026-1001', weldId:'W-104', actor:'赵岚', value:201, criterion:'≤220 HBW', clientCreatedAt:'2026-10-03 14:20:00', status:'已合并', mergedAt:'2026-10-03 15:02:00' },
    { id:'FR-3', idemKey:'IDEM|FB-2026-1003|W-112|215|2026/10/4 10:05:00', furnaceBatchId:'FB-2026-1003', weldId:'W-112', actor:'陈锋', value:215, criterion:'≤220 HBW', clientCreatedAt:'2026-10-04 10:05:00', status:'失败', failReason:'模拟网络中断，未收到服务端确认' },
  ],
  legacyRetests: [
    { id:'LR-1', weldId:'W-101', value:195, method:'UT', reportNo:'HB-2026-0801', createdAt:'2026-08-15', associated:false },
    { id:'LR-2', weldId:'W-107', value:208, method:'MT', reportNo:'', createdAt:'2026-09-01', associated:false },
    { id:'LR-3', weldId:'W-112', value:210, method:'UT', reportNo:'HB-2026-0712', createdAt:'2026-07-20', associated:false },
  ],
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideStore({ welds: weldReducer }),
    providePrimeNG({ theme: { preset: Aura, options: { darkModeSelector: false } } }),
    provideApollo(() => ({ cache: new InMemoryCache(), link: mockGraphqlLink })),
  ],
}
