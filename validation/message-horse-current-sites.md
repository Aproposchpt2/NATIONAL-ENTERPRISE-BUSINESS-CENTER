# Message Horse Current-Sites Modernization

Status: deploy-preview validation required before activation.

## Scope

This package updates `netlify/functions/message-horse.js` to distribute current APROPOS Group LLC messaging only.

Current public properties used by the rotation:

- https://aproposgroupllc.com
- https://marketplace.aproposgroupllc.com
- https://federalcontractorportal.aproposgroupllc.com
- https://natcorp.aproposgroupllc.com
- https://nebc.aproposgroupllc.com

The package removes Message Horse destinations for retired APROPOS public properties and adds a build-time regression gate.

## Activation boundary

`MESSAGE_HORSE_MODE` remains `paused` during code validation and deployment. Activation to `both` is a separate runtime configuration action after exact production-commit verification.

## Preserved behavior

- Daily schedule remains `0 15 * * *`.
- `?dry=1` remains non-publishing preview mode.
- Facebook posting continues to use `FB_PAGE_TOKEN` / `FB_PAGE_ID` and Meta Graph API.
- Email delivery continues to use Resend and `MESSAGE_RECIPIENT` / `RESEND_TO_EMAIL`.
- No Morgan, assessment, funding, authentication, or other NEBC application workflow is changed.
