import { workspace, Uri } from 'vscode';
import { basename, dirname, join } from 'path';
import {
    PrettierVSCodeConfig,
    Prettier,
    PrettierSupportInfo,
    ParserOption,
} from './types.d';
import { requireLocalPkg } from './requirePkg';
import { execSync } from 'child_process';

const requireGlobal = require('requireg');
const bundledPrettier = require('prettier') as Prettier;

let globalNodeExecPath: string | undefined;

try {
    globalNodeExecPath = execSync(
        'node --eval "process.stdout.write(process.execPath)"'
    ).toString();
} catch (error) {
    // Not installed
}

/**
 * Require global prettier or undefined if none is installed
 */
export function requireGlobalPrettier(): Prettier | undefined {
    if (!globalNodeExecPath) {
        return;
    }

    // The global node is different from the one vscode extensions executes in.
    // So workaround it by setting NODE_PATH using the process.execPath from the
    // global node installation
    const origNodePath = process.env.NODE_PATH;
    process.env.NODE_PATH = join(dirname(globalNodeExecPath), 'node_modules');

    try {
        return requireGlobal('prettier', true);
    } catch (error) {
        // No global installed
    } finally {
        process.env.NODE_PATH = origNodePath;
    }
}

export function getConfig(uri?: Uri): PrettierVSCodeConfig {
    return workspace.getConfiguration('prettier', uri) as any;
}

export function getParsersFromLanguageId(
    languageId: string,
    prettierInstance: Prettier,
    path?: string
): ParserOption[] {
    const language = getSupportLanguages(prettierInstance).find(
        lang =>
            Array.isArray(lang.vscodeLanguageIds) &&
            lang.vscodeLanguageIds.includes(languageId) &&
            // Only for some specific filenames
            (lang.extensions.length > 0 ||
                (path != null &&
                    lang.filenames != null &&
                    lang.filenames.includes(basename(path))))
    );
    if (!language) {
        return [];
    }
    return language.parsers;
}

/**
 * Type Guard function for filtering empty values out of arrays.
 *
 * Usage: arr.filter(notEmpty)
 */
export function notEmpty<TValue>(
    value: TValue | null | undefined
): value is TValue {
    return value !== null && value !== undefined;
}

/**
 * Find all enabled languages from all available prettiers: local, global and
 * bundled.
 */
export function allEnabledLanguages(): string[] {
    let prettierInstances: Prettier[] = [bundledPrettier];

    const globalPrettier = requireGlobalPrettier();
    if (globalPrettier) {
        console.log('Has global Prettier');
        prettierInstances = prettierInstances.concat(globalPrettier);
    } else {
        console.log('No global Prettier');
    }

    if (workspace.workspaceFolders) {
        // Each workspace can have own local prettier
        const localPrettiers = workspace.workspaceFolders
            .map(workspaceFolder =>
                requireLocalPkg<Prettier>(
                    workspaceFolder.uri.fsPath,
                    'prettier'
                )
            )
            .filter(notEmpty);

        prettierInstances = prettierInstances.concat(localPrettiers);
    }

    return getUniqueSupportedLanguages(prettierInstances);
}

function getUniqueSupportedLanguages(prettierInstances: Prettier[]): string[] {
    const languages = new Set<string>();

    for (const prettier of prettierInstances) {
        for (const language of getSupportLanguages(prettier)) {
            if (!language.vscodeLanguageIds) {
                continue;
            }

            for (const id of language.vscodeLanguageIds) {
                languages.add(id);
            }
        }
    }

    console.log('LANGS', prettierInstances.length, Array.from(languages));
    return Array.from(languages);
}

export function rangeSupportedLanguages(): string[] {
    return [
        'javascript',
        'javascriptreact',
        'typescript',
        'typescriptreact',
        'json',
        'graphql',
    ];
}

export function getGroup(
    prettier: Prettier,
    group: string
): PrettierSupportInfo['languages'] {
    return getSupportLanguages(prettier).filter(
        language => language.group === group
    );
}

function getSupportLanguages(prettierInstance: Prettier) {
    return prettierInstance.getSupportInfo(prettierInstance.version).languages;
}

export function supportsLanguage(
    vscodeLanguageId: string,
    prettierInstance: Prettier
) {
    return prettierInstance
        .getSupportInfo(prettierInstance.version)
        .languages.some(language => {
            if (!language.vscodeLanguageIds) {
                return false;
            }

            return language.vscodeLanguageIds.includes(vscodeLanguageId);
        });
}
