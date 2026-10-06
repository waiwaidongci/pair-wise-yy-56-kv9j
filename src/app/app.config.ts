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
    observer.next({ data: operation.operationName === 'Welds' ? mockData : {} })
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
  chain: {
    batches: [
      { id:'HT-2026-0925-03', materialGroup:'Q355B-Ⅱ', zones:'580±10 / 600±10 / 580±10', holdMinutes:90, date:'2026-09-25', componentIds:['GL-21'], weldIds:['W-104','W-107'], recordedAt:'2026-09-25 21:40', actor:'周炉' },
      { id:'HT-2026-0928-01', materialGroup:'Q355B-Ⅱ', zones:'600±10 / 620±10 / 600±10', holdMinutes:120, date:'2026-09-28', componentIds:['PL-08'], weldIds:['W-109'], recordedAt:'2026-09-28 03:10', actor:'周炉' },
    ],
    hardness: [
      { id:'HD-501', batchId:'HT-2026-0925-03', componentId:'GL-21', weldId:'W-104', hbw:241, limit:'≤ 270HBW', pass:true, report:'HR-2026-0926-11', testedAt:'2026-09-26 09:20', legacy:false },
      { id:'HD-502', batchId:'HT-2026-0925-03', componentId:'GL-21', weldId:'W-107', hbw:238, limit:'≤ 270HBW', pass:true, report:'HR-2026-0926-11', testedAt:'2026-09-26 09:35', legacy:false },
    ],
    bases: [
      { id:'RB-301', weldId:'W-104', batchId:'HT-2026-0925-03', hardnessIds:['HD-501'], planId:'IP-2026-0929-B', state:'有效', issuedReport:'HR-2026-0926-11', parameterSnapshot:{ materialGroup:'Q355B-Ⅱ', zones:'580±10 / 600±10 / 580±10', holdMinutes:90 }, supersededBy:'', createdAt:'2026-09-26 10:02' },
      { id:'RB-302', weldId:'W-107', batchId:'HT-2026-0925-03', hardnessIds:['HD-502'], planId:'IP-2026-0930-A', state:'有效', issuedReport:'', parameterSnapshot:{ materialGroup:'Q355B-Ⅱ', zones:'580±10 / 600±10 / 580±10', holdMinutes:90 }, supersededBy:'', createdAt:'2026-09-26 10:05' },
    ],
    claims: [
      { id:'CL-201', batchId:'HT-2026-0928-01', actor:'赵岚', submittedAt:'2026-09-28T08:31:00', state:'占用中' },
    ],
    offline: [
      { id:'OF-001', batchId:'HT-2026-0928-01', payloadDigest:'sha1:7f2c-现场本-928', copy:'现场热处理记录本 第47页：3#炉 620℃ 保温120min', actor:'周炉', capturedAt:'2026-09-28 04:02', syncedAt:'', state:'待同步', attempts:0, lastError:'' },
      { id:'OF-002', batchId:'HT-2026-0928-01', payloadDigest:'sha1:7f2c-现场本-928', copy:'现场热处理记录本 第47页：3#炉 620℃ 保温120min（重复抄录）', actor:'周炉', capturedAt:'2026-09-28 04:20', syncedAt:'', state:'待同步', attempts:0, lastError:'' },
    ],
    legacy: [
      { id:'LG-001', kind:'硬度', ref:'HR-2026-0912-03（纸质扫描件）', componentId:'GL-21', weldId:'W-112', hbw:233, materialGuess:'Q355B-Ⅱ', foundAt:'2026-09-12 16:00', state:'待关联', linkedBatchId:'' },
    ],
  },
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideStore({ welds: weldReducer }),
    providePrimeNG({ theme: { preset: Aura, options: { darkModeSelector: false } } }),
    provideApollo(() => ({ cache: new InMemoryCache(), link: mockGraphqlLink })),
  ],
}
