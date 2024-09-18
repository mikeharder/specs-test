// @ts-check

const { resolveObjectURL } = require("buffer");
const { promisify } = require("util");
const exec = promisify(require("child_process").exec);

/**
 * @param {import('github-script').AsyncFunctionArguments['github']} github
 * @param {import('github-script').AsyncFunctionArguments['context']} context
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @param {string} name
 */
async function addLabelIfNotExists(github, context, core, name) {
  await group(`addLabelIfNotExists("${name}")`, async () => {
    if (!context.payload.pull_request) {
      throw new Error("May only run in context of a pull request");
    }

    if (await hasLabel(github, context, core, name)) {
      console.log(`Already has label '${name}'`);
      return;
    }

    core.notice(`Adding label '${name}'`);

    return await github.rest.issues.addLabels({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.payload.pull_request.number,
      labels: [name],
    });
  });
}

/**
 * @param {string} command
 */
async function execRoot(command) {
  return await group(`exec("${command}")`, async () => {
    // TODO: Handle errors
    const result = await exec(command, {
      cwd: process.env.GITHUB_WORKSPACE,
    });
    console.log(`stdout: '${result.stdout}'`);
    console.log(`stderr: '${result.stderr}'`);
    return result.stdout;
  });
}

/**
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @param {string} [baseCommitish] Defaults to "HEAD^".
 * @param {string} [targetCommitish] Defaults to "HEAD".
 * @param {string} [diffFilter] Defaults to "d".
 * @returns {Promise<string[]>}
 */
async function getChangedSwaggerFiles(
  core,
  baseCommitish = "HEAD^",
  targetCommitish = "HEAD",
  diffFilter = "d"
) {
  return await group(
    `getChangedSwaggerFiles("${baseCommitish}", "${targetCommitish}", "${diffFilter}")`,
    async () => {
      const command =
        `pwsh -command ". ./eng/scripts/ChangedFiles-Functions.ps1; ` +
        `Get-ChangedSwaggerFiles (Get-ChangedFiles ${baseCommitish} ${targetCommitish} ${diffFilter})"`;
      const result = await execRoot(command);
      return result.trim().split("\n");
    }
  );
}

/**
 * Wrap an async function in a log group
 * 
 * @template T
 * @param {string} name
 * @param {() => Promise<T>} fn
 */
async function group(name, fn) {
  console.group(name);
  try {
    return await fn();
  }
  finally {
    console.groupEnd();
  }
}


/**
 * @param {import('github-script').AsyncFunctionArguments['github']} github
 * @param {import('github-script').AsyncFunctionArguments['context']} context
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @param {string} name
 * @returns {Promise<boolean>}
 */
async function hasLabel(github, context, core, name) {
  return await group(`hasLabel("${name}")`, async () => {
    if (!context.payload.pull_request) {
      throw new Error("May only run in context of a pull request");
    }

    // TODO: Add caching in front of GH Rest API calls
    const { data: labels } = await github.rest.issues.listLabelsOnIssue({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: context.payload.pull_request.number,
    });
    const labelNames = labels.map((l) => l.name);
    console.log(`Labels: ${labelNames}`);

    const result = labelNames.some((n) => n == name);
    console.log(`returning: ${result}`);
    return result;
  });
}

/**
 * @param {import('github-script').AsyncFunctionArguments['github']} github
 * @param {import('github-script').AsyncFunctionArguments['context']} context
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @param {string} name
 */
async function removeLabelIfExists(github, context, core, name) {
  return await group(`removeLabelIfExists("${name}")`, async () => {
    if (!context.payload.pull_request) {
      throw new Error("May only run in context of a pull request");
    }

    if (!(await hasLabel(github, context, core, name))) {
      console.log(`Does not have label '${name}'`);
      return;
    }

    core.notice(`Removing label '${name}'`);

    try {
      // TODO: Add caching in front of GH Rest API calls
      await github.rest.issues.removeLabel({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: context.payload.pull_request.number,
        name: name,
      });
    } catch (error) {
      /** @type {import("@octokit/request-error").RequestError} */
      const requestError = error;

      if (requestError.status == 404) {
        // Label does not exist
      } else {
        throw error;
      }
    }
  });
}

module.exports = {
  addLabelIfNotExists,
  execRoot,
  getChangedSwaggerFiles,
  group,
  hasLabel,
  removeLabelIfExists,
};
