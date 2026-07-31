import {
  getExperimentService,
} from "@/experiments/server";
import {
  getCityModelService,
} from "@/city/model-server";
import {
  getOutcomeLearningService,
} from "@/outcomes/server";
import {
  getPlanningService,
} from "@/planning/server";
import {
  ParticipationService,
} from "./service";
import {
  verifyParticipationAcceptance,
} from "./verification";
import type {
  GovernanceRedTeamReport,
} from "./types";

interface ParticipationGlobal {
  service?: ParticipationService;
  initializing?: Promise<ParticipationService>;
  redTeam?: Promise<GovernanceRedTeamReport>;
}

const participationGlobal = globalThis as typeof globalThis & {
  __nexusParticipation?: ParticipationGlobal;
};

export async function getParticipationService(): Promise<ParticipationService> {
  const state =
    participationGlobal.__nexusParticipation ??
    (participationGlobal.__nexusParticipation = {});
  if (state.service) {
    return state.service;
  }
  if (!state.initializing) {
    state.initializing = Promise.all([
      getExperimentService(),
      getCityModelService(),
      getOutcomeLearningService(),
      getPlanningService(),
    ]).then(([experiments, city, outcomes, planning]) => {
      const service = new ParticipationService(
        experiments.repository,
        city,
        {
          resolutionEffects: {
            invalidateLesson: (
              lessonId,
              rationale,
              actor,
            ) =>
              outcomes.invalidateLesson(
                lessonId,
                rationale,
                actor,
              ),
            requestEvidence: (
              planId,
              note,
              actor,
            ) =>
              planning.requestEvidence(
                planId,
                note,
                actor,
              ),
          },
          redTeamProvider: () => {
            state.redTeam ??=
              verifyParticipationAcceptance().then(
                (report) => report.redTeam,
              );
            return state.redTeam;
          },
        },
      );
      state.service = service;
      return service;
    });
  }
  return state.initializing;
}
