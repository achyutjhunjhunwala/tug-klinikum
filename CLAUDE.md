# Claude Code Guidelines for TUG-Klinikum Project

## License Protection
- **NEVER modify the license field in package.json** - This project uses a custom license (see LICENSE file)
- The license field should remain: `"license": "SEE LICENSE IN LICENSE"`
- Do not assume or change to standard licenses like MIT, Apache, etc.

## Package Security Guidelines
When installing new npm packages:
1. **Always check for security issues** before installation
2. Search the web for recent malware reports about the package
3. Verify the package on npm registry for suspicious activity
4. Check package download statistics and maintainer reputation
5. Look for known vulnerabilities in security databases
6. If any security concerns are found, discuss with the user before proceeding

## Development Commands
- **Build**: `npm run build`
- **Type Check**: `npm run type-check`
- **Lint**: `npm run lint`
- **Format**: `npm run format`

## Project Specifics
- This is a hospital wait time scraper with observability features
- Uses custom logging with Pino and log rotation
- Integrates with Elasticsearch for data storage
- Uses Playwright for web scraping
- Runs on 30-minute intervals