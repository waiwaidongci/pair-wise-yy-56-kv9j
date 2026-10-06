import { inject, Injectable } from '@angular/core'
import { Apollo, gql } from 'apollo-angular'
import { map } from 'rxjs'
import type { ChainData, InspectionPlan, Weld } from '../types'

const WELDS_QUERY = gql`query Welds {
  welds { id drawing component joint method welder qualification qualificationValid inspectionRatio requiredRatio status x y repairs defects { id position type length level method report } }
  plans { id date method weldIds inspector state basisOf supersededBy }
  chain {
    batches { id materialGroup zones holdMinutes date componentIds weldIds recordedAt actor }
    hardness { id batchId componentId weldId hbw limit pass report testedAt legacy }
    bases { id weldId batchId hardnessIds planId state issuedReport parameterSnapshot { materialGroup zones holdMinutes } supersededBy createdAt }
    claims { id batchId actor submittedAt state blockedBy }
    offline { id batchId payloadDigest copy actor capturedAt syncedAt state attempts lastError mergedTo }
    legacy { id kind ref componentId weldId hbw materialGuess foundAt state linkedBatchId }
  }
}`

@Injectable({ providedIn: 'root' })
export class WeldGraphqlService {
  private readonly apollo = inject(Apollo)
  load() {
    return this.apollo.watchQuery<{ welds: Weld[]; plans: InspectionPlan[]; chain: ChainData }>({ query: WELDS_QUERY, fetchPolicy: 'cache-first' }).valueChanges.pipe(map((result) => result.data))
  }
}
