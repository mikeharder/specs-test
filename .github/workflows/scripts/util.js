// @ts-check

const { promisify } = require("util");
const exec = promisify(require("child_process").exec);

module.exports = {
  addLabelIfNotExists,
  execRoot,
  getChangedSwaggerFiles,
  getLabels,
  group,
  hasLabel,
  removeLabelIfExists,
};


/** @type {Map<number, Set<string>>} */
const labelCache = new Map();

/**
 * @param {import('github-script').AsyncFunctionArguments['github']} github
 * @param {import('github-script').AsyncFunctionArguments['context']} context
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @param {string} name
 * @returns {Promise<void>}
 */
async function addLabelIfNotExists(github, context, core, name) {
  await group(`addLabelIfNotExists("${name}")`, async () => {
    if (!context.payload.pull_request) {
      throw new Error("May only run in context of a pull request");
    }

    if (await hasLabel(github, context, name)) {
      console.log(`Already has label '${name}'`);
    }

    core.notice(`Adding label '${name}'`);

    const prNumber = context.payload.pull_request.number;
    const { data: labels } = await github.rest.issues.addLabels({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: prNumber,
      labels: [name],
    });

    const labelNames = new Set(labels.map((l) => l.name));
    labelCache.set(prNumber, labelNames);
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
 * @param {import('github-script').AsyncFunctionArguments['github']} github
 * @param {import('github-script').AsyncFunctionArguments['context']} context
 * @returns {Promise<Set<string>>} Set of labels associated with the current PR
 */
async function getLabels(github, context) {
  return await group(`getLabels()`, async () => {
    if (!context.payload.pull_request) {
      throw new Error("May only run in context of a pull request");
    }

    const prNumber = context.payload.pull_request.number;

    let labelNames = labelCache.get(prNumber);
    if (!labelNames) {
      const { data: labels } = await github.rest.issues.listLabelsOnIssue({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: prNumber,
      });
      labelNames = new Set(labels.map((l) => l.name));
      labelCache.set(prNumber, labelNames);
    }

    console.log(`Labels: ${Array.from(labelNames).sort()}`);

    return labelNames;
  });
}

/**
 * Wrap an async function in a log group
 *
 * @template T
 * @param {string} name
 * @param {() => Promise<T>} fn
 */
async function group(name, fn) {
  // Uses console.group() instead of @actions/core.group() which doesn't support nesting
  console.group(name);
  try {
    return await fn();
  } finally {
    console.groupEnd();
  }
}

/**
 * @param {import('github-script').AsyncFunctionArguments['github']} github
 * @param {import('github-script').AsyncFunctionArguments['context']} context
 * @param {string} name
 * @returns {Promise<boolean>} True if the current PR contains the named label
 */
async function hasLabel(github, context, name) {
  return await group(`hasLabel("${name}")`, async () => {
    const result = (await getLabels(github, context)).has(name);
    console.log(`returning: ${result}`);
    return result;
  });
}

/**
 * @param {import('github-script').AsyncFunctionArguments['github']} github
 * @param {import('github-script').AsyncFunctionArguments['context']} context
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @param {string} name
 * @returns {Promise<void>}
 */
async function removeLabelIfExists(github, context, core, name) {
  await group(`removeLabelIfExists("${name}")`, async () => {
    if (!context.payload.pull_request) {
      throw new Error("May only run in context of a pull request");
    }

    if (!(await hasLabel(github, context, name))) {
      console.log(`Does not have label '${name}'`);
      return;
    }

    core.notice(`Removing label '${name}'`);

    const prNumber = context.payload.pull_request.number;
    try {
      // TODO: Add caching in front of GH Rest API calls
      const {data: labels} = await github.rest.issues.removeLabel({
        owner: context.repo.owner,
        repo: context.repo.repo,
        issue_number: prNumber,
        name: name,
      });

      const labelNames = new Set(labels.map((l) => l.name));
      labelCache.set(prNumber, labelNames);
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

// /**
//  * @param {import('github-script').AsyncFunctionArguments['github']} github
//  * @param {import('github-script').AsyncFunctionArguments['context']} context
//  * @returns {Promise<boolean>} True if all required checks for the PR are complete and passing
//  */
// async function allRequiredChecksPassing(github, context) {
//   return await group(`allRequiredChecksPassing()`, async () => {
//     if (!context.payload.pull_request) {
//       throw new Error("May only run in context of a pull request");
//     }

//     const checkSuite = await github.rest.checks.listSuitesForRef({
//       owner: context.repo.owner,
//       repo: context.repo.repo,
//       ref: context.payload.pull_request.head.sha,
//     });

//     console.log(checkSuite);

//     // const checks = await github.rest.checks.listForRef({
//     //   owner: context.repo.owner,
//     //   repo: context.repo.repo,
//     //   ref: context.payload.pull_request.head.sha,
//     // });

//     // for (let checkRun of checks.data.check_runs) {
//     //   console.log(checkRun);
//     // }

//     // const requiredCheckNames = await getRequiredCheckNames(github, context);

//     // for (const requiredCheckName of requiredCheckNames) {
//     //   console.log(`Required check: ${requiredCheckName}`);
//     // }

//     return true;
//   });
// }

// /**
//  * @param {import('github-script').AsyncFunctionArguments['github']} github
//  * @param {import('github-script').AsyncFunctionArguments['context']} context
//  * @returns {Promise<Set<string>>} Set of required check names for a PR
//  */
// async function getRequiredCheckNames(github, context) {
//   // TODO: Add logging

//   if (!context.payload.pull_request) {
//     throw new Error("May only run in context of a pull request");
//   }

//   /** @type {Set<string>} */
//   const requiredChecksNames = new Set();

//   const branchRules = await github.rest.repos.getBranchRules({
//     owner: context.repo.owner,
//     repo: context.repo.repo,
//     branch: context.payload.pull_request.base.ref,
//   });

//   for (const branchRule of branchRules.data) {
//     if (branchRule.type == "required_status_checks") {
//       const repoRuleset = await github.rest.repos.getRepoRuleset({
//         owner: context.repo.owner,
//         repo: context.repo.repo,
//         ruleset_id: branchRule.ruleset_id ?? -1,
//       });

//       if (repoRuleset.data.rules) {
//         for (const rule of repoRuleset.data.rules) {
//           if (rule.type == "required_status_checks") {
//             if (rule.parameters) {
//               for (const requiredStatusCheck of rule.parameters.required_status_checks) {
//                 requiredChecksNames.add(requiredStatusCheck.context);
//               }
//             }
//           }
//         }
//       }
//     }
//   }

//   return requiredChecksNames;
// }

