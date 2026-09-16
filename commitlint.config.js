// Commit messages are load-bearing: they become the permanent history that
// the CHANGELOG quotes, and the squash-merge title is what a reader sees in
// `git log`. The version bump itself comes from the changeset the PR adds,
// not from the message prefix — but a non-conventional subject still
// degrades the record, so the hook and CI enforce the format.
export default {
  extends: ['@commitlint/config-conventional'],
};
