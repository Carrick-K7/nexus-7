export class ExperimentNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExperimentNotFoundError";
  }
}

export class ExperimentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExperimentConflictError";
  }
}

export class ExperimentPermissionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExperimentPermissionError";
  }
}

export class ExperimentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExperimentValidationError";
  }
}
