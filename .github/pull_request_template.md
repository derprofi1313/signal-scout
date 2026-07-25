## Problem and scope

<!-- What reviewable problem does this change solve? Keep the scope narrow. -->

## Evidence

<!-- Show the failing behavior, test, packet fragment, or screenshot before and after. -->

## Trust-boundary changes

<!-- Describe schema, determinism, network, storage, security, or compatibility effects. Write "None" when not applicable. -->

## Verification

- [ ] `pnpm check`
- [ ] `pnpm exec playwright install chromium` when browser dependencies changed
- [ ] `pnpm test:e2e`
- [ ] Focused tests for changed behavior
- [ ] Documentation and synthetic fixtures updated where the public contract changed
- [ ] No secrets, private captured content, invented usage claims, or automatic commit/PR behavior added

## Remaining limitations

<!-- State what this change intentionally does not solve. -->
