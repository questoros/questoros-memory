export class DriveNotConfiguredError extends Error {
  public readonly code = 'DRIVE_NOT_CONFIGURED' as const;

  constructor(
    message = 'Microsoft Graph Drive provider is not configured. Provide options.client.',
  ) {
    super(message);
    this.name = 'DriveNotConfiguredError';
  }
}
