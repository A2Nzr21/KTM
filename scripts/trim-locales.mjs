import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const KEEP = new Set(['en-GB.pak', 'en-US.pak', 'fa.pak']);

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export default async function trimLocales(context) {
    const localesDir = join(context.appOutDir, 'locales');
    try {
        const removed = [];
        for (const file of readdirSync(localesDir)) {
            if (file.endsWith('.pak') && !KEEP.has(file)) {
                rmSync(join(localesDir, file));
                removed.push(file);
            }
        }
        console.log(
            `trim-locales: removed ${removed.length} locale files (kept ${[...KEEP].join(', ')})`,
        );
    } catch (error) {
        console.warn('trim-locales failed:', error.message);
    }
}
