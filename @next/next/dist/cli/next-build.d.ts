#!/usr/bin/env node
import '../server/lib/cpu-profile';
type NextBuildOptions = {
    debug?: boolean;
    profile?: boolean;
    lint: boolean;
    mangling: boolean;
    experimentalDebugMemoryUsage: boolean;
    experimentalAppOnly?: boolean;
    experimentalTurbo?: boolean;
    experimentalBuildMode: 'default' | 'compile' | 'generate';
};
declare const nextBuild: (options: NextBuildOptions, directory?: string) => Promise<void>;
export { nextBuild };