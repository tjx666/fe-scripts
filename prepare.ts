import ci from 'ci-info';

// import { i18n } from './i18n';
import { runTurboTask } from './turbo-run';
import { runCommand } from './utils';

function buildTools() {
    const commonArgs = ['build:tool', '--output-logs', 'errors-only'] as const;
    if ('XXX_SKIP_CACHE' in process.env) {
        return runTurboTask(...commonArgs, '--force');
    } else {
        return runTurboTask(...commonArgs);
    }
}

async function prepare() {
    // const tasks = [i18n(), buildTools()];
    const tasks: Promise<any>[] = [buildTools()];

    if (!ci.isCI) {
        tasks.push(
            // 安装 git hooks
            runCommand('simple-git-hooks'),
            // 共享 git 配置
            runCommand('git config --local include.path ../.gitconfig'),
        );
    }

    await Promise.all(tasks);
}

prepare();
