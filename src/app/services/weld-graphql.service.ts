import { inject, Injectable } from '@angular/core'
import { Apollo, gql } from 'apollo-angular'
import { map } from 'rxjs'
import type { InspectionPlan, Weld, FurnaceBatch, HardnessRetest, RepairPlan, FieldRecord, LegacyRetest } from '../types'

const WELDS_QUERY = gql`query Welds { welds { id drawing component joint method welder qualification qualificationValid inspectionRatio requiredRatio status x y repairs defects { id position type length level method report } } plans { id date method weldIds inspector state } }`

const HEAT_TREATMENT_QUERY = gql`query HeatTreatment { furnaceBatches { id weldIds status temperatureZone holdingTime materialGroup basisHash version occupiedBy occupiedAt createdAt } hardnessRetests { id furnaceBatchId weldId value criterion result basisHash reportNo issued idemKey source createdAt } repairPlans { id furnaceBatchId weldIds basisHash state version reason updatedAt } fieldRecords { id idemKey furnaceBatchId weldId actor value criterion clientCreatedAt status failReason mergedAt } legacyRetests { id weldId value method reportNo createdAt furnaceBatchId associated } }`

@Injectable({ providedIn: 'root' })
export class WeldGraphqlService {
  private readonly apollo = inject(Apollo)
  load() {
    return this.apollo.watchQuery<{ welds: Weld[]; plans: InspectionPlan[] }>({ query: WELDS_QUERY, fetchPolicy: 'cache-first' }).valueChanges.pipe(map((result) => result.data))
  }
  loadHeatTreatment() {
    return this.apollo.watchQuery<{ furnaceBatches: FurnaceBatch[]; hardnessRetests: HardnessRetest[]; repairPlans: RepairPlan[]; fieldRecords: FieldRecord[]; legacyRetests: LegacyRetest[] }>({ query: HEAT_TREATMENT_QUERY, fetchPolicy: 'cache-first' }).valueChanges.pipe(map((result) => result.data))
  }
}
