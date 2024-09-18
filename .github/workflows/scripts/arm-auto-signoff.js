// @ts-check

const path = require("path");
const util = require("./util.js");

/** @param {import('github-script').AsyncFunctionArguments} AsyncFunctionArguments */
module.exports = async ({ github, context, core }) => {
  // If all the following conditions are true, apply label "ARMAutoSignoff".  Else, remove label.
  // - PR has label "ARMReview"
  // - PR represents incremental changes to an existing resource provider
  //   - The first PR for a new resource provider will still go thru the usual manual review process.
  // - All required checks are passing
  // - No swagger lintdiff suppressions are applied to the PR
  //   - If any suppressions are applied to these PRs, they will go thru a manual approval process because applying suppressions indicates that some of the mandatory guidelines are attempted to be violated.
  // - Authors self-attest the adherence to design best practices that are not automated.
  // - Not a conversion to TypeSpec

  if (!context.payload.pull_request) {
    throw new Error("May only run in context of a pull request");
  }

  if (
    (await util.hasLabel(github, context, core, "ARMReview")) &&
    (await incrementalChangesToExistingResourceProvider(core))
  ) {
    await util.addLabelIfNotExists(github, context, core, "ARMAutoSignedOff");
  } else {
    await util.removeLabelIfExists(github, context, core, "ARMAutoSignedOff");
  }
};

/**
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @param {string} file
 * @returns {Promise<boolean>} True if the spec folder exists in the target branch
 */
async function specFolderExistsInTargetBranch(core, file) {
  // Example: specification/contosowidgetmanager/resource-manager/Microsoft.Contoso/preview/2021-10-01-preview/contoso.json

  // Example: specification/contosowidgetmanager/resource-manager/Microsoft.Contoso
  const specDir = path.dirname(path.dirname(path.dirname(file)));
  console.log(`specDir: ${specDir}`);

  const lsTree = await util.execRoot(core, `git ls-tree HEAD^ ${specDir}`);

  // Command "git ls-tree" returns a nonempty string if the folder exists in the target branch
  return Boolean(lsTree);
}

/**
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @returns {Promise<boolean>} True if PR contains at least one change to an existing RP, and no new RPs
 */
async function incrementalChangesToExistingResourceProvider(core) {
  const changedSwaggerFiles = await util.getChangedSwaggerFiles(
    "HEAD^",
    "HEAD",
    ""
  );
  const changedRmFiles = changedSwaggerFiles.filter((f) =>
    f.includes("/resource-manager/")
  );

  console.log(
    `Changed files containing path '/resource-manager/': ${changedRmFiles}`
  );

  if (changedRmFiles.length == 0) {
    console.log(
      "No changes to swagger files containing path '/resource-manager/'"
    );
    return false;
  } else if (
    changedRmFiles.some(
      async (f) => !(await specFolderExistsInTargetBranch(core, f))
    )
  ) {
    console.log("Appears to include changes in a new resource provider");
    return false;
  } else {
    return true;
  }
}
