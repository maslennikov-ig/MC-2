# RFC-001: Branching Strategy and Environment Alignment

**Date**: 2025-10-30
**Status**: Implemented
**Implementation**: [ADR-005](./ADR-005-deployment-strategy.md)

## 1. Context and Problem Statement

Currently, our workflow pushes code directly into the `master` (or `main`) branch. This triggers a deployment to an environment we label "Production". However, this workflow lacks intermediate verification steps, and the current environment often serves as a testing ground.

We need to establish distinct environments for **Development (Dev)**, **Staging (Stage)**, and **Production (Prod)** to ensure software quality and stability.

## 2. Proposed Branching Strategy

We propose adopting a flow where specific branches map 1:1 to deployment environments.

### 2.1. Branches and Environments

| Branch    | Environment | Purpose                                                                      | Deployment Strategy        |
| :-------- | :---------- | :--------------------------------------------------------------------------- | :------------------------- |
| `develop` | **Dev**     | Integration of feature branches. Continuous deployment for internal testing. | Rolling Update (Fast)      |
| `staging` | **Stage**   | Pre-production environment. Parity with Prod. Used for QA/UAT.               | Blue/Green (Parity)        |
| `main`    | **Prod**    | Live user traffic. Highest stability required.                               | Blue/Green (Zero Downtime) |

### 2.2. Workflow

1.  **Feature Development**: Developers create `feat/*` or `fix/*` branches from `develop`.
2.  **Merge to Dev**: Pull Request (PR) to `develop`. CI checks run. Merge triggers deploy to **Dev**.
3.  **Promote to Stage**: When `develop` is stable, a PR is opened from `develop` to `staging`. Merge triggers deploy to **Stage**.
4.  **Promote to Prod**: After Stage verification, a PR is opened from `staging` to `main`. Merge triggers deploy to **Prod**.

## 3. Implementation Details

### 3.1. GitHub Actions

- Update `deploy.yml` to trigger on pushes to `develop`, `staging`, and `main`.
- Use GitHub Environments (`dev`, `staging`, `production`) to manage secrets and variables for each target.

### 3.2. Infrastructure

- **Dev**: Can run on smaller resources or the same cluster with a different namespace/port.
- **Stage**: Should mirror Production infrastructure (Blue/Green setup) to validate the deployment process itself.
- **Prod**: Full Blue/Green setup.

### 3.3. CI/CD Optimization

- **Pre-commit Hooks**: Move all linter and formatter jobs to pre-commit hooks to ensure code quality locally and reduce CI usage. We will use **Husky** to manage git hooks. Additionally, we consider **commitlint** for enforcing conventional commit messages and **lint-staged** for running linters on staged files as optional but recommended tooling.
- **Test Separation**: Implement a tiered testing strategy based on the branch. Instead of running the full test circle for every environment, we will run a minimum viable test suite for lower environments (Dev) and comprehensive tests for higher environments (Stage/Prod).

## 4. Migration Plan

1.  Create `develop` and `staging` branches from current `main`.
2.  Configure GitHub Environments for `dev` and `staging`.
3.  Update CI/CD pipelines to handle the new branch-to-environment mapping.
4.  Rename current "Production" environment in GitHub to "Dev" or "Stage" if it contains test data, or provision new infrastructure.

## 5. Consequences

- **Positive**: Clear separation of concerns. Risky changes are tested in Dev/Stage before reaching users.
- **Negative**: Slightly more overhead in managing merges between branches (Dev -> Stage -> Prod).
