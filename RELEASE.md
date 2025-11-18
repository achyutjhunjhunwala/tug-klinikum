# Release Process

This document describes how to create a new release for the TUG-Klinikum project.

## Overview

The release process is automated using GitHub Actions. When you create a new release, the following happens automatically:

1. **Version Validation**: The workflow validates the version format
2. **Changelog Generation**: A changelog is automatically generated from commits and pull requests
3. **Package Version Update**: `package.json` is updated with the new version
4. **Git Tag Creation**: A git tag is created and pushed
5. **GitHub Release**: A GitHub release is created with the changelog
6. **Docker Images**: Docker images are built and published to GitHub Container Registry (ghcr.io)

## Creating a Release

### Prerequisites

- You must have write access to the repository
- You must be on the `main` branch
- All changes you want to include in the release should be merged to `main`

### Steps

1. **Go to GitHub Actions**
   - Navigate to: `Actions` → `Create Release` workflow
   - Click `Run workflow`

2. **Fill in the Release Details**
   - **Branch**: Select `main` (or your default branch)
   - **Release version**: Enter the version number (e.g., `1.0.0` or `v1.0.0`)
     - Format: `X.Y.Z` (semantic versioning)
     - Optional: `X.Y.Z-beta.1` for pre-releases
   - **Mark as pre-release**: Check this box if it's a beta/alpha release

3. **Click "Run workflow"**

4. **Wait for Completion**
   - The workflow will:
     - Validate the version
     - Generate the changelog
     - Update package.json
     - Create a git tag
     - Create the GitHub release
     - Trigger the Docker build workflow

5. **Verify the Release**
   - Check the Releases page for your new release
   - Verify the Docker images are being built in the Actions tab
   - Images will be available at:
     - `ghcr.io/achyutjhunjhunwala/tug-klinikum:X.Y.Z`
     - `ghcr.io/achyutjhunjhunwala/tug-klinikum-ui:X.Y.Z`

## Version Numbering

We follow [Semantic Versioning](https://semver.org/):

- **MAJOR** version (X.0.0): Incompatible API changes
- **MINOR** version (0.X.0): New functionality in a backward-compatible manner
- **PATCH** version (0.0.X): Backward-compatible bug fixes

Examples:
- `1.0.0` - First stable release
- `1.1.0` - Added new features
- `1.1.1` - Bug fixes
- `2.0.0` - Breaking changes
- `1.2.0-beta.1` - Pre-release version

## Docker Images

Each release publishes the following Docker images:

### Hospital Scraper
```bash
# Specific version
docker pull ghcr.io/achyutjhunjhunwala/tug-klinikum:1.0.0

# Latest stable
docker pull ghcr.io/achyutjhunjhunwala/tug-klinikum:latest

# Major version (auto-updated)
docker pull ghcr.io/achyutjhunjhunwala/tug-klinikum:1

# Major.Minor version (auto-updated)
docker pull ghcr.io/achyutjhunjhunwala/tug-klinikum:1.0
```

### Hospital UI
```bash
# Specific version
docker pull ghcr.io/achyutjhunjhunwala/tug-klinikum-ui:1.0.0

# Latest stable
docker pull ghcr.io/achyutjhunjhunwala/tug-klinikum-ui:latest

# Major version (auto-updated)
docker pull ghcr.io/achyutjhunjhunwala/tug-klinikum-ui:1

# Major.Minor version (auto-updated)
docker pull ghcr.io/achyutjhunjhunwala/tug-klinikum-ui:1.0
```

## Changelog Generation

The changelog is automatically generated from:

1. **Pull Requests**: All merged PRs since the last release
2. **Commits**: Individual commits with their messages
3. **GitHub Release Notes**: Automatically categorized by GitHub

To get better changelogs, use conventional commit messages:

- `feat: Add new feature` - New features
- `fix: Fix bug in scraper` - Bug fixes
- `docs: Update README` - Documentation
- `chore: Update dependencies` - Maintenance tasks
- `refactor: Restructure code` - Code refactoring
- `test: Add tests` - Testing
- `perf: Improve performance` - Performance improvements

## What Changed from Before?

### Previous Behavior
- ❌ Push to `main` → Automatically published Docker images
- ❌ No versioning
- ❌ No changelog
- ❌ No GitHub releases

### New Behavior
- ✅ Push to `main` → No automatic publishing
- ✅ Create release → Automatically publishes versioned Docker images
- ✅ Automatic changelog generation
- ✅ Proper GitHub releases with notes
- ✅ Semantic versioning with multiple tags (latest, major, major.minor, full version)

## Troubleshooting

### "Tag already exists"
If you get an error that the tag already exists, choose a different version number. Each version can only be released once.

### "Invalid version format"
Make sure your version follows the format `X.Y.Z` (e.g., `1.0.0`, `2.3.1`). You can optionally prefix with `v` (e.g., `v1.0.0`).

### Docker images not building
After the release is created, check the "Build and Push Docker Images" workflow in the Actions tab. This workflow is triggered automatically when a release is published.

### Changelog is empty or incomplete
The changelog is generated from commits and pull requests since the last release. If this is your first release, it will include all commits from the beginning of the repository.

## Manual Testing Before Release

Before creating a release, ensure you:

1. Run tests: `npm test`
2. Run linter: `npm run lint`
3. Check types: `npm run type-check`
4. Build successfully: `npm run build`
5. Test locally with Docker:
   ```bash
   docker build -t test-scraper .
   docker run test-scraper
   ```

## Rollback

If you need to rollback a release:

1. Delete the GitHub release (go to Releases → Delete)
2. Delete the git tag:
   ```bash
   git tag -d vX.Y.Z
   git push origin :refs/tags/vX.Y.Z
   ```
3. Revert the version bump commit if needed
4. The Docker images will remain but you can delete them from the Packages page

## Questions?

If you have questions about the release process, please open an issue or contact the maintainers.
