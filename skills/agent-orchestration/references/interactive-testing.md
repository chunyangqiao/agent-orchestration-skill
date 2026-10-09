# Interactive testing

Use this checklist in the main conversation to coordinate work whose acceptance depends on live UI, browser, device, or external state. Follow [Agent Orchestration](../SKILL.md) for role selection and standard dispatch rules.

## Prepare the assignment

Add these details to the standard Agent Orchestration brief:

- **Scenario:** User goal, starting state, and required steps for repeatable checks or exploration scope for investigations.
- **Environment:** Target page and viewport or device, assigned session, account, test data, and permitted interactions.
- **Checks and evidence:** Observable success and failure conditions, relevant tolerances, and the evidence needed to judge them. Choose scenario and environment coverage according to risk.
- **Cleanup:** Test data and temporary state to restore, who restores them, and how restoration is verified.

## Coordinate access

Check both session ownership and affected application data before running tests in parallel. Serialize runs that share a session or can alter each other's starting state or results; separate tabs or accounts alone do not establish independence.

## Assess results

Reuse existing verification only for the claims it establishes. Require live evidence for acceptance criteria that depend on rendering, interaction, or external state.

If the environment, starting state, acceptance criteria, or evidence is insufficient, mark the affected checks unverified and identify what is missing. Confirm agreed cleanup or record any state still requiring restoration.
