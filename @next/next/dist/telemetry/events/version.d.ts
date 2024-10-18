import type { NextConfigComplete } from '../../server/config-shared';
type EventCliSessionStarted = {
    nextVersion: string;
    nodeVersion: string;
    cliCommand: string;
    isSrcDir: boolean | null;
    hasNowJson: boolean;
    isCustomServer: boolean | null;
    hasNextConfig: boolean;
    buildTarget: string;
    hasWebpackConfig: boolean;
    hasBabelConfig: boolean;
    basePathEnabled: boolean;
    i18nEnabled: boolean;
    imageEnabled: boolean;
    imageFutureEnabled: boolean;
    locales: string | null;
    localeDomainsCount: number | null;
    localeDetectionEnabled: boolean | null;
    imageDomainsCount: number | null;
    imageRemotePatternsCount: number | null;
    imageLocalPatternsCount: number | null;
    imageSizes: string | null;
    imageLoader: string | null;
    imageFormats: string | null;
    nextConfigOutput: string | null;
    trailingSlashEnabled: boolean;
    reactStrictMode: boolean;
    webpackVersion: number | null;
    turboFlag: boolean;
    appDir: boolean | null;
    pagesDir: boolean | null;
    staticStaleTime: number | null;
    dynamicStaleTime: number | null;
};
export declare function eventCliSession(dir: string, nextConfig: NextConfigComplete, event: Omit<EventCliSessionStarted, 'nextVersion' | 'nodeVersion' | 'hasNextConfig' | 'buildTarget' | 'hasWebpackConfig' | 'hasBabelConfig' | 'basePathEnabled' | 'i18nEnabled' | 'imageEnabled' | 'imageFutureEnabled' | 'locales' | 'localeDomainsCount' | 'localeDetectionEnabled' | 'imageDomainsCount' | 'imageRemotePatternsCount' | 'imageLocalPatternsCount' | 'imageSizes' | 'imageLoader' | 'imageFormats' | 'nextConfigOutput' | 'trailingSlashEnabled' | 'reactStrictMode' | 'staticStaleTime' | 'dynamicStaleTime'>): {
    eventName: string;
    payload: EventCliSessionStarted;
}[];
export {};
