import path from 'node:path';

import micromatch from 'micromatch';
import c from 'picocolors';

import { consola, pathExists, projectRoot } from './utils';

const defaultIgnoredFiles = new Set([
    'README.md',
    'CHANGELOG.md',
    'LICENSE.txt',
    'CODEOWNERS',
    'Jenkinsfile',
    'pull_request_template.md',
]);

const ignorePaths = ['__mocks__'];

function toKebabCase(str: string) {
    return str
        .replaceAll(/([a-z])([A-Z])/g, '$1-$2') // 将驼峰式命名转换为连字符命名
        .replaceAll(/[\s_]+/g, '-') // 将空格和下划线替换为连字符
        .toLowerCase(); // 将所有字母转换为小写
}
const kebabCaseRegexp = /^([\da-z]+(-[\da-z]+)*)?(\.([\da-z]+(-[\da-z])*))*$/;
// 排除不存在的文件
const checkExistsPromises = process.argv.slice(2).map(async (filePath) => {
    return (await pathExists(filePath, true)) ? filePath : '';
});
const filePaths = (await Promise.all(checkExistsPromises)).filter(Boolean);
const invalidFilePaths = new Set<string>([]);
for (const filePath of filePaths) {
    const basename = path.basename(filePath);
    if (defaultIgnoredFiles.has(basename)) {
        continue;
    }

    if (micromatch.contains(filePath, ignorePaths)) {
        continue;
    }

    const segments = path.normalize(path.relative(projectRoot, filePath)).split(path.sep);
    for (const [index, segment] of segments.entries()) {
        if (!kebabCaseRegexp.test(segment)) {
            invalidFilePaths.add(path.join(projectRoot, ...segments.slice(0, index + 1)));
        }
    }
}

if (invalidFilePaths.size > 0) {
    consola.error('以下文件名不符合 kebab 风格：');
    const invalidFilePathList = [...invalidFilePaths];
    invalidFilePathList.sort();
    console.log(
        `${invalidFilePathList
            .map((filePath) => {
                const basename = path.basename(filePath);
                const correctPath = `${filePath.slice(0, -basename.length)}${toKebabCase(
                    basename,
                )}`;
                return `${c.red(filePath)} ${c.yellow('->')} ${c.green(correctPath)}`;
            })
            .join('\n')}\n`,
    );
    process.exit(1);
}
