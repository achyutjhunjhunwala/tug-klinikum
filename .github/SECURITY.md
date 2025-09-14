# Security Policy

## Automated Quality Checks

This repository uses automated quality checks on Pull Requests to maintain code quality and security.

### For Repository Owner (@achyutjhunjhunwala)
- Quality checks run automatically on all your PRs
- No manual intervention required

### For External Contributors
For security reasons, quality checks on external PRs require manual approval:

1. **Create your PR** - Include a clear description of your changes
2. **Wait for approval** - The repository owner will review and trigger checks
3. **Owner triggers checks** by commenting `/run-checks` or `/check`
4. **Address any issues** found by the automated checks

### What Gets Checked
- 🔍 **ESLint** - Code linting and best practices
- 💅 **Prettier** - Code formatting consistency  
- 🔧 **TypeScript** - Type checking and compilation
- 🧪 **Tests** - Automated test suite
- 🏗️ **Build** - Successful compilation

### Security Considerations
This approach prevents:
- Malicious code execution in GitHub Actions
- Resource abuse from external contributions
- Unauthorized access to repository secrets

## Reporting Security Issues

If you discover a security vulnerability, please:

1. **DO NOT** open a public issue
2. Email the maintainer privately
3. Include detailed information about the vulnerability
4. Allow reasonable time for the issue to be addressed

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest main branch | ✅ |
| Previous releases | ❌ |

## Contact

For security-related questions, contact: @achyutjhunjhunwala