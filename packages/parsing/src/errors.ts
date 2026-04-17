export class SqlParseError extends Error {
  readonly position: number | null

  constructor(message: string, position: number | null) {
    super(message)
    this.name = 'SqlParseError'
    this.position = position
  }
}

export class SqlOptimisationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SqlOptimisationError'
  }
}

export class SqlOptimizationError extends SqlOptimisationError {
  constructor(message: string) {
    super(message)
    this.name = 'SqlOptimizationError'
  }
}
