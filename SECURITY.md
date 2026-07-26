# Security policy

## Supported versions

Check Make is pre-1.0 software. Security fixes are provided for the latest
published release when practical. Older releases and development builds are
not supported.

## Report a vulnerability privately

Do not open a public issue for a suspected vulnerability or exposed secret.
Use GitHub's private vulnerability reporting for this repository:

<https://github.com/Androoz/check-make/security/advisories/new>

Include the affected version, operating system, reproduction steps, impact,
and any suggested mitigation. Please avoid accessing data that is not your own
and do not publish details before a fix or coordinated disclosure.

Acknowledgement and remediation are best-effort; this project currently has no
paid security response team or service-level agreement.

## Security boundaries

- OpenAI API keys entered in the application are intended to remain in process
  memory for the current session and must never be committed to the repository.
- Local slicer discovery and export interact with installed third-party
  applications and profiles. Treat generated projects as untrusted files until
  they have been inspected in the target slicer.
- Check Make does not certify a printed part for structural, medical,
  electrical, food-contact, or other safety-critical use.
