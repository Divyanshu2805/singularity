# Security Policy

## Reporting a vulnerability

Please **don't open a public issue** for a security problem. Report it privately through GitHub: on the repository's **Security** tab, choose **Report a vulnerability**.

Include what you found, how to reproduce it, and the impact you expect. You'll get an acknowledgement, and a fix or mitigation will be coordinated with you before any details are made public.

## Scope

In scope:

- this repository's code and deployment configuration;
- the live demo at `vibecraft.divyanshuagrahari.dev` and its preview hostnames.

Please don't run automated scanners or load tests against the live demo, access other users' data, or disrupt the service. The demo uses Stripe test mode; no real payments are processed.

## Security model

How VibeCraft isolates tenants, authenticates services, sandboxes generated code, and protects preview links is described in the [security model](docs/architecture/security-model.md). The rules every change must respect are in the [security guardrails](docs/practices/security-guardrails.md).
