---
name: commit
description: Commit staged and unstaged changes in logical atomic groups. Use when the user asks to commit, save changes, or mentions "commit". Analyzes the working tree, groups related changes, and asks the user which groups to commit.
---

# Committing Changes

Commit changes in logical, atomic groups — never as a single large commit.

## Workflow

1. Run `git status` and `git diff` (staged + unstaged) to understand all pending changes.
2. Analyze the changes and group them into logical atomic commits (e.g., by feature, bug fix, refactor, file type, or domain area). Each group should represent a single coherent change.
3. Use the `AskUserQuestion` tool to present the groups and ask which to commit. Include an "All uncommitted/unstaged changes" option that commits everything in the identified groups sequentially. Example:

```
AskUserQuestion:
  question: "Which changes should be committed?"
  header: "Commit"
  multiSelect: true
  options:
    - label: "All changes"
      description: "Commit everything in sequential atomic groups"
    - label: "<Group 1 summary>"
      description: "<files and nature of change>"
    - label: "<Group 2 summary>"
      description: "<files and nature of change>"
```

4. For each selected group, stage only the relevant files and create a commit with a clear message.
5. After committing, run `git status` to confirm the result.
