// @ts-check

const path = require("path");
const util = require("./util.js");
const { readFile } = require("fs/promises");

/** @param {import('github-script').AsyncFunctionArguments} AsyncFunctionArguments */
module.exports = async ({ github, context, core }) => {
  // If all the following conditions are true, apply label "ARMAutoSignoff".  Else, remove label.
  // - PR has label "ARMReview"
  // - PR does *not* have label "NotReadForARMReview"
  // - PR has label "ARMBestPractices"
  // - PR represents incremental changes to an existing resource provider
  //   - The first PR for a new resource provider will still go thru the usual manual review process.
  // - Not a conversion to TypeSpec
  // - Authors self-attest the adherence to design best practices that are not automated.
  // - Already blocks merge
  //   - All required checks are passing (LintDiff, BreakingChanges)
  //   - No swagger lintdiff suppressions are applied to the PR
  //     - If any suppressions are applied to these PRs, they will go thru a manual approval process because
  //       applying suppressions indicates that some of the mandatory guidelines are attempted to be violated.

  if (
    (await util.hasLabel(github, context, "ARMReview")) &&
    !(await util.hasLabel(github, context, "NotReadyForARMReview")) &&
    (await util.hasLabel(github, context, "ARMBestPractices")) &&
    (await incrementalChangesToExistingResourceProvider(core)) &&
    !(await typespecConversion(core))
  ) {
    await util.addLabelIfNotExists(github, context, core, "ARMAutoSignedOff");
  } else {
    await util.removeLabelIfExists(github, context, core, "ARMAutoSignedOff");
  }
};

/**
 * @param {string} file
 * @returns {Promise<boolean>} True if the spec folder exists in the target branch
 */
async function specFolderExistsInTargetBranch(file) {
  // Example: specification/contosowidgetmanager/resource-manager/Microsoft.Contoso/preview/2021-10-01-preview/contoso.json
  return await util.group(
    `specFolderExistsInTargetBranch("${file}")`,
    async () => {
      // Example: specification/contosowidgetmanager/resource-manager/Microsoft.Contoso
      const specDir = path.dirname(path.dirname(path.dirname(file)));
      console.log(`specDir: ${specDir}`);

      const lsTree = await util.execRoot(`git ls-tree HEAD^ ${specDir}`);

      // Command "git ls-tree" returns a nonempty string if the folder exists in the target branch
      const result = Boolean(lsTree);
      console.log(`returning: ${result}`);
      return result;
    }
  );
}

/**
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @returns {Promise<boolean>} True if PR contains changes to existing RPs, and no new RPs
 */
async function incrementalChangesToExistingResourceProvider(core) {
  return await util.group(
    `incrementalChangesToExistingResourceProvider()`,
    async () => {
      const changedSwaggerFiles = await util.getChangedSwaggerFiles(
        core,
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
      } else {
        for (const file of changedRmFiles) {
          if (!(await specFolderExistsInTargetBranch(file))) {
            console.log(`Appears to add a new RP: ${file}`);
            return false;
          }
        }
        console.log("Appears to change an existing RPs, but adds no new RPs");
        return true;
      }
    }
  );
}

/**
 * @param {import('github-script').AsyncFunctionArguments['core']} core
 * @returns {Promise<boolean>} True if PR contains a conversion to TypeSpec
 */
async function typespecConversion(core) {
  return await util.group(`typespecConversion()`, async () => {
    const changedSwaggerFiles = await util.getChangedSwaggerFiles(
      core,
      "HEAD^",
      "HEAD",
      "d"
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
    }

    let changedSwaggerTypeSpecGenerated = false;

    for (const file of changedRmFiles) {
      const swagger = await readFile(
        path.join(process.env.GITHUB_WORKSPACE || "", file),
        { encoding: "utf8" }
      );
      const swaggerObj = JSON.parse(swagger);
      if (swaggerObj["info"]["x-typespec-generated"]) {
        console.log(`File "${file}" contains "info.x-typespec-generated"`);
        changedSwaggerTypeSpecGenerated = true;
      }
    }

    return changedSwaggerTypeSpecGenerated;
  });
}
