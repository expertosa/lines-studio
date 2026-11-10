export class ApiError extends Error {
  constructor(status, code, message, details, extra = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryAfter = extra.retryAfter;
  }
}

export class CodedError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'CodedError';
    this.code = code;
  }
}
