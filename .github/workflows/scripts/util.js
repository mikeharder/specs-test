// @ts-check

const { promisify } = require("util");
const exec = promisify(require("child_process").exec);

/**
 * @param {import('github-script').AsyncFunctionArguments['github']} github
 * @param {import('github-script').AsyncFunctionArguments['context']} context
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @param {string} name
 */
async function addLabelIfNotExists(github, context, core, name) {
  if (!context.payload.pull_request) {
    throw new Error("May only run in context of a pull request");
  }

  if (await hasLabel(github, context, name)) {
    console.log(`Already has label '${name}'`);
    return;
  }

  core.notice(`Adding label '${name}'`);

  // TODO: Add caching in front of GH Rest API calls
  await github.rest.issues.addLabels({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.payload.pull_request.number,
    labels: [name],
  });
}

/**
 * @param {string} command
 */
async function execRoot(command) {
  // TODO: Handle errors
  console.log(`exec("${command}")`);
  const result = await exec(command, {
    cwd: process.env.GITHUB_WORKSPACE,
  });
  console.log(`stdout: '${result.stdout}'`)
  return result.stdout;
}

/**
 * @param {string} [baseCommitish] Defaults to "HEAD^".
 * @param {string} [targetCommitish] Defaults to "HEAD".
 * @param {string} [diffFilter] Defaults to "d".
 * @returns {Promise<string[]>}
 */
async function getChangedSwaggerFiles(
  baseCommitish = "HEAD^",
  targetCommitish = "HEAD",
  diffFilter = "d"
) {
  const command =
    `pwsh -command ". ./eng/scripts/ChangedFiles-Functions.ps1; ` +
    `Get-ChangedSwaggerFiles (Get-ChangedFiles ${baseCommitish} ${targetCommitish} ${diffFilter})"`;
  const result = await exec(command);
  return result.stdout.trim().split("\n");
}

/**
 * @param {import('github-script').AsyncFunctionArguments['github']} github
 * @param {import('github-script').AsyncFunctionArguments['context']} context
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @param {string} name
 * @returns {Promise<boolean>}
 */
async function hasLabel(github, context, name) {
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

  return labelNames.some((n) => n == name);
}

/**
 * @param {import('github-script').AsyncFunctionArguments['github']} github
 * @param {import('github-script').AsyncFunctionArguments['context']} context
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @param {string} name
 */
async function removeLabelIfExists(github, context, core, name) {
  if (!context.payload.pull_request) {
    throw new Error("May only run in context of a pull request");
  }

  if (!(await hasLabel(github, context, name))) {
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
}

module.exports = {
  addLabelIfNotExists,
  execRoot,
  getChangedSwaggerFiles,
  hasLabel,
  removeLabelIfExists,
};
