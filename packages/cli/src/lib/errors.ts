export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode: number = 1,
  ) {
    super(message);
    this.name = "CliError";
  }
}

export class AuthRequiredError extends CliError {
  constructor(message = "Authentication required. Run `broomva auth login` first.") {
    super(message, 1);
    this.name = "AuthRequiredError";
  }
}

export class ApiError extends CliError {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly body?: string,
  ) {
    super(`API error ${status}: ${statusText}${body ? ` — ${body}` : ""}`);
    this.name = "ApiError";
  }
}
