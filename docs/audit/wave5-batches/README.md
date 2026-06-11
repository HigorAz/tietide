# Audit Wave 5 — Remediation Batches

The 43 unfixed findings from the 2026-06-11 adversarial audit (`../AUDIT-2026-06-11.md`), grouped into themed batches — one batch = one GitHub issue (label `audit-wave5`) = one focused session. The 10 CRITICAL/HIGH + rate-limit findings are already fixed (see tracker checkboxes).

| Batch | Theme                                                        | Findings | IDs                                                                        |
| ----- | ------------------------------------------------------------ | -------- | -------------------------------------------------------------------------- |
| B     | [Billing correctness & plan enforcement](issue-B.md)         | 5        | W5.17, W5.18, W5.24, W5.25, W5.26                                          |
| C     | [Audit-trail completeness & data retention](issue-C.md)      | 4        | W5.20, W5.21, W5.22, W5.53                                                 |
| D     | [SSRF deep-hardening & sandbox/connector safety](issue-D.md) | 3        | W5.6, W5.38, W5.47                                                         |
| E     | [Connection & credential lifecycle / secrets](issue-E.md)    | 11       | W5.7, W5.11, W5.12, W5.13, W5.14, W5.28, W5.29, W5.33, W5.35, W5.45, W5.49 |
| F     | [Input validation & payload caps](issue-F.md)                | 4        | W5.41, W5.42, W5.46, W5.48                                                 |
| G     | [Webhook signature & replay robustness](issue-G.md)          | 3        | W5.30, W5.31, W5.32                                                        |
| H     | [Auth session & rate-limit hardening](issue-H.md)            | 3        | W5.27, W5.37, W5.50                                                        |
| I     | [DevOps, CI & config hardening](issue-I.md)                  | 4        | W5.8, W5.19, W5.51, W5.52                                                  |
| J     | [SPA client security](issue-J.md)                            | 3        | W5.40, W5.43, W5.44                                                        |
| K     | [Workflow engine robustness](issue-K.md)                     | 3        | W5.15, W5.16, W5.34                                                        |

Each batch file is a ready-to-paste GitHub issue body. To create them once the GitHub API is reachable:

```sh
for f in docs/audit/wave5-batches/issue-*.md; do gh issue create --title "Audit Wave 5 — $(...)" --body-file "$f" --label audit-wave5; done
```

Work each finding via TDD (failing regression test → minimal fix → atomic commit, one finding = one commit) on branch `feature/audit-wave5-remediation`.
