# Security Policy

## Reporting A Vulnerability

Report security issues privately through the security contact configured in the repository, or through a private advisory if the repository host supports it.

Please include:

- Affected LeetCode Master version.
- VS Code version and operating system.
- Clear reproduction steps.
- Impact assessment.
- Any logs or screenshots that do not expose credentials.

Do not publish session cookies, Personal Access Tokens, or exploit details in a public issue.

## Supported Versions

Security fixes are targeted at the latest published Marketplace version.

## Secret Handling

Marketplace publishing requires a VS Code Marketplace Personal Access Token. Store it only in your local `vsce` login state or in a CI secret such as `VSCE_PAT`. Never commit it to the repository.
