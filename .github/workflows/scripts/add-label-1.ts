export default async ({ github, context}: import('github-script').AsyncFunctionArguments) => {
  await github.rest.issues.addLabels({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.payload.pull_request!.number,
    labels: ['label1']
  });
}
