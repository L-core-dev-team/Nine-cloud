/**
 * The engineering workbench is available only in Vite development mode and
 * only when an engineer explicitly opts in. Vite compiles DEV to false in
 * preview, test builds, and production bundles.
 */
export function shouldEnableInternalTurnWorkspace(isDev: boolean, setting: string | undefined): boolean {
  return isDev && setting === 'true';
}

export const INTERNAL_TURN_WORKSPACE_ENABLED = shouldEnableInternalTurnWorkspace(
  import.meta.env.DEV,
  import.meta.env.VITE_ENABLE_INTERNAL_TURN_WORKSPACE,
);
