export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;

  constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = "AppError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, 404, "NOT_FOUND");
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409, "CONFLICT");
    this.name = "ConflictError";
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(message, 400, "VALIDATION_ERROR");
    this.name = "ValidationError";
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401, "UNAUTHORIZED");
    this.name = "UnauthorizedError";
  }
}

/** Wraps a failure from the wg/wg-quick command layer — deliberately distinct from AppError so callers can decide whether to roll back on it. */
export class WireGuardCommandError extends Error {
  readonly command: string;
  readonly stderr: string;

  constructor(command: string, stderr: string) {
    super(`WireGuard command failed: ${command}\n${stderr}`);
    this.name = "WireGuardCommandError";
    this.command = command;
    this.stderr = stderr;
  }
}

export class SubnetExhaustedError extends AppError {
  constructor(cidr: string) {
    super(`No available IP addresses remain in ${cidr}`, 409, "SUBNET_EXHAUSTED");
    this.name = "SubnetExhaustedError";
  }
}
