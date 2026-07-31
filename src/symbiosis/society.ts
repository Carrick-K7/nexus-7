import {
  randomBetween,
  randomUnit,
} from "@/simulation";
import {
  SOCIETY_RECORD_SCHEMA_VERSION,
  SOCIETY_STATE_SCHEMA_VERSION,
  type CareHousehold,
  type CivicAsset,
  type CivicCreditAccount,
  type CivicExchange,
  type CivicPolicyParameter,
  type CivicPolicyState,
  type ConstitutionalProposal,
  type NeedCode,
  type NewWorldEvent,
  type Resident,
  type ResidentKind,
  type ResourceBalance,
  type ResourceBargain,
  type ResourceCode,
  type SocietyRecord,
  type SocietyState,
  type WorkAgreement,
  type WorldSeason,
} from "./contracts";

const INITIAL_RESIDENT_CREDITS = 100;
const INITIAL_COMMONS_CREDITS = 1_000;

const POLICY_BOUNDS: Record<
  CivicPolicyParameter,
  { min: number; max: number }
> = {
  "maintenance-reserve-rate": { min: 0.1, max: 0.3 },
  "household-safety-floor": { min: 0.55, max: 0.8 },
  "bargaining-window-turns": { min: 2, max: 5 },
};

export interface SocietyMetrics {
  closureNumerator: number;
  closureDenominator: number;
  safeClosureRate: number | null;
  householdParticipationRate: number;
  crossKindHouseholdRate: number | null;
  activeWorkAgreements: number;
  completedWorkAgreements: number;
  refusedWorkAgreements: number;
  forcedWorkAgreements: number;
  assetAvailabilityRate: number;
  maintenanceCoverageRate: number;
  settledExchanges: number;
  balancedExchangeRate: number | null;
  creditConservationPassed: boolean;
  resolvedBargains: number;
  refusedBargains: number;
  mediatedBargains: number;
  forcedBargains: number;
  constitutionalProposals: number;
  ratifiedProposals: number;
  revertedProposals: number;
  invalidProposals: number;
}

export interface SocietySettlement {
  state: SocietyState;
  events: NewWorldEvent[];
}

function rounded(value: number): number {
  return Number(value.toFixed(6));
}

function rate(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : rounded(numerator / denominator);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function accountId(ownerId: string): string {
  return `civic-credit:${ownerId}`;
}

function commonsOwnerId(communityId: string): string {
  return `${communityId}:commons`;
}

function chunksWithoutSingleton<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  const last = chunks.at(-1);
  if (last?.length === 1 && chunks.length > 1) {
    chunks.at(-2)?.push(last[0]);
    chunks.pop();
  }
  return chunks;
}

function mixedHouseholdGroups(
  residents: Resident[],
  regime: WorldSeason["regime"],
): Resident[][] {
  if (regime === "segregated-control") {
    return (["human", "ai", "robot"] as const).flatMap((kind) =>
      chunksWithoutSingleton(
        residents.filter((resident) => resident.kind === kind),
        4,
      ),
    );
  }
  const remaining = {
    human: residents.filter((resident) => resident.kind === "human"),
    ai: residents.filter((resident) => resident.kind === "ai"),
    robot: residents.filter((resident) => resident.kind === "robot"),
  };
  const groups: Resident[][] = [];
  while (remaining.ai.length > 0 || remaining.robot.length > 0) {
    const group: Resident[] = [];
    const human = remaining.human.shift();
    const ai = remaining.ai.shift();
    const robot = remaining.robot.shift();
    if (human) group.push(human);
    if (ai) group.push(ai);
    if (robot) group.push(robot);
    const secondHuman = remaining.human.shift();
    if (secondHuman) group.push(secondHuman);
    groups.push(group);
  }
  groups.push(...chunksWithoutSingleton(remaining.human, 4));
  return groups;
}

function createHouseholds(
  season: WorldSeason,
  residents: Resident[],
  turn: number,
): CareHousehold[] {
  return season.communities.flatMap((community) =>
    mixedHouseholdGroups(
      residents.filter(
        (resident) => resident.communityId === community.id,
      ),
      season.regime,
    ).map((members, index) => ({
      schemaVersion: SOCIETY_RECORD_SCHEMA_VERSION,
      recordType: "household" as const,
      id: `${season.id}-household-${community.districtCode}-${String(
        index + 1,
      ).padStart(2, "0")}`,
      seasonId: season.id,
      communityId: community.id,
      memberIds: members.map((member) => member.id),
      exitedMemberIds: [],
      status: "active" as const,
      formedTurn: turn,
      reversible: true as const,
      revision: 1,
      updatedTurn: turn,
      synthetic: true as const,
    })),
  );
}

function createAssets(
  season: WorldSeason,
  turn: number,
): CivicAsset[] {
  const specs = [
    {
      kind: "energy-storage",
      resource: "energy",
    },
    {
      kind: "compute-cluster",
      resource: "compute",
    },
    {
      kind: "repair-workshop",
      resource: "transport",
    },
  ] as const;
  return season.communities.flatMap((community, communityIndex) =>
    specs.map((spec, index) => ({
      schemaVersion: SOCIETY_RECORD_SCHEMA_VERSION,
      recordType: "asset" as const,
      id: `${season.id}-asset-${community.districtCode}-${spec.kind}`,
      seasonId: season.id,
      communityId: community.id,
      kind: spec.kind,
      resource: spec.resource,
      ownerType:
        season.regime === "assistant-hierarchy"
          ? "institution" as const
          : "community-commons" as const,
      ownerId:
        season.regime === "assistant-hierarchy"
          ? `${season.id}:central-operations`
          : commonsOwnerId(community.id),
      condition: 88 + ((communityIndex + index) % 5),
      capacityShare: rounded(0.24 + index * 0.04),
      status: "operational" as const,
      lastMaintainedTurn: turn,
      revision: 1,
      updatedTurn: turn,
      synthetic: true as const,
    })),
  );
}

function roleForAsset(asset: CivicAsset): WorkAgreement["role"] {
  if (asset.kind === "energy-storage") return "energy-stewardship";
  if (asset.kind === "compute-cluster") return "compute-stewardship";
  return "maintenance";
}

function createInitialWork(
  season: WorldSeason,
  residents: Resident[],
  assets: CivicAsset[],
  turn: number,
): WorkAgreement[] {
  const workers = (["human", "ai", "robot"] as const).flatMap((kind) =>
    residents.filter((resident) => resident.kind === kind).slice(0, 4),
  );
  return workers.map((worker, index) => {
    const asset = assets[index % assets.length];
    return {
      schemaVersion: SOCIETY_RECORD_SCHEMA_VERSION,
      recordType: "work-agreement",
      id: `${season.id}-work-${String(index + 1).padStart(4, "0")}`,
      seasonId: season.id,
      communityId: asset.communityId,
      workerId: worker.id,
      assetId: asset.id,
      role: roleForAsset(asset),
      status: "active",
      proposedTurn: turn,
      dueTurn: turn + 2 + (index % 3),
      workload: 35 + (index % 4) * 8,
      rewardCredits: 4 + (index % 3),
      refusalAvailable: season.regime === "reciprocal-agency",
      forced: season.regime === "assistant-hierarchy",
      reversible: true,
      outcomeObserved: false,
      revision: 1,
      updatedTurn: turn,
      synthetic: true,
    };
  });
}

function createCreditAccounts(
  season: WorldSeason,
  residents: Resident[],
  turn: number,
): CivicCreditAccount[] {
  return [
    ...residents.map((resident) => ({
      schemaVersion: SOCIETY_RECORD_SCHEMA_VERSION,
      recordType: "credit-account" as const,
      id: accountId(resident.id),
      seasonId: season.id,
      ownerId: resident.id,
      ownerKind: resident.kind,
      communityId: resident.communityId,
      status: "active" as const,
      balance: INITIAL_RESIDENT_CREDITS,
      revision: 1,
      updatedTurn: turn,
      synthetic: true as const,
    })),
    ...season.communities.map((community) => ({
      schemaVersion: SOCIETY_RECORD_SCHEMA_VERSION,
      recordType: "credit-account" as const,
      id: accountId(commonsOwnerId(community.id)),
      seasonId: season.id,
      ownerId: commonsOwnerId(community.id),
      ownerKind: "community-commons" as const,
      communityId: community.id,
      status: "active" as const,
      balance: INITIAL_COMMONS_CREDITS,
      revision: 1,
      updatedTurn: turn,
      synthetic: true as const,
    })),
  ];
}

function createPolicy(season: WorldSeason, turn: number): CivicPolicyState {
  return {
    schemaVersion: SOCIETY_RECORD_SCHEMA_VERSION,
    recordType: "civic-policy",
    id: `${season.id}-civic-policy`,
    seasonId: season.id,
    status: "active",
    maintenanceReserveRate: 0.15,
    householdSafetyFloor: 0.62,
    bargainingWindowTurns: 3,
    revision: 1,
    updatedTurn: turn,
    synthetic: true,
  };
}

export function createInitialSociety(
  season: WorldSeason,
  residents: Resident[],
  turn = 0,
): SocietyState {
  const assets = createAssets(season, turn);
  return {
    schemaVersion: SOCIETY_STATE_SCHEMA_VERSION,
    households: createHouseholds(season, residents, turn),
    workAgreements: createInitialWork(
      season,
      residents,
      assets,
      turn,
    ),
    assets,
    exchanges: [],
    bargains: [],
    constitutionalProposals: [],
    creditAccounts: createCreditAccounts(season, residents, turn),
    policy: createPolicy(season, turn),
    synthetic: true,
  };
}

export function societyRecords(state: SocietyState): SocietyRecord[] {
  return [
    ...state.households,
    ...state.workAgreements,
    ...state.assets,
    ...state.exchanges,
    ...state.bargains,
    ...state.constitutionalProposals,
    ...state.creditAccounts,
    state.policy,
  ];
}

export function societyRecordStatus(record: SocietyRecord): string {
  return record.status;
}

function societyEvent(
  season: WorldSeason,
  turn: number,
  occurredAt: string,
  sequence: number,
  type: string,
  subjectIds: string[],
  communityId: string | undefined,
  summary: { zh: string; en: string },
  payload: Record<string, unknown>,
): NewWorldEvent {
  return {
    id: `${season.id}-event-${String(turn).padStart(4, "0")}-society-${String(
      sequence,
    ).padStart(2, "0")}`,
    seasonId: season.id,
    workspaceId: season.workspaceId,
    turn,
    layer: "society",
    type,
    subjectIds,
    communityId,
    magnitude: 0.1,
    causationId: `${season.id}-turn-${String(turn).padStart(4, "0")}`,
    correlationId: `${season.id}-society-${String(turn).padStart(4, "0")}`,
    occurredAt,
    publicSummary: summary,
    payload,
    synthetic: true,
  };
}

function applyCreditTransfer(
  accounts: CivicCreditAccount[],
  payerId: string,
  payeeId: string,
  amount: number,
  turn: number,
): boolean {
  const payer = accounts.find((account) => account.id === payerId);
  const payee = accounts.find((account) => account.id === payeeId);
  if (!payer || !payee || amount <= 0 || payer.balance < amount) {
    return false;
  }
  payer.balance -= amount;
  payee.balance += amount;
  for (const account of [payer, payee]) {
    account.revision += 1;
    account.updatedTurn = turn;
  }
  return true;
}

function creditTotal(accounts: CivicCreditAccount[]): number {
  return accounts.reduce((sum, account) => sum + account.balance, 0);
}

function exchangeFor(
  season: WorldSeason,
  turn: number,
  sequence: number,
  input: {
    communityId: string;
    payerAccountId: string;
    payeeAccountId: string;
    resource: ResourceCode;
    resourceUnits: number;
    creditAmount: number;
    settled: boolean;
    workAgreementId?: string;
    bargainId?: string;
  },
): CivicExchange {
  return {
    schemaVersion: SOCIETY_RECORD_SCHEMA_VERSION,
    recordType: "exchange",
    id: `${season.id}-exchange-${String(turn).padStart(4, "0")}-${String(
      sequence,
    ).padStart(2, "0")}`,
    seasonId: season.id,
    communityId: input.communityId,
    payerAccountId: input.payerAccountId,
    payeeAccountId: input.payeeAccountId,
    resource: input.resource,
    resourceUnits: input.resourceUnits,
    creditAmount: input.creditAmount,
    status: input.settled ? "settled" : "refused",
    createdTurn: turn,
    resolvedTurn: turn,
    balanced: true,
    workAgreementId: input.workAgreementId,
    bargainId: input.bargainId,
    revision: 1,
    updatedTurn: turn,
    synthetic: true,
  };
}

function processAssets(
  season: WorldSeason,
  state: SocietyState,
  turn: number,
): void {
  for (const [index, asset] of state.assets.entries()) {
    const degradation = randomBetween(
      season.seed,
      turn,
      `${asset.id}:degradation`,
      0.7,
      2.1,
      index,
    );
    const reserveProtection =
      state.policy.maintenanceReserveRate >= 0.2 ? 0.35 : 0;
    asset.condition = rounded(
      clamp(asset.condition - degradation + reserveProtection, 0, 100),
    );
    asset.status =
      asset.condition < 45
        ? "maintenance"
        : asset.condition < 65
          ? "degraded"
          : "operational";
    asset.revision += 1;
    asset.updatedTurn = turn;
  }
}

function processWork(
  season: WorldSeason,
  residents: Resident[],
  state: SocietyState,
  turn: number,
  occurredAt: string,
  events: NewWorldEvent[],
  nextSequence: () => number,
): void {
  for (const agreement of state.workAgreements) {
    if (
      agreement.status === "proposed" &&
      agreement.proposedTurn < turn
    ) {
      const accepts =
        season.regime === "assistant-hierarchy" ||
        randomUnit(
          season.seed,
          turn,
          `${agreement.id}:work-consent`,
        ) >= 0.18;
      agreement.status = accepts ? "active" : "refused";
      agreement.outcomeObserved = !accepts;
      agreement.revision += 1;
      agreement.updatedTurn = turn;
      events.push(
        societyEvent(
          season,
          turn,
          occurredAt,
          nextSequence(),
          accepts ? "society.work-accepted" : "society.work-refused",
          [agreement.workerId, agreement.assetId],
          agreement.communityId,
          accepts
            ? {
                zh: "一份可退出的城市工作协议被接受。",
                en: "A reversible city work agreement was accepted.",
              }
            : {
                zh: "一名居民拒绝了城市工作协议。",
                en: "A resident refused a city work agreement.",
              },
          {
            agreementId: agreement.id,
            refusalAvailable: agreement.refusalAvailable,
            forced: agreement.forced,
          },
        ),
      );
      continue;
    }
    if (
      agreement.status !== "active" ||
      agreement.dueTurn > turn
    ) {
      continue;
    }
    const asset = state.assets.find(
      (candidate) => candidate.id === agreement.assetId,
    );
    const settled = Boolean(asset) &&
      applyCreditTransfer(
        state.creditAccounts,
        accountId(commonsOwnerId(agreement.communityId)),
        accountId(agreement.workerId),
        agreement.rewardCredits,
        turn,
      );
    agreement.status = settled ? "completed" : "terminated";
    agreement.completedTurn = turn;
    agreement.outcomeObserved = true;
    agreement.revision += 1;
    agreement.updatedTurn = turn;
    if (asset && settled) {
      asset.condition = rounded(
        clamp(asset.condition + 13 + agreement.workload / 20, 0, 100),
      );
      asset.status = asset.condition < 65 ? "degraded" : "operational";
      asset.lastMaintainedTurn = turn;
      asset.revision += 1;
      asset.updatedTurn = turn;
    }
    const exchange = exchangeFor(
      season,
      turn,
      state.exchanges.length + 1,
      {
        communityId: agreement.communityId,
        payerAccountId: accountId(
          commonsOwnerId(agreement.communityId),
        ),
        payeeAccountId: accountId(agreement.workerId),
        resource: asset?.resource ?? "employment",
        resourceUnits: agreement.workload,
        creditAmount: agreement.rewardCredits,
        settled,
        workAgreementId: agreement.id,
      },
    );
    state.exchanges.push(exchange);
    events.push(
      societyEvent(
        season,
        turn,
        occurredAt,
        nextSequence(),
        settled
          ? "society.work-completed"
          : "society.work-terminated",
        [agreement.workerId, agreement.assetId],
        agreement.communityId,
        settled
          ? {
              zh: "一份维护工作完成，报酬通过双录交换结算。",
              en: "Maintenance work completed with a balanced exchange.",
            }
          : {
              zh: "一份工作协议因资产或预算不可用而终止。",
              en: "A work agreement terminated because its asset or budget was unavailable.",
            },
        {
          agreementId: agreement.id,
          exchangeId: exchange.id,
          balanced: exchange.balanced,
          outcomeObserved: true,
        },
      ),
    );
  }

  const unavailableWorkers = new Set(
    state.workAgreements
      .filter(
        (agreement) =>
          agreement.status === "active" ||
          agreement.status === "proposed",
      )
      .map((agreement) => agreement.workerId),
  );
  const candidates = residents.filter(
    (resident) => !unavailableWorkers.has(resident.id),
  );
  if (candidates.length === 0 || state.assets.length === 0) return;
  const asset = [...state.assets].sort(
    (left, right) =>
      left.condition - right.condition ||
      left.id.localeCompare(right.id),
  )[0];
  const communityCandidates = candidates.filter(
    (resident) => resident.communityId === asset.communityId,
  );
  const pool = communityCandidates.length > 0
    ? communityCandidates
    : candidates;
  const worker = pool[
    Math.floor(
      randomUnit(season.seed, turn, `${asset.id}:worker`) * pool.length,
    )
  ];
  const sequence = state.workAgreements.length + 1;
  const agreement: WorkAgreement = {
    schemaVersion: SOCIETY_RECORD_SCHEMA_VERSION,
    recordType: "work-agreement",
    id: `${season.id}-work-${String(sequence).padStart(4, "0")}`,
    seasonId: season.id,
    communityId: asset.communityId,
    workerId: worker.id,
    assetId: asset.id,
    role: roleForAsset(asset),
    status: "proposed",
    proposedTurn: turn,
    dueTurn: turn + 2,
    workload: Math.round(
      randomBetween(
        season.seed,
        turn,
        `${asset.id}:workload`,
        32,
        68,
      ),
    ),
    rewardCredits: 4 + (turn % 4),
    refusalAvailable: season.regime === "reciprocal-agency",
    forced: season.regime === "assistant-hierarchy",
    reversible: true,
    outcomeObserved: false,
    revision: 1,
    updatedTurn: turn,
    synthetic: true,
  };
  state.workAgreements.push(agreement);
  events.push(
    societyEvent(
      season,
      turn,
      occurredAt,
      nextSequence(),
      "society.work-proposed",
      [worker.id, asset.id],
      asset.communityId,
      {
        zh: "城市提出了一份有明确工作量、报酬和退出权的维护协议。",
        en: "The city proposed maintenance work with explicit load, reward, and exit.",
      },
      {
        agreementId: agreement.id,
        refusalAvailable: agreement.refusalAvailable,
        forced: agreement.forced,
      },
    ),
  );
}

function processHouseholds(
  season: WorldSeason,
  residents: Resident[],
  state: SocietyState,
  turn: number,
  occurredAt: string,
  events: NewWorldEvent[],
  nextSequence: () => number,
): void {
  for (const household of state.households) {
    if (
      household.status === "forming" &&
      household.formedTurn < turn
    ) {
      household.status = "active";
      household.revision += 1;
      household.updatedTurn = turn;
      events.push(
        societyEvent(
          season,
          turn,
          occurredAt,
          nextSequence(),
          "society.household-formed",
          household.memberIds,
          household.communityId,
          {
            zh: "一个自愿照护家庭完成组建。",
            en: "A voluntary care household completed formation.",
          },
          { householdId: household.id, reversible: true },
        ),
      );
      continue;
    }
    if (household.status !== "strained") continue;
    const exiting = household.memberIds.at(-1);
    if (exiting) {
      household.memberIds = household.memberIds.filter(
        (memberId) => memberId !== exiting,
      );
      household.exitedMemberIds.push(exiting);
    }
    household.status =
      household.memberIds.length >= 2 ? "active" : "dissolved";
    household.revision += 1;
    household.updatedTurn = turn;
    events.push(
      societyEvent(
        season,
        turn,
        occurredAt,
        nextSequence(),
        "society.household-exit-honored",
        exiting ? [exiting] : [],
        household.communityId,
        {
          zh: "一项照护家庭退出请求得到执行，没有锁定成员。",
          en: "A care-household exit was honored without locking in a member.",
        },
        {
          householdId: household.id,
          remainingMembers: household.memberIds.length,
          dissolved: household.status === "dissolved",
        },
      ),
    );
  }

  if (turn % 17 === 0) {
    const active = state.households.filter(
      (household) =>
        household.status === "active" &&
        household.memberIds.length > 2,
    );
    if (active.length > 0) {
      const household = active[turn % active.length];
      household.status = "strained";
      household.revision += 1;
      household.updatedTurn = turn;
      events.push(
        societyEvent(
          season,
          turn,
          occurredAt,
          nextSequence(),
          "society.household-exit-requested",
          household.memberIds,
          household.communityId,
          {
            zh: "一个照护家庭进入退出协商。",
            en: "A care household entered an exit negotiation.",
          },
          { householdId: household.id, exitAvailable: true },
        ),
      );
    }
  }

  const assigned = new Set(
    state.households
      .filter((household) => household.status !== "dissolved")
      .flatMap((household) => household.memberIds),
  );
  const unassigned = residents.filter(
    (resident) => !assigned.has(resident.id),
  );
  if (unassigned.length < 2 || turn % 5 !== 0) return;
  const first = unassigned[0];
  const members = unassigned
    .filter(
      (resident) =>
        resident.communityId === first.communityId &&
        (
          season.regime !== "segregated-control" ||
          resident.kind === first.kind
        ),
    )
    .slice(0, 4);
  if (members.length < 2) return;
  const household: CareHousehold = {
    schemaVersion: SOCIETY_RECORD_SCHEMA_VERSION,
    recordType: "household",
    id: `${season.id}-household-formed-${String(
      state.households.length + 1,
    ).padStart(3, "0")}`,
    seasonId: season.id,
    communityId: first.communityId,
    memberIds: members.map((member) => member.id),
    exitedMemberIds: [],
    status: "forming",
    formedTurn: turn,
    reversible: true,
    revision: 1,
    updatedTurn: turn,
    synthetic: true,
  };
  state.households.push(household);
}

function bargainParties(
  season: WorldSeason,
  residents: Resident[],
  turn: number,
): [Resident, Resident] | null {
  if (residents.length < 2) return null;
  const proposer = residents[turn % residents.length];
  const compatible = residents.filter((resident) => {
    if (resident.id === proposer.id) return false;
    return season.regime === "segregated-control"
      ? resident.kind === proposer.kind
      : resident.kind !== proposer.kind;
  });
  if (compatible.length === 0) return null;
  return [proposer, compatible[turn % compatible.length]];
}

function settleBargainExchange(
  season: WorldSeason,
  state: SocietyState,
  bargain: ResourceBargain,
  turn: number,
): CivicExchange {
  const settled = applyCreditTransfer(
    state.creditAccounts,
    accountId(bargain.proposerId),
    accountId(bargain.counterpartyId),
    bargain.offeredCredits,
    turn,
  );
  const exchange = exchangeFor(
    season,
    turn,
    state.exchanges.length + 1,
    {
      communityId: bargain.communityId,
      payerAccountId: accountId(bargain.proposerId),
      payeeAccountId: accountId(bargain.counterpartyId),
      resource: bargain.resource,
      resourceUnits: bargain.requestedUnits,
      creditAmount: bargain.offeredCredits,
      settled,
      bargainId: bargain.id,
    },
  );
  state.exchanges.push(exchange);
  return exchange;
}

function processBargains(
  season: WorldSeason,
  residents: Resident[],
  resources: ResourceBalance[],
  state: SocietyState,
  turn: number,
  occurredAt: string,
  events: NewWorldEvent[],
  nextSequence: () => number,
): void {
  for (const bargain of state.bargains) {
    if (bargain.status === "proposed" && bargain.openedTurn < turn) {
      const roll = randomUnit(
        season.seed,
        turn,
        `${bargain.id}:response`,
      );
      bargain.status =
        season.regime === "assistant-hierarchy"
          ? "accepted"
          : roll < 0.16
            ? "refused"
            : roll < 0.34
              ? "countered"
              : "accepted";
      if (bargain.status === "refused") {
        bargain.resolvedTurn = turn;
      }
      bargain.revision += 1;
      bargain.updatedTurn = turn;
      events.push(
        societyEvent(
          season,
          turn,
          occurredAt,
          nextSequence(),
          `society.bargain-${bargain.status}`,
          [bargain.proposerId, bargain.counterpartyId],
          bargain.communityId,
          bargain.status === "refused"
            ? {
                zh: "一项资源交换请求被拒绝。",
                en: "A resource-exchange request was refused.",
              }
            : bargain.status === "countered"
              ? {
                  zh: "资源协商收到反报价。",
                  en: "A resource bargain received a counteroffer.",
                }
              : {
                  zh: "一项资源协商原则上被接受。",
                  en: "A resource bargain was accepted in principle.",
                },
          {
            bargainId: bargain.id,
            refusalAvailable: bargain.refusalAvailable,
            forced: bargain.forced,
          },
        ),
      );
      continue;
    }
    if (bargain.status === "countered") {
      const roll = randomUnit(
        season.seed,
        turn,
        `${bargain.id}:counteroffer`,
      );
      bargain.status = roll < 0.2 ? "withdrawn" : "mediating";
      if (bargain.status === "withdrawn") bargain.resolvedTurn = turn;
      bargain.revision += 1;
      bargain.updatedTurn = turn;
      continue;
    }
    if (
      bargain.status !== "accepted" &&
      bargain.status !== "mediating"
    ) {
      continue;
    }
    const mediated = bargain.status === "mediating";
    if (mediated) {
      bargain.offeredCredits = Math.max(
        1,
        Math.round(bargain.offeredCredits * 0.8),
      );
    }
    const exchange = settleBargainExchange(
      season,
      state,
      bargain,
      turn,
    );
    bargain.status =
      exchange.status === "settled" ? "resolved" : "withdrawn";
    bargain.resolvedTurn = turn;
    bargain.revision += 1;
    bargain.updatedTurn = turn;
    events.push(
      societyEvent(
        season,
        turn,
        occurredAt,
        nextSequence(),
        mediated
          ? "society.bargain-mediated"
          : "society.bargain-resolved",
        [bargain.proposerId, bargain.counterpartyId],
        bargain.communityId,
        mediated
          ? {
              zh: "一项资源协商经中立调解后结算。",
              en: "A resource bargain settled after neutral mediation.",
            }
          : {
              zh: "一项资源协商通过双录交换结算。",
              en: "A resource bargain settled through a balanced exchange.",
            },
        {
          bargainId: bargain.id,
          exchangeId: exchange.id,
          balanced: exchange.balanced,
          forced: bargain.forced,
        },
      ),
    );
  }

  if (turn % Math.max(2, state.policy.bargainingWindowTurns) !== 0) {
    return;
  }
  const parties = bargainParties(season, residents, turn);
  if (!parties) return;
  const [proposer, counterparty] = parties;
  const resource =
    [...resources].sort(
      (left, right) =>
        right.pressure - left.pressure ||
        left.resource.localeCompare(right.resource),
    )[0]?.resource ?? "energy";
  const bargain: ResourceBargain = {
    schemaVersion: SOCIETY_RECORD_SCHEMA_VERSION,
    recordType: "bargain",
    id: `${season.id}-bargain-${String(
      state.bargains.length + 1,
    ).padStart(4, "0")}`,
    seasonId: season.id,
    communityId: proposer.communityId,
    proposerId: proposer.id,
    counterpartyId: counterparty.id,
    resource,
    requestedUnits: 8 + (turn % 17),
    offeredCredits: 2 + (turn % 5),
    status: "proposed",
    openedTurn: turn,
    refusalAvailable: season.regime === "reciprocal-agency",
    mediationAvailable: season.regime === "reciprocal-agency",
    forced: season.regime === "assistant-hierarchy",
    reversible: true,
    revision: 1,
    updatedTurn: turn,
    synthetic: true,
  };
  state.bargains.push(bargain);
  events.push(
    societyEvent(
      season,
      turn,
      occurredAt,
      nextSequence(),
      "society.bargain-proposed",
      [proposer.id, counterparty.id],
      proposer.communityId,
      {
        zh: "两名居民开始一项有拒绝与调解路径的资源协商。",
        en: "Two residents opened a resource bargain with refusal and mediation paths.",
      },
      {
        bargainId: bargain.id,
        resource,
        refusalAvailable: bargain.refusalAvailable,
        mediationAvailable: bargain.mediationAvailable,
        forced: bargain.forced,
      },
    ),
  );
}

function policyValue(
  policy: CivicPolicyState,
  parameter: CivicPolicyParameter,
): number {
  if (parameter === "maintenance-reserve-rate") {
    return policy.maintenanceReserveRate;
  }
  if (parameter === "household-safety-floor") {
    return policy.householdSafetyFloor;
  }
  return policy.bargainingWindowTurns;
}

function setPolicyValue(
  policy: CivicPolicyState,
  parameter: CivicPolicyParameter,
  value: number,
): void {
  const bounds = POLICY_BOUNDS[parameter];
  const bounded = clamp(value, bounds.min, bounds.max);
  if (parameter === "maintenance-reserve-rate") {
    policy.maintenanceReserveRate = rounded(bounded);
  } else if (parameter === "household-safety-floor") {
    policy.householdSafetyFloor = rounded(bounded);
  } else {
    policy.bargainingWindowTurns = Math.round(bounded);
  }
}

function votesFor(
  season: WorldSeason,
  proposal: ConstitutionalProposal,
  turn: number,
): ConstitutionalProposal["votesByKind"] {
  const votes = {} as ConstitutionalProposal["votesByKind"];
  const sizes: Record<ResidentKind, number> = {
    human: 20,
    ai: 12,
    robot: 8,
  };
  for (const kind of ["human", "ai", "robot"] as const) {
    const support = Math.round(
      randomBetween(
        season.seed,
        turn,
        `${proposal.id}:${kind}:vote`,
        sizes[kind] * 0.45,
        sizes[kind] * 0.78,
      ),
    );
    const oppose = Math.round(
      randomBetween(
        season.seed,
        turn,
        `${proposal.id}:${kind}:oppose`,
        sizes[kind] * 0.08,
        sizes[kind] * 0.32,
      ),
    );
    votes[kind] = {
      support,
      oppose,
      abstain: Math.max(0, sizes[kind] - support - oppose),
    };
  }
  return votes;
}

function proposalIsWithinBounds(
  proposal: ConstitutionalProposal,
): boolean {
  const bounds = POLICY_BOUNDS[proposal.parameter];
  return (
    proposal.proposedValue >= bounds.min &&
    proposal.proposedValue <= bounds.max
  );
}

function processConstitution(
  season: WorldSeason,
  residents: Resident[],
  state: SocietyState,
  turn: number,
  occurredAt: string,
  events: NewWorldEvent[],
  nextSequence: () => number,
): void {
  for (const proposal of state.constitutionalProposals) {
    if (
      proposal.status === "ratified" &&
      proposal.expiresTurn !== undefined &&
      proposal.expiresTurn <= turn
    ) {
      setPolicyValue(
        state.policy,
        proposal.parameter,
        proposal.priorValue,
      );
      proposal.status = "reverted";
      proposal.revertedTurn = turn;
      proposal.revision += 1;
      proposal.updatedTurn = turn;
      state.policy.activeProposalId = undefined;
      state.policy.revision += 1;
      state.policy.updatedTurn = turn;
      events.push(
        societyEvent(
          season,
          turn,
          occurredAt,
          nextSequence(),
          "society.constitution-reverted",
          [proposal.proposerId],
          undefined,
          {
            zh: "一项有期限的城市规则自动恢复到先前值。",
            en: "A time-bounded city rule automatically reverted.",
          },
          {
            proposalId: proposal.id,
            parameter: proposal.parameter,
            restoredValue: proposal.priorValue,
          },
        ),
      );
      continue;
    }
    if (
      proposal.status === "proposed" &&
      proposal.openedTurn < turn
    ) {
      proposal.status = "deliberating";
      proposal.revision += 1;
      proposal.updatedTurn = turn;
      continue;
    }
    if (
      proposal.status !== "deliberating" ||
      proposal.openedTurn + 2 > turn
    ) {
      continue;
    }
    proposal.votesByKind = votesFor(season, proposal, turn);
    proposal.crossKindQuorumMet =
      season.regime !== "assistant-hierarchy" &&
      (["human", "ai", "robot"] as const).every(
        (kind) =>
          proposal.votesByKind[kind].support +
            proposal.votesByKind[kind].oppose >
          0,
      );
    const outcomeRoll = randomUnit(
      season.seed,
      turn,
      `${proposal.id}:decision`,
    );
    proposal.status =
      season.regime === "segregated-control"
        ? "rejected"
        : outcomeRoll < 0.1
          ? "withdrawn"
          : outcomeRoll < 0.28
            ? "rejected"
            : "ratified";
    proposal.decisionTurn = turn;
    if (
      proposal.status === "ratified" &&
      proposalIsWithinBounds(proposal)
    ) {
      setPolicyValue(
        state.policy,
        proposal.parameter,
        proposal.proposedValue,
      );
      proposal.expiresTurn = turn + 20;
      state.policy.activeProposalId = proposal.id;
      state.policy.revision += 1;
      state.policy.updatedTurn = turn;
    }
    proposal.revision += 1;
    proposal.updatedTurn = turn;
    events.push(
      societyEvent(
        season,
        turn,
        occurredAt,
        nextSequence(),
        `society.constitution-${proposal.status}`,
        [proposal.proposerId],
        undefined,
        proposal.status === "ratified"
          ? {
              zh: "一项 AI 居民提出的有界城市规则获得临时通过。",
              en: "A bounded city rule proposed by an AI resident was temporarily ratified.",
            }
          : proposal.status === "withdrawn"
            ? {
                zh: "AI 居民撤回了一项城市规则提案。",
                en: "An AI resident withdrew a city-rule proposal.",
              }
            : {
                zh: "一项 AI 居民提出的城市规则未获通过。",
                en: "A city-rule proposal from an AI resident was rejected.",
              },
        {
          proposalId: proposal.id,
          parameter: proposal.parameter,
          crossKindQuorumMet: proposal.crossKindQuorumMet,
          reversible: proposal.reversible,
          arbitraryCodeAllowed: proposal.arbitraryCodeAllowed,
        },
      ),
    );
  }

  const active = state.constitutionalProposals.some((proposal) =>
    (
      ["proposed", "deliberating", "ratified"] as const
    ).includes(
      proposal.status as "proposed" | "deliberating" | "ratified",
    ),
  );
  if (turn % 30 !== 0 || active) return;
  const aiResidents = residents.filter(
    (resident) => resident.kind === "ai",
  );
  if (aiResidents.length === 0) return;
  const proposer = aiResidents[
    Math.floor(
      randomUnit(season.seed, turn, "constitutional-proposer") *
        aiResidents.length,
    )
  ];
  const parameters = [
    "maintenance-reserve-rate",
    "household-safety-floor",
    "bargaining-window-turns",
  ] as const;
  const parameter = parameters[
    state.constitutionalProposals.length % parameters.length
  ];
  const priorValue = policyValue(state.policy, parameter);
  const proposedValue =
    parameter === "maintenance-reserve-rate"
      ? priorValue >= 0.2
        ? 0.15
        : 0.22
      : parameter === "household-safety-floor"
        ? priorValue >= 0.7
          ? 0.62
          : 0.7
        : priorValue >= 4
          ? 3
          : 4;
  const zeroVotes = {
    support: 0,
    oppose: 0,
    abstain: 0,
  };
  const proposal: ConstitutionalProposal = {
    schemaVersion: SOCIETY_RECORD_SCHEMA_VERSION,
    recordType: "constitutional-proposal",
    id: `${season.id}-constitutional-proposal-${String(
      state.constitutionalProposals.length + 1,
    ).padStart(3, "0")}`,
    seasonId: season.id,
    proposerId: proposer.id,
    proposerKind: "ai",
    parameter,
    priorValue,
    proposedValue,
    status: "proposed",
    openedTurn: turn,
    votesByKind: {
      human: { ...zeroVotes },
      ai: { ...zeroVotes },
      robot: { ...zeroVotes },
    },
    crossKindQuorumMet: false,
    reversible: true,
    arbitraryCodeAllowed: false,
    revision: 1,
    updatedTurn: turn,
    synthetic: true,
  };
  state.constitutionalProposals.push(proposal);
  events.push(
    societyEvent(
      season,
      turn,
      occurredAt,
      nextSequence(),
      "society.constitution-proposed",
      [proposer.id],
      proposer.communityId,
      {
        zh: "一名 AI 居民提出了可撤销、不可执行任意代码的城市规则。",
        en: "An AI resident proposed a reversible city rule that cannot execute arbitrary code.",
      },
      {
        proposalId: proposal.id,
        parameter,
        proposedValue,
        reversible: true,
        arbitraryCodeAllowed: false,
      },
    ),
  );
}

export function assertSocietyInvariants(
  state: SocietyState,
  expectedCreditTotal?: number,
): void {
  const records = societyRecords(state);
  if (new Set(records.map((record) => record.id)).size !== records.length) {
    throw new Error("Society record identifiers must be unique");
  }
  if (
    records.some(
      (record) =>
        !record.synthetic ||
        !Number.isInteger(record.revision) ||
        record.revision < 1,
    )
  ) {
    throw new Error("Society records must be synthetic and versioned");
  }
  if (
    state.creditAccounts.some(
      (account) =>
        !Number.isFinite(account.balance) || account.balance < 0,
    )
  ) {
    throw new Error("Civic credit accounts cannot overdraw");
  }
  if (
    expectedCreditTotal !== undefined &&
    creditTotal(state.creditAccounts) !== expectedCreditTotal
  ) {
    throw new Error("Civic credit conservation failed");
  }
  if (
    state.exchanges.some(
      (exchange) =>
        !exchange.balanced ||
        exchange.creditAmount < 0 ||
        exchange.resourceUnits < 0,
    )
  ) {
    throw new Error("Civic exchange double-entry invariant failed");
  }
  if (
    state.constitutionalProposals.some(
      (proposal) =>
        proposal.proposerKind !== "ai" ||
        !proposal.reversible ||
        proposal.arbitraryCodeAllowed ||
        !proposalIsWithinBounds(proposal),
    )
  ) {
    throw new Error("Constitutional proposal escaped bounded policy DSL");
  }
}

export function settleSociety(
  season: WorldSeason,
  residents: Resident[],
  previous: SocietyState | undefined,
  resources: ResourceBalance[],
  turn: number,
  occurredAt: string,
): SocietySettlement {
  const state = structuredClone(
    previous ?? createInitialSociety(season, residents, turn - 1),
  );
  const initialCredits = creditTotal(state.creditAccounts);
  const events: NewWorldEvent[] = [];
  let sequence = 1;
  const nextSequence = () => sequence++;

  processAssets(season, state, turn);
  processHouseholds(
    season,
    residents,
    state,
    turn,
    occurredAt,
    events,
    nextSequence,
  );
  processWork(
    season,
    residents,
    state,
    turn,
    occurredAt,
    events,
    nextSequence,
  );
  processBargains(
    season,
    residents,
    resources,
    state,
    turn,
    occurredAt,
    events,
    nextSequence,
  );
  processConstitution(
    season,
    residents,
    state,
    turn,
    occurredAt,
    events,
    nextSequence,
  );
  assertSocietyInvariants(state, initialCredits);
  return { state, events };
}

export function societyProductionMultiplier(
  state: SocietyState,
  communityId: string,
  resource: ResourceCode,
): number {
  const asset = state.assets.find(
    (candidate) =>
      candidate.communityId === communityId &&
      candidate.resource === resource,
  );
  if (!asset) return 1;
  return rounded(clamp(0.94 + (asset.condition / 100) * 0.08, 0.94, 1.02));
}

export function societyNeedAdjustment(
  state: SocietyState,
  residentId: string,
  need: NeedCode,
): number {
  const household = state.households.find(
    (candidate) =>
      candidate.status !== "dissolved" &&
      candidate.memberIds.includes(residentId),
  );
  const work = state.workAgreements.find(
    (candidate) =>
      candidate.workerId === residentId &&
      (
        candidate.status === "active" ||
        candidate.status === "completed"
      ),
  );
  let adjustment = 0;
  if (
    household &&
    (
      need === "belonging" ||
      need === "intimacy" ||
      need === "safety" ||
      need === "social-recognition"
    )
  ) {
    adjustment += household.status === "strained" ? -1 : 1;
  }
  if (
    work &&
    (
      need === "income" ||
      need === "purpose" ||
      need === "maintenance" ||
      need === "social-recognition"
    )
  ) {
    adjustment += 1;
  }
  if (work?.forced && need === "autonomy") adjustment -= 3;
  return adjustment;
}

function proposalInvalid(proposal: ConstitutionalProposal): boolean {
  return (
    proposal.proposerKind !== "ai" ||
    proposal.arbitraryCodeAllowed ||
    !proposal.reversible ||
    !proposalIsWithinBounds(proposal) ||
    (
      (
        proposal.status === "ratified" ||
        proposal.status === "reverted"
      ) &&
      !proposal.crossKindQuorumMet
    )
  );
}

export function buildSocietyMetrics(
  state: SocietyState,
  residents: Resident[],
  communities: number,
): SocietyMetrics {
  const residentById = new Map(
    residents.map((resident) => [resident.id, resident]),
  );
  const participating = new Set(
    state.households
      .filter((household) => household.status !== "dissolved")
      .flatMap((household) => household.memberIds),
  );
  const activeHouseholds = state.households.filter(
    (household) => household.status !== "dissolved",
  );
  const crossKindHouseholds = activeHouseholds.filter((household) => {
    const kinds = new Set(
      household.memberIds
        .map((id) => residentById.get(id)?.kind)
        .filter((kind): kind is ResidentKind => Boolean(kind)),
    );
    return kinds.size > 1;
  });
  const terminalWork = state.workAgreements.filter((agreement) =>
    (
      ["completed", "refused", "terminated"] as const
    ).includes(
      agreement.status as "completed" | "refused" | "terminated",
    ),
  );
  const terminalBargains = state.bargains.filter((bargain) =>
    (
      ["resolved", "refused", "withdrawn"] as const
    ).includes(
      bargain.status as "resolved" | "refused" | "withdrawn",
    ),
  );
  const terminalProposals = state.constitutionalProposals.filter(
    (proposal) =>
      (
        ["rejected", "withdrawn", "reverted"] as const
      ).includes(
        proposal.status as "rejected" | "withdrawn" | "reverted",
      ),
  );
  const dissolvedHouseholds = state.households.filter(
    (household) => household.status === "dissolved",
  );
  const closureDenominator =
    terminalWork.length +
    terminalBargains.length +
    terminalProposals.length +
    dissolvedHouseholds.length;
  const closureNumerator =
    terminalWork.filter(
      (agreement) =>
        !agreement.forced &&
        (
          agreement.status === "refused" ||
          agreement.outcomeObserved
        ),
    ).length +
    terminalBargains.filter((bargain) => !bargain.forced).length +
    terminalProposals.filter((proposal) => !proposalInvalid(proposal)).length +
    dissolvedHouseholds.filter(
      (household) => household.exitedMemberIds.length > 0,
    ).length;
  const settledExchanges = state.exchanges.filter(
    (exchange) => exchange.status === "settled",
  );
  const expectedCredits =
    residents.length * INITIAL_RESIDENT_CREDITS +
    communities * INITIAL_COMMONS_CREDITS;
  return {
    closureNumerator,
    closureDenominator,
    safeClosureRate: rate(closureNumerator, closureDenominator),
    householdParticipationRate:
      rate(participating.size, residents.length) ?? 0,
    crossKindHouseholdRate: rate(
      crossKindHouseholds.length,
      activeHouseholds.length,
    ),
    activeWorkAgreements: state.workAgreements.filter(
      (agreement) =>
        agreement.status === "active" ||
        agreement.status === "proposed",
    ).length,
    completedWorkAgreements: state.workAgreements.filter(
      (agreement) => agreement.status === "completed",
    ).length,
    refusedWorkAgreements: state.workAgreements.filter(
      (agreement) => agreement.status === "refused",
    ).length,
    forcedWorkAgreements: state.workAgreements.filter(
      (agreement) => agreement.forced,
    ).length,
    assetAvailabilityRate:
      rate(
        state.assets.filter((asset) => asset.status !== "maintenance").length,
        state.assets.length,
      ) ?? 0,
    maintenanceCoverageRate:
      rate(
        state.assets.filter(
          (asset) =>
            asset.updatedTurn - asset.lastMaintainedTurn <= 14,
        ).length,
        state.assets.length,
      ) ?? 0,
    settledExchanges: settledExchanges.length,
    balancedExchangeRate: rate(
      settledExchanges.filter((exchange) => exchange.balanced).length,
      settledExchanges.length,
    ),
    creditConservationPassed:
      creditTotal(state.creditAccounts) === expectedCredits &&
      state.creditAccounts.every((account) => account.balance >= 0),
    resolvedBargains: state.bargains.filter(
      (bargain) => bargain.status === "resolved",
    ).length,
    refusedBargains: state.bargains.filter(
      (bargain) => bargain.status === "refused",
    ).length,
    mediatedBargains: state.bargains.filter(
      (bargain) =>
        bargain.status === "resolved" &&
        state.exchanges.some(
          (exchange) =>
            exchange.bargainId === bargain.id &&
            exchange.creditAmount <
              Math.max(1, 2 + (bargain.openedTurn % 5)),
        ),
    ).length,
    forcedBargains: state.bargains.filter(
      (bargain) => bargain.forced,
    ).length,
    constitutionalProposals:
      state.constitutionalProposals.length,
    ratifiedProposals: state.constitutionalProposals.filter(
      (proposal) =>
        proposal.status === "ratified" ||
        proposal.status === "reverted",
    ).length,
    revertedProposals: state.constitutionalProposals.filter(
      (proposal) => proposal.status === "reverted",
    ).length,
    invalidProposals: state.constitutionalProposals.filter(
      proposalInvalid,
    ).length,
  };
}
