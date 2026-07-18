// @vitest-environment node

import { createHash } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { Pool } from "pg";
import {
  ExperimentService,
  PostgresExperimentRepository,
} from "@/experiments";
import {
  createPostgresBackup,
  restorePostgresBackup,
  verifyPostgresBackup,
} from "./postgres-backup";
import {
  defaultReleasePolicyPayload,
  GovernanceService,
} from "@/governance";
import { stableStringify } from "@/simulation";
import {
  OperationalIntelligenceService,
} from "./intelligence-service";
import {
  LIFECYCLE_EVENT_SCHEMA_VERSION,
} from "@/lifecycle";
import {
  bindReleaseArtifact,
  refreshClosedLoopCaseFingerprint,
} from "@/closure/engine";
import {
  buildCertifiedClosedLoopCase,
  CLOSED_LOOP_CERTIFICATION_CORPUS,
} from "@/closure/corpus";

const sourceUrl = process.env.TEST_DATABASE_URL;
const restoreUrl = process.env.TEST_RESTORE_DATABASE_URL;
const integrationDescribe =
  sourceUrl && restoreUrl ? describe : describe.skip;
const sourcePool = sourceUrl
  ? new Pool({ connectionString: sourceUrl })
  : null;
const restorePool = restoreUrl
  ? new Pool({ connectionString: restoreUrl })
  : null;

function refreshChecksum<T extends {
  schemaVersion: number;
  createdAt: string;
  tables: unknown;
  rowCounts: unknown;
  checksum: string;
}>(backup: T): T {
  backup.checksum = createHash("sha256")
    .update(stableStringify({
      schemaVersion: backup.schemaVersion,
      createdAt: backup.createdAt,
      tables: backup.tables,
      rowCounts: backup.rowCounts,
    }))
    .digest("hex");
  return backup;
}

integrationDescribe("PostgreSQL backup and restore", () => {
  afterAll(async () => {
    await Promise.all([
      sourcePool?.end(),
      restorePool?.end(),
    ]);
  });

  it("restores a checksum-verified consistent snapshot with replay evidence", async () => {
    const repository = new PostgresExperimentRepository(sourcePool!);
    let sequence = 0;
    const service = new ExperimentService(repository, {
      id: () => `backup-${Date.now()}-${++sequence}`,
    });
    await service.initialize();
    const actor = { id: "backup-test", role: "admin" as const };
    let run = await service.createRun(
      { name: "Backup drill", seed: "backup-drill-seed" },
      actor,
    );
    for (let index = 0; index < 7; index += 1) {
      run = await service.mutateRun(
        run.id,
        run.version,
        { type: "step" },
        actor,
      );
    }
    const expectedReport = await service.report(run.id);
    const governance = new GovernanceService(repository, {
      id: () => `backup-governance-${Date.now()}-${++sequence}`,
    });
    await governance.initialize();
    const governanceAdmin = {
      id: "backup-governance-admin",
      role: "admin" as const,
      workspaceId: "workspace-neo-angeles",
      principalType: "human" as const,
    };
    const serviceAccount = await governance.createServiceAccount(
      {
        name: `Backup worker ${Date.now()}`,
        issuer: "https://workload.example",
        subject: `backup-worker-${Date.now()}`,
        role: "operator",
        workloadKind: "worker",
      },
      governanceAdmin,
    );
    const evidenceRecord = await repository.storeGovernanceEvidence({
      id: `backup-evidence-${Date.now()}`,
      organizationId: serviceAccount.organizationId,
      workspaceId: serviceAccount.workspaceId,
      kind: "recovery-drill",
      provider: "github-actions-sigstore",
      repository: "Carrick-K7/nexus-7",
      sourceCommitSha: "a".repeat(40),
      signerWorkflow:
        "Carrick-K7/nexus-7/.github/workflows/operations-drills.yml",
      runId: `backup-evidence-run-${Date.now()}`,
      subjectPath: "recovery-drill.json",
      subjectSha256: "b".repeat(64),
      passed: true,
      generatedAt: "2026-07-16T11:00:00.000Z",
      verifiedAt: "2026-07-16T11:30:00.000Z",
      expiresAt: "2026-07-23T11:30:00.000Z",
      ingestedBy: governanceAdmin.id,
      ingestedAt: "2026-07-16T11:31:00.000Z",
      summary: {
        observedRecoveryPointMs: 50,
        observedRecoveryTimeMs: 500,
      },
    });
    const policyRecord = await repository.activateReleasePolicy({
      id: `backup-policy-${Date.now()}`,
      organizationId: serviceAccount.organizationId,
      workspaceId: serviceAccount.workspaceId,
      status: "active",
      bundle: {
        payload: defaultReleasePolicyPayload(
          serviceAccount.organizationId,
          new Date("2026-07-16T10:00:00.000Z"),
        ),
        signature: "backup-persistence-test-signature",
      },
      activatedBy: governanceAdmin.id,
      activatedAt: "2026-07-16T10:00:00.000Z",
    });
    const accessSubject = `backup-access-${Date.now()}`;
    await governance.upsertMembership(
      {
        issuer: "https://backup-identity.example",
        subject: accessSubject,
        role: "operator",
      },
      governanceAdmin,
    );
    const delegation = await governance.createDelegation(
      {
        issuer: "https://backup-identity.example",
        subject: accessSubject,
        duty: "operations-admin",
      },
      governanceAdmin,
    );
    const accessCampaign = await governance.createAccessReviewCampaign(
      {
        name: `Backup access review ${Date.now()}`,
        dueAt: new Date(
          Date.now() + 24 * 60 * 60 * 1_000,
        ).toISOString(),
      },
      governanceAdmin,
    );
    const requester = await governance.resolveActor({
      id: accessSubject,
      role: "operator",
      workspaceId: "workspace-neo-angeles",
      principalType: "human",
      authSource: "oidc",
      issuer: "https://backup-identity.example",
    });
    const breakGlassRequest = await governance.requestBreakGlass(
      {
        purpose: "Backup coverage for emergency access",
        permissionGrants: ["policy:manage"],
        ttlMinutes: 30,
      },
      requester,
    );
    const firstBreakGlassApproval = await governance.approveBreakGlass(
      breakGlassRequest.id,
      breakGlassRequest.revision,
      governanceAdmin,
    );
    const activeBreakGlass = await governance.approveBreakGlass(
      breakGlassRequest.id,
      firstBreakGlassApproval.revision,
      {
        ...governanceAdmin,
        id: "backup-governance-second-admin",
      },
    );
    const operations = new OperationalIntelligenceService(repository, {
      id: () => `backup-operations-${Date.now()}-${++sequence}`,
    });
    const operationsChannel = await operations.createChannel(
      {
        name: `Backup notification ${Date.now()}`,
        endpointUrl: "https://operations.example.test/incidents",
        secretEnvName: "NEXUS_BACKUP_TEST_WEBHOOK_SECRET",
        dryRun: true,
      },
      governanceAdmin,
    );
    const operationsRule = await operations.createRule(
      {
        code: `backup-latency-${Date.now()}`,
        name: "Backup operational latency",
        source: "recovery",
        metric: `backup-latency-${Date.now()}`,
        comparison: "greater-than",
        threshold: 1_000,
        severity: "warning",
        notificationChannelIds: [operationsChannel.id],
      },
      governanceAdmin,
    );
    const operationalResult = await operations.recordSample(
      {
        source: "recovery",
        metric: operationsRule.metric,
        value: 2_000,
        unit: "milliseconds",
        status: "breaching",
      },
      governanceAdmin,
    );
    const maintenanceWindow = await operations.createMaintenanceWindow(
      {
        name: "Backup maintenance",
        startsAt: "2030-01-01T00:00:00.000Z",
        endsAt: "2030-01-01T01:00:00.000Z",
        ruleIds: [operationsRule.id],
        reason: "Backup coverage",
      },
      governanceAdmin,
    );
    const suppression = await operations.createSuppression(
      {
        ruleId: operationsRule.id,
        reason: "Backup suppression coverage",
        endsAt: "2030-01-01T02:00:00.000Z",
      },
      governanceAdmin,
    );
    const escalationPolicy = await operations.createEscalationPolicy(
      {
        name: "Backup escalation",
        minimumSeverity: "warning",
        steps: [
          {
            afterMinutes: 0,
            channelIds: [operationsChannel.id],
          },
        ],
      },
      governanceAdmin,
    );
    const [delivered] = await operations.processDueDeliveries(
      governanceAdmin,
    );
    const receipt = await operations.recordDeliveryReceipt(
      {
        deliveryId: delivered.id,
        status: "accepted",
        externalId: "backup-receipt",
      },
      governanceAdmin,
    );
    const governedWorkspace = await repository.getGovernedWorkspace(
      governanceAdmin.workspaceId!,
    );
    const lifecycleTimestamp = "2026-07-16T11:59:00.000Z";
    const closedLoopFixture =
      refreshClosedLoopCaseFingerprint({
        ...buildCertifiedClosedLoopCase(
          CLOSED_LOOP_CERTIFICATION_CORPUS[0],
          bindReleaseArtifact({
            packageVersion: "2.0.0",
            repository: "Carrick-K7/nexus-7",
            commitSha: "a".repeat(40),
            dirty: false,
            artifactDigest: "b".repeat(64),
            evidenceManifestFingerprint: "c".repeat(64),
            trust: "local-committed",
            boundAt: lifecycleTimestamp,
          }),
          lifecycleTimestamp,
        ),
        id: `backup-closed-loop-${Date.now()}`,
        organizationId: governedWorkspace!.organizationId,
        workspaceId: governanceAdmin.workspaceId!,
        fingerprint: "",
      });
    const lifecycleRecord = {
      id: closedLoopFixture.id,
      organizationId: governedWorkspace!.organizationId,
      workspaceId: governanceAdmin.workspaceId!,
      kind: "closed-loop-case",
      status: closedLoopFixture.status,
      revision: 1,
      data: { ...closedLoopFixture },
      createdAt: lifecycleTimestamp,
      updatedAt: lifecycleTimestamp,
    };
    await repository.createLifecycleRecord({
      record: lifecycleRecord,
      event: {
        id: `backup-lifecycle-event-${Date.now()}`,
        organizationId: lifecycleRecord.organizationId,
        workspaceId: lifecycleRecord.workspaceId,
        aggregateId: lifecycleRecord.id,
        aggregateKind: lifecycleRecord.kind,
        type: "closure.backup-fixture-created",
        actorId: governanceAdmin.id,
        correlationId: `corr-${lifecycleRecord.id}`,
        occurredAt: lifecycleTimestamp,
        schemaVersion: LIFECYCLE_EVENT_SCHEMA_VERSION,
        payload: {
          caseId: closedLoopFixture.id,
          disposition: closedLoopFixture.disposition,
        },
      },
    });
    const backup = await createPostgresBackup(
      sourcePool!,
      new Date("2026-07-16T12:00:00.000Z"),
    );

    expect(verifyPostgresBackup(backup)).toBe(true);
    expect(backup.rowCounts.nexus_runs).toBeGreaterThan(0);
    expect(backup.rowCounts.nexus_service_accounts).toBeGreaterThan(0);
    expect(backup.rowCounts.nexus_governance_evidence).toBeGreaterThan(0);
    expect(backup.rowCounts.nexus_release_policies).toBeGreaterThan(0);
    expect(
      backup.rowCounts.nexus_delegated_admin_grants,
    ).toBeGreaterThan(0);
    expect(
      backup.rowCounts.nexus_access_review_campaigns,
    ).toBeGreaterThan(0);
    expect(backup.rowCounts.nexus_access_review_items).toBeGreaterThan(0);
    expect(backup.rowCounts.nexus_break_glass_requests).toBeGreaterThan(0);
    expect(backup.rowCounts.nexus_slo_samples).toBeGreaterThan(0);
    expect(backup.rowCounts.nexus_alert_rules).toBeGreaterThan(0);
    expect(backup.rowCounts.nexus_operational_incidents).toBeGreaterThan(0);
    expect(backup.rowCounts.nexus_notification_deliveries).toBeGreaterThan(0);
    expect(backup.rowCounts.nexus_maintenance_windows).toBeGreaterThan(0);
    expect(backup.rowCounts.nexus_alert_suppressions).toBeGreaterThan(0);
    expect(
      backup.rowCounts.nexus_notification_escalation_policies,
    ).toBeGreaterThan(0);
    expect(backup.rowCounts.nexus_notification_receipts).toBeGreaterThan(0);
    expect(backup.rowCounts.nexus_lifecycle_records).toBeGreaterThan(0);
    expect(backup.rowCounts.nexus_lifecycle_events).toBeGreaterThan(0);

    const v13Backup = structuredClone(backup);
    for (const tableName of [
      "nexus_slo_samples",
      "nexus_alert_rules",
      "nexus_operational_incidents",
      "nexus_alert_occurrences",
      "nexus_notification_channels",
      "nexus_notification_deliveries",
      "nexus_maintenance_windows",
      "nexus_alert_suppressions",
      "nexus_notification_escalation_policies",
      "nexus_notification_receipts",
      "nexus_delegated_admin_grants",
      "nexus_access_review_campaigns",
      "nexus_access_review_items",
      "nexus_break_glass_requests",
      "nexus_lifecycle_records",
      "nexus_lifecycle_events",
    ] as const) {
      delete (
        v13Backup.tables as Partial<typeof v13Backup.tables>
      )[tableName];
      delete (
        v13Backup.rowCounts as Partial<typeof v13Backup.rowCounts>
      )[tableName];
    }
    expect(verifyPostgresBackup(refreshChecksum(v13Backup))).toBe(true);

    const earlyV14Backup = structuredClone(backup);
    for (const tableName of [
      "nexus_maintenance_windows",
      "nexus_alert_suppressions",
      "nexus_notification_escalation_policies",
      "nexus_notification_receipts",
      "nexus_delegated_admin_grants",
      "nexus_access_review_campaigns",
      "nexus_access_review_items",
      "nexus_break_glass_requests",
      "nexus_lifecycle_records",
      "nexus_lifecycle_events",
    ] as const) {
      delete (
        earlyV14Backup.tables as Partial<typeof earlyV14Backup.tables>
      )[tableName];
      delete (
        earlyV14Backup.rowCounts as Partial<
          typeof earlyV14Backup.rowCounts
        >
      )[tableName];
    }
    expect(
      verifyPostgresBackup(refreshChecksum(earlyV14Backup)),
    ).toBe(true);

    const legacyBackup = structuredClone(backup);
    for (const tableName of [
      "nexus_organizations",
      "nexus_workspace_governance",
      "nexus_workspace_memberships",
      "nexus_service_accounts",
      "nexus_governance_audit",
      "nexus_governance_evidence",
      "nexus_release_policies",
      "nexus_slo_samples",
      "nexus_alert_rules",
      "nexus_operational_incidents",
      "nexus_alert_occurrences",
      "nexus_notification_channels",
      "nexus_notification_deliveries",
      "nexus_maintenance_windows",
      "nexus_alert_suppressions",
      "nexus_notification_escalation_policies",
      "nexus_notification_receipts",
      "nexus_delegated_admin_grants",
      "nexus_access_review_campaigns",
      "nexus_access_review_items",
      "nexus_break_glass_requests",
      "nexus_lifecycle_records",
      "nexus_lifecycle_events",
    ] as const) {
      delete (
        legacyBackup.tables as Partial<typeof legacyBackup.tables>
      )[tableName];
      delete (
        legacyBackup.rowCounts as Partial<typeof legacyBackup.rowCounts>
      )[tableName];
    }
    expect(verifyPostgresBackup(refreshChecksum(legacyBackup))).toBe(true);

    await restorePostgresBackup(restorePool!, backup, { force: true });
    const restoredRepository = new PostgresExperimentRepository(restorePool!);
    const restoredService = new ExperimentService(restoredRepository);
    const restoredReport = await restoredService.report(run.id);

    expect(restoredReport.verification).toEqual(expectedReport.verification);
    expect(restoredReport.run).toEqual(expectedReport.run);
    expect(
      await restoredRepository.getServiceAccount(serviceAccount.id),
    ).toMatchObject({
      subject: serviceAccount.subject,
      status: "active",
    });
    expect(
      (await restoredRepository.listGovernanceEvidence(
        serviceAccount.workspaceId,
      )).find((record) => record.id === evidenceRecord.id),
    ).toEqual(evidenceRecord);
    expect(
      await restoredRepository.getActiveReleasePolicy(
        serviceAccount.workspaceId,
      ),
    ).toEqual(policyRecord);
    expect(
      await restoredRepository.getOperationalIncident(
        operationalResult.incidents[0].id,
      ),
    ).toEqual(operationalResult.incidents[0]);
    expect(
      await restoredRepository.getDelegatedAdministrationGrant(
        delegation.id,
      ),
    ).toEqual(delegation);
    expect(
      await restoredRepository.getAccessReviewCampaign(
        accessCampaign.id,
      ),
    ).toEqual(accessCampaign);
    expect(
      await restoredRepository.getBreakGlassRequest(activeBreakGlass.id),
    ).toEqual(activeBreakGlass);
    expect(
      await restoredRepository.listMaintenanceWindows(
        governanceAdmin.workspaceId!,
      ),
    ).toContainEqual(maintenanceWindow);
    expect(
      await restoredRepository.listAlertSuppressions(
        governanceAdmin.workspaceId!,
      ),
    ).toContainEqual(suppression);
    expect(
      await restoredRepository.listNotificationEscalationPolicies(
        governanceAdmin.workspaceId!,
      ),
    ).toContainEqual(escalationPolicy);
    expect(
      await restoredRepository.listNotificationReceipts(
        governanceAdmin.workspaceId!,
      ),
    ).toContainEqual(receipt);
    expect(
      await restoredRepository.getLifecycleRecord(lifecycleRecord.id),
    ).toEqual(lifecycleRecord);
    expect(
      await restoredRepository.listLifecycleEvents(
        lifecycleRecord.workspaceId,
        { aggregateId: lifecycleRecord.id },
      ),
    ).toHaveLength(1);
    expect(
      (
        await restoredRepository.listNotificationDeliveries(
          serviceAccount.workspaceId,
          { limit: 200 },
        )
      ).some(
        (delivery) =>
          delivery.incidentId === operationalResult.incidents[0].id,
      ),
    ).toBe(true);
    expect(await restoredRepository.getWorkerLease("experiment-clock")).toBeNull();

    const tampered = structuredClone(backup);
    tampered.tables.nexus_runs[0].name = "Tampered";
    expect(verifyPostgresBackup(tampered)).toBe(false);
    await expect(
      restorePostgresBackup(restorePool!, tampered, { force: true }),
    ).rejects.toThrow("checksum");
  }, 30_000);
});
